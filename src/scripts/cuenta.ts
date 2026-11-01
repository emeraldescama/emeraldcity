/**
 * Página /cuenta: entrar, crear la cuenta y editar el perfil (Pokémon, equipo y
 * descripción). La sesión es una cookie que pone el servidor; la página no guarda nada.
 */
import { avatarUrl, TEAM_NAMES, type Equipo } from '../utils/perfil';

export interface CuentaPropia {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'bloqueada';
  avatar: number;
  shiny: boolean;
  equipo: Equipo;
  bio: string;
  entrenador: string;
  ciudad: string;
  codigo: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Llamada a /api/cuenta; los errores traen el mensaje del servidor */
export async function cuentaApi<T>(accion: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accion, ...payload }),
  });
  const data = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}.` }));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
  return data as T;
}

let cuenta: CuentaPropia | null = null;
let pokemon: [number, string][] = [];
let selected = 25;

// ---------- Acceso ----------

function setMode(mode: 'entrar' | 'crear') {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.modo-boton')) {
    button.setAttribute('aria-selected', String(button.dataset.modo === mode));
  }
  $('form-entrar').classList.toggle('hidden', mode !== 'entrar');
  $('form-crear').classList.toggle('hidden', mode !== 'crear');
}

async function submit(form: HTMLFormElement, errorId: string, action: () => Promise<{ cuenta: CuentaPropia }>) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  $(errorId).textContent = '';
  try {
    showProfile((await action()).cuenta);
  } catch (err) {
    $(errorId).textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
}

function onLogin(event: SubmitEvent) {
  event.preventDefault();
  submit(event.target as HTMLFormElement, 'entrar-error', () =>
    cuentaApi('entrar', { codigo: $<HTMLInputElement>('entrar-codigo').value, clave: $<HTMLInputElement>('entrar-clave').value }),
  );
}

function onCreate(event: SubmitEvent) {
  event.preventDefault();
  const clave = $<HTMLInputElement>('crear-clave').value;
  if (clave !== $<HTMLInputElement>('crear-clave2').value) {
    $('crear-error').textContent = 'Las dos contraseñas no son iguales.';
    return;
  }
  submit(event.target as HTMLFormElement, 'crear-error', () =>
    cuentaApi('crear', { codigo: $<HTMLInputElement>('crear-codigo').value, telefono: $<HTMLInputElement>('crear-telefono').value, clave }),
  );
}

// ---------- Perfil ----------

function renderHeader() {
  if (!cuenta) return;
  $<HTMLImageElement>('perfil-avatar').src = avatarUrl(selected, $<HTMLInputElement>('perfil-shiny').checked);
  $('perfil-nombre').textContent = cuenta.entrenador;
  $('perfil-detalle').textContent = [cuenta.ciudad, cuenta.equipo ? `Equipo ${TEAM_NAMES[cuenta.equipo]}` : ''].filter(Boolean).join(' · ');
  $('perfil-pendiente').classList.toggle('hidden', cuenta.estado !== 'pendiente');
  $('perfil-foro').classList.toggle('hidden', cuenta.estado !== 'aprobada');
}

function showProfile(account: CuentaPropia) {
  cuenta = account;
  selected = account.avatar;
  $<HTMLInputElement>('perfil-shiny').checked = account.shiny;
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="equipo"]')) radio.checked = radio.value === account.equipo;
  $<HTMLTextAreaElement>('perfil-bio').value = account.bio;
  $('bio-cuenta').textContent = String(account.bio.length);
  $('acceso').classList.add('hidden');
  $('perfil').classList.remove('hidden');
  renderHeader();
  loadPokemon();
}

function showAccess() {
  cuenta = null;
  $('perfil').classList.add('hidden');
  $('acceso').classList.remove('hidden');
  setMode('entrar');
}

async function loadPokemon() {
  if (pokemon.length) return renderPokemon();
  try {
    pokemon = await (await fetch('/data/pokemon.json')).json();
  } catch {
    pokemon = [[25, 'Pikachu']];
  }
  renderPokemon();
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Muestra hasta 60 Pokémon que coinciden con la búsqueda; el elegido siempre primero */
function renderPokemon() {
  const query = normalize($<HTMLInputElement>('buscar-pokemon').value.trim());
  const shiny = $<HTMLInputElement>('perfil-shiny').checked;
  const matches = pokemon.filter(([number, name]) => !query || normalize(name).includes(query) || String(number) === query);
  const current = pokemon.find(([number]) => number === selected);
  const shown = [...(current && !matches.slice(0, 60).includes(current) ? [current] : []), ...matches.slice(0, 60)];

  $('lista-pokemon').replaceChildren(
    ...shown.map(([number, name]) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${name} (#${number})`;
      button.setAttribute('aria-pressed', String(number === selected));
      button.className = 'pokemon-opcion w-full flex flex-col items-center rounded-xl border p-1 transition-colors';
      const img = document.createElement('img');
      img.src = avatarUrl(number, shiny);
      img.alt = '';
      img.loading = 'lazy';
      img.width = 72;
      img.height = 72;
      img.className = 'w-16 h-16 [image-rendering:pixelated]';
      const label = document.createElement('span');
      label.className = 'text-[10px] font-semibold text-zinc-300 truncate max-w-full';
      label.textContent = name;
      button.append(img, label);
      button.addEventListener('click', () => {
        selected = number;
        renderPokemon();
        renderHeader();
      });
      item.append(button);
      return item;
    }),
  );
}

async function onSaveProfile(event: SubmitEvent) {
  event.preventDefault();
  const button = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const message = $('perfil-mensaje');
  button.disabled = true;
  message.textContent = '';
  try {
    const { cuenta: updated } = await cuentaApi<{ cuenta: CuentaPropia }>('perfil', {
      avatar: selected,
      shiny: $<HTMLInputElement>('perfil-shiny').checked,
      equipo: document.querySelector<HTMLInputElement>('input[name="equipo"]:checked')?.value ?? '',
      bio: $<HTMLTextAreaElement>('perfil-bio').value,
    });
    cuenta = updated;
    renderHeader();
    message.className = 'text-sm font-semibold text-emerald-300';
    message.textContent = '¡Perfil guardado!';
  } catch (err) {
    message.className = 'text-sm font-semibold text-red-300';
    message.textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
}

async function onChangePassword(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const message = $('clave-mensaje');
  button.disabled = true;
  message.textContent = '';
  try {
    await cuentaApi('clave', { actual: $<HTMLInputElement>('clave-actual').value, nueva: $<HTMLInputElement>('clave-nueva').value });
    form.reset();
    message.className = 'text-sm font-semibold text-emerald-300';
    message.textContent = 'Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.';
  } catch (err) {
    message.className = 'text-sm font-semibold text-red-300';
    message.textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
}

export async function initCuenta() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.modo-boton')) {
    button.addEventListener('click', () => setMode(button.dataset.modo as 'entrar' | 'crear'));
  }
  $('form-entrar').addEventListener('submit', onLogin);
  $('form-crear').addEventListener('submit', onCreate);
  $('form-perfil').addEventListener('submit', onSaveProfile);
  $('form-clave').addEventListener('submit', onChangePassword);
  $('buscar-pokemon').addEventListener('input', renderPokemon);
  $('perfil-shiny').addEventListener('change', () => {
    renderPokemon();
    renderHeader();
  });
  $('perfil-bio').addEventListener('input', () => {
    $('bio-cuenta').textContent = String($<HTMLTextAreaElement>('perfil-bio').value.length);
  });
  $('salir').addEventListener('click', async () => {
    await cuentaApi('salir').catch(() => undefined);
    showAccess();
  });

  try {
    const { cuenta: account } = await cuentaApi<{ cuenta: CuentaPropia | null }>('yo');
    if (account) showProfile(account);
    else showAccess();
    // "/cuenta#crear" abre directo el formulario para crear la cuenta
    if (!account && location.hash === '#crear') setMode('crear');
  } catch {
    showAccess();
  } finally {
    $('cuenta-cargando').classList.add('hidden');
  }
}
