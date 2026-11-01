/** Ayudas compartidas por las funciones de cuentas y foro */
import { endUserSession, userSession } from './_cookies.js';
import { accountById } from './_cuentas.js';
import { DbError } from './_miembros.js';

/**
 * Cuenta de la sesión abierta. Si la cookie ya no sirve (contraseña cambiada, cuenta
 * bloqueada o borrada), la borra. Con optional devuelve null en vez de un error.
 */
export async function currentAccount(req, res, { optional = false, approved = false } = {}) {
  const session = userSession(req);
  const account = session ? await accountById(session.id) : null;
  const valid = account && account.sesion === session.sesion && account.estado !== 'bloqueada';
  if (!valid) {
    if (session) endUserSession(res);
    if (optional) return null;
    throw new DbError(401, 'Inicia sesión para continuar.');
  }
  if (approved && account.estado !== 'aprobada') {
    throw new DbError(403, 'Tu cuenta todavía no está aprobada. El equipo la revisará pronto.');
  }
  return account;
}

export function fail(res, err) {
  const status = Number(err?.status) || 500;
  return res.status(status).json({ error: err?.message || 'Error inesperado.' });
}
