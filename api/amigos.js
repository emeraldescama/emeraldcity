/**
 * "Haz amigos":
 *   GET   lista pública (nombre de entrenador, código, ciudad, recomendaciones)
 *   POST  { accion: 'recomendar', codigo, dispositivo } marca o quita "envía regalos"
 */
import { createHash } from 'node:crypto';
import { DbError, publicFriends, toggleRecommendation } from './_miembros.js';

export default async function handler(req, res) {
  if (req.method === 'POST') return recommend(req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    const amigos = await publicFriends();
    // Sin caché: las recomendaciones y los miembros nuevos se ven al recargar
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ amigos });
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo cargar la lista.' });
  }
}

async function recommend(req, res) {
  const body = req.body || {};
  const codigo = String(body.codigo ?? '').replace(/\D/g, '');
  const dispositivo = String(body.dispositivo ?? '');
  if (body.accion !== 'recomendar' || codigo.length !== 12 || !/^[\w-]{8,64}$/.test(dispositivo)) {
    return res.status(400).json({ error: 'Petición no válida.' });
  }
  try {
    // Se guarda una huella del dispositivo, no el identificador tal cual
    const votante = createHash('sha256').update(`emerald-city:${dispositivo}`).digest('hex');
    return res.status(200).json(await toggleRecommendation(codigo, votante));
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo guardar tu recomendación.' });
  }
}
