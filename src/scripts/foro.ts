/**
 * Foro (/foro). Vistas según el enlace:
 *   /foro              categorías
 *   /foro#c/general    temas de una categoría
 *   /foro#t/abc123     mensajes de un tema (se actualiza solo cada 20 segundos)
 * Todo el texto se muestra con textContent: nadie puede meter código en un mensaje.
 */
import { avatarUrl, CATEGORY_HINTS, CATEGORY_NAMES, ROLE_BADGES, TEAM_COLORS, TEAM_NAMES, timeAgo, type Equipo } from '../utils/perfil';
import { birthdayMessage, canvasToFile, drawBirthdayFlyer, type Cumpleanero } from './birthdayFlyer';
import { cuentaApi, type CuentaPropia } from './cuenta';
import { getGeneralContactWhatsAppUrl } from '../utils/whatsapp';
import { escamaBadge } from '../utils/escamaBadge';

interface Autor {
  id: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
  equipo: Equipo;
  /** Mensajes que escribe la web sola (cumpleaños) */
  sistema?: boolean;
  /** 'principal' o 'admin': etiqueta de administrador */
  rol?: string;
  /** Miembro activo de Escama Esmeralda: lleva la escama verde */
  escama?: boolean;
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
  /** Comentario al que responde */
  respuestaA: string | null;
  likes: number;
  meGusta: boolean;
  /** Quiénes le dieron me gusta (los últimos 12) */
  gustan: string[];
}
interface Usuario {
  id: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
  rol: string;
  escama?: boolean;
}
interface Aviso {
  id: string;
  tipo: 'mencion' | 'respuesta';
  leido: boolean;
  creado: string;
  mensajeId: string;
  temaId: string;
  titulo: string;
  de: string;
  avatar: number;
  shiny: boolean;
}
interface Tema {
  id: string;
  categoria: string;
  titulo: string;
  fijado: boolean;
  mensajes: Mensaje[];
  cumple: (Cumpleanero & { telefono?: string }) | null;
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
let replyTarget: Mensaje | null = null;
let users: Usuario[] = [];
let usersLoaded: Promise<void> | null = null;
let noticesTimer: number | undefined;
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

// ---------- Entrada: crear la cuenta o entrar sin salir del foro ----------

type Gate = 'anonimo' | 'pendiente' | 'mensaje';

function showGate(gate: Gate, message = '') {
  showView(null);
  $('puerta-anonimo').classList.toggle('hidden', gate !== 'anonimo');
  $('puerta-pendiente').classList.toggle('hidden', gate !== 'pendiente');
  $('puerta-mensaje').classList.toggle('hidden', gate !== 'mensaje');
  $('puerta-mensaje').textContent = message;
  $('foro-puerta').classList.remove('hidden');
}

function setGateTab(tab: 'crear' | 'entrar' | 'recuperar') {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.puerta-tab')) {
    button.setAttribute('aria-selected', String(button.dataset.puerta === (tab === 'recuperar' ? 'entrar' : tab)));
  }
  $('puerta-crear').classList.toggle('hidden', tab !== 'crear');
  $('puerta-entrar').classList.toggle('hidden', tab !== 'entrar');
  $('puerta-recuperar').classList.toggle('hidden', tab !== 'recuperar');
}

/** Ya dentro (cuenta nueva, contraseña recuperada o entrada): directo al foro */
async function enterForum() {
  if (returnIfAsked()) return;
  showMe();
  $('foro-puerta').classList.add('hidden');
  await route();
}

async function onRecover(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const codigo = $<HTMLInputElement>('pr-codigo').value.replace(/\D/g, '');
  const clave = $<HTMLInputElement>('pr-clave').value;
  const showErr = (message: string, help = false) => {
    $('pr-error-texto').textContent = message;
    $('pr-ayuda').classList.toggle('hidden', !help);
    $('pr-error').classList.toggle('hidden', !message);
  };
  showErr('');
  if (codigo.length !== 12) return showErr('Escribe tu código de amistad completo: son 12 números.');
  if (clave.length < 6) return showErr('La contraseña nueva debe tener al menos 6 letras o números.');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  button.textContent = 'Cambiando…';
  try {
    await accountCall('recuperar', { codigo, telefono: $<HTMLInputElement>('pr-telefono').value, clave });
    await enterForum();
  } catch (err) {
    const status = err instanceof ForoError ? err.status : 0;
    // Sin WhatsApp registrado, bloqueada o con muchos intentos: solo el equipo puede ayudar
    showErr((err as Error).message, [403, 409, 429].includes(status));
  } finally {
    button.disabled = false;
    button.textContent = 'Cambiar contraseña y entrar';
  }
}

/** Llamada a /api/cuenta que conserva el código de error para explicar qué pasó */
async function accountCall(accion: string, payload: Record<string, unknown>) {
  const res = await fetch('/api/cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accion, ...payload }),
  });
  const data = await res.json().catch(() => ({ error: 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.' }));
  if (!res.ok) throw new ForoError(res.status, data.error || 'No se pudo completar. Inténtalo de nuevo.');
  return data as { cuenta: CuentaPropia };
}

/** Si vino desde "Registrarme" en Eventos, vuelve allá con la cuenta lista */
function returnIfAsked(): boolean {
  try {
    const target = sessionStorage.getItem('emerald-volver');
    if (!target) return false;
    sessionStorage.removeItem('emerald-volver');
    location.href = target;
    return true;
  } catch {
    return false;
  }
}

function showPending(account: CuentaPropia) {
  $('pendiente-nombre').textContent = `, ${account.entrenador}`;
  const message = `Hola, soy ${account.entrenador} y ya creé mi cuenta del foro de Emerald City. ¿Me la pueden aprobar? 🙏`;
  $<HTMLAnchorElement>('pendiente-whatsapp').href = getGeneralContactWhatsAppUrl(message);
  showGate('pendiente');
}

function formatCode(input: HTMLInputElement) {
  input.value = input.value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function createError(message: string, action?: { label: string; href: string }) {
  $('pc-error-texto').textContent = message;
  const link = $<HTMLAnchorElement>('pc-error-accion');
  link.classList.toggle('hidden', !action);
  if (action) {
    link.textContent = action.label;
    link.href = action.href;
    link.target = action.href.startsWith('http') ? '_blank' : '';
  }
  $('pc-error').classList.toggle('hidden', !message);
}

async function onCreate(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const codigo = $<HTMLInputElement>('pc-codigo').value.replace(/\D/g, '');
  const clave = $<HTMLInputElement>('pc-clave').value;
  createError('');
  if (codigo.length !== 12) return createError('Escribe tu código de amistad completo: son 12 números.');
  if (clave.length < 6) return createError('La contraseña debe tener al menos 6 letras o números.');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  button.textContent = 'Creando tu cuenta…';
  try {
    const { cuenta } = await accountCall('crear', { codigo, telefono: $<HTMLInputElement>('pc-telefono').value, clave });
    // Ya no hay que esperar aprobación: entra de una vez
    if (cuenta.estado === 'pendiente') {
      showMe();
      showPending(cuenta);
    } else await enterForum();
  } catch (err) {
    const status = err instanceof ForoError ? err.status : 0;
    const help = (text: string) => ({ label: 'Pedir ayuda por WhatsApp', href: getGeneralContactWhatsAppUrl(text) });
    if (status === 404) createError((err as Error).message, { label: 'Registrarme en la comunidad', href: '/unirse' });
    else if (status === 409) {
      // Ya tenía cuenta: se le lleva a "Ya tengo cuenta" con su código escrito
      setGateTab('entrar');
      $<HTMLInputElement>('pe-codigo').value = $<HTMLInputElement>('pc-codigo').value;
      $('pe-error').textContent = 'Ese código ya tiene cuenta. Entra con tu contraseña.';
      $('pe-error').classList.remove('hidden');
      $('pe-clave').focus();
    } else if (status === 403) {
      createError(`${(err as Error).message} Revisa el número o pídenos ayuda.`, help(`Hola, quiero crear mi cuenta del foro y me dice que el WhatsApp no coincide. Mi código de amistad es ${codigo}.`));
    } else createError((err as Error).message, help('Hola, necesito ayuda para crear mi cuenta del foro de Emerald City.'));
  } finally {
    button.disabled = false;
    button.textContent = 'Crear mi cuenta';
  }
}

async function onLogin(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const error = $('pe-error');
  error.classList.add('hidden');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  button.textContent = 'Entrando…';
  try {
    const { cuenta } = await accountCall('entrar', { codigo: $<HTMLInputElement>('pe-codigo').value, clave: $<HTMLInputElement>('pe-clave').value });
    if (returnIfAsked()) return;
    showMe();
    if (cuenta.estado === 'aprobada') {
      $('foro-puerta').classList.add('hidden');
      await route();
    } else showPending(cuenta);
  } catch (err) {
    error.textContent = (err as Error).message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar al foro';
  }
}

// ---------- Piezas ----------

function avatar(autor: Autor | null, size = 'w-12 h-12') {
  const img = el('img', `${size} flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 ${autor?.sistema ? 'object-contain p-1' : '[image-rendering:pixelated]'}`);
  img.src = autor?.sistema ? '/images/branding/logo-emerald-city-128.png' : avatarUrl(autor?.avatar ?? 132, autor?.shiny);
  img.alt = '';
  img.loading = 'lazy';
  return img;
}

/** Nombre del autor; al tocarlo se abre su perfil */
function authorName(autor: Autor | null) {
  if (!autor) return el('span', 'font-bold text-zinc-500', 'Cuenta borrada');
  if (autor.sistema) return el('span', 'font-bold text-emerald-300', autor.entrenador);
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
  const badge = roleBadge(autor.rol);
  if (!badge && !autor.escama) return button;
  const wrap = el('span', 'inline-flex flex-wrap items-center gap-1.5');
  wrap.append(button);
  if (autor.escama) wrap.append(escamaBadge());
  if (badge) wrap.append(badge);
  return wrap;
}

/** Etiqueta "Admin" que destaca a los administradores en el foro */
function roleBadge(rol?: string) {
  const badge = rol ? ROLE_BADGES[rol] : undefined;
  if (!badge) return null;
  return el('span', `px-1.5 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${badge.className}`, badge.label);
}

const MENTION = /(@[\p{L}\p{N}_]{2,30})/u;

/** Cuentas del foro, para resaltar menciones y sugerir nombres al escribir @ (una vez) */
function loadUsers() {
  usersLoaded ??= foroGet<{ usuarios: Usuario[] }>('?usuarios=1')
    .then((data) => {
      users = data.usuarios;
    })
    .catch(() => {
      usersLoaded = null;
    });
  return usersLoaded;
}

const findUser = (name: string) => users.find((u) => u.entrenador.toLowerCase() === name.toLowerCase());

/** Texto del mensaje: enlaces seguros y menciones @ resaltadas (las mías en dorado) */
function messageText(text: string) {
  const p = el('p', 'text-zinc-200 whitespace-pre-wrap break-words mt-1');
  for (const part of text.split(/(https?:\/\/[^\s<>"]+)/g)) {
    if (/^https?:\/\//.test(part)) {
      const link = el('a', 'text-emerald-400 underline break-all', part);
      link.href = part;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      p.append(link);
      continue;
    }
    for (const piece of part.split(MENTION)) {
      const user = piece.startsWith('@') ? findUser(piece.slice(1)) : undefined;
      if (user) {
        const mention = el('button', `foro-mencion ${user.id === me.cuenta ? 'foro-mencion-mia' : ''}`, `@${user.entrenador}`);
        mention.type = 'button';
        mention.addEventListener('click', () => openProfile(user.id));
        p.append(mention);
      } else if (piece) p.append(document.createTextNode(piece));
    }
  }
  return p;
}

/** Bloque "↪ Nombre: comienzo del comentario" que lleva al comentario respondido */
function quote(parentId: string, tema: Tema) {
  const parent = tema.mensajes.find((m) => m.id === parentId);
  const box = el('button', 'mt-1 mb-1 w-full text-left rounded-lg border-l-4 border-emerald-500/60 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/70');
  box.type = 'button';
  if (!parent) {
    box.textContent = '↪ Respondía a un comentario que ya fue borrado';
    box.disabled = true;
    return box;
  }
  box.append(el('span', 'font-bold text-emerald-300', `↪ ${parent.autor?.entrenador ?? 'Cuenta borrada'}: `), document.createTextNode(excerpt(parent.texto)));
  box.addEventListener('click', () => scrollToMessage(parent.id));
  return box;
}

const excerpt = (text: string) => (text.length > 90 ? `${text.slice(0, 90).trimEnd()}…` : text).replace(/\s+/g, ' ');

/** Lleva a un comentario y lo resalta un momento */
function scrollToMessage(id: string) {
  const target = document.getElementById(`m-${id}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('foro-destacado');
  setTimeout(() => target.classList.remove('foro-destacado'), 2200);
}

function likeButton(m: Mensaje) {
  const mine = !me.cuenta || m.autor?.sistema || m.autor?.id === me.cuenta;
  const label = `${m.meGusta ? '❤️' : '🤍'} ${m.likes || ''}`.trim();
  const button = el(
    'button',
    `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${
      m.meGusta ? 'border-pink-400/60 bg-pink-500/15 text-pink-200' : 'border-zinc-700 text-zinc-300 hover:border-pink-400/50'
    }`,
    label,
  );
  button.type = 'button';
  button.title = m.gustan.length ? `Les gusta a: ${m.gustan.join(', ')}${m.likes > m.gustan.length ? ' y más' : ''}` : 'Me gusta';
  // A los comentarios propios no se les da me gusta: solo se ve el contador
  if (mine) {
    button.disabled = true;
    if (!m.likes) button.classList.add('hidden');
    return button;
  }
  button.setAttribute('aria-pressed', String(m.meGusta));
  button.addEventListener('click', () => toggleLike(m, button));
  return button;
}

async function toggleLike(m: Mensaje, button: HTMLButtonElement) {
  button.disabled = true;
  try {
    const { likes, meGusta } = await foroPost<{ likes: number; meGusta: boolean }>('like', { mensaje: m.id });
    m.likes = likes;
    m.meGusta = meGusta;
    const mine = users.find((u) => u.id === me.cuenta)?.entrenador;
    if (mine) m.gustan = meGusta ? [mine, ...m.gustan.filter((n) => n !== mine)] : m.gustan.filter((n) => n !== mine);
    button.replaceWith(likeButton(m));
  } catch (err) {
    button.disabled = false;
    showError((err as Error).message);
  }
}

// ---------- Responder a un comentario ----------

function setReplyTarget(m: Mensaje | null) {
  replyTarget = m;
  $('respuesta-a').classList.toggle('hidden', !m);
  if (!m) return;
  $('respuesta-a-nombre').textContent = m.autor?.entrenador ?? 'Cuenta borrada';
  $('respuesta-a-texto').textContent = excerpt(m.texto);
  const box = $<HTMLTextAreaElement>('respuesta-texto');
  box.focus();
  $('form-respuesta').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Menciones: sugerencias al escribir @ ----------

/** Sugiere nombres mientras se escribe "@nom…" y completa el que se elige */
function attachMentions(textarea: HTMLTextAreaElement) {
  const list = el('ul', 'hidden absolute left-0 right-0 z-20 mt-1 rounded-xl border border-emerald-500/30 bg-zinc-950 shadow-2xl p-1 max-h-64 overflow-y-auto');
  list.setAttribute('role', 'listbox');
  textarea.parentElement!.style.position = 'relative';
  textarea.after(list);
  let matches: Usuario[] = [];
  let active = 0;

  const query = () => textarea.value.slice(0, textarea.selectionStart).match(/(?:^|\s)@([\p{L}\p{N}_]{0,30})$/u)?.[1];
  const close = () => {
    list.classList.add('hidden');
    matches = [];
  };
  const choose = (user: Usuario) => {
    const caret = textarea.selectionStart;
    const before = textarea.value.slice(0, caret).replace(/@([\p{L}\p{N}_]{0,30})$/u, `@${user.entrenador} `);
    textarea.value = before + textarea.value.slice(caret);
    textarea.setSelectionRange(before.length, before.length);
    textarea.focus();
    close();
  };
  const render = () => {
    list.replaceChildren(
      ...matches.map((user, i) => {
        const item = el('li');
        const option = el('button', `w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm ${i === active ? 'bg-emerald-500/15 text-emerald-200' : 'text-zinc-200 hover:bg-zinc-800'}`);
        option.type = 'button';
        option.setAttribute('role', 'option');
        const img = el('img', 'w-8 h-8 [image-rendering:pixelated]');
        img.src = avatarUrl(user.avatar, user.shiny);
        img.alt = '';
        option.append(img, document.createTextNode(user.entrenador));
        if (user.escama) option.append(escamaBadge());
        const badge = roleBadge(user.rol);
        if (badge) option.append(badge);
        // mousedown en vez de click: así el textarea no pierde el foco antes de elegir
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(user);
        });
        item.append(option);
        return item;
      }),
    );
    list.classList.toggle('hidden', matches.length === 0);
  };
  const update = async () => {
    const q = query();
    if (q === undefined) return close();
    await loadUsers();
    const wanted = q.toLowerCase();
    matches = users
      .filter((u) => u.id !== me.cuenta && u.entrenador.toLowerCase().includes(wanted))
      .sort((a, b) => Number(!a.entrenador.toLowerCase().startsWith(wanted)) - Number(!b.entrenador.toLowerCase().startsWith(wanted)))
      .slice(0, 6);
    active = 0;
    render();
  };
  textarea.addEventListener('input', update);
  textarea.addEventListener('click', update);
  textarea.addEventListener('blur', () => setTimeout(close, 150));
  textarea.addEventListener('keydown', (event) => {
    if (!matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      render();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === 'Escape') close();
  });
}

// ---------- Avisos ----------

async function loadNotices() {
  if (!me.cuenta) return;
  try {
    const { avisos, nuevos } = await foroGet<{ avisos: Aviso[]; nuevos: number }>('?avisos=1');
    const badge = $('avisos-nuevos');
    badge.textContent = nuevos > 9 ? '9+' : String(nuevos);
    badge.classList.toggle('hidden', nuevos === 0);
    $('avisos-boton').classList.replace('hidden', 'inline-flex');
    $('avisos-vacio').classList.toggle('hidden', avisos.length > 0);
    $('avisos-lista').replaceChildren(
      ...avisos.map((a) => {
        const item = el('li');
        const link = el('a', `flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 ${a.leido ? '' : 'bg-emerald-500/10'}`);
        link.href = `#t/${a.temaId}/${a.mensajeId}`;
        const img = el('img', 'w-10 h-10 flex-shrink-0 [image-rendering:pixelated]');
        img.src = avatarUrl(a.avatar, a.shiny);
        img.alt = '';
        const text = el('div', 'min-w-0 text-sm');
        const line = el('p', 'text-zinc-200');
        line.append(el('strong', 'text-zinc-100', a.de), document.createTextNode(a.tipo === 'mencion' ? ' te mencionó en ' : ' respondió a tu comentario en '), el('strong', 'text-emerald-300', `«${a.titulo}»`));
        text.append(line, el('p', 'text-xs text-zinc-500', timeAgo(a.creado)));
        link.append(img, text);
        link.addEventListener('click', () => $('avisos-panel').classList.add('hidden'));
        item.append(link);
        return item;
      }),
    );
  } catch {
    // Sin avisos no pasa nada: se reintenta en la próxima revisión
  }
}

async function toggleNotices() {
  const panel = $('avisos-panel');
  panel.classList.toggle('hidden');
  if (panel.classList.contains('hidden') || $('avisos-nuevos').classList.contains('hidden')) return;
  // Al abrir el panel, los avisos quedan vistos
  $('avisos-nuevos').classList.add('hidden');
  await foroPost('avisosLeidos', {}).catch(() => undefined);
}

// ---------- Vistas ----------
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
  // Los temas de cumpleaños los abre la web sola
  $('nuevo-tema-abrir').classList.toggle('hidden', !me.cuenta || categoria === 'cumpleanos');
  $('temas-vacio').classList.toggle('hidden', temas.length > 0);
  $('temas-vacio').textContent = categoria === 'cumpleanos' ? 'Hoy nadie está de cumpleaños. Cuando alguien cumpla, su tema aparece aquí solo.' : 'Todavía no hay temas aquí. ¡Abre el primero!';
  $('lista-temas').replaceChildren(
    ...temas.map((t) => {
      const item = el('li');
      const link = el('a', 'glass-card rounded-2xl p-4 flex items-center gap-4 hover:border-emerald-500/40');
      link.href = `#t/${t.id}`;
      const body = el('div', 'min-w-0 flex-grow');
      const title = el('p', 'font-bold text-zinc-100 break-words');
      if (t.fijado) title.append(el('span', 'mr-2 text-amber-400', '📌'));
      title.append(document.createTextNode(t.titulo));
      const meta = el('p', 'text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-1.5');
      meta.append(document.createTextNode(t.autor?.entrenador ?? 'Cuenta borrada'));
      if (t.autor?.escama) meta.append(escamaBadge());
      const badge = roleBadge(t.autor?.rol);
      if (badge) meta.append(badge);
      meta.append(document.createTextNode(`· ${t.respuestas} respuesta${t.respuestas === 1 ? '' : 's'} · ${timeAgo(t.actividad)}`));
      body.append(title, meta);
      link.append(avatar(t.autor, 'w-11 h-11'), body);
      item.append(link);
      return item;
    }),
  );
}

let flyerFor = '';

/** Dibuja el flyer de cumpleaños del tema (una sola vez por tema) */
async function renderBirthday(tema: Tema) {
  $('tema-cumple').classList.toggle('hidden', !tema.cumple);
  renderBirthdayAdmin(tema);
  if (!tema.cumple || flyerFor === tema.id) return;
  flyerFor = tema.id;
  await drawBirthdayFlyer($<HTMLCanvasElement>('cumple-canvas'), tema.cumple);
}

/** Teléfono de quien cumple años: solo llega al administrador */
function renderBirthdayAdmin(tema: Tema) {
  const phone = tema.cumple?.telefono;
  $('cumple-admin').classList.toggle('hidden', !me.moderador || !tema.cumple);
  if (!me.moderador || !tema.cumple) return;
  $('cumple-admin-nombre').textContent = tema.cumple.entrenador;
  $('cumple-admin-telefono').textContent = phone ? `+${phone}` : 'No tiene teléfono registrado (agrégalo en el panel: Miembros → Editar)';
  $('cumple-admin-telefono').classList.toggle('text-base', !phone);
  $('cumple-admin-botones').classList.toggle('hidden', !phone);
  $<HTMLAnchorElement>('cumple-admin-chat').href = `https://wa.me/${phone}?text=${encodeURIComponent(
    `🎂 ¡Feliz cumpleaños, ${tema.cumple.entrenador}! Toda la comunidad de Emerald City te desea un día lleno de shinies 💚`,
  )}`;
}

async function copyText(text: string, button: HTMLButtonElement, label: string) {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  button.textContent = '¡Copiado!';
  setTimeout(() => (button.textContent = label), 2000);
}

async function birthdayFile() {
  return canvasToFile($<HTMLCanvasElement>('cumple-canvas'), `cumpleanos-${currentTopic?.cumple?.entrenador ?? 'emerald'}.png`);
}

function renderTopic(tema: Tema) {
  currentTopic = tema;
  renderBirthday(tema);
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
      const item = el('li', `glass-panel rounded-2xl p-4 flex gap-3 ${m.autor?.rol ? 'border-amber-400/40 bg-amber-500/[0.04]' : ''}`);
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
      body.append(head);
      if (m.respuestaA) body.append(quote(m.respuestaA, tema));
      body.append(messageText(m.texto));
      if (!m.autor?.sistema || m.likes) {
        const actions = el('div', 'mt-2 flex flex-wrap items-center gap-2');
        actions.append(likeButton(m));
        if (me.cuenta && !m.autor?.sistema) {
          const answer = el('button', 'px-2.5 py-1 rounded-lg border border-zinc-700 text-xs font-bold text-zinc-300 hover:border-emerald-400/50 hover:text-emerald-200', '↩ Responder');
          answer.type = 'button';
          answer.addEventListener('click', () => setReplyTarget(m));
          actions.append(answer);
        }
        body.append(actions);
      }
      item.append(avatar(m.autor), body);
      return item;
    }),
  );
}

const signature = (tema: Tema) => `${tema.fijado}|${tema.mensajes.map((m) => `${m.id}:${m.likes}`).join(',')}`;

async function showTopic(id: string, quiet = false) {
  const [{ tema }] = await Promise.all([foroGet<{ tema: Tema }>(`?tema=${encodeURIComponent(id)}`), loadUsers()]);
  // Al actualizar en segundo plano solo se redibuja si llegó algo nuevo (mensajes o me gusta)
  const changed = !currentTopic || currentTopic.id !== tema.id || signature(currentTopic) !== signature(tema);
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
    const { tema } = await foroPost<{ tema: Tema }>('responder', {
      tema: currentTopic!.id,
      texto: $<HTMLTextAreaElement>('respuesta-texto').value,
      respuestaA: replyTarget?.id ?? null,
    });
    form.reset();
    setReplyTarget(null);
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
    const badge = roleBadge(perfil.rol);
    if (badge || perfil.escama) {
      const badges = el('span', 'flex flex-wrap items-center justify-center gap-2 mt-2');
      if (perfil.escama) {
        const scale = el('span', 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-emerald-400/60 bg-emerald-500/10 text-[11px] font-black uppercase tracking-wider text-emerald-200');
        scale.append(escamaBadge(), document.createTextNode('Escama Esmeralda'));
        badges.append(scale);
      }
      if (badge) badges.append(badge);
      $('pm-nombre').append(badges);
    }
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
      // "#t/tema" o "#t/tema/comentario" (desde un aviso: lleva a ese comentario)
      const [temaId, mensajeId] = hash.slice(2).split('/');
      currentTopic = null;
      setReplyTarget(null);
      await showTopic(temaId);
      if (mensajeId) setTimeout(() => scrollToMessage(mensajeId), 100);
      else window.scrollTo(0, 0);
      refreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible' && currentTopic) showTopic(currentTopic.id, true).catch(() => undefined);
      }, REFRESH_MS);
    } else if (hash.startsWith('c/')) await showTopics(hash.slice(2));
    else await showCategories();
    $('foro-puerta').classList.add('hidden');
    loadNotices();
  } catch (err) {
    if (err instanceof ForoError && err.status === 401) showGate('anonimo');
    else if (err instanceof ForoError && err.status === 403) {
      // Cuenta creada pero sin aprobar
      const me = await cuentaApi<{ cuenta: CuentaPropia | null }>('yo').catch(() => ({ cuenta: null }));
      if (me.cuenta) showPending(me.cuenta);
      else showGate('mensaje', err.message);
    }
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
  $('cumple-descargar').addEventListener('click', async () => {
    const file = await birthdayFile();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  // En el celular se puede mandar directo a WhatsApp
  const probe = new File([''], 'probe.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [probe] })) {
    $('cumple-compartir').classList.remove('hidden');
    $('cumple-compartir').addEventListener('click', async () => {
      if (!currentTopic?.cumple) return;
      const file = await birthdayFile();
      await navigator.share({ files: [file], text: birthdayMessage(currentTopic.cumple, currentTopic.cumple.telefono ?? '') }).catch(() => undefined);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('.puerta-tab')) {
    button.addEventListener('click', () => setGateTab(button.dataset.puerta as 'crear' | 'entrar'));
  }
  setGateTab('crear');
  $('puerta-crear').addEventListener('submit', onCreate);
  $('puerta-entrar').addEventListener('submit', onLogin);
  $('puerta-recuperar').addEventListener('submit', onRecover);
  $('pe-olvide').addEventListener('click', () => {
    setGateTab('recuperar');
    $<HTMLInputElement>('pr-codigo').value = $<HTMLInputElement>('pe-codigo').value;
  });
  $('pr-volver').addEventListener('click', () => setGateTab('entrar'));
  // "/foro#recuperar" abre directo el formulario de contraseña olvidada
  if (location.hash === '#recuperar') {
    setGateTab('recuperar');
    history.replaceState(null, '', location.pathname);
  }
  for (const id of ['pc-codigo', 'pe-codigo', 'pr-codigo']) $(id).addEventListener('input', () => formatCode($<HTMLInputElement>(id)));
  for (const button of document.querySelectorAll<HTMLButtonElement>('.ver-clave')) {
    button.addEventListener('click', () => {
      const input = $<HTMLInputElement>(button.dataset.ver!);
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
    });
  }
  $('pendiente-revisar').addEventListener('click', () => route());
  $('cumple-admin-copiar').addEventListener('click', (e) => {
    if (currentTopic?.cumple?.telefono) copyText(`+${currentTopic.cumple.telefono}`, e.currentTarget as HTMLButtonElement, 'Copiar número');
  });
  $('cumple-admin-mensaje').addEventListener('click', (e) => {
    if (currentTopic?.cumple) copyText(birthdayMessage(currentTopic.cumple, currentTopic.cumple.telefono ?? ''), e.currentTarget as HTMLButtonElement, 'Copiar mensaje con @etiqueta');
  });
  attachMentions($<HTMLTextAreaElement>('respuesta-texto'));
  attachMentions($<HTMLTextAreaElement>('tema-texto'));
  $('respuesta-a-cancelar').addEventListener('click', () => setReplyTarget(null));
  $('avisos-boton').addEventListener('click', toggleNotices);
  document.addEventListener('click', (event) => {
    const panel = $('avisos-panel');
    if (!panel.classList.contains('hidden') && !(event.target as HTMLElement).closest('#avisos-panel, #avisos-boton')) panel.classList.add('hidden');
  });
  // Los avisos se revisan cada minuto mientras la página está a la vista
  noticesTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadNotices();
  }, 60_000);
  window.addEventListener('hashchange', route);
  showMe();
  route();
}
