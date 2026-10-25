/**
 * Registro de miembros de Emerald City guardado en la base de datos de la página
 * (Upstash Redis, conectado desde Vercel → Storage). Los archivos de api/ que empiezan
 * con "_" no se publican como rutas.
 *
 * Variables de entorno (las crea Vercel solo al conectar la base de datos):
 *   KV_REST_API_URL y KV_REST_API_TOKEN  (o UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN)
 *
 * Claves:
 *   miembros         hash  id → datos del miembro (JSON)
 *   codigos          hash  código de amistad → id (evita registros duplicados)
 *   captura:<id>     texto captura del perfil en base64 (JPEG)
 */
import { randomUUID } from 'node:crypto';

export const LEGACY_WELCOME = 'Antes de la web';

export class DbError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const dbUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const dbToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export function dbConfigured() {
  return Boolean(dbUrl() && dbToken());
}

/** Ejecuta varios comandos de Redis en una sola petición y devuelve sus resultados */
async function redis(commands) {
  if (!dbConfigured()) {
    throw new DbError(500, 'Falta conectar la base de datos en Vercel (Storage → Upstash Redis).');
  }
  const res = await fetch(`${dbUrl()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dbToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new DbError(502, `La base de datos respondió ${res.status}.`);
  const replies = await res.json();
  const failed = replies.find((r) => r.error);
  if (failed) throw new DbError(502, `Error de la base de datos: ${failed.error}`);
  return replies.map((r) => r.result);
}

/** Convierte la respuesta de HGETALL ([campo, valor, campo, valor…]) en una lista */
function parseHash(flat) {
  const items = [];
  for (let i = 1; i < (flat || []).length; i += 2) items.push(JSON.parse(flat[i]));
  return items;
}

export async function listMembers() {
  const [flat] = await redis([['HGETALL', 'miembros']]);
  return parseHash(flat).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

async function getMember(id) {
  const [raw] = await redis([['HGET', 'miembros', String(id)]]);
  if (!raw) throw new DbError(404, 'Ese miembro ya no existe.');
  return JSON.parse(raw);
}

/** Registro desde el formulario de /unirse */
export async function addMember(registro, captura) {
  const id = randomUUID().slice(0, 8);
  const [isNew] = await redis([['HSETNX', 'codigos', registro.codigo, id]]);
  if (!isNew) throw new DbError(409, 'Ese código de amistad ya está registrado en la comunidad.');

  const member = {
    id,
    fecha: new Date().toISOString(),
    entrenador: registro.entrenador,
    nombre: registro.nombre,
    ciudad: registro.ciudad,
    codigo: registro.codigo,
    campfire: registro.campfire,
    campfireNombre: registro.campfireNombre,
    edad: registro.edad,
    mostrar: registro.mostrarEnAmigos,
    bienvenida: '',
    origen: 'web',
    tieneCaptura: true,
  };
  await redis([
    ['SET', `captura:${id}`, captura],
    ['HSET', 'miembros', id, JSON.stringify(member)],
  ]);
  return member;
}

/** Miembros que ya estaban en la hoja anterior. Devuelve cuántos se agregaron y cuántos ya existían */
export async function importMembers(list) {
  const withId = list.map((item) => ({ ...item, id: randomUUID().slice(0, 8) }));
  // Reserva todos los códigos en una sola petición; los que ya existían devuelven 0
  const withCode = withId.filter((item) => item.codigo);
  const reserved = withCode.length ? await redis(withCode.map((item) => ['HSETNX', 'codigos', item.codigo, item.id])) : [];
  const rejected = new Set(withCode.filter((_, i) => !reserved[i]).map((item) => item.id));

  const members = withId
    .filter((item) => !rejected.has(item.id))
    .map((item) => ({
      id: item.id,
      fecha: item.fecha || new Date().toISOString(),
      entrenador: item.entrenador,
      nombre: item.nombre || '',
      ciudad: item.ciudad || '',
      codigo: item.codigo || '',
      campfire: item.campfire ?? null,
      campfireNombre: item.campfireNombre || '',
      edad: item.edad ?? null,
      mostrar: true,
      bienvenida: LEGACY_WELCOME,
      origen: 'importado',
      tieneCaptura: false,
    }));
  if (members.length) await redis([['HSET', 'miembros', ...members.flatMap((m) => [m.id, JSON.stringify(m)])]]);
  return { added: members.length, duplicated: rejected.size };
}

const EDITABLE = ['mostrar'];

export async function updateMember(id, patch) {
  const member = await getMember(id);
  for (const key of EDITABLE) if (key in patch) member[key] = patch[key];
  await redis([['HSET', 'miembros', member.id, JSON.stringify(member)]]);
  return member;
}

export async function deleteMember(id) {
  const member = await getMember(id);
  const commands = [
    ['HDEL', 'miembros', member.id],
    ['DEL', `captura:${member.id}`],
  ];
  if (member.codigo) commands.push(['HDEL', 'codigos', member.codigo]);
  await redis(commands);
  return { id: member.id };
}

/**
 * Marca la bienvenida como enviada y borra la captura: solo servía para el flyer de
 * bienvenida, y así el plan gratuito de la base de datos alcanza para miles de miembros.
 */
export async function markWelcomed(id) {
  const member = await getMember(id);
  member.bienvenida = new Date().toISOString();
  member.tieneCaptura = false;
  await redis([
    ['HSET', 'miembros', member.id, JSON.stringify(member)],
    ['DEL', `captura:${member.id}`],
  ]);
  return member;
}

export async function getScreenshot(id) {
  const [base64] = await redis([['GET', `captura:${id}`]]);
  if (!base64) throw new DbError(404, 'Este miembro no tiene captura.');
  return { tipo: 'image/jpeg', base64 };
}

/** Lista pública de "Haz amigos": solo nombre de entrenador, código y ciudad */
export async function publicFriends() {
  const members = await listMembers();
  return members
    .filter((m) => m.mostrar && m.codigo?.length === 12 && m.entrenador)
    .map(({ entrenador, codigo, ciudad }) => ({ entrenador, codigo, ciudad }));
}
