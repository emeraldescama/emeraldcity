/**
 * Registro de miembros de Emerald City guardado en la base de datos de la página
 * (Neon Postgres, conectado desde Vercel → Storage). Los archivos de api/ que empiezan
 * con "_" no se publican como rutas.
 *
 * Variable de entorno (la crea Vercel solo al conectar la base de datos):
 *   DATABASE_URL  (o POSTGRES_URL, o la misma con un prefijo, como STORAGE_DATABASE_URL)
 *
 * Las tablas se crean (y se ponen al día) solas la primera vez que se usan:
 *   miembros         un registro por entrenador
 *   recomendaciones  un voto "envía regalos" por dispositivo y entrenador
 */
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const LEGACY_WELCOME = 'Antes de la web';

export class DbError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Vercel nombra la variable DATABASE_URL, pero si al conectar Neon se elige un prefijo
 * queda, por ejemplo, STORAGE_DATABASE_URL: se acepta cualquiera de esas.
 */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const key = Object.keys(process.env).find(
    (name) => /(DATABASE_URL|POSTGRES_URL)$/.test(name) && /^postgres(ql)?:\/\//.test(process.env[name] ?? ''),
  );
  return key ? process.env[key] : undefined;
}

export function dbConfigured() {
  return Boolean(databaseUrl());
}

// Una sentencia por llamada; las columnas nuevas se agregan a tablas que ya existían
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS miembros (
    id text PRIMARY KEY,
    fecha timestamptz NOT NULL DEFAULT now(),
    entrenador text NOT NULL,
    nombre text NOT NULL DEFAULT '',
    ciudad text NOT NULL DEFAULT '',
    codigo text UNIQUE,
    campfire boolean,
    campfire_nombre text NOT NULL DEFAULT '',
    edad integer,
    mostrar boolean NOT NULL DEFAULT true,
    bienvenida text NOT NULL DEFAULT '',
    origen text NOT NULL DEFAULT 'web',
    captura text
  )`,
  `ALTER TABLE miembros ADD COLUMN IF NOT EXISTS telefono text NOT NULL DEFAULT ''`,
  `ALTER TABLE miembros ADD COLUMN IF NOT EXISTS contacto boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS recomendaciones (
    codigo text NOT NULL,
    votante text NOT NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (codigo, votante)
  )`,
];

let sqlClient;
let schemaReady;

/** Cliente de la base de datos, con las tablas ya creadas */
async function db() {
  if (!dbConfigured()) {
    throw new DbError(500, 'Falta conectar la base de datos en Vercel (Storage → Neon).');
  }
  sqlClient ??= neon(databaseUrl());
  schemaReady ??= (async () => {
    for (const statement of SCHEMA) await sqlClient.query(statement);
  })().catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  await schemaReady;
  return sqlClient;
}

async function run(query) {
  try {
    return await query(await db());
  } catch (err) {
    if (err instanceof DbError) throw err;
    throw new DbError(502, `Error de la base de datos: ${err.message}`);
  }
}

const COLUMNS = `id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, contacto,
  mostrar, bienvenida, origen, captura IS NOT NULL AS tiene_captura`;

/** Fila de la tabla → objeto que usa el panel */
function toMember(row) {
  return {
    id: row.id,
    fecha: new Date(row.fecha).toISOString(),
    entrenador: row.entrenador,
    nombre: row.nombre,
    ciudad: row.ciudad,
    codigo: row.codigo ?? '',
    campfire: row.campfire,
    campfireNombre: row.campfire_nombre,
    edad: row.edad,
    telefono: row.telefono,
    contacto: row.contacto,
    mostrar: row.mostrar,
    bienvenida: row.bienvenida,
    origen: row.origen,
    tieneCaptura: row.tiene_captura,
  };
}

function oneMember(rows) {
  if (!rows.length) throw new DbError(404, 'Ese miembro ya no existe.');
  return toMember(rows[0]);
}

const newId = () => randomUUID().slice(0, 8);

/**
 * Número de WhatsApp en formato internacional sin "+": "0412-123 4567" → "584121234567".
 * Devuelve '' si no parece un teléfono.
 */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (/^0?4\d{9}$/.test(digits)) digits = `58${digits.replace(/^0/, '')}`; // celular venezolano sin código de país
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

export async function listMembers() {
  const rows = await run((sql) => sql.query(`SELECT ${COLUMNS} FROM miembros ORDER BY fecha DESC`));
  return rows.map(toMember);
}

/** Registro desde el formulario de /unirse */
export async function addMember(registro, captura) {
  const rows = await run((sql) =>
    sql.query(
      `INSERT INTO miembros (id, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, contacto, mostrar, origen, captura)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'web', $12)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        newId(),
        registro.entrenador,
        registro.nombre,
        registro.ciudad,
        registro.codigo,
        registro.campfire,
        registro.campfireNombre,
        registro.edad,
        registro.telefono,
        registro.contacto,
        registro.mostrarEnAmigos,
        captura,
      ],
    ),
  );
  if (!rows.length) throw new DbError(409, 'Ese código de amistad ya está registrado en la comunidad.');
  return toMember(rows[0]);
}

/**
 * Miembros de la hoja anterior. Volver a importar la misma hoja actualiza los datos de
 * los que ya se habían importado (sin tocar a quienes se registraron en la web) y no
 * duplica a nadie. Devuelve cuántos se agregaron, actualizaron y omitieron.
 */
export async function importMembers(list) {
  // Un código repetido dentro del mismo archivo cuenta una sola vez
  const seen = new Set();
  const unique = list.filter((item) => !item.codigo || (!seen.has(item.codigo) && seen.add(item.codigo)));
  const column = (key, empty = null) => unique.map((item) => item[key] || empty);

  const rows = await run((sql) =>
    sql.query(
      `INSERT INTO miembros AS m (id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, mostrar, bienvenida, origen)
       SELECT id, coalesce(fecha, now()), entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, true, $11, 'importado'
       FROM unnest($1::text[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[], $8::text[], $9::integer[], $10::text[])
         AS t(id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono)
       -- Sin código no hay con qué compararlos: se evita repetir el mismo nombre de entrenador
       WHERE t.codigo IS NOT NULL
          OR NOT EXISTS (SELECT 1 FROM miembros x WHERE x.codigo IS NULL AND lower(x.entrenador) = lower(t.entrenador))
       ON CONFLICT (codigo) DO UPDATE SET
         entrenador = excluded.entrenador,
         nombre = excluded.nombre,
         ciudad = excluded.ciudad,
         campfire = excluded.campfire,
         campfire_nombre = excluded.campfire_nombre,
         edad = excluded.edad,
         telefono = CASE WHEN excluded.telefono <> '' THEN excluded.telefono ELSE m.telefono END
       WHERE m.origen = 'importado'
       RETURNING (xmax = 0) AS inserted`,
      [
        unique.map(newId),
        column('fecha'),
        column('entrenador', ''),
        column('nombre', ''),
        column('ciudad', ''),
        column('codigo'),
        unique.map((item) => item.campfire ?? null),
        column('campfireNombre', ''),
        unique.map((item) => item.edad ?? null),
        column('telefono', ''),
        LEGACY_WELCOME,
      ],
    ),
  );
  const added = rows.filter((r) => r.inserted).length;
  const updated = rows.length - added;
  return { added, updated, duplicated: list.length - rows.length };
}

const PATCHABLE = { mostrar: 'mostrar', contacto: 'contacto' };

/** Cambia un interruptor del miembro: aparecer en Haz amigos o aceptar mensajes */
export async function updateMember(id, field, value) {
  const column = PATCHABLE[field];
  if (!column) throw new DbError(400, 'Ese dato no se puede cambiar.');
  return oneMember(
    await run((sql) => sql.query(`UPDATE miembros SET ${column} = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, value === true])),
  );
}

export async function deleteMember(id) {
  const rows = await run((sql) => sql.query('DELETE FROM miembros WHERE id = $1 RETURNING id', [id]));
  if (!rows.length) throw new DbError(404, 'Ese miembro ya no existe.');
  return { id: rows[0].id };
}

/**
 * Marca la bienvenida como enviada y borra la captura: solo servía para el flyer de
 * bienvenida, y así el plan gratuito de la base de datos alcanza para miles de miembros.
 */
export async function markWelcomed(id) {
  return oneMember(
    await run((sql) =>
      sql.query(`UPDATE miembros SET bienvenida = $2, captura = NULL WHERE id = $1 RETURNING ${COLUMNS}`, [id, new Date().toISOString()]),
    ),
  );
}

export async function getScreenshot(id) {
  const rows = await run((sql) => sql.query('SELECT captura FROM miembros WHERE id = $1', [id]));
  if (!rows[0]?.captura) throw new DbError(404, 'Este miembro no tiene captura.');
  return { tipo: 'image/jpeg', base64: rows[0].captura };
}

/**
 * Lista pública de "Haz amigos": nombre de entrenador, código, ciudad, recomendaciones y
 * si acepta mensajes. El teléfono nunca sale en la lista.
 */
export async function publicFriends() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT m.entrenador, m.codigo, m.ciudad, (m.contacto AND m.telefono <> '') AS contacto,
              (SELECT count(*) FROM recomendaciones r WHERE r.codigo = m.codigo)::integer AS recomendaciones
       FROM miembros m
       WHERE m.mostrar AND m.codigo IS NOT NULL AND length(m.codigo) = 12 AND m.entrenador <> ''
       ORDER BY m.fecha DESC`,
    ),
  );
  return rows.map((r) => ({ ...r, recomendaciones: Number(r.recomendaciones) }));
}

/** "Envía regalos": un voto por dispositivo; votar de nuevo lo quita */
export async function toggleRecommendation(codigo, votante) {
  const rows = await run(async (sql) => {
    const exists = await sql.query(`SELECT 1 FROM miembros WHERE codigo = $1 AND mostrar`, [codigo]);
    if (!exists.length) throw new DbError(404, 'Ese entrenador ya no está en la lista.');
    const removed = await sql.query(`DELETE FROM recomendaciones WHERE codigo = $1 AND votante = $2 RETURNING 1`, [codigo, votante]);
    if (!removed.length) await sql.query(`INSERT INTO recomendaciones (codigo, votante) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [codigo, votante]);
    const count = await sql.query(`SELECT count(*)::integer AS total FROM recomendaciones WHERE codigo = $1`, [codigo]);
    return [{ total: Number(count[0].total), recomendado: !removed.length }];
  });
  return { recomendaciones: rows[0].total, recomendado: rows[0].recomendado };
}

/** Teléfono para "Tengo intercambio con suerte", solo si el miembro lo aceptó */
export async function contactPhone(codigo) {
  const rows = await run((sql) =>
    sql.query(`SELECT entrenador, telefono FROM miembros WHERE codigo = $1 AND mostrar AND contacto AND telefono <> ''`, [codigo]),
  );
  return rows[0] ?? null;
}
