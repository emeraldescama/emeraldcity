/**
 * Página /eventos: dinámicas con retos diarios para los miembros activos de Escama
 * Esmeralda. Muestra los retos, la tabla de puntos con el perfil de cada participante y
 * deja subir la captura de cada reto cumplido.
 */
import { compressImage } from './images';
import { avatarUrl, TEAM_COLORS, TEAM_NAMES, type Equipo } from '../utils/perfil';
import { formatShortDate } from '../utils/eventos';

interface Reto {
  id: string;
  titulo: string;
  descripcion: string;
  puntos: number;
  inicio: string;
  fin: string;
  estado: 'abierto' | 'cerrado' | 'proximo';
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
interface Vista {
  hoy: string;
  dinamicas: Dinamica[];
  participa: boolean;
  entregas?: Record<string, { estado: 'pendiente' | 'aprobada' | 'rechazada'; nota: string }>;
  cuenta: { id: string; entrenador: string } | null;
  motivo: string | null;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let view: Vista;
let uploadingFor: string | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const range = (inicio: string, fin: string) => (inicio === fin ? formatShortDate(inicio) : `${formatShortDate(inicio)} – ${formatShortDate(fin)}`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function showError(message = '') {
  $('ev-error').textContent = message;
  $('ev-error').classList.toggle('hidden', !message);
}

// ---------- Retos ----------

function statusBadge(retoId: string) {
  const entrega = view.entregas?.[retoId];
  if (!entrega) return null;
  const styles = {
    pendiente: ['En revisión ⏳', 'text-amber-300 border-amber-500/40 bg-amber-500/10'],
    aprobada: ['Cumplido ✅', 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'],
    rechazada: ['Rechazado', 'text-red-300 border-red-500/40 bg-red-500/10'],
  } as const;
  const [label, style] = styles[entrega.estado];
  const wrap = el('div', 'space-y-1');
  wrap.append(el('span', `inline-flex px-2.5 py-1 text-xs font-bold rounded-lg border ${style}`, label));
  if (entrega.estado === 'rechazada' && entrega.nota) wrap.append(el('p', 'text-xs text-red-300', entrega.nota));
  return wrap;
}

function challengeCard(reto: Reto) {
  const open = reto.estado === 'abierto';
  const card = el('article', `glass-card rounded-2xl p-5 flex flex-col gap-3 ${open ? 'border-emerald-500/40' : 'opacity-80'}`);
  const head = el('div', 'flex items-start justify-between gap-3');
  const title = el('div', 'min-w-0');
  title.append(
    el('p', 'text-xs font-bold uppercase tracking-wider text-amber-400', open ? `Reto · ${reto.fin === view.hoy ? 'hasta hoy' : `hasta el ${formatShortDate(reto.fin)}`}` : range(reto.inicio, reto.fin)),
    el('h3', 'text-lg font-black text-zinc-100 mt-1 break-words', reto.titulo),
  );
  head.append(title, el('span', 'flex-shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-black', `+${reto.puntos}`));
  card.append(head);
  if (reto.descripcion) card.append(el('p', 'text-sm text-zinc-300 whitespace-pre-line break-words', reto.descripcion));

  const footer = el('div', 'mt-auto flex flex-wrap items-center gap-3');
  const badge = statusBadge(reto.id);
  if (badge) footer.append(badge);
  const entrega = view.entregas?.[reto.id];
  if (open && view.participa && entrega?.estado !== 'aprobada') {
    const upload = el('button', 'px-4 py-2.5 text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-xl disabled:opacity-50', entrega ? 'Cambiar captura' : 'Subir mi captura');
    upload.type = 'button';
    upload.dataset.reto = reto.id;
    upload.addEventListener('click', () => {
      uploadingFor = reto.id;
      $<HTMLInputElement>('ev-archivo').click();
    });
    footer.append(upload);
  }
  if (footer.childElementCount) card.append(footer);
  return card;
}

// ---------- Tabla de puntos ----------

function rankingList(ranking: Participante[]) {
  if (!ranking.length) return el('p', 'glass-panel rounded-2xl p-6 text-center text-sm text-zinc-400', 'Todavía no hay participantes.');
  const list = el('ol', 'space-y-2');
  const medals = ['🥇', '🥈', '🥉'];
  let position = 0;
  ranking.forEach((p, i) => {
    // Empates comparten el puesto
    if (i === 0 || p.puntos !== ranking[i - 1].puntos) position = i + 1;
    const mine = p.id === view.cuenta?.id;
    const item = el('li', `glass-panel rounded-2xl px-4 py-3 flex items-center gap-3 ${mine ? 'border-emerald-400/60 bg-emerald-500/5' : ''}`);
    const place = el('span', 'w-8 text-center font-black text-lg flex-shrink-0', p.puntos > 0 && position <= 3 ? medals[position - 1] : String(position));
    const img = el('img', 'w-12 h-12 flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 [image-rendering:pixelated]');
    img.src = avatarUrl(p.avatar, p.shiny);
    img.alt = '';
    img.loading = 'lazy';
    const info = el('div', 'min-w-0 flex-grow');
    const name = el('p', 'font-bold text-zinc-100 flex items-center gap-1.5 truncate');
    if (p.equipo) {
      const dot = el('span', 'w-2.5 h-2.5 rounded-full flex-shrink-0');
      dot.style.background = TEAM_COLORS[p.equipo as Exclude<Equipo, ''>];
      dot.title = `Equipo ${TEAM_NAMES[p.equipo as Exclude<Equipo, ''>]}`;
      name.append(dot);
    }
    name.append(document.createTextNode(`${p.entrenador}${mine ? ' (tú)' : ''}`));
    info.append(name, el('p', 'text-xs text-zinc-400', `${p.retos} reto${p.retos === 1 ? '' : 's'} cumplido${p.retos === 1 ? '' : 's'}`));
    const points = el('span', 'flex-shrink-0 text-right');
    points.append(el('span', 'block text-xl font-black text-emerald-400 leading-none', String(p.puntos)), el('span', 'text-[10px] font-bold uppercase text-zinc-500', 'puntos'));
    item.append(place, img, info, points);
    list.append(item);
  });
  return list;
}

// ---------- Página ----------

function render() {
  $('ev-vacio').classList.toggle('hidden', view.dinamicas.length > 0);
  const showJoin = !view.participa && view.dinamicas.length > 0;
  $('ev-participar').classList.toggle('hidden', !showJoin);
  $('ev-motivo').textContent =
    view.motivo ?? 'Participan los miembros activos de Escama Esmeralda con su cuenta de la web aprobada.';
  $('ev-entrar').classList.toggle('hidden', Boolean(view.cuenta));

  $('ev-dinamicas').replaceChildren(
    ...view.dinamicas.map((d) => {
      const section = el('section', 'space-y-6');
      const hero = el('div', 'glass-panel rounded-3xl p-6 sm:p-8 border-emerald-500/30');
      const left = daysBetween(view.hoy, d.fin);
      hero.append(
        el('p', 'text-xs font-bold uppercase tracking-wider text-amber-400', range(d.inicio, d.fin)),
        el('h2', 'text-3xl sm:text-4xl font-black text-zinc-100 tracking-tight mt-1', d.nombre),
      );
      if (d.descripcion) hero.append(el('p', 'text-zinc-300 mt-3 whitespace-pre-line', d.descripcion));
      hero.append(
        el(
          'p',
          'mt-4 inline-flex px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm font-bold text-emerald-300',
          left > 1 ? `Faltan ${left} días` : left === 1 ? 'Termina mañana' : left === 0 ? 'Último día' : 'Dinámica terminada · tabla final',
        ),
      );
      section.append(hero);

      const open = d.retos.filter((r) => r.estado === 'abierto');
      const closed = d.retos.filter((r) => r.estado === 'cerrado');
      const grid = el('div', 'grid grid-cols-1 lg:grid-cols-5 gap-8');
      const challenges = el('div', 'lg:col-span-3 space-y-4');
      challenges.append(el('h3', 'text-xl font-black text-zinc-100', open.length === 1 ? 'Reto del día' : 'Retos abiertos'));
      if (open.length) {
        const cards = el('div', 'grid grid-cols-1 gap-4');
        cards.append(...open.map(challengeCard));
        challenges.append(cards);
      } else {
        challenges.append(el('p', 'glass-panel rounded-2xl p-6 text-center text-sm text-zinc-400', left >= 0 ? 'El próximo reto se publica pronto.' : 'La dinámica terminó. ¡Gracias por participar!'));
      }
      if (closed.length) {
        const details = el('details', 'group');
        const summary = el('summary', 'cursor-pointer text-sm font-bold text-emerald-400 hover:text-emerald-300 py-2', `Retos anteriores (${closed.length})`);
        const cards = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3');
        cards.append(...closed.map(challengeCard));
        details.append(summary, cards);
        challenges.append(details);
      }
      const table = el('div', 'lg:col-span-2 space-y-4');
      table.append(el('h3', 'text-xl font-black text-zinc-100', 'Tabla de puntos'), rankingList(d.ranking));
      grid.append(challenges, table);
      section.append(grid);
      return section;
    }),
  );
}

async function load() {
  try {
    const res = await fetch('/api/eventos', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los eventos.');
    view = data;
    render();
  } catch (err) {
    showError((err as Error).message);
  } finally {
    $('ev-cargando').classList.add('hidden');
  }
}

async function onFileChosen() {
  const input = $<HTMLInputElement>('ev-archivo');
  const file = input.files?.[0];
  const retoId = uploadingFor;
  input.value = '';
  if (!file || !retoId) return;
  const button = document.querySelector<HTMLButtonElement>(`button[data-reto="${retoId}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Subiendo…';
  }
  showError();
  try {
    const { base64 } = await compressImage(file, { maxSide: 1100, maxBytes: 450 * 1024 });
    const res = await fetch('/api/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ accion: 'entregar', reto: retoId, captura: base64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la captura.');
    await load();
  } catch (err) {
    showError((err as Error).message);
    if (button) {
      button.disabled = false;
      button.textContent = 'Subir mi captura';
    }
  }
}

export function initEventos() {
  $('ev-archivo').addEventListener('change', onFileChosen);
  load();
}
