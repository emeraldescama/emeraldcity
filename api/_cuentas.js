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
import { caracasToday } from './_escama.js';
import { DbError, newId, normalizePhone, run } from './_miembros.js';

const scryptAsync = promisify(scrypt);

export const ESTADOS = ['pendiente', 'aprobada', 'bloqueada'];
export const EQUIPOS = ['', 'instinto', 'sabiduria', 'valor'];
export const CATEGORIAS = {
  general: 'General',
  intercambios: 'Intercambios',
  incursiones: 'Incursiones y quedadas',
  eventos: 'Eventos',
  cumpleanos: 'Cumpleaños',
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

const ACCOUNT_COLUMNS = `c.id, c.estado, c.sesion, c.avatar, c.shiny, c.equipo, c.bio, c.creada, c.rol,
  m.entrenador, m.ciudad, m.codigo, m.mostrar, m.cumple_dia, m.cumple_mes`;

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
    cumpleDia: row.cumple_dia === null || row.cumple_dia === undefined ? null : Number(row.cumple_dia),
    cumpleMes: row.cumple_mes === null || row.cumple_mes === undefined ? null : Number(row.cumple_mes),
    rol: row.rol ?? '',
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
      `SELECT m.id, m.telefono, m.pokemon, c.id AS cuenta FROM miembros m LEFT JOIN cuentas c ON c.miembro_id = m.id WHERE m.codigo = $1`,
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
    // Queda aprobada de una vez; el perfil empieza con el Pokémon favorito que eligió al registrarse
    await sql.query(`INSERT INTO cuentas (id, miembro_id, clave, avatar, estado) VALUES ($1, $2, $3, coalesce($4::integer, 25), 'aprobada')`, [
      id,
      member.id,
      await hashPassword(password),
      member.pokemon ?? null,
    ]);
    return [{ id }];
  });
  return accountById(rows[0].id);
}

// Intentos fallidos de recuperar la contraseña que se permiten por hora: pocos por código, y
// más por conexión (en una quedada muchos teléfonos salen a internet por la misma)
const RESET_TRIES_PER_CODE = 5;
const RESET_TRIES_PER_NETWORK = 15;

/**
 * El miembro cambia su contraseña olvidada sin ayuda: demuestra que es él con su código de
 * amistad y el WhatsApp con el que se registró (la misma prueba que al crear la cuenta).
 * Cierra las sesiones abiertas en otros teléfonos y devuelve la cuenta para entrar.
 */
export async function recoverPassword(codigo, telefono, nueva, red = '') {
  const tries = await run((sql) =>
    sql.query(
      `SELECT count(*) FILTER (WHERE codigo = $1)::integer AS por_codigo,
              count(*) FILTER (WHERE $2 <> '' AND red = $2)::integer AS por_red
       FROM recuperar_intentos WHERE creado > now() - interval '1 hour'`,
      [codigo, red],
    ),
  );
  if (Number(tries[0].por_codigo) >= RESET_TRIES_PER_CODE || Number(tries[0].por_red) >= RESET_TRIES_PER_NETWORK) {
    throw new DbError(429, 'Hiciste muchos intentos. Espera una hora o escríbele al equipo por WhatsApp.');
  }
  const failed = async (status, message) => {
    await run((sql) => sql.query(`INSERT INTO recuperar_intentos (codigo, red) VALUES ($1, $2)`, [codigo, red]));
    throw new DbError(status, message);
  };
  const rows = await run((sql) =>
    sql.query(`SELECT c.id, c.estado, m.telefono FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE m.codigo = $1`, [codigo]),
  );
  const account = rows[0];
  if (!account) return failed(404, 'Ese código no tiene cuenta todavía. Créala en "Crear mi cuenta".');
  if (account.estado === 'bloqueada') throw new DbError(403, 'Tu cuenta está bloqueada. Escríbele al equipo si crees que es un error.');
  if (!account.telefono) {
    throw new DbError(409, 'No tienes un WhatsApp registrado en la comunidad, así que no podemos comprobar que eres tú. Escríbele al equipo y te ayudamos.');
  }
  if (normalizePhone(telefono) !== account.telefono) {
    return failed(403, 'El WhatsApp no coincide con el que registraste en la comunidad.');
  }
  await run(async (sql) => sql.query(`UPDATE cuentas SET clave = $2, sesion = sesion + 1 WHERE id = $1`, [account.id, await hashPassword(nueva)]));
  return accountById(account.id);
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
  await run(async (sql) => {
    await sql.query(`UPDATE cuentas SET avatar = $2, shiny = $3, equipo = $4, bio = $5 WHERE id = $1`, [
      id,
      profile.avatar,
      profile.shiny,
      profile.equipo,
      profile.bio,
    ]);
    // El Pokémon del perfil es también su favorito (el del flyer de cumpleaños)
    await sql.query(
      `UPDATE miembros SET pokemon = $2, cumple_dia = $3, cumple_mes = $4 WHERE id = (SELECT miembro_id FROM cuentas WHERE id = $1)`,
      [id, profile.avatar, profile.cumpleDia, profile.cumpleMes],
    );
  });
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

// ---------- Administradores del foro ----------

/** Cuenta del administrador principal (la del panel), o null si todavía no la creó */
export async function mainAdminAccount() {
  const rows = await run((sql) => sql.query(`SELECT id FROM cuentas WHERE rol = 'principal' LIMIT 1`));
  return rows.length ? accountById(rows[0].id) : null;
}

/**
 * Crea la cuenta del administrador principal para escribir en el foro. Si ya es miembro
 * (da su código de amistad) se usa ese registro; si no, se crea uno solo para el foro,
 * que no aparece en "Haz amigos". No necesita contraseña: entra con la sesión del panel.
 */
export async function createMainAdmin(nick, codigo) {
  if (await mainAdminAccount()) throw new DbError(409, 'Ya creaste tu cuenta de administrador.');
  await run(async (sql) => {
    let memberId;
    if (codigo) {
      const members = await sql.query(
        `SELECT m.id, c.id AS cuenta FROM miembros m LEFT JOIN cuentas c ON c.miembro_id = m.id WHERE m.codigo = $1`,
        [codigo],
      );
      if (!members.length) throw new DbError(404, 'Ese código no está en la lista de miembros. Déjalo vacío para crear la cuenta solo con tu nick.');
      await sql.query(`UPDATE miembros SET entrenador = $2 WHERE id = $1`, [members[0].id, nick]);
      if (members[0].cuenta) {
        // Ya tenía cuenta de miembro: esa pasa a ser la del administrador principal
        await sql.query(`UPDATE cuentas SET rol = 'principal', estado = 'aprobada' WHERE id = $1`, [members[0].cuenta]);
        return;
      }
      memberId = members[0].id;
    } else {
      const taken = await sql.query(`SELECT 1 FROM miembros WHERE lower(entrenador) = lower($1)`, [nick]);
      if (taken.length) throw new DbError(409, `Ya hay un miembro llamado ${nick}. Si eres tú, escribe tu código de amistad para usar ese registro.`);
      memberId = newId();
      await sql.query(`INSERT INTO miembros (id, entrenador, mostrar, origen, bienvenida) VALUES ($1, $2, false, 'admin', 'Administrador')`, [memberId, nick]);
    }
    // Sin contraseña usable: solo se entra con la sesión del panel
    await sql.query(`INSERT INTO cuentas (id, miembro_id, clave, estado, rol) VALUES ($1, $2, $3, 'aprobada', 'principal')`, [
      newId(),
      memberId,
      await hashPassword(randomBytes(24).toString('base64')),
    ]);
  });
  return mainAdminAccount();
}

/** Da o quita la etiqueta de administrador en el foro */
export async function setAccountRole(id, rol) {
  if (!['', 'admin'].includes(rol)) throw new DbError(400, 'Etiqueta no válida.');
  const rows = await run((sql) => sql.query(`UPDATE cuentas SET rol = $2 WHERE id = $1 AND rol <> 'principal' RETURNING id`, [id, rol]));
  if (!rows.length) throw new DbError(409, 'Esa cuenta no existe o es la del administrador principal.');
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

const bool = (v) => v === true || v === 't' || v === 'true';

// Se vuelve a revisar cada 10 minutos: así un cumpleaños de hoy agregado o importado a
// media mañana también recibe su tema y su felicitación
const BIRTHDAY_CHECK_MS = 10 * 60 * 1000;
let birthdaysChecked = { day: '', at: 0 };

/**
 * Abre el tema de cumpleaños de cada miembro que cumple años hoy (hora de Caracas). Se
 * llama al abrir el foro, la página de inicio y el correo diario; el índice único evita temas repetidos aunque varias visitas
 * lleguen a la vez. Quien cumple el 29 de febrero lo celebra el 28 en los años no bisiestos.
 */
export async function ensureBirthdays() {
  const today = caracasToday();
  if (birthdaysChecked.day === today && Date.now() - birthdaysChecked.at < BIRTHDAY_CHECK_MS) return;
  const [year, month, day] = today.split('-').map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const alsoFeb29 = month === 2 && day === 28 && !leap;
  await run(async (sql) => {
    const members = await sql.query(
      `SELECT id, entrenador FROM miembros
       WHERE entrenador <> '' AND ((cumple_mes = $1 AND cumple_dia = $2) OR ($3::boolean AND cumple_mes = 2 AND cumple_dia = 29))`,
      [month, day, alsoFeb29],
    );
    for (const member of members) {
      const temaId = newId();
      const created = await sql.query(
        `INSERT INTO foro_temas (id, categoria, titulo, cumple_miembro, cumple_fecha) VALUES ($1, 'cumpleanos', $2, $3, $4)
         ON CONFLICT (cumple_miembro, cumple_fecha) DO NOTHING RETURNING id`,
        [temaId, `¡Feliz cumpleaños, ${member.entrenador}! 🎂`, member.id, today],
      );
      if (!created.length) continue;
      await sql.query(`INSERT INTO foro_mensajes (id, tema_id, cuenta_id, texto, sistema) VALUES ($1, $2, NULL, $3, true)`, [
        newId(),
        temaId,
        `¡Hoy está de cumpleaños ${member.entrenador}! 🎉 Toda la comunidad de Emerald City te desea un día lleno de shinies. Déjale tus felicitaciones aquí abajo.`,
      ]);
    }
  });
  birthdaysChecked = { day: today, at: Date.now() };
}

const AUTHOR_COLUMNS = `c.id AS autor_id, m.entrenador AS autor, c.avatar, c.shiny, c.equipo, c.rol`;

// Autor de los mensajes que escribe la web sola (los temas de cumpleaños)
const SYSTEM_AUTHOR = { id: 'emerald', entrenador: 'Emerald City', avatar: 384, shiny: false, equipo: '', sistema: true };

function toAuthor(row) {
  if (bool(row.sistema)) return SYSTEM_AUTHOR;
  if (!row.autor_id) return null;
  return {
    id: row.autor_id,
    entrenador: row.autor,
    avatar: Number(row.avatar),
    shiny: row.shiny === true || row.shiny === 't' || row.shiny === 'true',
    equipo: row.equipo,
    rol: row.rol ?? '',
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
      `SELECT t.id, t.titulo, t.fijado, t.creado, t.actividad, ${AUTHOR_COLUMNS}, (t.cumple_miembro IS NOT NULL) AS sistema,
              (SELECT count(*) FROM foro_mensajes f WHERE f.tema_id = t.id)::integer - 1 AS respuestas
       FROM foro_temas t
       LEFT JOIN cuentas c ON c.id = t.cuenta_id
       LEFT JOIN miembros m ON m.id = c.miembro_id
       WHERE t.categoria = $1
       ORDER BY t.fijado DESC, coalesce(t.cumple_fecha, t.actividad::date) DESC, t.actividad DESC
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

export async function getTopic(id, viewerId = null) {
  const [topics, messages] = await run((sql) =>
    Promise.all([
      sql.query(
        `SELECT t.id, t.categoria, t.titulo, t.fijado, t.cuenta_id, t.creado, t.cumple_fecha,
                m.entrenador AS cumple_entrenador, m.codigo AS cumple_codigo, m.mostrar AS cumple_mostrar,
                coalesce(c.avatar, m.pokemon) AS cumple_pokemon, c.shiny AS cumple_shiny
         FROM foro_temas t
         LEFT JOIN miembros m ON m.id = t.cumple_miembro
         LEFT JOIN cuentas c ON c.miembro_id = m.id
         WHERE t.id = $1`,
        [id],
      ),
      sql.query(
        `SELECT f.id, f.texto, f.creado, f.sistema, f.respuesta_a, ${AUTHOR_COLUMNS},
                (SELECT count(*) FROM foro_likes l WHERE l.mensaje_id = f.id)::integer AS likes,
                EXISTS (SELECT 1 FROM foro_likes l WHERE l.mensaje_id = f.id AND l.cuenta_id = $2::text) AS me_gusta,
                (SELECT string_agg(x.entrenador, ', ') FROM (
                   SELECT m2.entrenador FROM foro_likes l2 JOIN cuentas c2 ON c2.id = l2.cuenta_id JOIN miembros m2 ON m2.id = c2.miembro_id
                   WHERE l2.mensaje_id = f.id ORDER BY l2.creado DESC LIMIT 12
                 ) x) AS gustan
         FROM foro_mensajes f
         LEFT JOIN cuentas c ON c.id = f.cuenta_id
         LEFT JOIN miembros m ON m.id = c.miembro_id
         WHERE f.tema_id = $1
         ORDER BY f.creado, f.id
         LIMIT 500`,
        [id, viewerId],
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
    // Datos del flyer de cumpleaños; el código solo si el miembro aparece en "Haz amigos"
    cumple: topic.cumple_entrenador
      ? {
          entrenador: topic.cumple_entrenador,
          codigo: bool(topic.cumple_mostrar) && String(topic.cumple_codigo ?? '').length === 12 ? topic.cumple_codigo : '',
          pokemon: topic.cumple_pokemon === null || topic.cumple_pokemon === undefined ? 384 : Number(topic.cumple_pokemon),
          shiny: bool(topic.cumple_shiny),
          fecha: String(topic.cumple_fecha instanceof Date ? topic.cumple_fecha.toISOString() : topic.cumple_fecha).slice(0, 10),
        }
      : null,
    mensajes: messages.map((row) => ({
      id: row.id,
      texto: row.texto,
      creado: new Date(row.creado).toISOString(),
      autor: toAuthor(row),
      respuestaA: row.respuesta_a ?? null,
      likes: Number(row.likes),
      meGusta: bool(row.me_gusta),
      gustan: row.gustan ? String(row.gustan).split(', ') : [],
    })),
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

// "@Ophiuc0" en un mensaje: nombres de entrenador de 2 a 30 letras, números o _
const MENTION = /@([\p{L}\p{N}_]{2,30})/gu;

/**
 * Avisos de un mensaje nuevo: a quien escribió el comentario al que responde y a cada
 * cuenta aprobada que se menciona con @. Nunca a uno mismo ni dos avisos a la misma persona.
 */
async function notify(sql, cuentaId, mensajeId, texto, parentAuthor) {
  const notified = new Set([cuentaId]);
  const add = async (to, tipo) => {
    if (!to || notified.has(to)) return;
    notified.add(to);
    await sql.query(`INSERT INTO foro_avisos (id, cuenta_id, tipo, de_cuenta, mensaje_id) VALUES ($1, $2, $3, $4, $5)`, [newId(), to, tipo, cuentaId, mensajeId]);
  };
  await add(parentAuthor, 'respuesta');
  const names = [...new Set([...texto.matchAll(MENTION)].map((m) => m[1].toLowerCase()))].slice(0, 10);
  if (names.length) {
    const mentioned = await sql.query(
      `SELECT c.id FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE c.estado = 'aprobada' AND lower(m.entrenador) = ANY($1::text[])`,
      [names],
    );
    for (const row of mentioned) await add(row.id, 'mencion');
  }
}

export async function createTopic(cuentaId, categoria, titulo, texto) {
  const id = newId();
  await run(async (sql) => {
    await checkRate(sql, cuentaId);
    const mensajeId = newId();
    await sql.query(`INSERT INTO foro_temas (id, categoria, titulo, cuenta_id) VALUES ($1, $2, $3, $4)`, [id, categoria, titulo, cuentaId]);
    await sql.query(`INSERT INTO foro_mensajes (id, tema_id, cuenta_id, texto) VALUES ($1, $2, $3, $4)`, [mensajeId, id, cuentaId, texto]);
    await notify(sql, cuentaId, mensajeId, texto, null);
  });
  return getTopic(id, cuentaId);
}

/** Respuesta en un tema; con respuestaA, responde a un comentario en particular */
export async function reply(cuentaId, temaId, texto, respuestaA = null) {
  await run(async (sql) => {
    const exists = await sql.query(`SELECT 1 FROM foro_temas WHERE id = $1`, [temaId]);
    if (!exists.length) throw new DbError(404, 'Ese tema ya no existe.');
    let parentAuthor = null;
    if (respuestaA) {
      const parent = await sql.query(`SELECT cuenta_id FROM foro_mensajes WHERE id = $1 AND tema_id = $2`, [respuestaA, temaId]);
      if (!parent.length) throw new DbError(404, 'El comentario al que respondes ya no existe.');
      parentAuthor = parent[0].cuenta_id;
    }
    await checkRate(sql, cuentaId);
    const mensajeId = newId();
    await sql.query(`INSERT INTO foro_mensajes (id, tema_id, cuenta_id, texto, respuesta_a) VALUES ($1, $2, $3, $4, $5)`, [
      mensajeId,
      temaId,
      cuentaId,
      texto,
      respuestaA,
    ]);
    await sql.query(`UPDATE foro_temas SET actividad = now() WHERE id = $1`, [temaId]);
    await notify(sql, cuentaId, mensajeId, texto, parentAuthor);
  });
  return getTopic(temaId, cuentaId);
}

/** Me gusta en un comentario: tocar de nuevo lo quita. No se da a los comentarios propios */
export async function toggleLike(cuentaId, mensajeId) {
  return run(async (sql) => {
    const rows = await sql.query(`SELECT cuenta_id FROM foro_mensajes WHERE id = $1`, [mensajeId]);
    if (!rows.length) throw new DbError(404, 'Ese comentario ya no existe.');
    if (rows[0].cuenta_id === cuentaId) throw new DbError(409, 'No puedes darle me gusta a tu propio comentario.');
    const removed = await sql.query(`DELETE FROM foro_likes WHERE mensaje_id = $1 AND cuenta_id = $2 RETURNING 1`, [mensajeId, cuentaId]);
    if (!removed.length) await sql.query(`INSERT INTO foro_likes (mensaje_id, cuenta_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [mensajeId, cuentaId]);
    const count = await sql.query(`SELECT count(*)::integer AS total FROM foro_likes WHERE mensaje_id = $1`, [mensajeId]);
    return { likes: Number(count[0].total), meGusta: !removed.length };
  });
}

/** Últimos avisos (menciones y respuestas) de una cuenta y cuántos no ha visto */
export async function notices(cuentaId) {
  const rows = await run((sql) =>
    sql.query(
      `SELECT a.id, a.tipo, a.leido, a.creado, a.mensaje_id, t.id AS tema_id, t.titulo, m.entrenador AS de, c.avatar, c.shiny
       FROM foro_avisos a
       JOIN foro_mensajes f ON f.id = a.mensaje_id JOIN foro_temas t ON t.id = f.tema_id
       LEFT JOIN cuentas c ON c.id = a.de_cuenta LEFT JOIN miembros m ON m.id = c.miembro_id
       WHERE a.cuenta_id = $1
       ORDER BY a.creado DESC LIMIT 30`,
      [cuentaId],
    ),
  );
  const avisos = rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    leido: bool(r.leido),
    creado: new Date(r.creado).toISOString(),
    mensajeId: r.mensaje_id,
    temaId: r.tema_id,
    titulo: r.titulo,
    de: r.de ?? 'Alguien',
    avatar: r.avatar === null || r.avatar === undefined ? 25 : Number(r.avatar),
    shiny: bool(r.shiny),
  }));
  return { avisos, nuevos: avisos.filter((a) => !a.leido).length };
}

export async function markNoticesRead(cuentaId) {
  await run((sql) => sql.query(`UPDATE foro_avisos SET leido = true WHERE cuenta_id = $1 AND NOT leido`, [cuentaId]));
  return { nuevos: 0 };
}

/** Cuentas aprobadas, para sugerir nombres al escribir @ */
export async function forumUsers() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT c.id, m.entrenador, c.avatar, c.shiny, c.rol FROM cuentas c JOIN miembros m ON m.id = c.miembro_id
       WHERE c.estado = 'aprobada' AND m.entrenador <> '' ORDER BY lower(m.entrenador)`,
    ),
  );
  return rows.map((r) => ({ id: r.id, entrenador: r.entrenador, avatar: Number(r.avatar), shiny: bool(r.shiny), rol: r.rol ?? '' }));
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

/**
 * Quienes cumplen años hoy, para la página de inicio: solo datos públicos (nombre de
 * entrenador, Pokémon y el código si aparece en "Haz amigos"; nunca el teléfono).
 */
export async function birthdaysToday() {
  await ensureBirthdays();
  const rows = await run((sql) =>
    sql.query(
      `SELECT t.id AS tema, t.cumple_fecha, m.entrenador, m.codigo, m.mostrar, coalesce(c.avatar, m.pokemon) AS pokemon, c.shiny
       FROM foro_temas t JOIN miembros m ON m.id = t.cumple_miembro LEFT JOIN cuentas c ON c.miembro_id = m.id
       WHERE t.cumple_fecha = $1 ORDER BY lower(m.entrenador)`,
      [caracasToday()],
    ),
  );
  return rows.map((r) => ({
    tema: r.tema,
    entrenador: r.entrenador,
    codigo: bool(r.mostrar) && String(r.codigo ?? '').length === 12 ? r.codigo : '',
    pokemon: r.pokemon === null || r.pokemon === undefined ? 384 : Number(r.pokemon),
    shiny: bool(r.shiny),
    fecha: String(r.cumple_fecha instanceof Date ? r.cumple_fecha.toISOString() : r.cumple_fecha).slice(0, 10),
  }));
}

/** WhatsApp de quien cumple años en un tema de cumpleaños (solo para el administrador) */
export async function birthdayPhone(temaId) {
  const rows = await run((sql) =>
    sql.query(`SELECT m.telefono FROM foro_temas t JOIN miembros m ON m.id = t.cumple_miembro WHERE t.id = $1`, [temaId]),
  );
  return rows[0]?.telefono ?? '';
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
    rol: account.rol,
    // El código solo se muestra si el miembro aparece en "Haz amigos"
    codigo: account.mostrar ? account.codigo : '',
  };
}
