/**
 * Página /eventos (Wild Area): misiones por día para los miembros activos de Escama
 * Esmeralda. Cada misión se marca con "¡Lo logré!" y la valida el admin en la quedada;
 * los retos antiguos con captura siguen funcionando igual.
 */
import { compressImage } from './images';
import { artworkUrl, avatarUrl, TEAM_COLORS, TEAM_NAMES, type Equipo } from '../utils/perfil';
import { formatShortDate } from '../utils/eventos';

interface Reto {
  id: string;
  titulo: string;
  descripcion: string;
  puntos: number;
  inicio: string;
  fin: string;
  estado: 'abierto' | 'cerrado' | 'proximo';
  modo: 'logro' | 'captura';
  limite: number | null;
  grupo: string;
  pokemon: number[];
  /** Misión de un día que todavía no llega: solo trae la fecha */
  bloqueado?: boolean;
}
interface Participante {
  id: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
  equipo: Equipo;
  puntos: number;
  retos: number;
}
interface Dinamica {
  id: string;
  nombre: string;
  descripcion: string;
  inicio: string;
  fin: string;
  retos: Reto[];
  ranking: Participante[];
}
interface Logros {
  pendientes: number;
  aprobados: number;
  rechazados: number;
}
interface Vista {
  hoy: string;
  dinamicas: Dinamica[];
  participa: boolean;
  entregas?: Record<string, { estado: 'pendiente' | 'aprobada' | 'rechazada'; nota: string }>;
  logros?: Record<string, Logros>;
  cuenta: { id: string; entrenador: string; avatar: number; shiny: boolean; estado: string } | null;
  motivo: string | null;
  validarTelefono: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const DAY_NAMES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

let view: Vista;
let uploadingFor: string | null = null;
let lastClaim: Reto | null = null;
// Día elegido en cada dinámica
const selectedDay = new Map<string, string>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const range = (inicio: string, fin: string) => (inicio === fin ? formatShortDate(inicio) : `${formatShortDate(inicio)} – ${formatShortDate(fin)}`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function days(inicio: string, fin: string): string[] {
  const list: string[] = [];
  for (let d = inicio; d <= fin && list.length < 31; ) {
    list.push(d);
    const next = new Date(`${d}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return list;
}

function showError(message = '') {
  $('wa-error').textContent = message;
  $('wa-error').classList.toggle('hidden', !message);
}

async function post(payload: Record<string, unknown>) {
  const res = await fetch('/api/eventos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar. Inténtalo de nuevo.');
  return data;
}

// ---------- Ilustraciones ----------

/** Pokémon de la misión en un círculo con brillo Dinamax (o un huevo) */
function orb(pokemon: number[], size = 'wa-orb') {
  const box = el('div', size);
  if (!pokemon.length) {
    box.append(el('span', 'absolute inset-0 flex items-center justify-center text-5xl', '🥚'));
    return box;
  }
  const shown = pokemon.slice(0, 3);
  const layouts = [
    [{ l: 5, t: 5, s: 90 }],
    [
      { l: 0, t: 12, s: 62 },
      { l: 38, t: 30, s: 62 },
    ],
    [
      { l: 0, t: 6, s: 52 },
      { l: 48, t: 6, s: 52 },
      { l: 24, t: 44, s: 54 },
    ],
  ][shown.length - 1];
  shown.forEach((n, i) => {
    const img = el('img');
    img.src = artworkUrl(n);
    img.alt = '';
    img.loading = 'lazy';
    const { l, t, s } = layouts[i];
    img.style.left = `${l}%`;
    img.style.top = `${t}%`;
    img.style.width = `${s}%`;
    img.style.height = `${s}%`;
    box.append(img);
  });
  return box;
}

// ---------- Misiones ----------

function missionCard(reto: Reto) {
  const open = reto.estado === 'abierto';
  const card = el('article', `wa-mission p-4 flex gap-4 items-start ${open ? 'wa-open' : ''}`);
  card.append(orb(reto.pokemon));

  const body = el('div', 'min-w-0 flex-grow space-y-2');
  const head = el('div', 'flex items-start justify-between gap-3');
  head.append(
    el('h4', 'font-black text-white leading-snug break-words', reto.titulo),
    el('span', 'shrink-0 px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-400/50 text-pink-100 text-sm font-black', `+${reto.puntos} pt${reto.puntos === 1 ? '' : 's'}`),
  );
  body.append(head);
  if (reto.descripcion) body.append(el('p', 'text-sm text-zinc-300', reto.descripcion));

  const mine = view.logros?.[reto.id] ?? { pendientes: 0, aprobados: 0, rechazados: 0 };
  const used = mine.pendientes + mine.aprobados;
  const chips = el('div', 'flex flex-wrap items-center gap-2 text-xs font-bold');
  chips.append(el('span', 'px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300', reto.limite === null ? 'Sin límite' : `Límite: ${reto.limite}`));
  if (reto.fin !== reto.inicio) chips.append(el('span', 'px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300', range(reto.inicio, reto.fin)));
  if (mine.aprobados) chips.append(el('span', 'px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/50 text-emerald-200', `✓ ${mine.aprobados} validado${mine.aprobados === 1 ? '' : 's'}`));
  if (mine.pendientes) chips.append(el('span', 'px-2 py-1 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200', `⏳ ${mine.pendientes} por validar`));
  body.append(chips);

  const actions = el('div', 'flex flex-wrap items-center gap-2 pt-1');
  if (reto.modo === 'captura') actions.append(...captureActions(reto));
  else if (!open) {
    actions.append(el('span', 'text-xs font-bold text-zinc-400', reto.estado === 'proximo' ? `Disponible el ${DAY_LONG[weekday(reto.inicio)]} ${formatShortDate(reto.inicio)}` : 'Misión cerrada'));
  } else if (view.participa) {
    if (reto.limite !== null && used >= reto.limite) actions.append(el('span', 'text-xs font-bold text-emerald-200', '¡Completaste el límite de esta misión!'));
    else {
      const button = el('button', 'wa-button text-sm', used ? '¡Lo logré otra vez!' : '¡Lo logré!');
      button.type = 'button';
      button.addEventListener('click', () => onClaim(reto, button));
      actions.append(button);
    }
    if (mine.pendientes) {
      const undo = el('button', 'text-xs font-bold text-zinc-400 hover:text-zinc-200 underline', 'Deshacer');
      undo.type = 'button';
      undo.addEventListener('click', () => onUndo(reto, undo));
      actions.append(undo);
    }
  }
  if (actions.childElementCount) body.append(actions);
  card.append(body);
  return card;
}

/** Retos antiguos: se completan subiendo la captura */
function captureActions(reto: Reto): HTMLElement[] {
  const entrega = view.entregas?.[reto.id];
  const out: HTMLElement[] = [];
  if (entrega) {
    const labels = { pendiente: 'En revisión ⏳', aprobada: 'Cumplido ✅', rechazada: `Rechazado${entrega.nota ? `: ${entrega.nota}` : ''}` };
    out.push(el('span', 'text-xs font-bold text-zinc-200', labels[entrega.estado]));
  }
  if (reto.estado === 'abierto' && view.participa && entrega?.estado !== 'aprobada') {
    const upload = el('button', 'wa-button text-sm', entrega ? 'Cambiar captura' : 'Subir mi captura');
    upload.type = 'button';
    upload.dataset.reto = reto.id;
    upload.addEventListener('click', () => {
      uploadingFor = reto.id;
      $<HTMLInputElement>('ev-archivo').click();
    });
    out.push(upload);
  }
  return out;
}

/** Selector de días (LUN 9 … DOM 15) y las misiones del día elegido, por grupos */
function missionsSection(d: Dinamica) {
  const section = el('section', 'space-y-5');
  const list = days(d.inicio, d.fin);
  const chosen = selectedDay.get(d.id) ?? (list.includes(view.hoy) ? view.hoy : view.hoy < d.inicio ? d.inicio : list.at(-1)!);
  selectedDay.set(d.id, chosen);

  const tabs = el('div', 'flex gap-2 overflow-x-auto pb-2 -mx-1 px-1');
  tabs.setAttribute('role', 'tablist');
  for (const date of list) {
    const first = d.retos.find((r) => r.inicio === date && !r.bloqueado && r.pokemon.length && r.modo === 'logro')?.pokemon[0];
    const locked = date > view.hoy;
    const tab = el('button', `wa-day ${date === view.hoy ? 'wa-today' : ''} ${locked ? 'opacity-70' : ''}`);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(date === chosen));
    if (locked) tab.append(el('span', 'block text-2xl leading-9', '🔒'));
    else if (first) {
      const img = el('img', 'w-9 h-9 mx-auto [image-rendering:pixelated]');
      img.src = avatarUrl(first);
      img.alt = '';
      img.loading = 'lazy';
      tab.append(img);
    }
    tab.append(el('span', 'block text-xs font-black tracking-wider', DAY_NAMES[weekday(date)]), el('span', 'block text-lg font-black leading-tight', String(Number(date.slice(8)))));
    if (date === view.hoy) tab.append(el('span', 'block text-[10px] font-black uppercase text-amber-200', 'Hoy'));
    tab.addEventListener('click', () => {
      selectedDay.set(d.id, date);
      render();
    });
    tabs.append(tab);
  }
  section.append(tabs);

  // Misiones del día elegido (también las que abarcan varios días, como la de "WILD")
  const missions = d.retos.filter((r) => r.inicio <= chosen && r.fin >= chosen && !r.bloqueado);
  const lockedCount = d.retos.filter((r) => r.bloqueado && r.inicio === chosen).length;
  const header = el('div', 'flex flex-wrap items-baseline justify-between gap-2');
  header.append(
    el('h3', 'text-2xl font-black text-white', `${DAY_LONG[weekday(chosen)][0].toUpperCase()}${DAY_LONG[weekday(chosen)].slice(1)} ${formatShortDate(chosen)}`),
    el('p', 'text-sm font-bold text-pink-200', chosen === view.hoy ? '¡Misiones de hoy!' : chosen < view.hoy ? 'Día terminado' : 'Bloqueado'),
  );
  section.append(header);
  if (chosen > view.hoy) {
    // Día que todavía no llega: candado y cuándo se desbloquea
    const lock = el('div', 'wa-card p-8 text-center space-y-2');
    lock.append(
      el('p', 'text-5xl', '🔒'),
      el('p', 'text-lg font-black text-white', `Las misiones del ${DAY_LONG[weekday(chosen)]} ${formatShortDate(chosen)} se desbloquean ese día`),
      el('p', 'text-sm text-zinc-300', `${lockedCount ? `${lockedCount} misiones te esperan. ` : ''}Vuelve el ${DAY_LONG[weekday(chosen)]} desde las 12:00 AM para verlas y marcar tus logros.`),
    );
    section.append(lock);
    return section;
  }
  if (!missions.length) section.append(el('p', 'wa-card p-6 text-center text-sm text-zinc-300', 'No hay misiones este día.'));

  const groups = new Map<string, Reto[]>();
  for (const reto of missions) groups.set(reto.grupo, [...(groups.get(reto.grupo) ?? []), reto]);
  for (const [group, retos] of groups) {
    const block = el('div', 'space-y-3');
    if (group) block.append(el('p', 'text-xs font-black uppercase tracking-[0.15em] text-amber-200/90', group));
    const grid = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
    grid.append(...retos.map(missionCard));
    block.append(grid);
    section.append(block);
  }
  return section;
}

// ---------- Tabla de puntos ----------

function rankingSection(ranking: Participante[]) {
  const section = el('section', 'wa-card p-5 sm:p-6 space-y-4');
  section.append(el('h3', 'text-2xl font-black text-white', '🏆 Tabla de puntos'));
  if (!ranking.length) {
    section.append(el('p', 'text-sm text-zinc-300', 'Todavía no hay participantes. ¡Valida tu Escama Esmeralda y sé el primero!'));
    return section;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const list = el('ol', 'space-y-2');
  let position = 0;
  ranking.forEach((p, i) => {
    // Empates comparten el puesto
    if (i === 0 || p.puntos !== ranking[i - 1].puntos) position = i + 1;
    const mine = p.id === view.cuenta?.id;
    const top = p.puntos > 0 && position <= 3;
    const item = el('li', `rounded-2xl px-4 py-3 flex items-center gap-3 border ${mine ? 'border-pink-400/70 bg-pink-500/10' : top ? 'border-amber-400/40 bg-amber-500/5' : 'border-white/10 bg-black/30'}`);
    item.append(el('span', 'w-8 text-center font-black text-lg shrink-0 text-white', top ? medals[position - 1] : String(position)));
    const img = el('img', 'w-12 h-12 shrink-0 [image-rendering:pixelated]');
    img.src = avatarUrl(p.avatar, p.shiny);
    img.alt = '';
    img.loading = 'lazy';
    const info = el('div', 'min-w-0 flex-grow');
    const name = el('p', 'font-bold text-white flex items-center gap-1.5 truncate');
    if (p.equipo) {
      const dot = el('span', 'w-2.5 h-2.5 rounded-full shrink-0');
      dot.style.background = TEAM_COLORS[p.equipo as Exclude<Equipo, ''>];
      dot.title = `Equipo ${TEAM_NAMES[p.equipo as Exclude<Equipo, ''>]}`;
      name.append(dot);
    }
    name.append(el('span', 'truncate', p.entrenador));
    info.append(name, el('p', 'text-xs text-zinc-400', `${mine ? 'Tú · ' : ''}${p.retos} logro${p.retos === 1 ? '' : 's'} validado${p.retos === 1 ? '' : 's'}`));
    const points = el('span', 'shrink-0 text-right');
    points.append(el('span', 'block text-2xl font-black text-pink-200 leading-none', String(p.puntos)), el('span', 'text-[10px] font-bold uppercase text-zinc-400', 'puntos'));
    item.append(img, info, points);
    list.append(item);
  });
  section.append(list);
  return section;
}

// ---------- Página ----------

function render() {
  const main = view.dinamicas[0];
  $('wa-vacio').classList.toggle('hidden', view.dinamicas.length > 0);
  if (main) {
    $('wa-nombre').textContent = main.nombre;
    $('wa-fechas').textContent = `${range(main.inicio, main.fin)} · Escama Esmeralda`;
    const total = daysBetween(main.inicio, main.fin) + 1;
    const progress = $('wa-progreso');
    progress.textContent =
      view.hoy < main.inicio
        ? `Empieza en ${daysBetween(view.hoy, main.inicio)} día${daysBetween(view.hoy, main.inicio) === 1 ? '' : 's'}`
        : view.hoy > main.fin
          ? 'Terminó · tabla final'
          : `Día ${daysBetween(main.inicio, view.hoy) + 1} de ${total}`;
    progress.classList.remove('hidden');
  }

  // Invitación a unirse: solo para quien todavía no participa
  $('wa-unete').classList.toggle('hidden', view.participa);

  // Portada: "Registrarme" para quien todavía no participa, "Ya estás registrado" para quien sí
  $('wa-registrarme').classList.toggle('hidden', view.participa);
  $('wa-registrado').classList.toggle('hidden', !view.participa);
  $('wa-registrado').classList.toggle('inline-flex', view.participa);
  renderRegistration();

  $('wa-dinamicas').replaceChildren(
    ...view.dinamicas.map((d) => {
      const block = el('div', 'space-y-8');
      if (view.dinamicas.length > 1) block.append(el('h2', 'text-3xl font-black text-white', d.nombre));
      if (view.participa) {
        const me = d.ranking.find((p) => p.id === view.cuenta?.id);
        if (me) {
          const summary = el('div', 'wa-card p-4 flex items-center gap-4');
          const img = el('img', 'w-14 h-14 [image-rendering:pixelated]');
          img.src = avatarUrl(me.avatar, me.shiny);
          img.alt = '';
          const text = el('div', 'flex-grow');
          text.append(el('p', 'font-black text-white', `¡Estás participando, ${me.entrenador}!`), el('p', 'text-sm text-zinc-300', 'Marca tus logros y muéstraselos al admin en la quedada.'));
          const pts = el('p', 'text-right');
          pts.append(el('span', 'block text-3xl font-black text-pink-200 leading-none', String(me.puntos)), el('span', 'text-[10px] font-bold uppercase text-zinc-400', 'tus puntos'));
          summary.append(img, text, pts);
          block.append(summary);
        }
      }
      const grid = el('div', 'grid grid-cols-1 lg:grid-cols-3 gap-8 items-start');
      const missions = missionsSection(d);
      missions.classList.add('lg:col-span-2');
      grid.append(missions, rankingSection(d.ranking));
      block.append(grid);
      return block;
    }),
  );
}

async function load() {
  try {
    const res = await fetch('/api/eventos', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las misiones.');
    view = data;
    render();
    // "/eventos#registro": abre la ventana de registro (por ejemplo, al volver del foro)
    if (location.hash === '#registro' && !view.participa) {
      history.replaceState(null, '', location.pathname);
      openRegistration();
    }
  } catch (err) {
    showError((err as Error).message);
  } finally {
    $('wa-cargando').classList.add('hidden');
  }
}

// ---------- Acciones ----------

async function onClaim(reto: Reto, button: HTMLButtonElement) {
  button.disabled = true;
  showError();
  try {
    view = await post({ accion: 'logre', reto: reto.id });
    lastClaim = reto;
    render();
    $('wa-logrado-mision').textContent = reto.titulo;
    $('wa-logrado-arte').replaceChildren(orb(reto.pokemon));
    $<HTMLDialogElement>('wa-logrado').showModal();
  } catch (err) {
    button.disabled = false;
    showError((err as Error).message);
  }
}

async function onUndo(reto: Reto, button?: HTMLButtonElement) {
  if (button) button.disabled = true;
  try {
    view = await post({ accion: 'deshacer', reto: reto.id });
    render();
  } catch (err) {
    if (button) button.disabled = false;
    showError((err as Error).message);
  }
}

// ---------- Registro: validar Escama Esmeralda con el teléfono ----------

const RETURN_KEY = 'emerald-volver';

/** Qué muestra la ventana de registro según quién la abre */
function renderRegistration(done = false) {
  const anon = !view.cuenta;
  const form = !done && Boolean(view.cuenta) && view.validarTelefono;
  // Otro motivo: por ejemplo, ya vinculado pero con la suscripción vencida
  const motivo = !done && !anon && !form && !view.participa ? view.motivo : '';
  $('wr-intro').classList.toggle('hidden', done);
  $('wr-anon').classList.toggle('hidden', done || !anon);
  $('wr-form').classList.toggle('hidden', !form);
  $('wr-motivo').classList.toggle('hidden', !motivo);
  $('wr-motivo').textContent = motivo ?? '';
  $('wr-ok').classList.toggle('hidden', !done);
  $('wr-no-miembro').classList.toggle('hidden', done);
}

function openRegistration() {
  renderRegistration();
  $('wr-error').classList.add('hidden');
  $<HTMLDialogElement>('wa-registro').showModal();
  if (!$('wr-form').classList.contains('hidden')) $('wr-telefono').focus();
}

async function onValidate(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const error = $('wr-error');
  error.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'Registrando…';
  try {
    view = await post({ accion: 'validar', telefono: $<HTMLInputElement>('wr-telefono').value });
    render();
    $('wr-ok-nombre').textContent = view.cuenta ? `, ${view.cuenta.entrenador}` : '';
    renderRegistration(true);
  } catch (err) {
    error.textContent = (err as Error).message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'Registrarme';
  }
}

async function onFileChosen() {
  const input = $<HTMLInputElement>('ev-archivo');
  const file = input.files?.[0];
  const retoId = uploadingFor;
  input.value = '';
  if (!file || !retoId) return;
  showError();
  try {
    const { base64 } = await compressImage(file, { maxSide: 1100, maxBytes: 450 * 1024 });
    await post({ accion: 'entregar', reto: retoId, captura: base64 });
    await load();
  } catch (err) {
    showError((err as Error).message);
  }
}

export function initEventos() {
  $('ev-archivo').addEventListener('change', onFileChosen);
  $('wr-form').addEventListener('submit', onValidate);
  $('wa-registrarme').addEventListener('click', openRegistration);
  $('wr-cerrar').addEventListener('click', () => $<HTMLDialogElement>('wa-registro').close());
  $('wr-ver').addEventListener('click', () => {
    $<HTMLDialogElement>('wa-registro').close();
    document.getElementById('wa-dinamicas')?.scrollIntoView({ behavior: 'smooth' });
  });
  // Sin sesión: al volver del foro con la cuenta lista, la ventana se abre sola
  $('wr-entrar').addEventListener('click', () => {
    try {
      sessionStorage.setItem(RETURN_KEY, '/eventos#registro');
    } catch {
      // Sin almacenamiento, la persona vuelve a Eventos a mano
    }
  });
  $('wa-logrado-ok').addEventListener('click', () => $<HTMLDialogElement>('wa-logrado').close());
  $('wa-logrado-deshacer').addEventListener('click', async () => {
    $<HTMLDialogElement>('wa-logrado').close();
    if (lastClaim) await onUndo(lastClaim);
  });
  load();
}
