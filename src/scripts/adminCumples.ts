/**
 * Pestaña "Cumpleaños" del panel: quién cumple años hoy y en los próximos 30 días, con su
 * flyer listo para el grupo de WhatsApp.
 */
import { onMembersChange, loadMembers, type Miembro } from './adminMiembros';
import { birthdayMessage, canvasToFile, drawBirthdayFlyer, type Cumpleanero } from './birthdayFlyer';
import { avatarUrl, birthdayText } from '../utils/perfil';
import { caracasToday } from '../utils/eventos';

type ShowStatus = (message: string, kind?: 'ok' | 'error' | 'info') => void;
type Api = <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const DAYS_AHEAD = 30;

let showStatus: ShowStatus;
let api: Api;
let members: Miembro[] = [];
let selected: Cumpleanero | null = null;
let selectedPhone = '';

/** Días que faltan para el próximo cumpleaños (0 = hoy) y su fecha */
function nextBirthday(member: Miembro, today: string): { days: number; date: string } | null {
  if (!member.cumpleDia || !member.cumpleMes) return null;
  const [year] = today.split('-').map(Number);
  const start = Date.parse(`${today}T00:00:00Z`);
  for (const y of [year, year + 1]) {
    // El 29 de febrero se celebra el 28 en los años no bisiestos
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = member.cumpleMes === 2 && member.cumpleDia === 29 && !leap ? 28 : member.cumpleDia;
    const date = `${y}-${String(member.cumpleMes).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / 86400000);
    if (days >= 0) return { days, date };
  }
  return null;
}

function toPerson(member: Miembro, date: string): Cumpleanero {
  return { entrenador: member.entrenador, codigo: member.mostrar ? member.codigo : '', pokemon: member.pokemon ?? 384, shiny: member.shiny, fecha: date };
}

function render() {
  const today = caracasToday();
  const upcoming = members
    .map((member) => ({ member, next: nextBirthday(member, today) }))
    .filter((x): x is { member: Miembro; next: { days: number; date: string } } => Boolean(x.next) && x.next!.days <= DAYS_AHEAD)
    .sort((a, b) => a.next.days - b.next.days || a.member.entrenador.localeCompare(b.member.entrenador, 'es'));
  const todayCount = upcoming.filter((x) => x.next.days === 0).length;
  const count = $('cumples-count');
  count.textContent = String(todayCount);
  count.classList.toggle('hidden', todayCount === 0);
  $('cumples-empty').classList.toggle('hidden', upcoming.length > 0);
  const missing = members.filter((m) => !m.cumpleDia).length;
  $('cumples-faltan').textContent = missing
    ? `${missing} miembro${missing === 1 ? '' : 's'} todavía no tiene${missing === 1 ? '' : 'n'} su cumpleaños registrado. Lo pueden agregar en su perfil (/cuenta) o tú en Miembros → Editar.`
    : '';

  $('cumples-list').replaceChildren(
    ...upcoming.map(({ member, next }) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `w-full glass-panel rounded-2xl p-3 flex items-center gap-3 text-left hover:border-emerald-500/40 ${next.days === 0 ? 'border-amber-400/60' : ''}`;
      const img = document.createElement('img');
      img.src = avatarUrl(member.pokemon ?? 384, member.shiny);
      img.alt = '';
      img.className = 'w-12 h-12 [image-rendering:pixelated]';
      const info = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'font-bold text-zinc-100';
      name.textContent = member.entrenador;
      const when = document.createElement('p');
      when.className = `text-xs font-bold ${next.days === 0 ? 'text-amber-300' : 'text-zinc-400'}`;
      when.textContent = `${birthdayText(member.cumpleDia!, member.cumpleMes!)} · ${next.days === 0 ? '¡Hoy! 🎂' : next.days === 1 ? 'mañana' : `en ${next.days} días`}`;
      info.append(name, when);
      button.append(img, info);
      button.addEventListener('click', () => select(toPerson(member, next.date), member.telefono));
      item.append(button);
      return item;
    }),
  );
}

async function select(person: Cumpleanero, telefono: string) {
  selected = person;
  selectedPhone = telefono;
  $('cumples-placeholder').classList.add('hidden');
  $('cumples-preview').classList.remove('hidden');
  $('cumples-nombre').textContent = person.entrenador;
  $('cumples-telefono').textContent = telefono ? `+${telefono}` : 'No tiene teléfono registrado (agrégalo en Miembros → Editar)';
  $('cumples-telefono').classList.toggle('text-base', !telefono);
  $('cumples-telefono-botones').classList.toggle('hidden', !telefono);
  // Chat privado con la persona, con la felicitación ya escrita
  $<HTMLAnchorElement>('cumples-chat').href = `https://wa.me/${telefono}?text=${encodeURIComponent(
    `🎂 ¡Feliz cumpleaños, ${person.entrenador}! Toda la comunidad de Emerald City te desea un día lleno de shinies 💚`,
  )}`;
  await drawBirthdayFlyer($<HTMLCanvasElement>('cumples-canvas'), person);
}

const file = () => canvasToFile($<HTMLCanvasElement>('cumples-canvas'), `cumpleanos-${selected?.entrenador ?? 'emerald'}.png`);

async function loadEmailStatus() {
  const status = $('correo-estado');
  try {
    const { falta, para } = await api<{ falta: string[]; para: string }>('correoEstado');
    status.textContent = falta.length
      ? `Falta configurarlo en Vercel (Settings → Environment Variables): ${falta.join(', ')}.`
      : `Cada día a las 7:00 AM, si alguien cumple años, llega un correo a ${para} con sus datos y el mensaje para el grupo.`;
    status.className = `text-sm ${falta.length ? 'text-amber-300' : 'text-emerald-300'}`;
  } catch (err) {
    status.textContent = (err as Error).message;
  }
}

async function sendTestEmail(button: HTMLButtonElement) {
  button.disabled = true;
  button.textContent = 'Enviando…';
  try {
    const { para } = await api<{ para: string }>('correoPrueba');
    showStatus(`Correo de prueba enviado a ${para}. Revisa la bandeja de entrada (y la de spam).`, 'ok');
  } catch (err) {
    showStatus((err as Error).message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar correo de prueba';
  }
}

export function initBirthdays(options: { api: Api; showStatus: ShowStatus; canShareFiles: boolean }) {
  showStatus = options.showStatus;
  api = options.api;
  const testButton = $<HTMLButtonElement>('correo-prueba');
  testButton.addEventListener('click', () => sendTestEmail(testButton));
  // El estado del correo se revisa al abrir la pestaña
  document.querySelector('[data-tab="cumples"]')?.addEventListener('click', loadEmailStatus);
  onMembersChange((list) => {
    members = list;
    render();
  });
  $('cumples-refresh').addEventListener('click', () => loadMembers());
  $('cumples-download').addEventListener('click', async () => {
    const png = await file();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = png.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('cumples-copy').addEventListener('click', async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(birthdayMessage(selected, selectedPhone)).catch(() => undefined);
    showStatus('Mensaje copiado. Pégalo en el grupo junto con el flyer.', 'ok');
  });
  $('cumples-copy-phone').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`+${selectedPhone}`).catch(() => undefined);
    showStatus('Número copiado.', 'ok');
  });
  if (options.canShareFiles) {
    $('cumples-share').classList.remove('hidden');
    $('cumples-share').addEventListener('click', async () => {
      if (!selected) return;
      await navigator.share({ files: [await file()], text: birthdayMessage(selected, selectedPhone) }).catch(() => undefined);
    });
  }
}
