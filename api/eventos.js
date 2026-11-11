/**
 * Sección Eventos (/eventos, Wild Area): misiones para los miembros de Escama Esmeralda.
 *   GET                                          dinámicas, misiones y tabla de puntos
 *   POST { accion: 'validar', telefono }         valida la suscripción de Escama con el teléfono
 *                                                (y aprueba la cuenta del foro si estaba pendiente)
 *   POST { accion: 'logre', reto }               "¡Lo logré!": queda por validar en la quedada
 *   POST { accion: 'deshacer', reto }            quita el último "¡Lo logré!" sin validar
 *   POST { accion: 'entregar', reto, captura }   retos con captura (JPEG en base64)
 */
import { hasAdminSession, sameOrigin } from './_cookies.js';
import { autoLinkByPhone, claim, participationProblem, publicView, submit, undoClaim, validatePhone } from './_dinamicas.js';
import { setAccountState } from './_cuentas.js';
import { escamaPhoneProblem } from './_escama.js';
import { currentAccount, fail } from './_sesion.js';

// El navegador reduce la captura antes de enviarla
const MAX_SCREENSHOT_BYTES = 700 * 1024;
const ID = /^[a-z0-9-]{4,40}$/;

async function view(account, admin = false) {
  const cuentaId = account?.estado === 'aprobada' ? account.id : null;
  let data = await publicView(cuentaId, { admin });
  // Si su teléfono de Emerald City es el mismo que tiene en Escama, se vincula solo
  if (cuentaId && !data.participa && (await autoLinkByPhone(cuentaId).catch(() => false))) data = await publicView(cuentaId, { admin });
  // Si tiene cuenta pero no participa, se le explica por qué
  const motivo = !account
    ? 'Entra con tu cuenta del foro para participar.'
    : account.estado !== 'aprobada'
      ? 'Tu cuenta del foro todavía no está aprobada.'
      : data.participa
        ? null
        : await participationProblem(account.id);
  return {
    ...data,
    cuenta: account ? { id: account.id, entrenador: account.entrenador, avatar: account.avatar, shiny: account.shiny, estado: account.estado } : null,
    motivo,
    // Con la sesión del panel: puede editar las misiones desde esta misma página
    admin,
    // Se le muestra el formulario del teléfono a quien tiene cuenta (aprobada o pendiente) y aún no participa
    validarTelefono: Boolean(account && !data.participa && !escamaPhoneProblem() && (account.estado !== 'aprobada' || motivo?.startsWith('Valida'))),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await view(await currentAccount(req, res, { optional: true }), hasAdminSession(req)));
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Petición no permitida.' });
    const body = req.body || {};
    const reto = String(body.reto ?? '');

    // Validar Escama también sirve a cuentas que esperan aprobación: si el teléfono es de un
    // miembro activo de Escama, la cuenta queda aprobada y vinculada en el mismo paso
    if (body.accion === 'validar') {
      const pending = await currentAccount(req, res);
      await validatePhone(pending.id, String(body.telefono ?? ''));
      const account = pending.estado === 'pendiente' ? await setAccountState(pending.id, 'aprobada') : pending;
      return res.status(200).json({ ...(await view(account, hasAdminSession(req))), registrado: true });
    }

    const account = await currentAccount(req, res, { approved: true });
    switch (body.accion) {
      case 'logre':
      case 'deshacer':
        if (!ID.test(reto)) return res.status(400).json({ error: 'Misión no válida.' });
        await (body.accion === 'logre' ? claim(account.id, reto) : undoClaim(account.id, reto));
        return res.status(200).json(await view(account, hasAdminSession(req)));
      case 'entregar': {
        if (!ID.test(reto)) return res.status(400).json({ error: 'Reto no válido.' });
        const captura = typeof body.captura === 'string' ? body.captura : '';
        const bytes = Buffer.from(captura, 'base64');
        if (!bytes.length) return res.status(400).json({ error: 'Falta la captura.' });
        if (bytes.length > MAX_SCREENSHOT_BYTES) return res.status(400).json({ error: 'La captura es demasiado pesada.' });
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return res.status(400).json({ error: 'La captura no es una imagen válida.' });
        return res.status(200).json(await submit(account.id, reto, captura));
      }
      default:
        return res.status(400).json({ error: 'Acción desconocida.' });
    }
  } catch (err) {
    return fail(res, err);
  }
}
