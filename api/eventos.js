/**
 * Sección Eventos (/eventos): dinámicas con retos para los miembros de Escama Esmeralda.
 *   GET                                    dinámicas vigentes, retos publicados y tabla de puntos
 *   POST { accion: 'entregar', reto, captura }   sube la captura del reto cumplido (JPEG en base64)
 */
import { sameOrigin } from './_cookies.js';
import { participationProblem, publicView, submit } from './_dinamicas.js';
import { currentAccount, fail } from './_sesion.js';

// El navegador reduce la captura antes de enviarla
const MAX_SCREENSHOT_BYTES = 700 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const account = await currentAccount(req, res, { optional: true });
      const cuentaId = account?.estado === 'aprobada' ? account.id : null;
      const view = await publicView(cuentaId);
      // Si tiene cuenta pero no participa, se le explica por qué
      const motivo = !account
        ? 'Entra con tu cuenta para participar.'
        : account.estado !== 'aprobada'
          ? 'Tu cuenta todavía no está aprobada.'
          : view.participa
            ? null
            : await participationProblem(account.id);
      return res.status(200).json({ ...view, cuenta: account ? { id: account.id, entrenador: account.entrenador } : null, motivo });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Petición no permitida.' });
    const body = req.body || {};
    if (body.accion !== 'entregar') return res.status(400).json({ error: 'Acción desconocida.' });
    const account = await currentAccount(req, res, { approved: true });
    const reto = String(body.reto ?? '');
    if (!/^[a-z0-9-]{4,40}$/.test(reto)) return res.status(400).json({ error: 'Reto no válido.' });
    const captura = typeof body.captura === 'string' ? body.captura : '';
    const bytes = Buffer.from(captura, 'base64');
    if (!bytes.length) return res.status(400).json({ error: 'Falta la captura.' });
    if (bytes.length > MAX_SCREENSHOT_BYTES) return res.status(400).json({ error: 'La captura es demasiado pesada.' });
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return res.status(400).json({ error: 'La captura no es una imagen válida.' });
    return res.status(200).json(await submit(account.id, reto, captura));
  } catch (err) {
    return fail(res, err);
  }
}
