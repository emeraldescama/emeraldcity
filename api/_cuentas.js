/**
 * Cuentas de la web y foro de la comunidad.
 *
 * Solo puede crear cuenta quien ya está en la lista de miembros (se busca por su código de
 * amistad y, si se registró con teléfono, también debe escribirlo). La cuenta queda
 * "pendiente" hasta que un administrador la aprueba; solo las cuentas aprobadas leen y
 * escriben en el foro.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DbError, newId, normalizePhone, run } from './_miembros.js';

const scryptAsync = promisify(scrypt);

export const ESTADOS = ['pendiente', 'aprobada', 'bloqueada'];
export const EQUIPOS = ['', 'instinto', 'sabiduria', 'valor'];
export const CATEGORIAS = {
  general: 'General',
  intercambios: 'Intercambios',
  incursiones: 'Incursiones y quedadas',
  eventos: 'Eventos',
};
export const MAX_POKEMON = 1025;

// Límites para frenar el spam: un mensaje cada 10 segundos y 40 por hora por cuenta
const SECONDS_BETWEEN_POSTS = 10;
const POSTS_PER_HOUR = 40;

// ---------- Contraseñas ----------

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

async function passwordMatches(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Contraseña temporal que el administrador le pasa al miembro por WhatsApp */
export function temporaryPassword() {
  const words = ['pikachu', 'eevee', 'snorlax', 'gengar', 'lapras', 'mewtwo', 'rayquaza', 'lucario', 'dragonite', 'togepi'];
  return `${words[randomBytes(1)[0] % words.length]}${100 + (randomBytes(2).readUInt16BE() % 900)}`;
}

// ---------- Cuentas ----------

const ACCOUNT_COLUMNS = `c.id, c.estado, c.sesion, c.avatar, c.shiny, c.equipo, c.bio, c.creada,
  m.entrenador, m.ciudad, m.codigo, m.mostrar`;

function toAccount(row) {
  return {
    id: row.id,
    estado: row.estado,
    sesion: Number(row.sesion),
    avatar: Number(row.avatar),
    shiny: row.shiny === true || row.shiny === 't' || row.shiny === 'true',
    equipo: row.equipo,
    bio: row.bio,
    creada: new Date(row.creada).toISOString(),
    entrenador: row.entrenador,
    ciudad: row.ciudad,
    codigo: row.codigo ?? '',
    mostrar: row.mostrar === true || row.mostrar === 't' || row.mostrar === 'true',
  };
}

export async function accountById(id) {
  const rows = await run((sql) =>
    sql.query(`SELECT ${ACCOUNT_COLUMNS} FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE c.id = $1`, [id]),
  );
  return rows.length ? toAccount(rows[0]) : null;
}

/** Crea la cuenta de un miembro de la lista. Queda pendiente de aprobación */
export async function createAccount(codigo, telefono, password) {
  const rows = await run(async (sql) => {
    const members = await sql.query(
      `SELECT m.id, m.telefono, c.id AS cuenta FROM miembros m LEFT JOIN cuentas c ON c.miembro_id = m.id WHERE m.codigo = $1`,
      [codigo],
    );
    const member = members[0];
    if (!member) {
      throw new DbError(404, 'Ese código de amistad no está en la lista de miembros. Primero regístrate en "Quiero ser parte".');
    }
    if (member.cuenta) throw new DbError(409, 'Ese código ya tiene una cuenta. Si olvidaste tu contraseña, pídele al equipo que la reinicie.');
    // El teléfono no es público: comprueba que la cuenta la crea el dueño del código
    if (member.telefono && normalizePhone(telefono) !== member.telefono) {
      throw new DbError(403, 'El WhatsApp no coincide con el que registraste en la comunidad.');
    }
    const id = newId();
    await sql.query(`INSERT INTO cuentas (id, miembro_id, clave) VALUES ($1, $2, $3)`, [id, member.id, await hashPassword(password)]);
    return [{ id }];
  });
  return accountById(rows[0].id);
}

/** Cuenta con ese código y contraseña, o null */
export async function login(codigo, password) {
  const rows = await run((sql) =>
    sql.query(`SELECT c.id, c.clave FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE m.codigo = $1`, [codigo]),
  );
  if (!rows.length || !(await passwordMatches(password, rows[0].clave))) return null;
  return accountById(rows[0].id);
}

export async function updateProfile(id, profile) {
  await run((sql) =>
    sql.query(`UPDATE cuentas SET avatar = $2, shiny = $3, equipo = $4, bio = $5 WHERE id = $1`, [
      id,
      profile.avatar,
      profile.shiny,
      profile.equipo,
      profile.bio,
    ]),
  );
  return accountById(id);
}

/** Cambia la contraseña y cierra las demás sesiones abiertas de la cuenta */
export async function changePassword(id, current, next) {
  const rows = await run((sql) => sql.query(`SELECT clave FROM cuentas WHERE id = $1`, [id]));
  if (!rows.length) throw new DbError(404, 'La cuenta ya no existe.');
  if (!(await passwordMatches(current, rows[0].clave))) throw new DbError(403, 'La contraseña actual no es correcta.');
  await run(async (sql) => sql.query(`UPDATE cuentas SET clave = $2, sesion = sesion + 1 WHERE id = $1`, [id, await hashPassword(next)]));
  return accountById(id);
}

// ---------- Administración de cuentas ----------

export async function listAccounts() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT ${ACCOUNT_COLUMNS}, m.nombre, m.telefono,
              (SELECT count(*) FROM foro_mensajes f WHERE f.cuenta_id = c.id)::integer AS mensajes
       FROM cuentas c JOIN miembros m ON m.id = c.miembro_id
       ORDER BY (c.estado = 'pendiente') DESC, c.creada DESC`,
    ),
  );
  return rows.map((row) => ({ ...toAccount(row), nombre: row.nombre, telefono: row.telefono, mensajes: Number(row.mensajes) }));
}

export async function setAccountState(id, estado) {
  if (!ESTADOS.includes(estado)) throw new DbError(400, 'Estado no válido.');
  // Bloquear cierra la sesión que tenga abierta
  const rows = await run((sql) =>
    sql.query(`UPDATE cuentas SET estado = $2, sesion = sesion + (CASE WHEN $2 = 'bloqueada' THEN 1 ELSE 0 END) WHERE id = $1 RETURNING id`, [id, estado]),
  );
  if (!rows.length) throw new DbError(404, 'Esa cuenta ya no existe.');
  return accountById(id);
}

export async function resetPassword(id) {
  const password = temporaryPassword();
  const rows = await run(async (sql) =>
    sql.query(`UPDATE cuentas SET clave = $2, sesion = sesion + 1 WHERE id = $1 RETURNING id`, [id, await hashPassword(password)]),
  );
  if (!rows.length) throw new DbError(404, 'Esa cuenta ya no existe.');
  return { cuenta: await accountById(id), clave: password };
}

export async function deleteAccount(id) {
  const rows = await run((sql) => sql.query(`DELETE FROM cuentas WHERE id = $1 RETURNING id`, [id]));
  if (!rows.length) throw new DbError(404, 'Esa cuenta ya no existe.');
  return { id };
}

// ---------- Foro ----------

const AUTHOR_COLUMNS = `c.id AS autor_id, m.entrenador AS autor, c.avatar, c.shiny, c.equipo`;

function toAuthor(row) {
  if (!row.autor_id) return null;
  return {
    id: row.autor_id,
    entrenador: row.autor,
    avatar: Number(row.avatar),
    shiny: row.shiny === true || row.shiny === 't' || row.shiny === 'true',
    equipo: row.equipo,
  };
}

export async function forumSummary() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT t.categoria, count(DISTINCT t.id)::integer AS temas, count(f.id)::integer AS mensajes, max(t.actividad) AS actividad
       FROM foro_temas t LEFT JOIN foro_mensajes f ON f.tema_id = t.id GROUP BY t.categoria`,
    ),
  );
  return Object.entries(CATEGORIAS).map(([id, nombre]) => {
    const row = rows.find((r) => r.categoria === id);
    return {
      id,
      nombre,
      temas: Number(row?.temas ?? 0),
      mensajes: Number(row?.mensajes ?? 0),
      actividad: row?.actividad ? new Date(row.actividad).toISOString() : null,
    };
  });
}

export async function listTopics(categoria) {
  const rows = await run((sql) =>
    sql.query(
      `SELECT t.id, t.titulo, t.fijado, t.creado, t.actividad, ${AUTHOR_COLUMNS},
              (SELECT count(*) FROM foro_mensajes f WHERE f.tema_id = t.id)::integer - 1 AS respuestas
       FROM foro_temas t
       LEFT JOIN cuentas c ON c.id = t.cuenta_id
       LEFT JOIN miembros m ON m.id = c.miembro_id
       WHERE t.categoria = $1
       ORDER BY t.fijado DESC, t.actividad DESC
       LIMIT 100`,
      [categoria],
    ),
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    fijado: row.fijado === true || row.fijado === 't' || row.fijado === 'true',
    creado: new Date(row.creado).toISOString(),
    actividad: new Date(row.actividad).toISOString(),
    respuestas: Math.max(0, Number(row.respuestas)),
    autor: toAuthor(row),
  }));
}

export async function getTopic(id) {
  const [topics, messages] = await run((sql) =>
    Promise.all([
      sql.query(`SELECT id, categoria, titulo, fijado, cuenta_id, creado FROM foro_temas WHERE id = $1`, [id]),
      sql.query(
        `SELECT f.id, f.texto, f.creado, ${AUTHOR_COLUMNS}
         FROM foro_mensajes f
         LEFT JOIN cuentas c ON c.id = f.cuenta_id
         LEFT JOIN miembros m ON m.id = c.miembro_id
         WHERE f.tema_id = $1
         ORDER BY f.creado, f.id
         LIMIT 500`,
        [id],
      ),
    ]),
  );
  const topic = topics[0];
  if (!topic) throw new DbError(404, 'Ese tema ya no existe.');
  return {
    id: topic.id,
    categoria: topic.categoria,
    titulo: topic.titulo,
    fijado: topic.fijado === true || topic.fijado === 't' || topic.fijado === 'true',
    autorId: topic.cuenta_id,
    creado: new Date(topic.creado).toISOString(),
    mensajes: messages.map((row) => ({ id: row.id, texto: row.texto, creado: new Date(row.creado).toISOString(), autor: toAuthor(row) })),
  };
}

async function checkRate(sql, cuentaId) {
  const rows = await sql.query(
    `SELECT count(*) FILTER (WHERE creado > now() - interval '${SECONDS_BETWEEN_POSTS} seconds')::integer AS recientes,
            count(*) FILTER (WHERE creado > now() - interval '1 hour')::integer AS hora
     FROM foro_mensajes WHERE cuenta_id = $1`,
    [cuentaId],
  );
  if (Number(rows[0].recientes) > 0) throw new DbError(429, 'Espera unos segundos antes de enviar otro mensaje.');
  if (Number(rows[0].hora) >= POSTS_PER_HOUR) throw new DbError(429, 'Enviaste muchos mensajes en la última hora. Intenta más tarde.');
}

export async function createTopic(cuentaId, categoria, titulo, texto) {
  const id = newId();
  await run(async (sql) => {
    await checkRate(sql, cuentaId);
    await sql.query(`INSERT INTO foro_temas (id, categoria, titulo, cuenta_id) VALUES ($1, $2, $3, $4)`, [id, categoria, titulo, cuentaId]);
    await sql.query(`INSERT INTO foro_mensajes (id, tema_id, cuenta_id, texto) VALUES ($1, $2, $3, $4)`, [newId(), id, cuentaId, texto]);
  });
  return getTopic(id);
}

export async function reply(cuentaId, temaId, texto) {
  await run(async (sql) => {
    const exists = await sql.query(`SELECT 1 FROM foro_temas WHERE id = $1`, [temaId]);
    if (!exists.length) throw new DbError(404, 'Ese tema ya no existe.');
    await checkRate(sql, cuentaId);
    await sql.query(`INSERT INTO foro_mensajes (id, tema_id, cuenta_id, texto) VALUES ($1, $2, $3, $4)`, [newId(), temaId, cuentaId, texto]);
    await sql.query(`UPDATE foro_temas SET actividad = now() WHERE id = $1`, [temaId]);
  });
  return getTopic(temaId);
}

/**
 * Borra un mensaje. Cada quien borra los suyos; el administrador, cualquiera. Si era el
 * primer mensaje del tema, se borra el tema completo (solo si no tiene respuestas de otros,
 * salvo que lo borre el administrador).
 */
export async function deleteMessage(id, { cuentaId, admin }) {
  return run(async (sql) => {
    const rows = await sql.query(
      `SELECT f.cuenta_id, f.tema_id,
              (SELECT g.id FROM foro_mensajes g WHERE g.tema_id = f.tema_id ORDER BY g.creado, g.id LIMIT 1) AS primero,
              (SELECT count(*) FROM foro_mensajes g WHERE g.tema_id = f.tema_id AND g.cuenta_id IS DISTINCT FROM f.cuenta_id)::integer AS ajenos
       FROM foro_mensajes f WHERE f.id = $1`,
      [id],
    );
    const message = rows[0];
    if (!message) throw new DbError(404, 'Ese mensaje ya no existe.');
    if (!admin && message.cuenta_id !== cuentaId) throw new DbError(403, 'Solo puedes borrar tus propios mensajes.');
    if (message.primero === id) {
      if (!admin && Number(message.ajenos) > 0) {
        throw new DbError(409, 'Este tema ya tiene respuestas de otros miembros. Pídele al equipo que lo borre.');
      }
      await sql.query(`DELETE FROM foro_temas WHERE id = $1`, [message.tema_id]);
      return { temaBorrado: message.tema_id };
    }
    await sql.query(`DELETE FROM foro_mensajes WHERE id = $1`, [id]);
    return { borrado: id };
  });
}

export async function pinTopic(id, fijado) {
  const rows = await run((sql) => sql.query(`UPDATE foro_temas SET fijado = $2 WHERE id = $1 RETURNING id`, [id, fijado === true]));
  if (!rows.length) throw new DbError(404, 'Ese tema ya no existe.');
  return getTopic(id);
}

/** Perfil público de un miembro del foro */
export async function publicProfile(id) {
  const account = await accountById(id);
  if (!account || account.estado !== 'aprobada') throw new DbError(404, 'Ese perfil no existe.');
  const rows = await run((sql) => sql.query(`SELECT count(*)::integer AS total FROM foro_mensajes WHERE cuenta_id = $1`, [id]));
  return {
    id: account.id,
    entrenador: account.entrenador,
    ciudad: account.ciudad,
    avatar: account.avatar,
    shiny: account.shiny,
    equipo: account.equipo,
    bio: account.bio,
    creada: account.creada,
    mensajes: Number(rows[0].total),
    // El código solo se muestra si el miembro aparece en "Haz amigos"
    codigo: account.mostrar ? account.codigo : '',
  };
}
