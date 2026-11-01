/**
 * Cuenta de los miembros en la web (/cuenta):
 *   POST { accion: 'crear', codigo, telefono, clave }
 *   POST { accion: 'entrar', codigo, clave }
 *   POST { accion: 'salir' }
 *   POST { accion: 'yo' }                                    datos de la cuenta abierta
 *   POST { accion: 'perfil', avatar, shiny, equipo, bio, cumpleDia, cumpleMes }
 *   POST { accion: 'clave', actual, nueva }
 */
import { endUserSession, sameOrigin, startUserSession } from './_cookies.js';
import { EQUIPOS, MAX_POKEMON, changePassword, createAccount, login, updateProfile } from './_cuentas.js';
import { validBirthday } from './_miembros.js';
import { currentAccount, fail } from './_sesion.js';

const code = (value) => String(value ?? '').replace(/\D/g, '');

function validPassword(value) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres.'), { status: 400 });
  if (password.length > 72) throw Object.assign(new Error('La contraseña es demasiado larga.'), { status: 400 });
  return password;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Petición no permitida.' });
  const body = req.body || {};

  try {
    switch (body.accion) {
      case 'crear': {
        const codigo = code(body.codigo);
        if (codigo.length !== 12) return res.status(400).json({ error: 'El código de amistad tiene 12 números.' });
        const account = await createAccount(codigo, body.telefono, validPassword(body.clave));
        startUserSession(res, account);
        return res.status(200).json({ cuenta: account });
      }
      case 'entrar': {
        const account = await login(code(body.codigo), String(body.clave ?? ''));
        if (!account) {
          // Pausa para frenar intentos de adivinar contraseñas
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return res.status(401).json({ error: 'El código o la contraseña no son correctos.' });
        }
        if (account.estado === 'bloqueada') {
          return res.status(403).json({ error: 'Tu cuenta está bloqueada. Escríbele al equipo si crees que es un error.' });
        }
        startUserSession(res, account);
        return res.status(200).json({ cuenta: account });
      }
      case 'salir':
        endUserSession(res);
        return res.status(200).json({ ok: true });
      case 'yo':
        return res.status(200).json({ cuenta: await currentAccount(req, res, { optional: true }) });
      case 'perfil': {
        const account = await currentAccount(req, res);
        const avatar = Number(body.avatar);
        const equipo = String(body.equipo ?? '');
        const bio = String(body.bio ?? '').trim();
        if (!Number.isInteger(avatar) || avatar < 1 || avatar > MAX_POKEMON) return res.status(400).json({ error: 'Elige un Pokémon de la lista.' });
        if (!EQUIPOS.includes(equipo)) return res.status(400).json({ error: 'Equipo no válido.' });
        if (bio.length > 160) return res.status(400).json({ error: 'La descripción puede tener hasta 160 caracteres.' });
        const birthday = validBirthday(body.cumpleDia, body.cumpleMes);
        return res.status(200).json({ cuenta: await updateProfile(account.id, { avatar, shiny: body.shiny === true, equipo, bio, ...birthday }) });
      }
      case 'clave': {
        const account = await currentAccount(req, res);
        const updated = await changePassword(account.id, String(body.actual ?? ''), validPassword(body.nueva));
        // La sesión de este dispositivo sigue abierta con la versión nueva
        startUserSession(res, updated);
        return res.status(200).json({ cuenta: updated });
      }
      default:
        return res.status(400).json({ error: 'Acción desconocida.' });
    }
  } catch (err) {
    return fail(res, err);
  }
}
