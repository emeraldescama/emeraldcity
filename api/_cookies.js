/**
 * Cookies firmadas para que nadie pueda fabricarlas ni cambiarlas desde el navegador:
 *   ec_admin    sesión del panel (8 horas). Es HttpOnly: ningún script de la página puede
 *               leerla, y el PIN ya no se guarda en el navegador.
 *   ec_votante  identificador anónimo para los likes de "Haz amigos" (1 año).
 *
 * La firma usa SESSION_SECRET si existe en Vercel; si no, una clave derivada del PIN y de la
 * base de datos (al cambiar el PIN se cierran todas las sesiones del panel).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ADMIN_COOKIE = 'ec_admin';
const VOTER_COOKIE = 'ec_votante';
const ADMIN_HOURS = 8;

function secret(purpose) {
  const base = process.env.SESSION_SECRET || `${purpose === 'admin' ? process.env.ADMIN_PIN : ''}|${process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.ADMIN_PIN ?? ''}`;
  return createHmac('sha256', 'emerald-city').update(`${purpose}|${base}`).digest();
}

function sign(value, purpose) {
  return createHmac('sha256', secret(purpose)).update(value).digest('base64url');
}

/** "valor.firma" → valor, o null si la firma no coincide */
function verify(token, purpose) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(value, purpose));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}

export function readCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}

function addCookie(res, cookie) {
  const previous = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), cookie]);
}

function cookieText(name, value, maxAge, sameSite) {
  return `${name}=${encodeURIComponent(value)}; Path=/api; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}

// ---------- Panel ----------

export function startAdminSession(res) {
  const expires = Date.now() + ADMIN_HOURS * 3600 * 1000;
  const value = `${expires}:${randomBytes(9).toString('base64url')}`;
  addCookie(res, cookieText(ADMIN_COOKIE, `${value}.${sign(value, 'admin')}`, ADMIN_HOURS * 3600, 'Strict'));
}

export function endAdminSession(res) {
  addCookie(res, cookieText(ADMIN_COOKIE, '', 0, 'Strict'));
}

export function hasAdminSession(req) {
  const value = verify(readCookies(req)[ADMIN_COOKIE], 'admin');
  return Boolean(value && Number(value.split(':')[0]) > Date.now());
}

/**
 * Las peticiones que cambian datos deben venir de la misma página: frena que otra web
 * aproveche la sesión abierta del administrador.
 */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // algunos navegadores no lo envían en peticiones del mismo sitio
  try {
    return new URL(origin).host === req.headers['x-forwarded-host'] || new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// ---------- Likes ----------

/**
 * Identificador del votante. Si no tiene cookie se le crea una; quien ya votaba con el
 * identificador que guardaba la página (versión anterior) lo conserva para no perder sus likes.
 */
export function voterId(req, res, legacyId) {
  const current = verify(readCookies(req)[VOTER_COOKIE], 'votante');
  if (current) return current;
  const id = typeof legacyId === 'string' && /^[\w-]{8,64}$/.test(legacyId) ? legacyId : randomBytes(12).toString('base64url');
  addCookie(res, cookieText(VOTER_COOKIE, `${id}.${sign(id, 'votante')}`, 365 * 24 * 3600, 'Lax'));
  return id;
}

/** Votante ya identificado por su cookie, sin crear una nueva */
export function existingVoterId(req) {
  return verify(readCookies(req)[VOTER_COOKIE], 'votante');
}
