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
  // Cumpleaños (día y mes, sin año) y Pokémon favorito, para el flyer de cumpleaños
  `ALTER TABLE miembros ADD COLUMN IF NOT EXISTS cumple_dia integer`,
  `ALTER TABLE miembros ADD COLUMN IF NOT EXISTS cumple_mes integer`,
  `ALTER TABLE miembros ADD COLUMN IF NOT EXISTS pokemon integer`,
  // Limpia ciudades que en realidad eran el enlace de Drive de la captura (importaciones viejas)
  `UPDATE miembros SET ciudad = '' WHERE ciudad ~* '^https?://'`,
  `CREATE TABLE IF NOT EXISTS recomendaciones (
    codigo text NOT NULL,
    votante text NOT NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (codigo, votante)
  )`,
  // Huella de la red desde donde se votó, para limitar los likes repetidos desde un mismo lugar
  `ALTER TABLE recomendaciones ADD COLUMN IF NOT EXISTS red text NOT NULL DEFAULT ''`,
  // Cuentas de la web (una por miembro) y foro
  `CREATE TABLE IF NOT EXISTS cuentas (
    id text PRIMARY KEY,
    miembro_id text NOT NULL UNIQUE REFERENCES miembros(id) ON DELETE CASCADE,
    clave text NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente',
    sesion integer NOT NULL DEFAULT 0,
    avatar integer NOT NULL DEFAULT 25,
    shiny boolean NOT NULL DEFAULT false,
    equipo text NOT NULL DEFAULT '',
    bio text NOT NULL DEFAULT '',
    creada timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS foro_temas (
    id text PRIMARY KEY,
    categoria text NOT NULL,
    titulo text NOT NULL,
    cuenta_id text REFERENCES cuentas(id) ON DELETE SET NULL,
    fijado boolean NOT NULL DEFAULT false,
    creado timestamptz NOT NULL DEFAULT now(),
    actividad timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS foro_mensajes (
    id text PRIMARY KEY,
    tema_id text NOT NULL REFERENCES foro_temas(id) ON DELETE CASCADE,
    cuenta_id text REFERENCES cuentas(id) ON DELETE SET NULL,
    texto text NOT NULL,
    creado timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS foro_mensajes_tema ON foro_mensajes (tema_id, creado)`,
  `CREATE INDEX IF NOT EXISTS foro_temas_categoria ON foro_temas (categoria, actividad DESC)`,
  // Temas de cumpleaños que la web abre sola, uno por miembro y año
  `ALTER TABLE foro_temas ADD COLUMN IF NOT EXISTS cumple_miembro text`,
  `ALTER TABLE foro_temas ADD COLUMN IF NOT EXISTS cumple_fecha date`,
  `CREATE UNIQUE INDEX IF NOT EXISTS foro_temas_cumple ON foro_temas (cumple_miembro, cumple_fecha)`,
  `ALTER TABLE foro_mensajes ADD COLUMN IF NOT EXISTS sistema boolean NOT NULL DEFAULT false`,
  // Datos sueltos de la página, por ejemplo el último día en que se mandó el correo de cumpleaños
  `CREATE TABLE IF NOT EXISTS ajustes (clave text PRIMARY KEY, valor text NOT NULL)`,
  // Etiqueta en el foro: '' (miembro), 'admin' o 'principal' (la cuenta del administrador del panel)
  `ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT ''`,
  // Foro: responder a un comentario, me gusta y avisos de menciones y respuestas
  `ALTER TABLE foro_mensajes ADD COLUMN IF NOT EXISTS respuesta_a text REFERENCES foro_mensajes(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS foro_likes (
    mensaje_id text NOT NULL REFERENCES foro_mensajes(id) ON DELETE CASCADE,
    cuenta_id text NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    creado timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (mensaje_id, cuenta_id)
  )`,
  `CREATE TABLE IF NOT EXISTS foro_avisos (
    id text PRIMARY KEY,
    cuenta_id text NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    de_cuenta text REFERENCES cuentas(id) ON DELETE CASCADE,
    mensaje_id text NOT NULL REFERENCES foro_mensajes(id) ON DELETE CASCADE,
    leido boolean NOT NULL DEFAULT false,
    creado timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS foro_avisos_cuenta ON foro_avisos (cuenta_id, creado DESC)`,
  // Sección Eventos: dinámicas (como la de Wild Area), sus retos y las capturas de cada miembro
  `CREATE TABLE IF NOT EXISTS escama_vinculos (
    escama_id text PRIMARY KEY,
    cuenta_id text NOT NULL UNIQUE REFERENCES cuentas(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS dinamicas (
    id text PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text NOT NULL DEFAULT '',
    inicio date NOT NULL,
    fin date NOT NULL,
    creada timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS retos (
    id text PRIMARY KEY,
    dinamica_id text NOT NULL REFERENCES dinamicas(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descripcion text NOT NULL DEFAULT '',
    puntos integer NOT NULL DEFAULT 5,
    inicio date NOT NULL,
    fin date NOT NULL,
    creado timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS entregas (
    id text PRIMARY KEY,
    reto_id text NOT NULL REFERENCES retos(id) ON DELETE CASCADE,
    cuenta_id text NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    captura text,
    estado text NOT NULL DEFAULT 'pendiente',
    nota text NOT NULL DEFAULT '',
    creada timestamptz NOT NULL DEFAULT now(),
    revisada timestamptz,
    UNIQUE (reto_id, cuenta_id)
  )`,
  // Misiones con "¡Lo logré!" (Wild Area): el administrador las valida en persona
  `ALTER TABLE retos ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'captura'`,
  `ALTER TABLE retos ADD COLUMN IF NOT EXISTS limite integer`,
  `ALTER TABLE retos ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT ''`,
  `ALTER TABLE retos ADD COLUMN IF NOT EXISTS pokemon text NOT NULL DEFAULT ''`,
  `ALTER TABLE retos ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS logros (
    id text PRIMARY KEY,
    reto_id text NOT NULL REFERENCES retos(id) ON DELETE CASCADE,
    cuenta_id text NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    estado text NOT NULL DEFAULT 'pendiente',
    creado timestamptz NOT NULL DEFAULT now(),
    revisado timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS logros_reto_cuenta ON logros (reto_id, cuenta_id)`,
  // Intentos de validar el teléfono de Escama: frena que alguien pruebe números al azar
  `CREATE TABLE IF NOT EXISTS escama_intentos (cuenta_id text NOT NULL, creado timestamptz NOT NULL DEFAULT now())`,
  // Pedido del administrador (10 nov 2026): en Wild Area, las misiones de miércoles, jueves y
  // viernes con límite 2 pasan a límite 1. Se aplica una sola vez (la marca en "ajustes" lo
  // impide después), así que si luego se cambia un límite a mano, no se vuelve a tocar.
  `UPDATE retos SET limite = 1
   WHERE modo = 'logro' AND limite = 2 AND inicio = fin AND inicio >= DATE '2026-11-11'
     AND extract(isodow FROM inicio) IN (3, 4, 5)
     AND NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'migracion-limites-wild-area')`,
  `INSERT INTO ajustes (clave, valor)
   SELECT 'migracion-limites-wild-area', now()::text
   WHERE EXISTS (SELECT 1 FROM retos WHERE modo = 'logro' AND inicio >= DATE '2026-11-11' AND extract(isodow FROM inicio) IN (3, 4, 5))
   ON CONFLICT (clave) DO NOTHING`,
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

export async function run(query) {
  try {
    return await query(await db());
  } catch (err) {
    if (err instanceof DbError) throw err;
    throw new DbError(502, `Error de la base de datos: ${err.message}`);
  }
}

const COLUMNS = `id, fecha, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, contacto,
  mostrar, bienvenida, origen, captura IS NOT NULL AS tiene_captura, cumple_dia, cumple_mes, pokemon,
  (SELECT c.avatar FROM cuentas c WHERE c.miembro_id = miembros.id) AS cuenta_avatar,
  (SELECT c.shiny FROM cuentas c WHERE c.miembro_id = miembros.id) AS cuenta_shiny`;

const intOrNull = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

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
    cumpleDia: intOrNull(row.cumple_dia),
    cumpleMes: intOrNull(row.cumple_mes),
    // El Pokémon del perfil de su cuenta manda; si no tiene cuenta, el que eligió al registrarse
    pokemon: intOrNull(row.cuenta_avatar) ?? intOrNull(row.pokemon),
    shiny: row.cuenta_shiny === true || row.cuenta_shiny === 't' || row.cuenta_shiny === 'true',
    pokemonFavorito: intOrNull(row.pokemon),
  };
}

function oneMember(rows) {
  if (!rows.length) throw new DbError(404, 'Ese miembro ya no existe.');
  return toMember(rows[0]);
}

export const newId = () => randomUUID().slice(0, 8);

/** { cumpleDia, cumpleMes } válidos (29 de febrero incluido), ambos null si no hay fecha */
export function validBirthday(dia, mes) {
  const day = intOrNull(dia);
  const month = intOrNull(mes);
  if (day === null && month === null) return { cumpleDia: null, cumpleMes: null };
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > daysInMonth[month - 1]) {
    throw new DbError(400, 'La fecha de cumpleaños no es válida.');
  }
  return { cumpleDia: day, cumpleMes: month };
}

/** Número de Pokémon válido o null */
export function validPokemon(value) {
  const number = intOrNull(value);
  if (number === null) return null;
  if (!Number.isInteger(number) || number < 1 || number > 1025) throw new DbError(400, 'Ese Pokémon no existe.');
  return number;
}

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
      `INSERT INTO miembros (id, entrenador, nombre, ciudad, codigo, campfire, campfire_nombre, edad, telefono, contacto, mostrar, origen, captura,
         cumple_dia, cumple_mes, pokemon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'web', $12, $13, $14, $15)
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
        registro.cumpleDia,
        registro.cumpleMes,
        registro.pokemon,
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
  // Una persona repetida dentro del mismo archivo cuenta una sola vez: por su código o,
  // si no tiene, por su nombre de entrenador
  const seen = new Set();
  const unique = list.filter((item) => {
    const key = item.codigo || `nombre:${item.entrenador.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
       -- Un dato vacío en la hoja nunca borra lo que ya estaba (por ejemplo, un Excel solo con cumpleaños)
       ON CONFLICT (codigo) DO UPDATE SET
         entrenador = CASE WHEN excluded.entrenador <> '' THEN excluded.entrenador ELSE m.entrenador END,
         nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE m.nombre END,
         ciudad = CASE WHEN excluded.ciudad <> '' THEN excluded.ciudad ELSE m.ciudad END,
         campfire = coalesce(excluded.campfire, m.campfire),
         campfire_nombre = CASE WHEN excluded.campfire_nombre <> '' THEN excluded.campfire_nombre ELSE m.campfire_nombre END,
         edad = coalesce(excluded.edad, m.edad),
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

  // Cumpleaños y Pokémon favorito: se completan en todos los que coinciden (también los
  // registrados en la web), por código o, si no tiene, por nombre de entrenador. Nunca
  // reemplazan lo que el miembro ya puso.
  const extras = unique.filter((item) => item.cumpleDia || item.pokemon);
  let birthdays = 0;
  let pokemon = 0;
  if (extras.length) {
    const completed = await run((sql) =>
      sql.query(
        `WITH t AS (
           SELECT * FROM unnest($1::text[], $2::text[], $3::integer[], $4::integer[], $5::integer[]) AS t(codigo, entrenador, dia, mes, pokemon)
         ),
         cambios AS (
           SELECT DISTINCT ON (m.id) m.id, t.dia, t.mes, t.pokemon,
                  (m.cumple_dia IS NULL AND t.dia IS NOT NULL) AS pone_cumple,
                  (m.pokemon IS NULL AND t.pokemon IS NOT NULL) AS pone_pokemon
           FROM miembros m JOIN t ON m.codigo = t.codigo OR (t.codigo IS NULL AND lower(m.entrenador) = lower(t.entrenador))
           ORDER BY m.id, coalesce(m.codigo = t.codigo, false) DESC
         )
         UPDATE miembros m SET
           cumple_dia = CASE WHEN c.pone_cumple THEN c.dia ELSE m.cumple_dia END,
           cumple_mes = CASE WHEN c.pone_cumple THEN c.mes ELSE m.cumple_mes END,
           pokemon = CASE WHEN c.pone_pokemon THEN c.pokemon ELSE m.pokemon END
         FROM cambios c
         WHERE m.id = c.id AND (c.pone_cumple OR c.pone_pokemon)
         RETURNING c.pone_cumple, c.pone_pokemon`,
        [
          extras.map((item) => item.codigo || null),
          extras.map((item) => item.entrenador),
          extras.map((item) => item.cumpleDia ?? null),
          extras.map((item) => item.cumpleMes ?? null),
          extras.map((item) => item.pokemon ?? null),
        ],
      ),
    );
    const yes = (v) => v === true || v === 't' || v === 'true';
    birthdays = completed.filter((r) => yes(r.pone_cumple)).length;
    pokemon = completed.filter((r) => yes(r.pone_pokemon)).length;
  }
  return { added, updated, duplicated: list.length - rows.length, birthdays, pokemon };
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

/**
 * El administrador corrige cualquier dato del miembro. Si cambia el código de amistad,
 * los likes recibidos pasan al código nuevo.
 */
export async function editMember(id, data) {
  return oneMember(
    await run(async (sql) => {
      const current = await sql.query(`SELECT codigo FROM miembros WHERE id = $1`, [id]);
      if (!current.length) throw new DbError(404, 'Ese miembro ya no existe.');
      if (data.codigo) {
        const taken = await sql.query(`SELECT entrenador FROM miembros WHERE codigo = $1 AND id <> $2`, [data.codigo, id]);
        if (taken.length) throw new DbError(409, `Ese código de amistad ya lo tiene ${taken[0].entrenador}.`);
      }
      const rows = await sql.query(
        `UPDATE miembros SET entrenador = $2, nombre = $3, ciudad = $4, codigo = $5, telefono = $6,
           contacto = contacto AND $6 <> '', campfire = $7, campfire_nombre = $8, edad = $9,
           cumple_dia = $10, cumple_mes = $11, pokemon = $12
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [
          id,
          data.entrenador,
          data.nombre,
          data.ciudad,
          data.codigo || null,
          data.telefono,
          data.campfire,
          data.campfireNombre,
          data.edad,
          data.cumpleDia,
          data.cumpleMes,
          data.pokemon,
        ],
      );
      const oldCode = current[0].codigo;
      if (oldCode && data.codigo && oldCode !== data.codigo) {
        await sql.query(
          `UPDATE recomendaciones SET codigo = $2 WHERE codigo = $1
             AND NOT EXISTS (SELECT 1 FROM recomendaciones r WHERE r.codigo = $2 AND r.votante = recomendaciones.votante)`,
          [oldCode, data.codigo],
        );
        await sql.query(`DELETE FROM recomendaciones WHERE codigo = $1`, [oldCode]);
      }
      return rows;
    }),
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
 * Lista pública de "Haz amigos": nombre de entrenador, código, ciudad, recomendaciones,
 * Pokémon favorito y si acepta mensajes. El teléfono nunca sale en la lista.
 */
export async function publicFriends() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT m.entrenador, m.codigo, m.ciudad, (m.contacto AND m.telefono <> '') AS contacto,
              (SELECT count(*) FROM recomendaciones r WHERE r.codigo = m.codigo)::integer AS recomendaciones,
              coalesce(c.avatar, m.pokemon) AS pokemon, coalesce(c.shiny, false) AS shiny
       FROM miembros m
       LEFT JOIN cuentas c ON c.miembro_id = m.id
       WHERE m.mostrar AND m.codigo IS NOT NULL AND length(m.codigo) = 12 AND m.entrenador <> ''
       ORDER BY m.fecha DESC`,
    ),
  );
  return rows.map((r) => ({
    ...r,
    recomendaciones: Number(r.recomendaciones),
    // Pokémon favorito (el de su perfil si tiene cuenta); sin él, la página muestra su inicial
    pokemon: r.pokemon === null || r.pokemon === undefined ? null : Number(r.pokemon),
    shiny: r.shiny === true || r.shiny === 't' || r.shiny === 'true',
  }));
}

// Likes que se aceptan para un mismo entrenador desde una misma conexión. No es 1 porque en
// Venezuela muchos celulares de la misma operadora salen a internet con la misma IP
const VOTES_PER_NETWORK = 10;

/** "Envía regalos": un voto por dispositivo; votar de nuevo lo quita */
export async function toggleRecommendation(codigo, votante, red = '') {
  const rows = await run(async (sql) => {
    const exists = await sql.query(`SELECT 1 FROM miembros WHERE codigo = $1 AND mostrar`, [codigo]);
    if (!exists.length) throw new DbError(404, 'Ese entrenador ya no está en la lista.');
    const removed = await sql.query(`DELETE FROM recomendaciones WHERE codigo = $1 AND votante = $2 RETURNING 1`, [codigo, votante]);
    if (!removed.length) {
      if (red) {
        const fromNetwork = await sql.query(`SELECT count(*)::integer AS total FROM recomendaciones WHERE codigo = $1 AND red = $2`, [codigo, red]);
        if (Number(fromNetwork[0].total) >= VOTES_PER_NETWORK) {
          throw new DbError(429, 'Desde esta conexión ya se recomendó a este entrenador varias veces.');
        }
      }
      await sql.query(`INSERT INTO recomendaciones (codigo, votante, red) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [codigo, votante, red]);
    }
    const count = await sql.query(`SELECT count(*)::integer AS total FROM recomendaciones WHERE codigo = $1`, [codigo]);
    return [{ total: Number(count[0].total), recomendado: !removed.length }];
  });
  return { recomendaciones: rows[0].total, recomendado: rows[0].recomendado };
}

/** Códigos que este votante ya recomendó (para pintar sus likes al abrir la página) */
export async function votesOf(votante) {
  const rows = await run((sql) => sql.query(`SELECT codigo FROM recomendaciones WHERE votante = $1`, [votante]));
  return rows.map((r) => r.codigo);
}

/**
 * Datos para "Tengo intercambio con suerte". El teléfono solo se entrega si el miembro
 * aceptó recibir mensajes; si no, el pedido se envía a la comunidad.
 */
export async function contactInfo(codigo) {
  const rows = await run((sql) =>
    sql.query(
      `SELECT entrenador, CASE WHEN contacto AND telefono <> '' THEN telefono ELSE '' END AS telefono
       FROM miembros WHERE codigo = $1 AND mostrar`,
      [codigo],
    ),
  );
  return rows[0] ?? null;
}

/** Da permiso de mensajes a los miembros importados que tienen teléfono. Devuelve cuántos cambió */
export async function allowImportedContact() {
  const rows = await run((sql) =>
    sql.query(`UPDATE miembros SET contacto = true WHERE origen = 'importado' AND telefono <> '' AND NOT contacto RETURNING id`),
  );
  return rows.length;
}
