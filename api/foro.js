/**
 * Foro de la comunidad (/foro). Solo lo usan las cuentas aprobadas; el administrador (con
 * su sesión del panel abierta) también puede leer, fijar temas y borrar cualquier mensaje.
 *   GET   ?                       categorías con su actividad
 *   GET   ?categoria=general      temas de una categoría
 *   GET   ?tema=abc123            mensajes de un tema
 *   GET   ?perfil=abc123          perfil público de un miembro
 *   POST  { accion: 'tema', categoria, titulo, texto }
 *   GET   ?usuarios=1                cuentas aprobadas (para sugerir @menciones)
 *   GET   ?avisos=1                  menciones y respuestas recibidas
 *   POST  { accion: 'responder', tema, texto, respuestaA? }   respuestaA: comentario al que responde
 *   POST  { accion: 'like', mensaje }                          me gusta (tocar de nuevo lo quita)
 *   POST  { accion: 'avisosLeidos' }
 *   POST  { accion: 'borrar', mensaje }
 *   POST  { accion: 'fijar', tema, fijado }                   solo administrador
 */
import { hasAdminSession, sameOrigin } from './_cookies.js';
import {
  CATEGORIAS,
  birthdayPhone,
  createTopic,
  deleteMessage,
  ensureBirthdays,
  forumSummary,
  forumUsers,
  getTopic,
  listTopics,
  markNoticesRead,
  notices,
  pinTopic,
  publicProfile,
  reply,
  toggleLike,
} from './_cuentas.js';
import { participants } from './_dinamicas.js';
import { currentAccount, fail } from './_sesion.js';

/** Cuentas vinculadas a un miembro activo de Escama Esmeralda (llevan la escama verde) */
async function escamaActive() {
  try {
    return new Set((await participants()).map((p) => p.id));
  } catch {
    // Si Escama no responde, el foro sigue funcionando sin las insignias
    return new Set();
  }
}

const mark = (active, autor) => {
  if (autor?.id && active.has(autor.id)) autor.escama = true;
  return autor;
};

/** Tema con la escama verde en los autores que son miembros activos de Escama */
async function withScales(tema) {
  const active = await escamaActive();
  for (const m of tema.mensajes) mark(active, m.autor);
  return tema;
}

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
      // Los temas de cumpleaños del día se abren solos al entrar al foro
      if (!query.tema && !query.perfil) await ensureBirthdays();
      if (query.tema) {
        const tema = await getTopic(id(query.tema), account?.id ?? null);
        // El teléfono de quien cumple años solo lo recibe el administrador, para etiquetarlo en el grupo
        if (admin && tema.cumple) tema.cumple.telefono = await birthdayPhone(tema.id);
        return res.status(200).json({ ...me, tema: await withScales(tema) });
      }
      if (query.perfil) return res.status(200).json({ ...me, perfil: mark(await escamaActive(), await publicProfile(id(query.perfil))) });
      if (query.usuarios) {
        const active = await escamaActive();
        return res.status(200).json({ ...me, usuarios: (await forumUsers()).map((u) => mark(active, u)) });
      }
      if (query.avisos) return res.status(200).json({ ...me, ...(account ? await notices(account.id) : { avisos: [], nuevos: 0 }) });
      if (query.categoria) {
        if (!CATEGORIAS[query.categoria]) throw new BadRequest('Esa categoría no existe.');
        const active = await escamaActive();
        const temas = await listTopics(query.categoria);
        for (const t of temas) mark(active, t.autor);
        return res.status(200).json({ ...me, temas });
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
        if (body.categoria === 'cumpleanos') throw new BadRequest('Los temas de cumpleaños los abre la web sola cada día.');
        const titulo = text(body.titulo, 'el título', 100);
        const texto = text(body.texto, 'el mensaje', 2000);
        return res.status(200).json({ tema: await withScales(await createTopic(writer(), body.categoria, titulo, texto)) });
      }
      case 'responder':
        return res
          .status(200)
          .json({ tema: await withScales(await reply(writer(), id(body.tema), text(body.texto, 'el mensaje', 2000), body.respuestaA ? id(body.respuestaA) : null)) });
      case 'like':
        return res.status(200).json(await toggleLike(writer(), id(body.mensaje)));
      case 'avisosLeidos':
        return res.status(200).json(await markNoticesRead(writer()));
      case 'borrar':
        return res.status(200).json(await deleteMessage(id(body.mensaje), { cuentaId: account?.id, admin }));
      case 'fijar':
        if (!admin) return res.status(403).json({ error: 'Solo el equipo puede fijar temas.' });
        return res.status(200).json({ tema: await withScales(await pinTopic(id(body.tema), body.fijado === true)) });
      default:
        throw new BadRequest('Acción desconocida.');
    }
  } catch (err) {
    return fail(res, err);
  }
}
