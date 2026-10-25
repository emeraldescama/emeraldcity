/**
 * Pestañas "Miembros" y "Bienvenidas" del panel: la hoja de miembros de la comunidad
 * (ver, buscar, ocultar de Haz amigos, eliminar, descargar en Excel e importar la hoja
 * anterior) y el flyer de bienvenida de los registros nuevos.
 */
import { readMembersFromFile, type ImportPreview } from './importar';
import { drawWelcomeFlyer, welcomeText } from './welcomeFlyer';
import { createXlsx } from './xlsx';

export interface Miembro {
  id: string;
  fecha: string;
  entrenador: string;
  nombre: string;
  ciudad: string;
  codigo: string;
  campfire: boolean | null;
  campfireNombre: string;
  edad: number | null;
  telefono: string;
  contacto: boolean;
  mostrar: boolean;
  bienvenida: string;
  origen: 'web' | 'importado';
  tieneCaptura: boolean;
}

type Api = <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
type ShowStatus = (message: string, kind?: 'ok' | 'error' | 'info') => void;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let api: Api;
let showStatus: ShowStatus;
let members: Miembro[] = [];
let loaded = false;
let pendingImport: ImportPreview | null = null;
let selectedWelcome: Miembro | null = null;
const confirmTimers = new Map<HTMLButtonElement, number>();

const formatCode = (code: string) => code.replace(/(\d{4})(?=\d)/g, '$1 ');
const formatDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('es-VE') : '');
const pendingWelcomes = () => members.filter((m) => m.origen === 'web' && !m.bienvenida);

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Primer toque pide confirmación; devuelve true en el segundo */
function confirmed(button: HTMLButtonElement, label: string): boolean {
  if (button.dataset.confirm === 'true') {
    clearTimeout(confirmTimers.get(button));
    return true;
  }
  button.dataset.confirm = 'true';
  button.textContent = '¿Seguro?';
  confirmTimers.set(
    button,
    window.setTimeout(() => {
      button.dataset.confirm = 'false';
      button.textContent = label;
    }, 4000),
  );
  return false;
}

// ---------- Miembros ----------

/** Celda de texto; lo largo se corta con "…" y se ve completo al pasar el mouse */
function cell(text: string, className = '') {
  const td = document.createElement('td');
  td.className = `px-3 py-2.5 whitespace-nowrap max-w-[12rem] truncate ${className}`;
  td.textContent = text;
  td.title = text;
  return td;
}

function switchButton(on: boolean, labels: [string, string], title: string, onClick: (button: HTMLButtonElement) => void, disabled = false) {
  const td = document.createElement('td');
  td.className = 'px-3 py-2.5';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `px-2.5 py-1 text-xs font-bold rounded-lg border whitespace-nowrap disabled:opacity-40 ${on ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-zinc-400 border-zinc-700'}`;
  button.textContent = on ? labels[0] : labels[1];
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', () => onClick(button));
  td.append(button);
  return td;
}

const formatPhone = (phone: string) => (phone ? `+${phone}` : '—');

function renderMembers() {
  const query = $<HTMLInputElement>('member-search').value.trim().toLowerCase();
  const shown = members.filter((m) => !query || `${m.entrenador} ${m.nombre} ${m.ciudad} ${m.codigo} ${m.telefono}`.toLowerCase().includes(query));
  $('member-count').textContent = `${members.length} miembro${members.length === 1 ? '' : 's'}`;
  $('member-empty').classList.toggle('hidden', members.length > 0);
  $('member-table-wrap').classList.toggle('hidden', members.length === 0);

  const body = $('member-rows');
  body.replaceChildren();
  for (const member of shown) {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-zinc-800';

    // Los interruptores van al principio y "Eliminar" queda fijo a la derecha: se ven sin desplazar la tabla
    const actions = document.createElement('td');
    actions.className = 'px-3 py-2.5 sticky right-0 bg-zinc-950 border-l border-zinc-800';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'px-2.5 py-1 text-xs font-bold text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/10 whitespace-nowrap';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => removeMember(member, remove));
    actions.append(remove);

    tr.append(
      cell(member.entrenador, 'font-bold text-zinc-100'),
      cell(member.codigo ? formatCode(member.codigo) : '—', 'font-mono text-amber-400'),
      switchButton(member.mostrar, ['Visible', 'Oculto'], member.mostrar ? 'Ocultar de Haz amigos' : 'Mostrar en Haz amigos', (b) =>
        toggleField(member, 'mostrar', b),
      ),
      switchButton(
        member.contacto,
        ['Acepta', 'No'],
        member.telefono ? 'Permitir o no los mensajes de intercambio con suerte' : 'No tiene teléfono registrado',
        (b) => toggleField(member, 'contacto', b),
        !member.telefono,
      ),
      cell(member.ciudad),
      cell(member.nombre),
      cell(formatPhone(member.telefono), 'text-zinc-400'),
      cell(member.campfire ? member.campfireNombre || 'Sí' : member.campfire === false ? 'No' : '—'),
      cell(member.edad ? String(member.edad) : '—'),
      cell(formatDate(member.fecha), 'text-zinc-400'),
      cell(
        member.bienvenida ? (member.bienvenida.includes('T') ? formatDate(member.bienvenida) : member.bienvenida) : 'Pendiente',
        member.bienvenida ? 'text-zinc-400' : 'text-amber-400 font-bold',
      ),
      actions,
    );
    body.append(tr);
  }
}

export async function loadMembers(quiet = false) {
  const button = $<HTMLButtonElement>('member-refresh');
  button.disabled = true;
  try {
    members = (await api<{ miembros: Miembro[] }>('miembros')).miembros;
    loaded = true;
    if (selectedWelcome && !pendingWelcomes().some((w) => w.id === selectedWelcome!.id)) clearWelcome();
    renderMembers();
    renderWelcomes();
  } catch (err) {
    if (!quiet) showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
  }
}

const TOGGLES = {
  mostrar: { action: 'miembroMostrar', on: 'ya aparece en Haz amigos', off: 'ya no aparece en Haz amigos' },
  contacto: { action: 'miembroContacto', on: 'ya recibe mensajes de intercambio', off: 'ya no recibe mensajes de intercambio' },
} as const;

async function toggleField(member: Miembro, field: keyof typeof TOGGLES, button: HTMLButtonElement) {
  const { action, on, off } = TOGGLES[field];
  button.disabled = true;
  try {
    const { miembro } = await api<{ miembro: Miembro }>(action, { id: member.id, [field]: !member[field] });
    members = members.map((m) => (m.id === miembro.id ? miembro : m));
    renderMembers();
    showStatus(`${miembro.entrenador} ${miembro[field] ? on : off}.`, 'ok');
  } catch (err) {
    button.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

async function removeMember(member: Miembro, button: HTMLButtonElement) {
  if (!confirmed(button, 'Eliminar')) return;
  button.disabled = true;
  try {
    await api('miembroEliminar', { id: member.id });
    members = members.filter((m) => m.id !== member.id);
    if (selectedWelcome?.id === member.id) clearWelcome();
    renderMembers();
    renderWelcomes();
    showStatus(`${member.entrenador} fue eliminado de la lista de miembros.`, 'ok');
  } catch (err) {
    button.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

async function allowImportedContact(button: HTMLButtonElement) {
  if (!confirmed(button, 'Permitir WhatsApp a importados')) return;
  button.disabled = true;
  try {
    const { cambiados } = await api<{ cambiados: number }>('contactoImportados');
    await loadMembers();
    showStatus(cambiados ? `Listo: ${cambiados} miembro${cambiados === 1 ? '' : 's'} importado${cambiados === 1 ? '' : 's'} ya recibe${cambiados === 1 ? '' : 'n'} mensajes de intercambio.` : 'No hay miembros importados con teléfono pendientes de permiso.', 'ok');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
    button.dataset.confirm = 'false';
    button.textContent = 'Permitir WhatsApp a importados';
  }
}

function downloadExcel() {
  const headers = ['Fecha', 'Nombre de entrenador', 'Nombre y apellido', 'Ciudad o país', 'Código de amistad', 'WhatsApp', 'Acepta mensajes de intercambio', '¿Tiene Campfire?', 'Nombre en Campfire', 'Edad', 'Aparece en Haz amigos', 'Bienvenida', 'Origen'];
  const rows = members.map((m) => [
    formatDate(m.fecha),
    m.entrenador,
    m.nombre,
    m.ciudad,
    m.codigo ? formatCode(m.codigo) : '',
    m.telefono ? `+${m.telefono}` : '',
    m.contacto ? 'Sí' : 'No',
    m.campfire === null ? '' : m.campfire ? 'Sí' : 'No',
    m.campfireNombre,
    m.edad,
    m.mostrar ? 'Sí' : 'No',
    m.bienvenida ? (m.bienvenida.includes('T') ? formatDate(m.bienvenida) : m.bienvenida) : 'Pendiente',
    m.origen === 'web' ? 'Formulario web' : 'Hoja anterior',
  ]);
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(createXlsx('Miembros', headers, rows), `miembros-emerald-city-${today}.xlsx`);
}

// ---------- Importar la hoja anterior ----------

async function onImportFile() {
  const input = $<HTMLInputElement>('member-import-file');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    pendingImport = await readMembersFromFile(file);
    const { members: found, columns, withoutCode } = pendingImport;
    $('import-summary').textContent = `Encontramos ${found.length} miembro${found.length === 1 ? '' : 's'}${withoutCode ? ` (${withoutCode} sin código de amistad, no saldrán en Haz amigos)` : ''}. Los que ya estén registrados no se duplican.`;
    const list = $('import-columns');
    list.replaceChildren();
    for (const column of columns) {
      const li = document.createElement('li');
      li.className = column.header ? 'text-zinc-300' : 'text-zinc-500';
      li.textContent = `${column.label}: ${column.header ? `"${column.header}"` : 'no encontrada'}`;
      list.append(li);
    }
    $('import-preview').classList.remove('hidden');
  } catch (err) {
    pendingImport = null;
    showStatus((err as Error).message || 'No se pudo leer el archivo. Usa el Excel (.xlsx) o el CSV que descarga Google.', 'error');
  }
}

async function confirmImport() {
  if (!pendingImport) return;
  const button = $<HTMLButtonElement>('import-confirm');
  button.disabled = true;
  showStatus('Importando miembros…');
  try {
    const { added, updated, duplicated } = await api<{ added: number; updated: number; duplicated: number }>('importar', { miembros: pendingImport.members });
    cancelImport();
    await loadMembers();
    const parts = [`se agregaron ${added}`];
    if (updated) parts.push(`se actualizaron ${updated}`);
    if (duplicated) parts.push(`${duplicated} se omitieron (repetidos o ya registrados en la web)`);
    showStatus(`Listo: ${parts.join(', ')}.`, 'ok');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
  }
}

function cancelImport() {
  pendingImport = null;
  $('import-preview').classList.add('hidden');
}

// ---------- Bienvenidas ----------

function renderWelcomes() {
  const welcomes = pendingWelcomes();
  const list = $('welcome-list');
  list.replaceChildren();
  $('welcome-empty').classList.toggle('hidden', welcomes.length > 0);
  const count = $('welcome-count');
  count.textContent = String(welcomes.length);
  count.classList.toggle('hidden', welcomes.length === 0);

  for (const welcome of welcomes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const active = selectedWelcome?.id === welcome.id;
    button.className = `w-full text-left glass-panel rounded-2xl p-4 border transition-colors ${active ? 'border-emerald-400' : 'border-transparent hover:border-emerald-500/40'}`;
    const name = document.createElement('p');
    name.className = 'font-bold text-zinc-100';
    name.textContent = welcome.entrenador;
    const detail = document.createElement('p');
    detail.className = 'text-xs text-zinc-400';
    detail.textContent = `${welcome.nombre} · ${welcome.ciudad} · ${formatDate(welcome.fecha)}`;
    button.append(name, detail);
    button.addEventListener('click', () => selectWelcome(welcome));
    item.append(button);
    list.append(item);
  }
}

function clearWelcome() {
  selectedWelcome = null;
  $('welcome-preview').classList.add('hidden');
  $('welcome-placeholder').classList.remove('hidden');
}

async function selectWelcome(welcome: Miembro) {
  selectedWelcome = welcome;
  renderWelcomes();
  showStatus(`Preparando la bienvenida de ${welcome.entrenador}…`);
  try {
    const { tipo, base64 } = await api<{ tipo: string; base64: string }>('captura', { id: welcome.id });
    if (selectedWelcome?.id !== welcome.id) return;
    await drawWelcomeFlyer($<HTMLCanvasElement>('welcome-canvas'), welcome, `data:${tipo};base64,${base64}`);
    $('welcome-placeholder').classList.add('hidden');
    $('welcome-preview').classList.remove('hidden');
    $('status').classList.add('hidden');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  }
}

function welcomeFile(): Promise<File> {
  return new Promise((resolve, reject) =>
    $<HTMLCanvasElement>('welcome-canvas').toBlob((blob) => {
      if (!blob || !selectedWelcome) return reject(new Error('No se pudo crear la imagen.'));
      resolve(new File([blob], `bienvenida-${selectedWelcome.entrenador}.png`, { type: 'image/png' }));
    }, 'image/png'),
  );
}

async function onWelcomeShare() {
  if (!selectedWelcome) return;
  try {
    await navigator.share({ files: [await welcomeFile()], text: welcomeText(selectedWelcome) });
  } catch (err) {
    if ((err as Error).name !== 'AbortError') showStatus('No se pudo abrir el menú de compartir. Descarga la imagen y envíala manualmente.', 'error');
  }
}

async function onWelcomeCopy() {
  if (!selectedWelcome) return;
  try {
    await navigator.clipboard.writeText(welcomeText(selectedWelcome));
    showStatus('Mensaje copiado. Pégalo en el grupo junto con la imagen.', 'ok');
  } catch {
    showStatus('No se pudo copiar automáticamente.', 'error');
  }
}

async function onWelcomeDone() {
  if (!selectedWelcome) return;
  const welcome = selectedWelcome;
  const button = $<HTMLButtonElement>('welcome-done');
  button.disabled = true;
  try {
    const { miembro } = await api<{ miembro: Miembro }>('marcarBienvenida', { id: welcome.id });
    members = members.map((m) => (m.id === miembro.id ? miembro : m));
    clearWelcome();
    renderWelcomes();
    renderMembers();
    showStatus(`Bienvenida de ${welcome.entrenador} marcada como enviada.`, 'ok');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
  }
}

// ---------- Inicio ----------

/** Al abrir una de estas pestañas por primera vez se carga la lista */
export function onShowTab() {
  if (!loaded) loadMembers();
}

export function initMembers(options: { api: Api; showStatus: ShowStatus; canShareFiles: boolean }) {
  api = options.api;
  showStatus = options.showStatus;

  $('member-refresh').addEventListener('click', () => loadMembers());
  $('member-search').addEventListener('input', renderMembers);
  $('member-excel').addEventListener('click', downloadExcel);
  const allowButton = $<HTMLButtonElement>('member-allow-contact');
  allowButton.addEventListener('click', () => allowImportedContact(allowButton));
  $('member-import-file').addEventListener('change', onImportFile);
  $('import-confirm').addEventListener('click', confirmImport);
  $('import-cancel').addEventListener('click', cancelImport);

  $('welcome-refresh').addEventListener('click', () => loadMembers());
  $('welcome-download').addEventListener('click', async () => {
    const file = await welcomeFile();
    downloadBlob(file, file.name);
  });
  $('welcome-copy').addEventListener('click', onWelcomeCopy);
  $('welcome-done').addEventListener('click', onWelcomeDone);
  if (options.canShareFiles) {
    $('welcome-share').classList.remove('hidden');
    $('welcome-share').addEventListener('click', onWelcomeShare);
  }
}
