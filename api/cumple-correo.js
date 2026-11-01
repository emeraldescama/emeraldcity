/**
 * Lo llama Vercel Cron todos los días (ver vercel.json) para mandar el correo con los
 * cumpleaños del día. Si existe CRON_SECRET en Vercel, solo acepta llamadas de Vercel.
 * Aunque alguien más lo llame, el correo sale una sola vez por día.
 */
import { sendBirthdayEmail } from './_correo.js';
import { fail } from './_sesion.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'No autorizado.' });
  try {
    return res.status(200).json(await sendBirthdayEmail());
  } catch (err) {
    return fail(res, err);
  }
}
