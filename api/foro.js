/**
 * Foro de la comunidad (/foro). Solo lo usan las cuentas aprobadas; el administrador (con
 * su sesión del panel abierta) también puede leer, fijar temas y borrar cualquier mensaje.
 *   GET   ?                       categorías con su actividad
 *   GET   ?categoria=general      temas de una categoría
 *   GET   ?tema=abc123            mensajes de un tema
 *   GET   ?perfil=abc123          perfil público de un miembro
 *   POST  { accion: 'tema', categoria, titulo, texto }
 *   POST  { accion: 'responder', tema, texto }
 *   POST  { accion: 'borrar', mensaje }
 *   POST  { accion: 'fijar', tema, fijado }                   solo administrador
 */
import { hasAdminSession, sameOrigin } from './_cookies.js';
import { CATEGORIAS, createTopic, deleteMessage, forumSummary, getTopic, listTopics, pinTopic, publicProfile, reply } from './_cuentas.js';
import { currentAccount, fail } from './_sesion.js';

const ID = /^[a-z0-9-]{4,40}$/;

class BadRequest extends Error {
  status = 400;
}

function text(value, field, max) {
  const clean = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!clean) throw new BadRequest(`Escribe ${field}.`);
  if (clean.length > max) throw new BadRequest(`${field[0].toUpperCase()}${field.slice(1)} puede tener hasta ${max} caracteres.`);
  return clean;
}

function id(value) {
  const clean = String(value ?? '');
  if (!ID.test(clean)) throw new BadRequest('Identificador no válido.');
  return clean;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const admin = hasAdminSession(req);
    const account = admin ? await currentAccount(req, res, { optional: true }) : await currentAccount(req, res, { approved: true });
    const me = { cuenta: account?.id ?? null, moderador: admin };

    if (req.method === 'GET') {
      const query = req.query || {};
      if (query.tema) return res.status(200).json({ ...me, tema: await getTopic(id(query.tema)) });
      if (query.perfil) return res.status(200).json({ ...me, perfil: await publicProfile(id(query.perfil)) });
      if (query.categoria) {
        if (!CATEGORIAS[query.categoria]) throw new BadRequest('Esa categoría no existe.');
        return res.status(200).json({ ...me, temas: await listTopics(query.categoria) });
      }
      return res.status(200).json({ ...me, categorias: await forumSummary() });
    }

    if (!sameOrigin(req)) return res.status(403).json({ error: 'Petición no permitida.' });
    const body = req.body || {};
    // Para escribir hace falta una cuenta aprobada, también para el administrador
    const writer = () => {
      if (!account || account.estado !== 'aprobada') throw Object.assign(new Error('Para escribir necesitas una cuenta aprobada.'), { status: 403 });
      return account.id;
    };
    switch (body.accion) {
      case 'tema': {
        if (!CATEGORIAS[body.categoria]) throw new BadRequest('Esa categoría no existe.');
        const titulo = text(body.titulo, 'el título', 100);
        const texto = text(body.texto, 'el mensaje', 2000);
        return res.status(200).json({ tema: await createTopic(writer(), body.categoria, titulo, texto) });
      }
      case 'responder':
        return res.status(200).json({ tema: await reply(writer(), id(body.tema), text(body.texto, 'el mensaje', 2000)) });
      case 'borrar':
        return res.status(200).json(await deleteMessage(id(body.mensaje), { cuentaId: account?.id, admin }));
      case 'fijar':
        if (!admin) return res.status(403).json({ error: 'Solo el equipo puede fijar temas.' });
        return res.status(200).json({ tema: await pinTopic(id(body.tema), body.fijado === true) });
      default:
        throw new BadRequest('Acción desconocida.');
    }
  } catch (err) {
    return fail(res, err);
  }
}
