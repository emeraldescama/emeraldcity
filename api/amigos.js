/**
 * Lista pública de "Haz amigos": nombre de entrenador, código de amistad y ciudad
 * de quienes aceptaron aparecer al registrarse.
 */
import { DbError, publicFriends } from './_miembros.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    const amigos = await publicFriends();
    // Vercel guarda la respuesta 1 minuto para no consultar la base de datos en cada visita
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ amigos });
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo cargar la lista.' });
  }
}
