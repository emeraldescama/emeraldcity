/**
 * "Haz amigos":
 *   GET   lista pública (nombre de entrenador, código, ciudad, recomendaciones)
 *   POST  { accion: 'recomendar', codigo } marca o quita "envía regalos"
 *
 * Quién vota lo dice una cookie firmada por el servidor (no se puede inventar desde el
 * navegador), y desde una misma conexión solo se aceptan unos pocos likes por entrenador.
 */
import { createHash } from 'node:crypto';
import { existingVoterId, sameOrigin, voterId } from './_cookies.js';
import { DbError, publicFriends, toggleRecommendation, votesOf } from './_miembros.js';

// Se guarda una huella, no el identificador ni la IP tal cual
const fingerprint = (text) => createHash('sha256').update(`emerald-city:${text}`).digest('hex');

function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] ?? '').split(',')[0] || req.socket?.remoteAddress || '').trim();
}

export default async function handler(req, res) {
  if (req.method === 'POST') return recommend(req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    const voter = existingVoterId(req);
    const [amigos, misVotos] = await Promise.all([publicFriends(), voter ? votesOf(fingerprint(voter)) : []]);
    // Sin caché: las recomendaciones y los miembros nuevos se ven al recargar
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ amigos, misVotos });
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo cargar la lista.' });
  }
}

async function recommend(req, res) {
  const body = req.body || {};
  const codigo = String(body.codigo ?? '').replace(/\D/g, '');
  if (body.accion !== 'recomendar' || codigo.length !== 12 || !sameOrigin(req)) {
    return res.status(400).json({ error: 'Petición no válida.' });
  }
  try {
    // "dispositivo" solo se usa la primera vez, para conservar los likes de la versión anterior
    const voter = voterId(req, res, body.dispositivo);
    const ip = clientIp(req);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await toggleRecommendation(codigo, fingerprint(voter), ip ? fingerprint(`red:${ip}`) : ''));
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo guardar tu recomendación.' });
  }
}
