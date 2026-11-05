/**
 * Pestaña "Dinámicas" del panel: revisar las capturas de los retos, crear dinámicas (como
 * la de Wild Area) con sus retos diarios y vincular a los miembros de Escama Esmeralda con
 * su cuenta de la web.
 */
import { avatarUrl } from '../utils/perfil';
import { dayLabel, drawMissionsFlyer, missionsText } from './wildAreaFlyer';
import { caracasToday, formatShortDate } from '../utils/eventos';

interface Reto {
  id: string;
  dinamicaId: string;
  titulo: string;
  descripcion: string;
  puntos: number;
  inicio: string;
  fin: string;
  estado: 'proximo' | 'abierto' | 'cerrado';
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  modo: 'captura' | 'logro';
  limite: number | null;
  grupo: string;
  pokemon: number[];
}
interface Dinamica {
  id: string;
  nombre: string;
  descripcion: string;
  inicio: string;
  fin: string;
  retos: Reto[];
}
interface Entrega {
  id: string;
  creada: string;
  reto: string;
  puntos: number;
  dinamica: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
}
interface MiembroEscama {
  id: string;
  nombre: string;
  alias: string;
  venc: string;
  estado: 'activo' | 'vencido' | 'pendiente' | 'baja';
  cuentaId: string | null;
}
interface CuentaSimple {
  id: string;
  entrenador: string;
  nombre: string;
}

type Api = <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
type ShowStatus = (message: string, kind?: 'ok' | 'error' | 'info') => void;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let api: Api;
let showStatus: ShowStatus;
let dynamics: Dinamica[] = [];
let editingDynamic: string | null = null;
let editingChallenge: { id: string | null; dinamicaId: string } | null = null;
let escama: { miembros: MiembroEscama[]; cuentas: CuentaSimple[]; telefonos?: string } = { miembros: [], cuentas: [] };

const smallButton = 'px-2.5 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap disabled:opacity-40';
const STATE_LABELS = { proximo: 'Próximo', abierto: 'Abierto', cerrado: 'Cerrado' };
const ESCAMA_LABELS = { activo: 'Activo', vencido: 'Vencido', pendiente: 'Sin pagos', baja: 'De baja' };
const ESCAMA_STYLES = {
  activo: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  vencido: 'text-red-300 border-red-500/40 bg-red-500/10',
  pendiente: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  baja: 'text-zinc-400 border-zinc-700',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: (b: HTMLButtonElement) => void) {
  const b = el('button', `${smallButton} ${className}`, label);
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

/** Primer toque pide confirmación; devuelve true en el segundo */
function confirmed(b: HTMLButtonElement, label: string): boolean {
  if (b.dataset.confirm === 'true') return true;
  b.dataset.confirm = 'true';
  b.textContent = '¿Seguro?';
  setTimeout(() => {
    b.dataset.confirm = 'false';
    b.textContent = label;
  }, 4000);
  return false;
}

const dateRange = (inicio: string, fin: string) => (inicio === fin ? formatShortDate(inicio) : `${formatShortDate(inicio)} – ${formatShortDate(fin)}`);

// ---------- Capturas por revisar ----------

export async function loadSubmissions(quiet = false) {
  try {
    const { entregas } = await api<{ entregas: Entrega[] }>('entregas');
    renderSubmissions(entregas);
  } catch (err) {
    if (!quiet) showStatus((err as Error).message, 'error');
  }
}

function renderSubmissions(entregas: Entrega[]) {
  pendingCaptures = entregas.length;
  updateBadge();
  $('entregas-empty').classList.toggle('hidden', entregas.length > 0);
  $('entregas-list').replaceChildren(
    ...entregas.map((entrega) => {
      const item = el('li', 'glass-panel rounded-2xl p-4 space-y-3');
      const head = el('div', 'flex items-center gap-3');
      const img = el('img', 'w-12 h-12 rounded-xl bg-zinc-900 [image-rendering:pixelated]');
      img.src = avatarUrl(entrega.avatar, entrega.shiny);
      img.alt = '';
      const info = el('div', 'min-w-0');
      info.append(
        el('p', 'font-bold text-zinc-100', entrega.entrenador),
        el('p', 'text-xs text-zinc-400', `${entrega.reto} · ${entrega.puntos} pts · ${entrega.dinamica} · ${new Date(entrega.creada).toLocaleString('es-VE')}`),
      );
      head.append(img, info);

      const proof = el('div', 'rounded-xl bg-zinc-900 border border-zinc-800 min-h-[3rem] flex items-center justify-center');
      const show = button('Ver captura', 'text-emerald-300 border-emerald-500/30', async (b) => {
        b.disabled = true;
        try {
          const { base64 } = await api<{ base64: string }>('entregaCaptura', { id: entrega.id });
          const shot = el('img', 'w-full max-h-[32rem] object-contain rounded-xl');
          shot.src = `data:image/jpeg;base64,${base64}`;
          shot.alt = `Captura de ${entrega.entrenador}`;
          proof.replaceChildren(shot);
        } catch (err) {
          b.disabled = false;
          showStatus((err as Error).message, 'error');
        }
      });
      proof.append(show);

      const note = el('input', 'w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500');
      note.placeholder = 'Nota si la rechazas (opcional): por ejemplo, no se ve la fecha';
      note.maxLength = 200;
      const actions = el('div', 'flex flex-wrap gap-2');
      const review = (estado: 'aprobada' | 'rechazada') => async (b: HTMLButtonElement) => {
        b.disabled = true;
        try {
          await api('entregaRevisar', { id: entrega.id, estado, nota: note.value });
          showStatus(estado === 'aprobada' ? `${entrega.entrenador} sumó ${entrega.puntos} puntos.` : `Se rechazó la captura de ${entrega.entrenador}. Puede subir otra mientras el reto esté abierto.`, 'ok');
          await Promise.all([loadSubmissions(), loadDynamics(true)]);
        } catch (err) {
          b.disabled = false;
          showStatus((err as Error).message, 'error');
        }
      };
      actions.append(
        button(`Aprobar (+${entrega.puntos})`, 'text-zinc-950 bg-emerald-400 border-emerald-400', review('aprobada')),
        button('Rechazar', 'text-red-300 border-red-500/30', review('rechazada')),
      );
      item.append(head, proof, note, actions);
      return item;
    }),
  );
}

// ---------- Logros por validar ----------

interface Logro {
  id: string;
  creado: string;
  cuentaId: string;
  mision: string;
  puntos: number;
  dia: string;
  grupo: string;
  pokemon: number | null;
  dinamica: string;
  entrenador: string;
  avatar: number;
  shiny: boolean;
}

let claims: Logro[] = [];
let pendingCaptures = 0;

function updateBadge() {
  const count = $('entregas-count');
  const total = claims.length + pendingCaptures;
  count.textContent = String(total);
  count.classList.toggle('hidden', total === 0);
}

export async function loadClaims(quiet = false) {
  try {
    claims = (await api<{ logros: Logro[] }>('logros')).logros;
    renderClaims();
  } catch (err) {
    if (!quiet) showStatus((err as Error).message, 'error');
  }
}

/** Una tarjeta por persona con sus logros pendientes: así se valida a cada quien de una vez */
function renderClaims() {
  updateBadge();
  const query = $<HTMLInputElement>('logros-buscar').value.trim().toLowerCase();
  const people = new Map<string, Logro[]>();
  for (const c of claims) if (!query || c.entrenador.toLowerCase().includes(query)) people.set(c.cuentaId, [...(people.get(c.cuentaId) ?? []), c]);
  $('logros-vacio').classList.toggle('hidden', people.size > 0);
  $('logros-vacio').textContent = claims.length ? 'Nadie con ese nombre tiene logros por validar.' : 'No hay logros por validar.';
  $('logros-lista').replaceChildren(
    ...[...people.values()].map((list) => {
      const first = list[0];
      const total = list.reduce((sum, c) => sum + c.puntos, 0);
      const item = el('li', 'glass-panel rounded-2xl p-4 space-y-3');
      const head = el('div', 'flex items-center gap-3');
      const img = el('img', 'w-12 h-12 [image-rendering:pixelated]');
      img.src = avatarUrl(first.avatar, first.shiny);
      img.alt = '';
      const who = el('div', 'flex-grow min-w-0');
      who.append(el('p', 'font-black text-zinc-100 truncate', first.entrenador), el('p', 'text-xs text-zinc-400', `${list.length} logro${list.length === 1 ? '' : 's'} · ${total} pts posibles`));
      head.append(img, who);
      if (list.length > 1) head.append(button(`✓ Validar todos (+${total})`, 'text-zinc-950 bg-emerald-400 border-emerald-400', (b) => review(list, 'aprobado', b)));
      const rows = el('ul', 'space-y-2');
      for (const c of list) {
        const row = el('li', 'flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2');
        const pk = el('img', 'w-10 h-10 shrink-0 [image-rendering:pixelated]');
        if (c.pokemon) pk.src = avatarUrl(c.pokemon);
        pk.alt = '';
        const text = el('div', 'flex-grow min-w-0');
        text.append(
          el('p', 'text-sm font-bold text-zinc-100', c.mision),
          el('p', 'text-xs text-zinc-400', `${formatShortDate(c.dia)} · +${c.puntos} pts · marcado ${new Date(c.creado).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}`),
        );
        row.append(c.pokemon ? pk : el('span', 'w-10 text-center text-2xl', '🥚'), text);
        row.append(
          button('✓', 'text-zinc-950 bg-emerald-400 border-emerald-400 text-base px-3', (b) => review([c], 'aprobado', b)),
          button('✗', 'text-red-300 border-red-500/40 text-base px-3', (b) => review([c], 'rechazado', b)),
        );
        rows.append(row);
      }
      item.append(head, rows);
      return item;
    }),
  );
}

async function review(list: Logro[], estado: 'aprobado' | 'rechazado', b: HTMLButtonElement) {
  b.disabled = true;
  try {
    await api('logrosRevisar', { ids: list.map((c) => c.id), estado });
    const ids = new Set(list.map((c) => c.id));
    claims = claims.filter((c) => !ids.has(c.id));
    renderClaims();
    const points = list.reduce((sum, c) => sum + c.puntos, 0);
    showStatus(estado === 'aprobado' ? `${list[0].entrenador} sumó ${points} punto${points === 1 ? '' : 's'}.` : `Se rechazó el logro de ${list[0].entrenador}.`, 'ok');
  } catch (err) {
    b.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

/** Próximo lunes (o hoy, si es lunes), para cargar las misiones */
function nextMonday() {
  const today = caracasToday();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

async function onLoadWildArea(event: SubmitEvent) {
  event.preventDefault();
  const submit = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;
  try {
    const { retos } = await api<{ retos: number }>('wildAreaCargar', {
      nombre: $<HTMLSelectElement>('wa-cargar-nombre').value,
      lunes: $<HTMLInputElement>('wa-cargar-lunes').value,
    });
    showStatus(`¡Listo! Se cargaron ${retos} misiones de Wild Area. Ya se ven en la página de Eventos.`, 'ok');
    await loadDynamics();
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    submit.disabled = false;
  }
}

// ---------- Dinámicas y retos ----------

// ---------- Flyer de las misiones del día ----------

/** La dinámica con misiones de "¡Lo logré!" más reciente (la de Wild Area) */
const flyerDynamic = () => dynamics.find((d) => d.retos.some((r) => r.modo === 'logro'));

function flyerMissions(date: string) {
  const d = flyerDynamic();
  return (d?.retos ?? []).filter((r) => r.modo === 'logro' && r.inicio <= date && r.fin >= date);
}

/** Llena el selector de días; elige hoy si cae dentro de la dinámica, si no el primero */
function renderFlyerOptions() {
  const d = flyerDynamic();
  $('mf-vacio').classList.toggle('hidden', Boolean(d));
  $('mf-contenido').classList.toggle('hidden', !d);
  if (!d) return;
  const select = $<HTMLSelectElement>('mf-dia');
  const previous = select.value;
  const list: string[] = [];
  for (let day = d.inicio; day <= d.fin && list.length < 31; ) {
    list.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  select.replaceChildren(...list.map((day) => new Option(dayLabel(day).toLowerCase(), day)));
  const today = caracasToday();
  select.value = list.includes(previous) ? previous : list.includes(today) ? today : list[0];
  drawFlyer();
}

async function drawFlyer() {
  const d = flyerDynamic();
  if (!d) return;
  await drawMissionsFlyer($<HTMLCanvasElement>('mf-canvas'), d.nombre, $<HTMLSelectElement>('mf-dia').value, flyerMissions($<HTMLSelectElement>('mf-dia').value));
}

function flyerFile(): Promise<File> {
  const date = $<HTMLSelectElement>('mf-dia').value;
  return new Promise((resolve, reject) =>
    $<HTMLCanvasElement>('mf-canvas').toBlob(
      (blob) => (blob ? resolve(new File([blob], `wild-area-misiones-${date}.png`, { type: 'image/png' })) : reject(new Error('No se pudo crear la imagen.'))),
      'image/png',
    ),
  );
}

const flyerText = () => {
  const date = $<HTMLSelectElement>('mf-dia').value;
  return missionsText(flyerDynamic()?.nombre ?? 'Wild Area', date, flyerMissions(date), location.origin);
};

async function loadDynamics(quiet = false) {
  try {
    dynamics = (await api<{ dinamicas: Dinamica[] }>('dinamicas')).dinamicas;
    renderDynamics();
    renderFlyerOptions();
  } catch (err) {
    if (!quiet) showStatus((err as Error).message, 'error');
  }
}

function renderDynamics() {
  $('dinamicas-empty').classList.toggle('hidden', dynamics.length > 0);
  $('dinamicas-list').replaceChildren(
    ...dynamics.map((dynamic) => {
      const card = el('article', 'glass-panel rounded-2xl p-5 space-y-4');
      const head = el('div', 'flex flex-wrap items-start justify-between gap-3');
      const title = el('div', 'min-w-0');
      title.append(el('h3', 'text-lg font-black text-zinc-100', dynamic.nombre), el('p', 'text-xs font-bold uppercase tracking-wider text-amber-400', dateRange(dynamic.inicio, dynamic.fin)));
      const actions = el('div', 'flex flex-wrap gap-2');
      actions.append(
        button('Agregar reto', 'text-zinc-950 bg-emerald-400 border-emerald-400', () => openChallenge(dynamic.id)),
        button('Editar', 'text-emerald-300 border-emerald-500/30', () => editDynamic(dynamic)),
        button('Borrar', 'text-red-300 border-red-500/30', (b) => removeDynamic(dynamic, b)),
      );
      head.append(title, actions);
      card.append(head);

      if (!dynamic.retos.length) card.append(el('p', 'text-sm text-zinc-400', 'Todavía no tiene retos.'));
      const list = el('ul', 'space-y-2');
      for (const reto of dynamic.retos) {
        const item = el('li', 'rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 flex flex-wrap items-center gap-3');
        const info = el('div', 'min-w-0 flex-grow');
        info.append(
          el('p', 'font-bold text-zinc-100', `${reto.titulo} · ${reto.puntos} pts`),
          el(
            'p',
            'text-xs text-zinc-400',
            `${dateRange(reto.inicio, reto.fin)} · ${STATE_LABELS[reto.estado]} · ${reto.modo === 'logro' ? `"¡Lo logré!"${reto.limite === null ? ' sin límite' : ` · límite ${reto.limite}`}` : 'con captura'} · ${reto.aprobadas} validado${reto.aprobadas === 1 ? '' : 's'}${reto.pendientes ? ` · ${reto.pendientes} por revisar` : ''}`,
          ),
        );
        const buttons = el('div', 'flex gap-2');
        buttons.append(
          button('Editar', 'text-emerald-300 border-emerald-500/30', () => openChallenge(dynamic.id, reto)),
          button('Borrar', 'text-red-300 border-red-500/30', (b) => removeChallenge(reto, b)),
        );
        item.append(info, buttons);
        list.append(item);
      }
      card.append(list);
      return card;
    }),
  );
}

function resetDynamicForm() {
  editingDynamic = null;
  ($('dinamica-form') as HTMLFormElement).reset();
  $('dinamica-form-title').textContent = 'Nueva dinámica';
  $('dinamica-cancel').classList.add('hidden');
  $<HTMLInputElement>('di-inicio').value = caracasToday();
}

function editDynamic(dynamic: Dinamica) {
  editingDynamic = dynamic.id;
  $<HTMLInputElement>('di-nombre').value = dynamic.nombre;
  $<HTMLTextAreaElement>('di-descripcion').value = dynamic.descripcion;
  $<HTMLInputElement>('di-inicio').value = dynamic.inicio;
  $<HTMLInputElement>('di-fin').value = dynamic.fin;
  $('dinamica-form-title').textContent = 'Editar dinámica';
  $('dinamica-cancel').classList.remove('hidden');
  $('dinamica-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function onSaveDynamic(event: SubmitEvent) {
  event.preventDefault();
  const submit = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;
  try {
    await api('dinamicaGuardar', {
      dinamica: {
        id: editingDynamic,
        nombre: $<HTMLInputElement>('di-nombre').value,
        descripcion: $<HTMLTextAreaElement>('di-descripcion').value,
        inicio: $<HTMLInputElement>('di-inicio').value,
        fin: $<HTMLInputElement>('di-fin').value,
      },
    });
    showStatus(editingDynamic ? 'Dinámica actualizada.' : 'Dinámica creada. Ahora agrégale retos.', 'ok');
    resetDynamicForm();
    await loadDynamics();
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    submit.disabled = false;
  }
}

async function removeDynamic(dynamic: Dinamica, b: HTMLButtonElement) {
  if (!confirmed(b, 'Borrar')) return;
  b.disabled = true;
  try {
    await api('dinamicaEliminar', { id: dynamic.id });
    showStatus(`Se borró "${dynamic.nombre}" con sus retos y puntos.`, 'ok');
    await loadDynamics();
  } catch (err) {
    b.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

function openChallenge(dinamicaId: string, reto?: Reto) {
  editingChallenge = { id: reto?.id ?? null, dinamicaId };
  const today = caracasToday();
  $('reto-form-title').textContent = reto ? 'Editar reto' : 'Nuevo reto';
  $<HTMLInputElement>('re-titulo').value = reto?.titulo ?? '';
  $<HTMLTextAreaElement>('re-descripcion').value = reto?.descripcion ?? '';
  $<HTMLInputElement>('re-puntos').value = String(reto?.puntos ?? 5);
  $<HTMLInputElement>('re-inicio').value = reto?.inicio ?? today;
  $<HTMLInputElement>('re-fin').value = reto?.fin ?? today;
  $('reto-error').textContent = '';
  $<HTMLDialogElement>('reto-dialog').showModal();
}

async function onSaveChallenge(event: SubmitEvent) {
  event.preventDefault();
  if (!editingChallenge) return;
  const submit = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;
  $('reto-error').textContent = '';
  try {
    await api('retoGuardar', {
      reto: {
        ...editingChallenge,
        titulo: $<HTMLInputElement>('re-titulo').value,
        descripcion: $<HTMLTextAreaElement>('re-descripcion').value,
        puntos: Number($<HTMLInputElement>('re-puntos').value),
        inicio: $<HTMLInputElement>('re-inicio').value,
        fin: $<HTMLInputElement>('re-fin').value,
      },
    });
    $<HTMLDialogElement>('reto-dialog').close();
    showStatus(editingChallenge.id ? 'Reto actualizado.' : 'Reto publicado.', 'ok');
    await loadDynamics();
  } catch (err) {
    $('reto-error').textContent = (err as Error).message;
  } finally {
    submit.disabled = false;
  }
}

async function removeChallenge(reto: Reto, b: HTMLButtonElement) {
  if (!confirmed(b, 'Borrar')) return;
  b.disabled = true;
  try {
    await api('retoEliminar', { id: reto.id });
    showStatus(`Se borró el reto "${reto.titulo}" y los puntos que daba.`, 'ok');
    await Promise.all([loadDynamics(), loadSubmissions(true)]);
  } catch (err) {
    b.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

// ---------- Escama Esmeralda ----------

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Cuenta que parece ser de ese miembro de Escama: mismo alias que el nombre de entrenador, o el mismo nombre */
function suggestion(member: MiembroEscama): CuentaSimple | undefined {
  const linked = new Set(escama.miembros.map((m) => m.cuentaId).filter(Boolean));
  const alias = normalize(member.alias);
  const name = normalize(member.nombre);
  return escama.cuentas.find(
    (c) => !linked.has(c.id) && ((alias && normalize(c.entrenador) === alias) || (name && (normalize(c.nombre) === name || normalize(c.entrenador) === name))),
  );
}

async function loadEscama() {
  const refresh = $<HTMLButtonElement>('escama-refresh');
  refresh.disabled = true;
  try {
    escama = await api('escama');
    renderEscama();
  } catch (err) {
    $('escama-resumen').textContent = (err as Error).message;
  } finally {
    refresh.disabled = false;
  }
}

function renderEscama() {
  const onlyActive = $<HTMLInputElement>('escama-solo-activos').checked;
  const active = escama.miembros.filter((m) => m.estado === 'activo');
  const linkedActive = active.filter((m) => m.cuentaId).length;
  $('escama-resumen').textContent = `${active.length} activos en Escama Esmeralda · ${linkedActive} vinculados con su cuenta (esos son los que participan). ${
    escama.telefonos ? `⚠️ ${escama.telefonos}` : '✓ Los miembros pueden validarse solos con su teléfono.'
  }`;
  const shown = escama.miembros
    .filter((m) => !onlyActive || m.estado === 'activo')
    .sort((a, b) => Number(Boolean(a.cuentaId)) - Number(Boolean(b.cuentaId)) || a.nombre.localeCompare(b.nombre, 'es'));

  $('escama-rows').replaceChildren(
    ...shown.map((member) => {
      const tr = el('tr', 'border-t border-zinc-800');
      const who = el('td', 'px-3 py-2.5');
      who.append(el('p', 'font-bold text-zinc-100', member.nombre), el('p', 'text-xs text-zinc-400', member.alias ? `@${member.alias}` : ''));
      const state = el('td', 'px-3 py-2.5');
      state.append(el('span', `px-2 py-0.5 text-[11px] font-bold uppercase rounded-md border ${ESCAMA_STYLES[member.estado]}`, ESCAMA_LABELS[member.estado]));
      const venc = el('td', 'px-3 py-2.5 text-zinc-400 whitespace-nowrap', member.venc ? formatShortDate(member.venc) : '—');

      const link = el('td', 'px-3 py-2.5');
      const wrap = el('div', 'flex flex-wrap items-center gap-2');
      const select = el('select', 'rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-100 max-w-[14rem]');
      select.append(new Option('Sin vincular', ''));
      for (const account of escama.cuentas) select.append(new Option(account.entrenador, account.id, false, account.id === member.cuentaId));
      select.addEventListener('change', () => saveLink(member, select.value || null, select));
      wrap.append(select);
      const suggested = !member.cuentaId ? suggestion(member) : undefined;
      if (suggested) {
        wrap.append(button(`Vincular con ${suggested.entrenador}`, 'text-emerald-300 border-emerald-500/30', (b) => saveLink(member, suggested.id, b)));
      }
      link.append(wrap);
      tr.append(who, state, venc, link);
      return tr;
    }),
  );
}

async function saveLink(member: MiembroEscama, cuentaId: string | null, control: HTMLButtonElement | HTMLSelectElement) {
  control.disabled = true;
  try {
    await api('escamaVincular', { escamaId: member.id, cuentaId });
    // Una cuenta solo puede estar vinculada a un miembro: se suelta de cualquier otro
    for (const m of escama.miembros) if (cuentaId && m.cuentaId === cuentaId) m.cuentaId = null;
    member.cuentaId = cuentaId;
    renderEscama();
    const account = escama.cuentas.find((c) => c.id === cuentaId);
    showStatus(account ? `${member.nombre} quedó vinculado con la cuenta ${account.entrenador}.` : `${member.nombre} quedó sin vincular.`, 'ok');
  } catch (err) {
    control.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

export function loadDynamicsTab() {
  loadClaims();
  loadSubmissions();
  loadDynamics();
  loadEscama();
}

export function initDynamics(options: { api: Api; showStatus: ShowStatus }) {
  api = options.api;
  showStatus = options.showStatus;
  resetDynamicForm();
  $<HTMLInputElement>('wa-cargar-lunes').value = nextMonday();
  $('wa-cargar').addEventListener('submit', onLoadWildArea);
  $('logros-refresh').addEventListener('click', () => loadClaims());
  $('logros-buscar').addEventListener('input', renderClaims);
  $('mf-dia').addEventListener('change', drawFlyer);
  $('mf-descargar').addEventListener('click', async () => {
    const file = await flyerFile();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('mf-copiar').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(flyerText()).catch(() => undefined);
    showStatus('Mensaje copiado. Pégalo en el grupo junto con el flyer.', 'ok');
  });
  // En el celular se puede mandar directo a WhatsApp
  if (navigator.canShare?.({ files: [new File([''], 'probe.png', { type: 'image/png' })] })) {
    $('mf-compartir').classList.remove('hidden');
    $('mf-compartir').addEventListener('click', async () => {
      await navigator.share({ files: [await flyerFile()], text: flyerText() }).catch(() => undefined);
    });
  }
  $('dinamica-form').addEventListener('submit', onSaveDynamic);
  $('dinamica-cancel').addEventListener('click', resetDynamicForm);
  $('dinamicas-refresh').addEventListener('click', () => loadDynamics());
  $('entregas-refresh').addEventListener('click', () => loadSubmissions());
  $('reto-form').addEventListener('submit', onSaveChallenge);
  $('reto-cancel').addEventListener('click', () => $<HTMLDialogElement>('reto-dialog').close());
  $('escama-refresh').addEventListener('click', loadEscama);
  $('escama-solo-activos').addEventListener('change', renderEscama);
}
