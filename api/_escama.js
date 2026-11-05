/**
 * Miembros de Escama Esmeralda, leídos en vivo de su página (https://escama-6jm5.vercel.app).
 * Su API pública solo trae nombre, alias, inicio, si está de baja y la fecha de vencimiento
 * (sin pagos ni teléfonos). Se guarda 5 minutos en memoria para no consultarla en cada visita.
 *
 * "Activo" es lo mismo que muestra esa página: no está de baja y su suscripción no ha vencido.
 *
 * Variables de entorno:
 *   ESCAMA_PIN  PIN de administrador de Escama Esmeralda. Con él se leen también los
 *               teléfonos (solo en el servidor, nunca se muestran) para que cada miembro
 *               valide su suscripción escribiendo su número.
 *   ESCAMA_URL  opcional, si la página de Escama cambia de dirección.
 */
import { DbError, normalizePhone } from './_miembros.js';

const ESCAMA_URL = (process.env.ESCAMA_URL || 'https://escama-6jm5.vercel.app').replace(/\/$/, '');
const CACHE_MS = 5 * 60 * 1000;

let cache = null;
let phonesError = '';

/** Por qué no se pueden validar teléfonos ('' si se puede) */
export function escamaPhoneProblem() {
  if (!escamaPhonesConfigured()) return 'Falta configurar ESCAMA_PIN en Vercel para validar con el teléfono.';
  return phonesError;
}

/** Fecha de hoy en Caracas (UTC−4), "YYYY-MM-DD" */
export function caracasToday() {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export const escamaPhonesConfigured = () => Boolean(process.env.ESCAMA_PIN?.trim());

function status(member, today) {
  if (member.activo === false) return 'baja';
  const venc = String(member.venc ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return 'pendiente';
  return venc >= today ? 'activo' : 'vencido';
}

async function fetchData(headers = {}) {
  const res = await fetch(`${ESCAMA_URL}/api/data`, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Teléfonos de los miembros (id → número normalizado), con el PIN de Escama */
async function fetchPhones() {
  const doc = await fetchData({ 'x-admin-pin': process.env.ESCAMA_PIN.trim() });
  if (doc.restricted) throw new Error('El PIN de Escama Esmeralda (ESCAMA_PIN) no es correcto.');
  return new Map((doc?.data?.members ?? []).filter((m) => m?.id).map((m) => [String(m.id), normalizePhone(m.telefono)]));
}

/** [{ id, nombre, alias, venc, estado, activo, telefono }] (telefono solo con ESCAMA_PIN) */
export async function escamaMembers({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.members;
  let doc;
  let phones = new Map();
  try {
    // Si fallan los teléfonos (PIN mal escrito), la lista y los activos siguen funcionando
    const [data, phoneResult] = await Promise.all([fetchData(), escamaPhonesConfigured() ? fetchPhones().catch((err) => err) : new Map()]);
    doc = data;
    phonesError = phoneResult instanceof Error ? phoneResult.message : '';
    if (!(phoneResult instanceof Error)) phones = phoneResult;
  } catch (err) {
    // Si Escama no responde se usa la última lista conocida
    if (cache) return cache.members;
    if (err instanceof DbError) throw err;
    throw new DbError(502, `No se pudo consultar Escama Esmeralda (${err.message}).`);
  }
  const today = caracasToday();
  const members = (doc?.data?.members ?? [])
    .filter((m) => m && m.id)
    .map((m) => {
      const estado = status(m, today);
      return {
        id: String(m.id),
        nombre: String(m.nombre ?? ''),
        alias: String(m.alias ?? '').replace(/^@/, ''),
        venc: String(m.venc ?? '').slice(0, 10),
        estado,
        activo: estado === 'activo',
        telefono: phones.get(String(m.id)) ?? '',
      };
    });
  cache = { at: Date.now(), members };
  return members;
}
