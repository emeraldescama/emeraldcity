/**
 * Función de Vercel para el panel de administración (/admin).
 *
 * Verifica el PIN y publica los eventos haciendo un commit en el repositorio de GitHub;
 * Vercel vuelve a compilar el sitio con cada commit, así que los cambios salen solos en 1–2 minutos.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   ADMIN_PIN      PIN del panel (mínimo 6 dígitos)
 *   GITHUB_TOKEN   Token de GitHub con permiso "Contents: Read and write" sobre el repositorio
 *   GITHUB_REPO    Opcional, por defecto "emeraldescama/emeraldcity"
 *   GITHUB_BRANCH  Opcional, por defecto "main"
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const EVENT_TYPES = ['Día de la Comunidad', 'Incursiones', 'GO Tour', 'GO Fest', 'Wild Area', 'Quedada', 'Torneo PvP', 'Otro'];
const EVENTS_DIR = 'src/content/eventos';
const DISCARDED_FILE = 'data/eventos-descartados.json';
// Vercel acepta hasta 4.5 MB por petición y el base64 ocupa un 33% más
const MAX_FLYER_BYTES = 3 * 1024 * 1024;

const REPO = process.env.GITHUB_REPO || 'emeraldescama/emeraldcity';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function pinMatches(pin) {
  const expected = process.env.ADMIN_PIN;
  if (!expected || typeof pin !== 'string') return false;
  const a = createHash('sha256').update(pin).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function github(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'emeraldcity-admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 404 && options.allow404) return null;
  if (!res.ok) {
    const detail = await res.text();
    throw new HttpError(502, `GitHub respondió ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/** Crea un único commit con todos los cambios (content = texto, base64 = binario, delete = borrar) */
async function commit(message, changes) {
  const ref = await github(`/git/ref/heads/${BRANCH}`);
  const parent = await github(`/git/commits/${ref.object.sha}`);

  const tree = [];
  for (const change of changes) {
    const entry = { path: change.path, mode: '100644', type: 'blob' };
    if (change.delete) entry.sha = null;
    else if (change.base64) {
      const blob = await github('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: change.base64, encoding: 'base64' }),
      });
      entry.sha = blob.sha;
    } else entry.content = change.content;
    tree.push(entry);
  }

  const newTree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const newCommit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  await github(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });
}

async function readJson(path) {
  const file = await github(`/contents/${path}?ref=${BRANCH}`, { allow404: true });
  if (!file) return null;
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}

function readEvent(id) {
  return readJson(`${EVENTS_DIR}/${id}.json`);
}

async function listEvents() {
  const files = (await github(`/contents/${EVENTS_DIR}?ref=${BRANCH}`, { allow404: true })) || [];
  const events = await Promise.all(
    files
      .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map(async (f) => ({ id: f.name.replace(/\.json$/, ''), ...(await readEvent(f.name.replace(/\.json$/, ''))) })),
  );
  return events.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function cleanText(value, field, max, required = true) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new HttpError(400, `Falta el campo "${field}".`);
  if (text.length > max) throw new HttpError(400, `"${field}" no puede tener más de ${max} caracteres.`);
  return text;
}

function validateEvent(input) {
  const event = {
    title: cleanText(input.title, 'Título', 120),
    date: cleanText(input.date, 'Fecha', 10),
    time: cleanText(input.time, 'Hora', 5),
    location: cleanText(input.location, 'Lugar', 120),
    type: input.type,
    description: cleanText(input.description, 'Descripción', 600, false),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw new HttpError(400, 'La fecha no es válida.');
  if (!/^\d{2}:\d{2}$/.test(event.time)) throw new HttpError(400, 'La hora no es válida.');
  if (!EVENT_TYPES.includes(event.type)) throw new HttpError(400, 'El tipo de evento no es válido.');
  return event;
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) throw new HttpError(400, 'Identificador de evento no válido.');
  return id;
}

/** El navegador siempre envía el flyer convertido a JPEG */
function decodeFlyer(base64) {
  if (typeof base64 !== 'string') throw new HttpError(400, 'El flyer no es válido.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_FLYER_BYTES) throw new HttpError(400, 'El flyer es demasiado pesado.');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpError(400, 'El flyer debe ser una imagen JPEG.');
  return bytes.toString('base64');
}

async function saveEvent({ id, event: input, flyer }) {
  const event = validateEvent(input || {});
  const existing = id ? await readEvent(validateId(id)) : null;
  if (id && !existing) throw new HttpError(404, 'Ese evento ya no existe.');
  if (!existing && !flyer) throw new HttpError(400, 'Sube el flyer del evento.');

  const eventId = id || `${event.date}-${slugify(event.title) || 'evento'}`;
  if (!id && (await readEvent(eventId))) throw new HttpError(409, 'Ya existe un evento con ese título en esa fecha.');

  const changes = [];
  let flyerPath = existing?.flyer;
  if (flyer) {
    // Nombre nuevo en cada subida para que nadie vea el flyer viejo en caché
    flyerPath = `/images/eventos/${eventId}-${Date.now().toString(36)}.jpg`;
    changes.push({ path: `public${flyerPath}`, base64: decodeFlyer(flyer) });
    if (existing?.flyer?.startsWith('/images/eventos/')) changes.push({ path: `public${existing.flyer}`, delete: true });
  }

  const saved = { ...event, flyer: flyerPath };
  changes.push({ path: `${EVENTS_DIR}/${eventId}.json`, content: `${JSON.stringify(saved, null, 2)}\n` });

  await commit(`${existing ? 'Actualizar' : 'Publicar'} evento: ${event.title}`, changes);
  return { id: eventId, ...saved };
}

async function deleteEvent({ id }) {
  const existing = await readEvent(validateId(id));
  if (!existing) throw new HttpError(404, 'Ese evento ya no existe.');
  const changes = [{ path: `${EVENTS_DIR}/${id}.json`, delete: true }];
  if (existing.flyer?.startsWith('/images/eventos/')) changes.push({ path: `public${existing.flyer}`, delete: true });
  // Los eventos automáticos se anotan para que scripts/sync-eventos.mjs no los vuelva a crear
  if (id.startsWith('auto-')) {
    const discarded = new Set((await readJson(DISCARDED_FILE)) || []);
    discarded.add(id);
    changes.push({ path: DISCARDED_FILE, content: `${JSON.stringify([...discarded].sort(), null, 2)}\n` });
  }
  await commit(`Eliminar evento: ${existing.title}`, changes);
  return { id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!process.env.ADMIN_PIN || !process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'El panel no está configurado: faltan ADMIN_PIN o GITHUB_TOKEN en Vercel.' });
  }

  const body = req.body || {};
  if (!pinMatches(body.pin)) {
    // Pausa para frenar intentos de adivinar el PIN
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return res.status(401).json({ error: 'PIN incorrecto.' });
  }

  try {
    switch (body.action) {
      case 'login':
        return res.status(200).json({ ok: true });
      case 'list':
        return res.status(200).json({ events: await listEvents() });
      case 'save':
        return res.status(200).json({ event: await saveEvent(body) });
      case 'delete':
        return res.status(200).json(await deleteEvent(body));
      default:
        return res.status(400).json({ error: 'Acción desconocida.' });
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'Error inesperado.' });
  }
}
