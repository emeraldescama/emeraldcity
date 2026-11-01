/**
 * Foro (/foro). Vistas según el enlace:
 *   /foro              categorías
 *   /foro#c/general    temas de una categoría
 *   /foro#t/abc123     mensajes de un tema (se actualiza solo cada 20 segundos)
 * Todo el texto se muestra con textContent: nadie puede meter código en un mensaje.
 */
import { avatarUrl, CATEGORY_HINTS, CATEGORY_NAMES, TEAM_COLORS, TEAM_NAMES, timeAgo, type Equipo } from '../utils/perfil';
import { cuentaApi, type CuentaPropia } from './cuenta';

interface Autor {
  id: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
  equipo: Equipo;
}
interface Categoria {
  id: string;
  nombre: string;
  temas: number;
  mensajes: number;
  actividad: string | null;
}
interface TemaResumen {
  id: string;
  titulo: string;
  fijado: boolean;
  actividad: string;
  respuestas: number;
  autor: Autor | null;
}
interface Mensaje {
  id: string;
  texto: string;
  creado: string;
  autor: Autor | null;
}
interface Tema {
  id: string;
  categoria: string;
  titulo: string;
  fijado: boolean;
  mensajes: Mensaje[];
}
interface Perfil extends Autor {
  ciudad: string;
  bio: string;
  creada: string;
  mensajes: number;
  codigo: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const VIEWS = ['vista-categorias', 'vista-temas', 'vista-tema'] as const;
const REFRESH_MS = 20_000;

let me: { cuenta: string | null; moderador: boolean } = { cuenta: null, moderador: false };
let currentTopic: Tema | null = null;
let refreshTimer: number | undefined;

class ForoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function foroGet<T>(query: string): Promise<T> {
  const res = await fetch(`/api/foro${query}`, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
  if (!res.ok) throw new ForoError(res.status, data.error || 'No se pudo cargar el foro.');
  me = { cuenta: data.cuenta ?? null, moderador: Boolean(data.moderador) };
  return data as T;
}

async function foroPost<T>(accion: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/foro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accion, ...payload }),
  });
  const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
  if (!res.ok) throw new ForoError(res.status, data.error || 'No se pudo completar la acción.');
  return data as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function showError(message = '') {
  $('foro-error').textContent = message;
  $('foro-error').classList.toggle('hidden', !message);
}

function showView(view: (typeof VIEWS)[number] | null) {
  for (const id of VIEWS) $(id).classList.toggle('hidden', id !== view);
}

function showGate(status: number, message: string) {
  showView(null);
  const pending = status === 403;
  $('foro-puerta-titulo').textContent = pending ? 'Tu cuenta está esperando aprobación' : 'Entra con tu cuenta para ver el foro';
  $('foro-puerta-texto').textContent = pending
    ? 'El equipo revisa las cuentas nuevas pronto. Mientras tanto puedes elegir tu Pokémon de perfil.'
    : message || 'El foro es solo para miembros de Emerald City con cuenta aprobada.';
  $('foro-puerta-botones').classList.toggle('hidden', pending);
  $('foro-puerta').classList.remove('hidden');
}

// ---------- Piezas ----------

function avatar(autor: Autor | null, size = 'w-12 h-12') {
  const img = el('img', `${size} flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 [image-rendering:pixelated]`);
  img.src = avatarUrl(autor?.avatar ?? 132, autor?.shiny);
  img.alt = '';
  img.loading = 'lazy';
  return img;
}

/** Nombre del autor; al tocarlo se abre su perfil */
function authorName(autor: Autor | null) {
  if (!autor) return el('span', 'font-bold text-zinc-500', 'Cuenta borrada');
  const button = el('button', 'inline-flex items-center gap-1.5 font-bold text-zinc-100 hover:text-emerald-300');
  button.type = 'button';
  if (autor.equipo) {
    const dot = el('span', 'w-2.5 h-2.5 rounded-full');
    dot.style.background = TEAM_COLORS[autor.equipo as Exclude<Equipo, ''>];
    dot.title = `Equipo ${TEAM_NAMES[autor.equipo as Exclude<Equipo, ''>]}`;
    button.append(dot);
  }
  button.append(document.createTextNode(autor.entrenador));
  button.addEventListener('click', () => openProfile(autor.id));
  return button;
}

/** Texto del mensaje con los enlaces convertidos en links seguros */
function messageText(text: string) {
  const p = el('p', 'text-zinc-200 whitespace-pre-wrap break-words mt-1');
  for (const part of text.split(/(https?:\/\/[^\s<>"]+)/g)) {
    if (/^https?:\/\//.test(part)) {
      const link = el('a', 'text-emerald-400 underline break-all', part);
      link.href = part;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      p.append(link);
    } else if (part) p.append(document.createTextNode(part));
  }
  return p;
}

// ---------- Vistas ----------

async function showCategories() {
  const { categorias } = await foroGet<{ categorias: Categoria[] }>('');
  showView('vista-categorias');
  $('lista-categorias').replaceChildren(
    ...categorias.map((c) => {
      const item = el('li');
      const link = el('a', 'glass-card rounded-2xl p-5 block h-full hover:border-emerald-500/40');
      link.href = `#c/${c.id}`;
      link.append(
        el('p', 'text-lg font-black text-zinc-100', c.nombre),
        el('p', 'text-sm text-zinc-400 mt-1', CATEGORY_HINTS[c.id] ?? ''),
        el(
          'p',
          'text-xs font-bold uppercase tracking-wider text-emerald-400 mt-3',
          `${c.temas} tema${c.temas === 1 ? '' : 's'} · ${c.mensajes} mensaje${c.mensajes === 1 ? '' : 's'}${c.actividad ? ` · ${timeAgo(c.actividad)}` : ''}`,
        ),
      );
      item.append(link);
      return item;
    }),
  );
}

async function showTopics(categoria: string) {
  const { temas } = await foroGet<{ temas: TemaResumen[] }>(`?categoria=${encodeURIComponent(categoria)}`);
  showView('vista-temas');
  $('temas-titulo').textContent = CATEGORY_NAMES[categoria] ?? 'Foro';
  $('temas-texto').textContent = CATEGORY_HINTS[categoria] ?? '';
  $('form-tema').dataset.categoria = categoria;
  $('nuevo-tema-abrir').classList.toggle('hidden', !me.cuenta);
  $('temas-vacio').classList.toggle('hidden', temas.length > 0);
  $('lista-temas').replaceChildren(
    ...temas.map((t) => {
      const item = el('li');
      const link = el('a', 'glass-card rounded-2xl p-4 flex items-center gap-4 hover:border-emerald-500/40');
      link.href = `#t/${t.id}`;
      const body = el('div', 'min-w-0 flex-grow');
      const title = el('p', 'font-bold text-zinc-100 break-words');
      if (t.fijado) title.append(el('span', 'mr-2 text-amber-400', '📌'));
      title.append(document.createTextNode(t.titulo));
      body.append(
        title,
        el('p', 'text-xs text-zinc-400 mt-1', `${t.autor?.entrenador ?? 'Cuenta borrada'} · ${t.respuestas} respuesta${t.respuestas === 1 ? '' : 's'} · ${timeAgo(t.actividad)}`),
      );
      link.append(avatar(t.autor, 'w-11 h-11'), body);
      item.append(link);
      return item;
    }),
  );
}

function renderTopic(tema: Tema) {
  currentTopic = tema;
  $('tema-nombre').textContent = `${tema.fijado ? '📌 ' : ''}${tema.titulo}`;
  const back = $<HTMLAnchorElement>('tema-volver');
  back.href = `#c/${tema.categoria}`;
  back.textContent = `← ${CATEGORY_NAMES[tema.categoria] ?? 'Volver'}`;
  const pin = $('tema-fijar');
  pin.classList.toggle('hidden', !me.moderador);
  pin.textContent = tema.fijado ? 'Quitar de arriba' : 'Fijar arriba';
  $('form-respuesta').classList.toggle('hidden', !me.cuenta);

  $('lista-mensajes').replaceChildren(
    ...tema.mensajes.map((m, i) => {
      const item = el('li', 'glass-panel rounded-2xl p-4 flex gap-3');
      item.id = `m-${m.id}`;
      const body = el('div', 'min-w-0 flex-grow');
      const head = el('div', 'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm');
      head.append(authorName(m.autor), el('span', 'text-xs text-zinc-500', timeAgo(m.creado)));
      if (me.moderador || (me.cuenta && m.autor?.id === me.cuenta)) {
        const remove = el('button', 'ml-auto text-xs font-bold text-zinc-500 hover:text-red-300', i === 0 ? 'Borrar tema' : 'Borrar');
        remove.type = 'button';
        remove.addEventListener('click', () => deleteMessage(m, remove, i === 0));
        head.append(remove);
      }
      body.append(head, messageText(m.texto));
      item.append(avatar(m.autor), body);
      return item;
    }),
  );
}

async function showTopic(id: string, quiet = false) {
  const { tema } = await foroGet<{ tema: Tema }>(`?tema=${encodeURIComponent(id)}`);
  // Al actualizar en segundo plano solo se redibuja si llegó algo nuevo
  const changed = !currentTopic || currentTopic.id !== tema.id || currentTopic.mensajes.length !== tema.mensajes.length || currentTopic.fijado !== tema.fijado;
  if (!quiet || changed) {
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 300;
    renderTopic(tema);
    if (quiet && nearBottom) $('form-respuesta').scrollIntoView({ block: 'end' });
  }
  showView('vista-tema');
}

// ---------- Acciones ----------

async function deleteMessage(message: Mensaje, button: HTMLButtonElement, wholeTopic: boolean) {
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = '¿Seguro?';
    setTimeout(() => {
      button.dataset.confirm = 'false';
      button.textContent = wholeTopic ? 'Borrar tema' : 'Borrar';
    }, 4000);
    return;
  }
  button.disabled = true;
  try {
    const result = await foroPost<{ temaBorrado?: string }>('borrar', { mensaje: message.id });
    if (result.temaBorrado) location.hash = `#c/${currentTopic?.categoria ?? 'general'}`;
    else if (currentTopic) await showTopic(currentTopic.id);
  } catch (err) {
    button.disabled = false;
    showError((err as Error).message);
  }
}

async function withButton(form: HTMLFormElement, action: () => Promise<void>) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  showError();
  try {
    await action();
  } catch (err) {
    showError((err as Error).message);
  } finally {
    button.disabled = false;
  }
}

function onNewTopic(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  withButton(form, async () => {
    const { tema } = await foroPost<{ tema: Tema }>('tema', {
      categoria: form.dataset.categoria,
      titulo: $<HTMLInputElement>('tema-titulo').value,
      texto: $<HTMLTextAreaElement>('tema-texto').value,
    });
    form.reset();
    form.classList.add('hidden');
    location.hash = `#t/${tema.id}`;
  });
}

function onReply(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (!currentTopic) return;
  withButton(form, async () => {
    const { tema } = await foroPost<{ tema: Tema }>('responder', { tema: currentTopic!.id, texto: $<HTMLTextAreaElement>('respuesta-texto').value });
    form.reset();
    renderTopic(tema);
    $('form-respuesta').scrollIntoView({ block: 'end' });
  });
}

async function onPin() {
  if (!currentTopic) return;
  try {
    renderTopic((await foroPost<{ tema: Tema }>('fijar', { tema: currentTopic.id, fijado: !currentTopic.fijado })).tema);
  } catch (err) {
    showError((err as Error).message);
  }
}

async function openProfile(id: string) {
  try {
    const { perfil } = await foroGet<{ perfil: Perfil }>(`?perfil=${encodeURIComponent(id)}`);
    $<HTMLImageElement>('pm-avatar').src = avatarUrl(perfil.avatar, perfil.shiny);
    $('pm-nombre').textContent = perfil.entrenador;
    $('pm-detalle').textContent = [
      perfil.ciudad,
      perfil.equipo ? `Equipo ${TEAM_NAMES[perfil.equipo as Exclude<Equipo, ''>]}` : '',
      `${perfil.mensajes} mensaje${perfil.mensajes === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(' · ');
    $('pm-bio').textContent = perfil.bio;
    const code = $<HTMLButtonElement>('pm-codigo');
    code.classList.toggle('hidden', !perfil.codigo);
    code.textContent = `${perfil.codigo.replace(/(\d{4})(?=\d)/g, '$1 ')} · Copiar código`;
    code.onclick = () => {
      navigator.clipboard?.writeText(perfil.codigo).then(() => (code.textContent = '¡Código copiado!'));
    };
    $<HTMLDialogElement>('perfil-miembro').showModal();
  } catch (err) {
    showError((err as Error).message);
  }
}

// ---------- Navegación ----------

async function route() {
  window.clearInterval(refreshTimer);
  showError();
  const hash = location.hash.slice(1);
  try {
    if (hash.startsWith('t/')) {
      currentTopic = null;
      await showTopic(hash.slice(2));
      window.scrollTo(0, 0);
      refreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible' && currentTopic) showTopic(currentTopic.id, true).catch(() => undefined);
      }, REFRESH_MS);
    } else if (hash.startsWith('c/')) await showTopics(hash.slice(2));
    else await showCategories();
    $('foro-puerta').classList.add('hidden');
  } catch (err) {
    if (err instanceof ForoError && (err.status === 401 || err.status === 403)) showGate(err.status, err.message);
    else showError((err as Error).message);
  } finally {
    $('foro-cargando').classList.add('hidden');
  }
}

async function showMe() {
  try {
    const { cuenta } = await cuentaApi<{ cuenta: CuentaPropia | null }>('yo');
    if (!cuenta) return;
    $<HTMLImageElement>('foro-yo-avatar').src = avatarUrl(cuenta.avatar, cuenta.shiny);
    $('foro-yo-nombre').textContent = cuenta.entrenador;
    $('foro-yo').classList.replace('hidden', 'inline-flex');
  } catch {
    // Sin sesión no se muestra
  }
}

export function initForo() {
  $('form-tema').addEventListener('submit', onNewTopic);
  $('form-respuesta').addEventListener('submit', onReply);
  $('tema-fijar').addEventListener('click', onPin);
  $('nuevo-tema-abrir').addEventListener('click', () => {
    $('form-tema').classList.remove('hidden');
    $('tema-titulo').focus();
  });
  $('nuevo-tema-cancelar').addEventListener('click', () => $('form-tema').classList.add('hidden'));
  window.addEventListener('hashchange', route);
  showMe();
  route();
}
