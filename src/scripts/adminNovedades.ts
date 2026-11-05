/**
 * Pestaña "Novedades" del panel: el flyer con las notas de actualización (src/data/novedades.ts)
 * para compartir con la comunidad.
 */
import { ACTUALIZACIONES } from '../data/novedades';
import { drawUpdatesFlyer, updateDate, updatesText } from './novedadesFlyer';

type ShowStatus = (message: string, kind?: 'ok' | 'error' | 'info') => void;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let showStatus: ShowStatus;
let drawn = '';

const selected = () => ACTUALIZACIONES.find((a) => a.id === $<HTMLSelectElement>('nv-actualizacion').value) ?? ACTUALIZACIONES[0];

async function draw() {
  const update = selected();
  if (!update) return;
  $('nv-lista').replaceChildren(
    ...update.novedades.map((n, i) => {
      const item = document.createElement('li');
      item.className = 'rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2';
      const title = document.createElement('strong');
      title.className = 'text-zinc-100';
      title.textContent = `${i + 1}. ${n.titulo}: `;
      item.append(title, document.createTextNode(n.texto));
      return item;
    }),
  );
  drawn = update.id;
  await drawUpdatesFlyer($<HTMLCanvasElement>('nv-canvas'), update, location.origin);
}

/** Al abrir la pestaña: la actualización más reciente (se dibuja una sola vez) */
export function showUpdates() {
  if (!drawn) draw();
}

function file(): Promise<File> {
  return new Promise((resolve, reject) =>
    $<HTMLCanvasElement>('nv-canvas').toBlob(
      (blob) => (blob ? resolve(new File([blob], `novedades-${selected().id}.png`, { type: 'image/png' })) : reject(new Error('No se pudo crear la imagen.'))),
      'image/png',
    ),
  );
}

export function initUpdates(options: { showStatus: ShowStatus; canShareFiles: boolean }) {
  showStatus = options.showStatus;
  const select = $<HTMLSelectElement>('nv-actualizacion');
  select.replaceChildren(...ACTUALIZACIONES.map((a) => new Option(`${updateDate(a.fecha)} · ${a.titulo}`, a.id)));
  select.addEventListener('change', draw);
  $('nv-descargar').addEventListener('click', async () => {
    const png = await file();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = png.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('nv-copiar').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(updatesText(selected(), location.origin)).catch(() => undefined);
    showStatus('Mensaje copiado. Pégalo en el grupo junto con el flyer.', 'ok');
  });
  if (options.canShareFiles) {
    $('nv-compartir').classList.remove('hidden');
    $('nv-compartir').addEventListener('click', async () => {
      await navigator.share({ files: [await file()], text: updatesText(selected(), location.origin) }).catch(() => undefined);
    });
  }
}
