/**
 * Formulario de registro de /unirse: avanza paso a paso, valida cada paso y
 * envía el registro a /api/registro, que lo guarda en la hoja de Google.
 */
import { compressImage } from './images';
import { BAZAR_WHATSAPP_PHONE } from '../utils/whatsapp';

const MIN_AGE = 16;
const TOTAL_STEPS = 4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let step = 1;
let screenshot: string | null = null;

function formatFriendCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function showError(message: string) {
  const el = $('registro-error');
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

function campfireAnswer(): string | null {
  return document.querySelector<HTMLInputElement>('input[name="campfire"]:checked')?.value ?? null;
}

function ageTooLow(): boolean {
  const value = $<HTMLInputElement>('edad').value;
  return value !== '' && Number(value) < MIN_AGE;
}

function render() {
  for (const fieldset of document.querySelectorAll<HTMLElement>('.paso')) {
    fieldset.classList.toggle('hidden', Number(fieldset.dataset.paso) !== step);
  }
  for (const item of document.querySelectorAll<HTMLElement>('.progreso-paso')) {
    const n = Number(item.dataset.paso);
    item.dataset.estado = n < step ? 'hecho' : n === step ? 'actual' : 'pendiente';
  }
  $('atras').classList.toggle('invisible', step === 1);
  const next = $<HTMLButtonElement>('continuar');
  next.textContent = step === TOTAL_STEPS ? 'Enviar mi registro' : 'Continuar';
  next.disabled = step === TOTAL_STEPS && ageTooLow();
  showError('');
}

/** Devuelve el primer problema del paso actual, o null si está completo */
function stepProblem(): { message: string; field?: HTMLElement } | null {
  const fieldset = document.querySelector<HTMLElement>(`.paso[data-paso="${step}"]`)!;
  for (const input of fieldset.querySelectorAll<HTMLInputElement>('input[required]:not([type="file"]):not([type="radio"])')) {
    if (!input.value.trim()) {
      const label = fieldset.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ?? 'este campo';
      return { message: `Completa: ${label}.`, field: input };
    }
  }

  if (step === 2) {
    if (!screenshot) return { message: 'Sube la captura de tu perfil.', field: $('captura-zona') };
    if ($<HTMLInputElement>('codigo').value.replace(/\D/g, '').length !== 12) {
      return { message: 'El código de amistad tiene 12 números.', field: $('codigo') };
    }
  }
  if (step === 3) {
    const answer = campfireAnswer();
    if (!answer) return { message: 'Cuéntanos si tienes cuenta en Campfire.' };
    if (answer === 'si' && !$<HTMLInputElement>('campfire-nombre').value.trim()) {
      return { message: 'Escribe tu nombre en Campfire.', field: $('campfire-nombre') };
    }
  }
  if (step === 4 && ageTooLow()) return { message: 'La comunidad admite personas desde los 16 años.' };
  return null;
}

async function onScreenshot() {
  const file = $<HTMLInputElement>('captura').files?.[0];
  const error = $('captura-error');
  error.classList.add('hidden');
  if (!file) return;
  try {
    // Más liviana que un flyer: se guarda en la base de datos y solo se usa para la bienvenida
    const { base64, dataUrl } = await compressImage(file, { maxSide: 1100, maxBytes: 450 * 1024 });
    screenshot = base64;
    const preview = $<HTMLImageElement>('captura-vista');
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    $('captura-vacia').classList.add('hidden');
  } catch (err) {
    screenshot = null;
    error.textContent = (err as Error).message || 'No se pudo leer la imagen. Prueba con otra.';
    error.classList.remove('hidden');
  }
}

async function submit() {
  const button = $<HTMLButtonElement>('continuar');
  button.disabled = true;
  button.textContent = 'Enviando…';
  const campfire = campfireAnswer() === 'si';
  try {
    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sitio: $<HTMLInputElement>('sitio').value,
        entrenador: $<HTMLInputElement>('entrenador').value,
        nombre: $<HTMLInputElement>('nombre').value,
        ciudad: $<HTMLInputElement>('ciudad').value,
        codigo: $<HTMLInputElement>('codigo').value,
        mostrarEnAmigos: $<HTMLInputElement>('mostrar-amigos').checked,
        campfire,
        campfireNombre: campfire ? $<HTMLInputElement>('campfire-nombre').value : '',
        edad: Number($<HTMLInputElement>('edad').value),
        captura: screenshot,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar tu registro. Inténtalo de nuevo.');

    const trainer = $<HTMLInputElement>('entrenador').value.trim();
    $('listo-entrenador').textContent = trainer;
    const message = `¡Hola! Soy ${trainer} y ya llené el formulario para ser parte de la comunidad Emerald City.`;
    $<HTMLAnchorElement>('listo-whatsapp').href = `https://wa.me/${BAZAR_WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
    $('registro').classList.add('hidden');
    $('progreso').classList.add('hidden');
    $('registro-listo').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError((err as Error).message || 'Revisa tu conexión e inténtalo de nuevo.');
    button.disabled = false;
    button.textContent = 'Enviar mi registro';
  }
}

function onContinue(event: SubmitEvent) {
  event.preventDefault();
  const problem = stepProblem();
  if (problem) {
    showError(problem.message);
    problem.field?.focus();
    return;
  }
  if (step < TOTAL_STEPS) {
    step += 1;
    render();
    $('progreso').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  submit();
}

export function initRegistro() {
  $('registro').addEventListener('submit', onContinue);
  $('atras').addEventListener('click', () => {
    step = Math.max(1, step - 1);
    render();
  });
  $('captura').addEventListener('change', onScreenshot);
  // El aviso de un campo pendiente desaparece en cuanto la persona lo corrige
  $('registro').addEventListener('input', () => showError(''));

  const code = $<HTMLInputElement>('codigo');
  code.addEventListener('input', () => {
    code.value = formatFriendCode(code.value);
  });

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="campfire"]')) {
    radio.addEventListener('change', () => {
      const yes = campfireAnswer() === 'si';
      $('campfire-nombre-bloque').classList.toggle('hidden', !yes);
      $('campfire-no').classList.toggle('hidden', yes);
      showError('');
    });
  }

  $('edad').addEventListener('input', () => {
    $('edad-minima').classList.toggle('hidden', !ageTooLow());
    $<HTMLButtonElement>('continuar').disabled = ageTooLow();
  });

  render();
}
