/**
 * Dibuja el flyer "Eventos de esta semana" (1080x1350) para compartir en el grupo de WhatsApp.
 */
import { dayName, eventEnd, formatShortDate, formatTime, formatWeekRange, hasMeetup, type Evento } from '../utils/eventos';

export const FLYER_WIDTH = 1080;
export const FLYER_HEIGHT = 1350;
// Con muchos eventos el flyer pasa a formato vertical de historia (9:16) para que todo se lea
const TALL_HEIGHT = 1920;
const TALL_FROM = 6;

const MAX_ROWS = 10;
const COLORS = {
  bg: '#030712',
  card: 'rgba(15, 23, 42, 0.88)',
  cardBorder: 'rgba(16, 185, 129, 0.35)',
  emerald: '#34d399',
  amber: '#fbbf24',
  text: '#f4f4f5',
  muted: '#a1a1aa',
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Dibuja la imagen recortada para cubrir el recuadro, como object-fit: cover */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Corta el texto en líneas que caben en `maxWidth`, con "…" si sobra */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const truncated = lines.length === maxLines && lines.join(' ').length < text.length;
  if (truncated) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const height = ctx.canvas.height;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FLYER_WIDTH, height);

  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FLYER_WIDTH, height);
  };
  glow(120, 120, 700, 'rgba(16, 185, 129, 0.28)');
  glow(FLYER_WIDTH, height, 650, 'rgba(245, 158, 11, 0.14)');

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= FLYER_WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FLYER_WIDTH, y);
    ctx.stroke();
  }
}

async function drawHeader(ctx: CanvasRenderingContext2D, logoUrl: string, weekStart: string, weekEnd: string) {
  const logo = await loadImage(logoUrl);
  if (logo) {
    ctx.save();
    roundRect(ctx, 60, 56, 104, 104, 24);
    ctx.clip();
    drawCover(ctx, logo, 60, 56, 104, 104);
    ctx.restore();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 44px Outfit, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('EMERALD', 188, 108);
  ctx.fillStyle = COLORS.emerald;
  ctx.fillText('CITY', 188 + ctx.measureText('EMERALD').width + 4, 108);
  ctx.font = '700 22px Outfit, sans-serif';
  ctx.fillStyle = COLORS.amber;
  ctx.fillText('COMUNIDAD POKÉMON GO · CARACAS', 190, 144);

  ctx.font = '900 92px Outfit, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('EVENTOS DE', 60, 290);
  ctx.fillStyle = COLORS.emerald;
  ctx.fillText('ESTA SEMANA', 60, 384);

  const range = formatWeekRange(weekStart, weekEnd).toUpperCase();
  ctx.font = '800 28px Outfit, sans-serif';
  const pillW = ctx.measureText(range).width + 48;
  roundRect(ctx, 60, 414, pillW, 52, 26);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COLORS.amber;
  ctx.fillText(range, 84, 450);
}

const dayAndDate = (date: string) => `${dayName(date)} ${formatShortDate(date)}`.toUpperCase();

/** "MIÉRCOLES 28 OCT · 6:00 PM", "MAR 27 OCT – DOMINGO 1 NOV" o "HASTA DOMINGO 1 NOV" */
function rowDateLabel(evento: Evento, weekStart: string): string {
  const end = eventEnd(evento);
  if (end === evento.date) return `${dayAndDate(evento.date)} · ${formatTime(evento.time)}`;
  if (evento.date < weekStart) return `HASTA EL ${dayAndDate(end)}`;
  return `${dayAndDate(evento.date)} – ${dayAndDate(end)}`;
}

async function drawEventRow(
  ctx: CanvasRenderingContext2D,
  evento: Evento,
  flyerUrl: string,
  y: number,
  rowH: number,
  weekStart: string,
) {
  const x = 60;
  const w = FLYER_WIDTH - 120;
  roundRect(ctx, x, y, w, rowH, 24);
  ctx.fillStyle = COLORS.card;
  ctx.fill();
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  const pad = Math.round(rowH * 0.1);
  const thumb = rowH - pad * 2;
  // Si el evento tiene ilustración del Pokémon se muestra completa; si no, un recorte del flyer
  const art = evento.image ? await loadImage(evento.image) : null;
  const flyer = art ? null : await loadImage(flyerUrl);
  ctx.save();
  roundRect(ctx, x + pad, y + pad, thumb, thumb, 16);
  ctx.clip();
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(x + pad, y + pad, thumb, thumb);
  if (art) {
    const inset = thumb * 0.06;
    ctx.drawImage(art, x + pad + inset, y + pad + inset, thumb - inset * 2, thumb - inset * 2);
  } else if (flyer) drawCover(ctx, flyer, x + pad, y + pad, thumb, thumb);
  ctx.restore();

  // El texto crece con la fila, con tope en el tamaño de las filas grandes
  const textX = x + pad + thumb + 32;
  const textW = x + w - textX - 28;
  const labelSize = Math.round(Math.min(26, rowH * 0.17));
  const titleSize = Math.round(Math.min(40, rowH * 0.24));
  const placeSize = Math.round(Math.min(25, rowH * 0.15));

  ctx.font = `800 ${titleSize}px Outfit, sans-serif`;
  const titleLines = wrapText(ctx, evento.title, textW, rowH > 170 ? 2 : 1);

  const blockH = labelSize + 14 + titleLines.length * titleSize * 1.12 + 12 + placeSize;
  let cursor = y + (rowH - blockH) / 2 + labelSize;

  ctx.font = `800 ${labelSize}px Outfit, sans-serif`;
  ctx.fillStyle = COLORS.amber;
  ctx.fillText(rowDateLabel(evento, weekStart), textX, cursor);

  cursor += 14;
  ctx.font = `800 ${titleSize}px Outfit, sans-serif`;
  ctx.fillStyle = COLORS.text;
  for (const line of titleLines) {
    cursor += titleSize * 1.12;
    ctx.fillText(line, textX, cursor - titleSize * 0.12);
  }

  cursor += 12 + placeSize;
  // En la Hora Destacada, la última línea muestra el bonus en vez del lugar
  if (evento.bonus) {
    ctx.font = `800 ${placeSize}px Outfit, sans-serif`;
    ctx.fillStyle = COLORS.amber;
    ctx.fillText(wrapText(ctx, `★ Bonus: ${evento.bonus}`, textW, 1)[0] ?? '', textX, cursor);
    return;
  }
  // Punto verde: hay quedada; gris: evento del juego sin quedada
  ctx.fillStyle = hasMeetup(evento) ? COLORS.emerald : '#71717a';
  ctx.beginPath();
  ctx.arc(textX + placeSize * 0.3, cursor - placeSize * 0.35, placeSize * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `500 ${placeSize}px Outfit, sans-serif`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(wrapText(ctx, evento.location, textW - placeSize, 1)[0] ?? '', textX + placeSize * 0.9, cursor);
}

function drawFooter(ctx: CanvasRenderingContext2D, extra: number) {
  const height = ctx.canvas.height;
  if (extra > 0) {
    ctx.font = '700 26px Outfit, sans-serif';
    ctx.fillStyle = COLORS.emerald;
    ctx.textAlign = 'center';
    ctx.fillText(`+${extra} evento${extra === 1 ? '' : 's'} más en la web`, FLYER_WIDTH / 2, height - 112);
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, height - 88);
  ctx.lineTo(FLYER_WIDTH - 60, height - 88);
  ctx.stroke();

  ctx.font = '700 26px Outfit, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('Más información: WhatsApp +58 422 2292700', 60, height - 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.amber;
  ctx.fillText('@emeraldcityccs', FLYER_WIDTH - 60, height - 42);
  ctx.textAlign = 'left';
}

export async function drawWeeklyFlyer(
  canvas: HTMLCanvasElement,
  eventos: Evento[],
  weekStart: string,
  weekEnd: string,
  options: { logoUrl: string; flyerUrl: (evento: Evento) => string },
) {
  const shown = eventos.slice(0, MAX_ROWS);
  canvas.width = FLYER_WIDTH;
  canvas.height = shown.length >= TALL_FROM ? TALL_HEIGHT : FLYER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await Promise.all(
    ['900 40px Outfit', '800 40px Outfit', '700 40px Outfit', '500 20px Outfit'].map((font) =>
      document.fonts.load(font).catch(() => undefined),
    ),
  );

  drawBackground(ctx);
  await drawHeader(ctx, options.logoUrl, weekStart, weekEnd);

  const top = 506;
  const bottom = canvas.height - (eventos.length > shown.length ? 150 : 128);

  if (shown.length === 0) {
    ctx.font = '800 40px Outfit, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'center';
    ctx.fillText('Pronto anunciaremos las quedadas', FLYER_WIDTH / 2, (top + bottom) / 2);
    ctx.textAlign = 'left';
  } else {
    const gap = shown.length >= TALL_FROM ? 14 : 20;
    const rowH = Math.min(230, (bottom - top - gap * (shown.length - 1)) / shown.length);
    // Con pocos eventos, el bloque queda centrado en vez de pegado arriba
    const blockTop = top + (bottom - top - (rowH * shown.length + gap * (shown.length - 1))) / 2;
    for (const [i, evento] of shown.entries()) {
      await drawEventRow(ctx, evento, options.flyerUrl(evento), blockTop + i * (rowH + gap), rowH, weekStart);
    }
  }

  drawFooter(ctx, eventos.length - shown.length);
}

/** Texto listo para pegar en el grupo de WhatsApp */
export function weeklyText(eventos: Evento[], weekStart: string, weekEnd: string, siteUrl: string): string {
  const lines = [`*EVENTOS DE ESTA SEMANA · Emerald City*`, formatWeekRange(weekStart, weekEnd), ''];
  if (eventos.length === 0) lines.push('Pronto anunciaremos las próximas quedadas.');
  for (const e of eventos) {
    const when = eventEnd(e) === e.date ? `${dayName(e.date)} ${formatShortDate(e.date)}, ${formatTime(e.time)}` : `Hasta el ${dayName(eventEnd(e))} ${formatShortDate(eventEnd(e))}`;
    lines.push(`• *${when}* · ${e.title}`);
    lines.push(hasMeetup(e) ? `  📍 ${e.location}` : '  🎮 Evento del juego, sin quedada');
    if (e.bonus) lines.push(`  ⭐ Bonus: ${e.bonus}`);
  }
  lines.push('', `Más info y flyers: ${siteUrl}/noticias#eventos`);
  return lines.join('\n');
}
