/**
 * Pestaña "Cuentas y foro" del panel: aprobar, bloquear o borrar las cuentas que los
 * miembros crean en /cuenta, y reiniciar su contraseña cuando la olvidan.
 */
import { avatarUrl, TEAM_NAMES, type Equipo } from '../utils/perfil';

interface Cuenta {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'bloqueada';
  avatar: number;
  shiny: boolean;
  equipo: Equipo;
  entrenador: string;
  nombre: string;
  ciudad: string;
  codigo: string;
  telefono: string;
  creada: string;
  mensajes: number;
}

type Api = <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
type ShowStatus = (message: string, kind?: 'ok' | 'error' | 'info') => void;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let api: Api;
let showStatus: ShowStatus;
let accounts: Cuenta[] = [];

const STATE_LABELS = { pendiente: 'Pendiente', aprobada: 'Aprobada', bloqueada: 'Bloqueada' };
const STATE_STYLES = {
  pendiente: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  aprobada: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  bloqueada: 'text-red-300 border-red-500/40 bg-red-500/10',
};
const buttonClass = 'px-2.5 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap disabled:opacity-40';

function button(label: string, className: string, onClick: (b: HTMLButtonElement) => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `${buttonClass} ${className}`;
  b.textContent = label;
  b.addEventListener('click', () => onClick(b));
  return b;
}

function render() {
  const pending = accounts.filter((a) => a.estado === 'pendiente').length;
  const count = $('account-count');
  count.textContent = String(pending);
  count.classList.toggle('hidden', pending === 0);
  $('account-empty').classList.toggle('hidden', accounts.length > 0);

  $('account-list').replaceChildren(
    ...accounts.map((account) => {
      const item = document.createElement('li');
      item.className = 'glass-panel rounded-2xl p-4 flex gap-4';

      const img = document.createElement('img');
      img.src = avatarUrl(account.avatar, account.shiny);
      img.alt = '';
      img.className = 'w-16 h-16 flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 [image-rendering:pixelated]';

      const info = document.createElement('div');
      info.className = 'min-w-0 flex-grow space-y-1';
      const title = document.createElement('p');
      title.className = 'flex flex-wrap items-center gap-2';
      const name = document.createElement('strong');
      name.className = 'text-zinc-100';
      name.textContent = account.entrenador;
      const state = document.createElement('span');
      state.className = `px-2 py-0.5 text-[11px] font-bold uppercase rounded-md border ${STATE_STYLES[account.estado]}`;
      state.textContent = STATE_LABELS[account.estado];
      title.append(name, state);
      const details = document.createElement('p');
      details.className = 'text-xs text-zinc-400 break-words';
      details.textContent = [
        account.nombre,
        account.ciudad,
        account.codigo.replace(/(\d{4})(?=\d)/g, '$1 '),
        account.telefono ? `+${account.telefono}` : 'sin teléfono',
        account.equipo ? TEAM_NAMES[account.equipo] : '',
        `${account.mensajes} mensaje${account.mensajes === 1 ? '' : 's'}`,
        `creada el ${new Date(account.creada).toLocaleDateString('es-VE')}`,
      ]
        .filter(Boolean)
        .join(' · ');

      const actions = document.createElement('div');
      actions.className = 'flex flex-wrap gap-2 pt-2';
      if (account.estado !== 'aprobada') {
        actions.append(button('Aprobar', 'text-zinc-950 bg-emerald-400 border-emerald-400', (b) => setState(account, 'aprobada', b)));
      }
      if (account.estado !== 'bloqueada') {
        actions.append(button('Bloquear', 'text-red-300 border-red-500/30', (b) => setState(account, 'bloqueada', b)));
      }
      actions.append(
        button('Reiniciar contraseña', 'text-zinc-300 border-zinc-700', (b) => resetPassword(account, b)),
        button('Borrar cuenta', 'text-red-300 border-red-500/30', (b) => removeAccount(account, b)),
      );

      info.append(title, details, actions);
      item.append(img, info);
      return item;
    }),
  );
}

export async function loadAccounts(quiet = false) {
  const refresh = $<HTMLButtonElement>('account-refresh');
  refresh.disabled = true;
  try {
    accounts = (await api<{ cuentas: Cuenta[] }>('cuentas')).cuentas;
    render();
  } catch (err) {
    if (!quiet) showStatus((err as Error).message, 'error');
  } finally {
    refresh.disabled = false;
  }
}

function replace(updated: Cuenta) {
  accounts = accounts.map((a) => (a.id === updated.id ? { ...a, ...updated } : a));
  render();
}

async function setState(account: Cuenta, estado: Cuenta['estado'], b: HTMLButtonElement) {
  b.disabled = true;
  try {
    const { cuenta } = await api<{ cuenta: Cuenta }>('cuentaEstado', { id: account.id, estado });
    replace(cuenta);
    showStatus(estado === 'aprobada' ? `${account.entrenador} ya puede usar el foro.` : `La cuenta de ${account.entrenador} quedó bloqueada.`, 'ok');
  } catch (err) {
    b.disabled = false;
    showStatus((err as Error).message, 'error');
  }
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

async function resetPassword(account: Cuenta, b: HTMLButtonElement) {
  if (!confirmed(b, 'Reiniciar contraseña')) return;
  b.disabled = true;
  try {
    const { clave } = await api<{ clave: string }>('cuentaClave', { id: account.id });
    const message = $('account-password');
    message.textContent = `Contraseña temporal de ${account.entrenador}: ${clave} — envíasela por WhatsApp; puede cambiarla en su perfil.`;
    message.classList.remove('hidden');
    message.scrollIntoView({ block: 'center' });
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    b.disabled = false;
    b.dataset.confirm = 'false';
    b.textContent = 'Reiniciar contraseña';
  }
}

async function removeAccount(account: Cuenta, b: HTMLButtonElement) {
  if (!confirmed(b, 'Borrar cuenta')) return;
  b.disabled = true;
  try {
    await api('cuentaEliminar', { id: account.id });
    accounts = accounts.filter((a) => a.id !== account.id);
    render();
    showStatus(`Se borró la cuenta de ${account.entrenador}. Sigue en la lista de miembros; sus mensajes quedan sin autor.`, 'ok');
  } catch (err) {
    b.disabled = false;
    showStatus((err as Error).message, 'error');
  }
}

export function initAccounts(options: { api: Api; showStatus: ShowStatus }) {
  api = options.api;
  showStatus = options.showStatus;
  $('account-refresh').addEventListener('click', () => loadAccounts());
}
