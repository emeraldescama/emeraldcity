/**
 * Lista pública de "Haz amigos": nombre de entrenador, código de amistad y ciudad
 * de quienes aceptaron aparecer al registrarse.
 */
import { AppsScriptError, callAppsScript } from './_apps-script.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    const { amigos } = await callAppsScript('amigos');
    // Vercel guarda la respuesta 5 minutos para no consultar la hoja en cada visita
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ amigos });
  } catch (err) {
    const status = err instanceof AppsScriptError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo cargar la lista.' });
  }
}
