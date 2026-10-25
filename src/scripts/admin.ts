/**
 * Lógica del panel de administración (/admin): acceso con PIN, carga de eventos
 * con su flyer y generación del flyer semanal. Miembros y bienvenidas: adminMiembros.ts.
 */
import {
  addDays,
  caracasToday,
  formatLongDate,
  formatTime,
  flyerWeek,
  formatWeekRange,
  sortByStart,
  type Evento,
} from '../utils/eventos';
import { drawWeeklyFlyer, weeklyText } from './weeklyFlyer';
import { compressImage } from './images';
import { initMembers, loadMembers, onShowTab } from './adminMiembros';

const PIN_KEY = 'emerald-admin-pin';

type EventInput = Omit<Evento, 'id' | 'flyer'>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let pin = '';
let events: Evento[] = [];
let editingId: string | null = null;
let pendingFlyer: { base64: string; dataUrl: string } | null = null;
let weekStart = flyerWeek(caracasToday()).start;
// Flyers subidos en esta sesión: la web tarda 1–2 min en publicarlos, así que el flyer semanal usa la copia local
const localFlyers = new Map<string, string>();

function readStoredPin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? '';
  } catch {
    return '';
  }
}

function storePin(value: string | null) {
  try {
    if (value) sessionStorage.setItem(PIN_KEY, value);
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    // Sin almacenamiento: el PIN se pedirá de nuevo al recargar
  }
}

async function api<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, action, ...payload }),
  });
  const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
  if (res.status === 401) {
    logout('El PIN ya no es válido. Vuelve a ingresarlo.');
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
  return data as T;
}

function showStatus(message: string, kind: 'ok' | 'error' | 'info' = 'info') {
  const el = $('status');
  el.textContent = message;
  el.className = `mb-6 px-4 py-3 rounded-xl text-sm font-semibold border ${
    kind === 'ok'
      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
      : kind === 'error'
        ? 'bg-red-500/10 border-red-500/40 text-red-300'
        : 'bg-zinc-900/90 border-zinc-700 text-zinc-300'
  }`;
}

function flyerUrl(evento: Evento): string {
  return localFlyers.get(evento.id) ?? evento.flyer;
}

// ---------- Formulario de eventos ----------

function resetForm() {
  editingId = null;
  pendingFlyer = null;
  ($('event-form') as HTMLFormElement).reset();
  $<HTMLInputElement>('ev-flyer').value = '';
  $('flyer-preview').classList.add('hidden');
  $('flyer-placeholder').classList.remove('hidden');
  $('form-title').textContent = 'Nuevo evento';
  $('save-button').textContent = 'Publicar evento';
  $('cancel-edit').classList.add('hidden');
}

function startEdit(evento: Evento) {
  editingId = evento.id;
  pendingFlyer = null;
  $<HTMLInputElement>('ev-title').value = evento.title;
  $<HTMLSelectElement>('ev-type').value = evento.type;
  $<HTMLInputElement>('ev-date').value = evento.date;
  $<HTMLInputElement>('ev-time').value = evento.time;
  $<HTMLInputElement>('ev-location').value = evento.location;
  $<HTMLTextAreaElement>('ev-description').value = evento.description;
  const preview = $<HTMLImageElement>('flyer-preview');
  preview.src = flyerUrl(evento);
  preview.classList.remove('hidden');
  $('flyer-placeholder').classList.add('hidden');
  $('form-title').textContent = 'Editar evento';
  $('save-button').textContent = 'Guardar cambios';
  $('cancel-edit').classList.remove('hidden');
  $('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function readForm(): EventInput {
  return {
    title: $<HTMLInputElement>('ev-title').value,
    type: $<HTMLSelectElement>('ev-type').value as Evento['type'],
    date: $<HTMLInputElement>('ev-date').value,
    time: $<HTMLInputElement>('ev-time').value,
    location: $<HTMLInputElement>('ev-location').value,
    description: $<HTMLTextAreaElement>('ev-description').value,
  };
}

async function onFlyerChosen() {
  const file = $<HTMLInputElement>('ev-flyer').files?.[0];
  if (!file) return;
  try {
    pendingFlyer = await compressImage(file);
    const preview = $<HTMLImageElement>('flyer-preview');
    preview.src = pendingFlyer.dataUrl;
    preview.classList.remove('hidden');
    $('flyer-placeholder').classList.add('hidden');
  } catch (err) {
    pendingFlyer = null;
    showStatus((err as Error).message || 'No se pudo leer la imagen.', 'error');
  }
}

async function onSave(event: SubmitEvent) {
  event.preventDefault();
  if (!editingId && !pendingFlyer) {
    showStatus('Elige la imagen del flyer antes de publicar.', 'error');
    return;
  }
  const button = $<HTMLButtonElement>('save-button');
  button.disabled = true;
  showStatus(editingId ? 'Guardando cambios…' : 'Publicando evento…');
  try {
    const { event: saved } = await api<{ event: Evento }>('save', {
      id: editingId,
      event: readForm(),
      flyer: pendingFlyer?.base64,
    });
    if (pendingFlyer) localFlyers.set(saved.id, pendingFlyer.dataUrl);
    events = sortByStart([...events.filter((e) => e.id !== saved.id), saved]);
    renderEventList();
    renderFlyer();
    resetForm();
    showStatus(`Listo: "${saved.title}" se verá en la web en 1–2 minutos.`, 'ok');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
  }
}

// ---------- Lista de eventos ----------

function renderEventList() {
  const list = $('event-list');
  list.replaceChildren();
  $('event-list-empty').classList.toggle('hidden', events.length > 0);
  const today = caracasToday();

  for (const evento of events) {
    const item = document.createElement('li');
    item.className = `glass-panel rounded-2xl p-3 flex items-center gap-4 ${evento.date < today ? 'opacity-50' : ''}`;

    const img = document.createElement('img');
    img.src = flyerUrl(evento);
    img.alt = '';
    img.className = 'w-16 h-20 rounded-lg object-cover bg-zinc-900 flex-shrink-0';

    const info = document.createElement('div');
    info.className = 'min-w-0 flex-1';
    const when = document.createElement('p');
    when.className = 'text-xs font-bold uppercase tracking-wider text-amber-400';
    when.textContent = `${formatLongDate(evento.date)} · ${formatTime(evento.time)}${evento.date < today ? ' · Pasado' : ''}`;
    const title = document.createElement('p');
    title.className = 'font-bold text-zinc-100 truncate';
    title.textContent = evento.title;
    const place = document.createElement('p');
    place.className = 'text-xs text-zinc-400 truncate';
    place.textContent = `${evento.id.startsWith('auto-') ? 'Automático · ' : ''}${evento.type} · ${evento.location}`;
    info.append(when, title, place);

    const actions = document.createElement('div');
    actions.className = 'flex flex-col sm:flex-row gap-2 flex-shrink-0';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-zinc-800';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => startEdit(evento));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/10';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => onDelete(evento, remove));
    actions.append(edit, remove);

    item.append(img, info, actions);
    list.append(item);
  }
}

let confirmTimer: number | undefined;

async function onDelete(evento: Evento, button: HTMLButtonElement) {
  // Primer toque pide confirmación, el segundo elimina
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = '¿Seguro?';
    clearTimeout(confirmTimer);
    confirmTimer = window.setTimeout(() => {
      button.dataset.confirm = 'false';
      button.textContent = 'Eliminar';
    }, 4000);
    return;
  }
  clearTimeout(confirmTimer);
  button.disabled = true;
  showStatus(`Eliminando "${evento.title}"…`);
  try {
    await api('delete', { id: evento.id });
    events = events.filter((e) => e.id !== evento.id);
    if (editingId === evento.id) resetForm();
    renderEventList();
    renderFlyer();
    showStatus(`"${evento.title}" se quitará de la web en 1–2 minutos.`, 'ok');
  } catch (err) {
    button.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

async function loadEvents() {
  const button = $<HTMLButtonElement>('refresh');
  button.disabled = true;
  try {
    const data = await api<{ events: Evento[] }>('list');
    events = sortByStart(data.events);
    $('event-list-empty').textContent = 'Todavía no hay eventos. Publica el primero con el formulario.';
    renderEventList();
    renderFlyer();
  } catch (err) {
    // Se muestra dentro de la pestaña Eventos para no tapar el resto del panel
    const empty = $('event-list-empty');
    empty.textContent = (err as Error).message;
    empty.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}

// ---------- Flyer semanal ----------

let flyerRender = 0;

function weekEvents(): Evento[] {
  const end = addDays(weekStart, 6);
  return events.filter((e) => e.date >= weekStart && e.date <= end);
}

async function renderFlyer() {
  const ticket = ++flyerRender;
  const end = addDays(weekStart, 6);
  $('week-label').textContent = formatWeekRange(weekStart, end);
  const canvas = document.createElement('canvas');
  await drawWeeklyFlyer(canvas, weekEvents(), weekStart, end, {
    logoUrl: '/images/branding/logo-emerald-city.png',
    flyerUrl,
  });
  // Solo se muestra el último dibujo si el usuario cambió de semana mientras tanto
  if (ticket !== flyerRender) return;
  const target = $<HTMLCanvasElement>('flyer-canvas');
  target.width = canvas.width;
  target.height = canvas.height;
  target.getContext('2d')!.drawImage(canvas, 0, 0);
}

function flyerFileName(): string {
  return `eventos-emerald-city-${weekStart}.png`;
}

function flyerBlob(): Promise<Blob> {
  return new Promise((resolve, reject) =>
    $<HTMLCanvasElement>('flyer-canvas').toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'),
  );
}

async function onDownload() {
  const url = URL.createObjectURL(await flyerBlob());
  const link = document.createElement('a');
  link.href = url;
  link.download = flyerFileName();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onShare() {
  const file = new File([await flyerBlob()], flyerFileName(), { type: 'image/png' });
  const text = weeklyText(weekEvents(), weekStart, addDays(weekStart, 6), location.origin);
  try {
    await navigator.share({ files: [file], text });
  } catch (err) {
    if ((err as Error).name !== 'AbortError') showStatus('No se pudo abrir el menú de compartir. Descarga la imagen y envíala manualmente.', 'error');
  }
}

async function onCopyText() {
  const text = weeklyText(weekEvents(), weekStart, addDays(weekStart, 6), location.origin);
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Texto copiado. Pégalo en el grupo de WhatsApp junto con la imagen.', 'ok');
  } catch {
    showStatus('No se pudo copiar automáticamente.', 'error');
  }
}

function setWeek(start: string) {
  weekStart = start;
  renderFlyer();
}

// ---------- Navegación y acceso ----------

type Tab = 'eventos' | 'flyer' | 'miembros' | 'bienvenidas';

function selectTab(tab: Tab) {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.tab-button')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  }
  $('tab-eventos').classList.toggle('hidden', tab !== 'eventos');
  $('tab-flyer').classList.toggle('hidden', tab !== 'flyer');
  $('tab-miembros').classList.toggle('hidden', tab !== 'miembros');
  $('tab-bienvenidas').classList.toggle('hidden', tab !== 'bienvenidas');
  if (tab === 'flyer') renderFlyer();
  if (tab === 'miembros' || tab === 'bienvenidas') onShowTab();
}

function showPanel() {
  $('pin-screen').classList.add('hidden');
  $('admin-panel').classList.remove('hidden');
  selectTab('eventos');
  loadEvents();
  // Solo para el contador de bienvenidas pendientes; los errores se muestran al abrir la pestaña
  loadMembers(true);
}

function logout(message = '') {
  pin = '';
  storePin(null);
  $('admin-panel').classList.add('hidden');
  $('pin-screen').classList.remove('hidden');
  $('pin-error').textContent = message;
  $<HTMLInputElement>('pin-input').value = '';
}

async function onLogin(event: SubmitEvent) {
  event.preventDefault();
  const button = $<HTMLButtonElement>('pin-submit');
  button.disabled = true;
  $('pin-error').textContent = '';
  pin = $<HTMLInputElement>('pin-input').value.trim();
  try {
    await api('login');
    storePin(pin);
    showPanel();
  } catch (err) {
    $('pin-error').textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
}

export function initAdmin() {
  $('pin-form').addEventListener('submit', onLogin);
  $('logout').addEventListener('click', () => logout());
  $('event-form').addEventListener('submit', onSave);
  $('ev-flyer').addEventListener('change', onFlyerChosen);
  $('cancel-edit').addEventListener('click', resetForm);
  $('refresh').addEventListener('click', loadEvents);
  for (const button of document.querySelectorAll<HTMLButtonElement>('.tab-button')) {
    button.addEventListener('click', () => selectTab(button.dataset.tab as Tab));
  }

  $('week-prev').addEventListener('click', () => setWeek(addDays(weekStart, -7)));
  $('week-next').addEventListener('click', () => setWeek(addDays(weekStart, 7)));
  $('week-today').addEventListener('click', () => setWeek(flyerWeek(caracasToday()).start));
  $('flyer-download').addEventListener('click', onDownload);
  $('flyer-copy').addEventListener('click', onCopyText);

  const probe = new File([''], 'probe.png', { type: 'image/png' });
  const canShareFiles = Boolean(navigator.canShare?.({ files: [probe] }));
  if (canShareFiles) {
    $('flyer-share').classList.remove('hidden');
    $('flyer-share').addEventListener('click', onShare);
  }
  initMembers({ api, showStatus, canShareFiles });

  const stored = readStoredPin();
  if (stored) {
    pin = stored;
    showPanel();
  }
}
