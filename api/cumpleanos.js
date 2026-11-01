/**
 * Cumpleaños de hoy para la página de inicio (público): nombre de entrenador, Pokémon,
 * código si aparece en "Haz amigos" y el tema del foro para felicitarlo. Sin teléfonos.
 */
import { birthdaysToday } from './_cuentas.js';
import { fail } from './_sesion.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  try {
    // Cinco minutos en caché: la lista solo cambia una vez al día
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json({ cumpleanos: await birthdaysToday() });
  } catch (err) {
    return fail(res, err);
  }
}
