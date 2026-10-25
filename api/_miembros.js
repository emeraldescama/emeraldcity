/**
 * Registro de miembros de Emerald City guardado en la base de datos de la página
 * (Neon Postgres, conectado desde Vercel → Storage). Los archivos de api/ que empiezan
 * con "_" no se publican como rutas.
 *
 * Variable de entorno (la crea Vercel solo al conectar la base de datos):
 *   DATABASE_URL  (o POSTGRES_URL, o la misma con un prefijo, como STORAGE_DATABASE_URL)
 *
 * La tabla "miembros" se crea sola la primera vez que se usa.
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

let sqlClient;
let schemaReady;

/** Cliente de la base de datos, con la tabla ya creada */
async function db() {
  if (!dbConfigured()) {
    throw new DbError(500, 'Falta conectar la base de datos en Vercel (Storage → Neon).');
  }
  sqlClient ??= neon(databaseUrl());
  schemaReady ??= sqlClient`
    CREATE TABLE IF NOT EXISTS miembros (
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
    )`.catch((err) => {
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

const COLUMNS = `id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, mostrar, bienvenida, origen, captura IS NOT NULL AS tiene_captura`;

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

export async function listMembers() {
  const rows = await run((sql) => sql.query(`SELECT ${COLUMNS} FROM miembros ORDER BY fecha DESC`));
  return rows.map(toMember);
}

/** Registro desde el formulario de /unirse */
export async function addMember(registro, captura) {
  const rows = await run((sql) =>
    sql.query(
      `INSERT INTO miembros (id, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, mostrar, origen, captura)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'web', $10)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING ${COLUMNS}`,
      [newId(), registro.entrenador, registro.nombre, registro.ciudad, registro.codigo, registro.campfire, registro.campfireNombre, registro.edad, registro.mostrarEnAmigos, captura],
    ),
  );
  if (!rows.length) throw new DbError(409, 'Ese código de amistad ya está registrado en la comunidad.');
  return toMember(rows[0]);
}

/** Miembros que ya estaban en la hoja anterior. Devuelve cuántos se agregaron y cuántos ya existían */
export async function importMembers(list) {
  const column = (key, empty = null) => list.map((item) => item[key] || empty);
  const rows = await run((sql) =>
    sql.query(
      `INSERT INTO miembros (id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, mostrar, bienvenida, origen)
       SELECT id, coalesce(fecha, now()), entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, true, $10, 'importado'
       FROM unnest($1::text[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[], $8::text[], $9::integer[])
         AS t(id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING id`,
      [
        list.map(newId),
        column('fecha'),
        column('entrenador', ''),
        column('nombre', ''),
        column('ciudad', ''),
        column('codigo'),
        list.map((item) => item.campfire ?? null),
        column('campfireNombre', ''),
        list.map((item) => item.edad ?? null),
        LEGACY_WELCOME,
      ],
    ),
  );
  return { added: rows.length, duplicated: list.length - rows.length };
}

export async function updateMember(id, patch) {
  return oneMember(
    await run((sql) => sql.query(`UPDATE miembros SET mostrar = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, patch.mostrar === true])),
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

/** Lista pública de "Haz amigos": solo nombre de entrenador, código y ciudad */
export async function publicFriends() {
  return run((sql) =>
    sql.query(
      `SELECT entrenador, codigo, ciudad FROM miembros
       WHERE mostrar AND codigo IS NOT NULL AND length(codigo) = 12 AND entrenador <> ''
       ORDER BY fecha DESC`,
    ),
  );
}
