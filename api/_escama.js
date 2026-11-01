/**
 * Miembros de Escama Esmeralda, leídos en vivo de su página (https://escama-6jm5.vercel.app).
 * Su API pública solo trae nombre, alias, inicio, si está de baja y la fecha de vencimiento
 * (sin pagos ni teléfonos). Se guarda 5 minutos en memoria para no consultarla en cada visita.
 *
 * "Activo" es lo mismo que muestra esa página: no está de baja y su suscripción no ha vencido.
 *
 * Variable de entorno opcional: ESCAMA_URL (si la página de Escama cambia de dirección).
 */
import { DbError } from './_miembros.js';

const ESCAMA_URL = (process.env.ESCAMA_URL || 'https://escama-6jm5.vercel.app').replace(/\/$/, '');
const CACHE_MS = 5 * 60 * 1000;

let cache = null;

/** Fecha de hoy en Caracas (UTC−4), "YYYY-MM-DD" */
export function caracasToday() {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function status(member, today) {
  if (member.activo === false) return 'baja';
  const venc = String(member.venc ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return 'pendiente';
  return venc >= today ? 'activo' : 'vencido';
}

/** [{ id, nombre, alias, venc, estado, activo }] */
export async function escamaMembers({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.members;
  let doc;
  try {
    const res = await fetch(`${ESCAMA_URL}/api/data`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    doc = await res.json();
  } catch (err) {
    // Si Escama no responde se usa la última lista conocida
    if (cache) return cache.members;
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
      };
    });
  cache = { at: Date.now(), members };
  return members;
}
