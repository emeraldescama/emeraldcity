/**
 * Flyer de "Novedades": las últimas actualizaciones de la página, cada una con un mini
 * ejemplo dibujado (el botón de me gusta, la campanita, la escama verde…). Hasta 4
 * novedades en 1080x1350; de 5 a 8 en 1080x1920 (el tamaño de los estados de WhatsApp).
 */
import type { Actualizacion, Ejemplo, Novedad } from '../data/novedades';
import { artworkUrl, avatarUrl } from '../utils/perfil';

const WIDTH = 1080;
const PAD = 56;
const GAP = 24;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

type Ctx = CanvasRenderingContext2D;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!images.has(src)) {
    images.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        // Las ilustraciones vienen de otro dominio: sin esto no se podría descargar el flyer
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }),
    );
  }
  return images.get(src)!;
}

function round(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function text(ctx: Ctx, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  ctx.textAlign = 'left';
}

function wrap(ctx: Ctx, value: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= width) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

/** Escama verde (la misma forma que la insignia del foro) */
function scale(ctx: Ctx, cx: number, cy: number, size: number) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 13 * s);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, 0, 24, 24);
  g.addColorStop(0, '#ecfccb');
  g.addColorStop(0.4, '#4ade80');
  g.addColorStop(1, '#15803d');
  ctx.shadowColor = 'rgba(74, 222, 128, 0.9)';
  ctx.shadowBlur = 14 / s;
  const drop = new Path2D('M12 2.2c4.7 3.3 7.7 7.2 7.7 11.3a7.7 7.7 0 0 1-15.4 0c0-4.1 3-8 7.7-11.3z');
  ctx.fillStyle = g;
  ctx.fill(drop);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#f0fdf4';
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D('M7.6 13.4c0-2.6 1.7-5 4.4-7.1 2.7 2.1 4.4 4.5 4.4 7.1'));
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#f0fdf4';
  ctx.fill(new Path2D('M12 10.2c1.5 1.2 2.4 2.5 2.4 3.9a2.4 2.4 0 0 1-4.8 0c0-1.4.9-2.7 2.4-3.9z'));
  ctx.restore();
}

/** Burbuja de comentario del foro con un avatar */
async function comment(ctx: Ctx, b: Box, name: string, pokemon: number, line: string) {
  round(ctx, b.x, b.y, b.w, b.h, 18, 'rgba(15, 23, 42, 0.95)', 'rgba(52, 211, 153, 0.35)');
  const avatar = await loadImage(avatarUrl(pokemon));
  round(ctx, b.x + 14, b.y + 14, 52, 52, 12, '#111827');
  if (avatar) ctx.drawImage(avatar, b.x + 12, b.y + 12, 56, 56);
  text(ctx, name, b.x + 80, b.y + 38, '800 22px Outfit, sans-serif', '#f4f4f5');
  text(ctx, line, b.x + 80, b.y + 66, '600 20px Outfit, sans-serif', '#d4d4d8');
}

// ---------- Ejemplos ----------

const EXAMPLES: Record<Ejemplo, (ctx: Ctx, b: Box, n: Novedad) => Promise<void>> = {
  async likes(ctx, b) {
    await comment(ctx, { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 }, 'AshKetchum', 25, '¡Qué buena captura! 🔥');
    round(ctx, b.x + 108, b.y + b.h - 70, 104, 40, 12, 'rgba(236, 72, 153, 0.25)', 'rgba(244, 114, 182, 0.8)');
    text(ctx, '❤️ 12', b.x + 160, b.y + b.h - 42, '800 22px Outfit, sans-serif', '#fce7f3', 'center');
    round(ctx, b.x + 226, b.y + b.h - 70, 130, 40, 12, 'rgba(0,0,0,0.3)', 'rgba(161, 161, 170, 0.6)');
    text(ctx, '↩ Responder', b.x + 291, b.y + b.h - 43, '700 18px Outfit, sans-serif', '#e4e4e7', 'center');
  },
  async mencion(ctx, b) {
    const inner = { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 };
    round(ctx, inner.x, inner.y, inner.w, inner.h, 18, 'rgba(15, 23, 42, 0.95)', 'rgba(52, 211, 153, 0.35)');
    round(ctx, inner.x + 16, inner.y + 16, inner.w - 32, 44, 10, 'rgba(16, 185, 129, 0.12)');
    ctx.fillStyle = '#34d399';
    ctx.fillRect(inner.x + 16, inner.y + 16, 5, 44);
    text(ctx, '↪ MistyWater: ¿Raid hoy a las 6?', inner.x + 32, inner.y + 46, '700 18px Outfit, sans-serif', '#a7f3d0');
    text(ctx, '¡Yo voy!', inner.x + 18, inner.y + 100, '700 24px Outfit, sans-serif', '#f4f4f5');
    ctx.font = '700 24px Outfit, sans-serif';
    const after = inner.x + 18 + ctx.measureText('¡Yo voy! ').width;
    ctx.font = '800 24px Outfit, sans-serif';
    const w = ctx.measureText('@Ophiuc0').width + 14;
    round(ctx, after - 4, inner.y + 76, w, 34, 8, 'rgba(16, 185, 129, 0.2)');
    text(ctx, '@Ophiuc0', after + 3, inner.y + 100, '800 24px Outfit, sans-serif', '#6ee7b7');
  },
  async avisos(ctx, b) {
    round(ctx, b.x + 24, b.y + 24, 92, 92, 22, 'rgba(15, 23, 42, 0.95)', 'rgba(52, 211, 153, 0.35)');
    text(ctx, '🔔', b.x + 70, b.y + 88, '52px sans-serif', '#fff', 'center');
    ctx.beginPath();
    ctx.arc(b.x + 112, b.y + 30, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    text(ctx, '3', b.x + 112, b.y + 38, '900 22px Outfit, sans-serif', '#111827', 'center');
    const row = { x: b.x + 136, y: b.y + 30, w: b.w - 160, h: 80 };
    round(ctx, row.x, row.y, row.w, row.h, 16, 'rgba(16, 185, 129, 0.15)', 'rgba(52, 211, 153, 0.4)');
    const avatar = await loadImage(avatarUrl(95));
    if (avatar) ctx.drawImage(avatar, row.x + 4, row.y + 8, 64, 64);
    text(ctx, 'BrockRock', row.x + 72, row.y + 34, '800 19px Outfit, sans-serif', '#f4f4f5');
    text(ctx, 'te mencionó', row.x + 72, row.y + 60, '600 18px Outfit, sans-serif', '#a7f3d0');
  },
  async wildarea(ctx, b) {
    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, '#3b0f4a');
    g.addColorStop(1, '#14532d');
    round(ctx, b.x + 14, b.y + 14, b.w - 28, b.h - 28, 18, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 61, 127, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const art = await loadImage(artworkUrl(10225));
    if (art) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 61, 127, 0.8)';
      ctx.shadowBlur = 24;
      ctx.drawImage(art, b.x + b.w - 190, b.y + 4, 170, 170);
      ctx.restore();
    }
    const title = ctx.createLinearGradient(b.x + 30, 0, b.x + 260, 0);
    title.addColorStop(0, '#ff8fab');
    title.addColorStop(1, '#fde68a');
    text(ctx, 'WILD AREA', b.x + 32, b.y + 66, '900 44px Outfit, sans-serif', title as unknown as string);
    const button = ctx.createLinearGradient(b.x + 32, 0, b.x + 210, 0);
    button.addColorStop(0, '#ff3d7f');
    button.addColorStop(1, '#d946ef');
    round(ctx, b.x + 32, b.y + 92, 180, 50, 14, button as unknown as string);
    text(ctx, '¡Lo logré!', b.x + 122, b.y + 125, '900 22px Outfit, sans-serif', '#fff', 'center');
  },
  async registro(ctx, b) {
    const inner = { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 };
    round(ctx, inner.x, inner.y, inner.w, inner.h, 18, 'rgba(42, 11, 61, 0.95)', 'rgba(255, 61, 127, 0.5)');
    text(ctx, 'Tu teléfono de Escama', inner.x + 20, inner.y + 30, '800 18px Outfit, sans-serif', '#fbcfe8');
    round(ctx, inner.x + 20, inner.y + 40, inner.w - 40, 44, 12, 'rgba(0,0,0,0.4)', 'rgba(249, 168, 212, 0.4)');
    text(ctx, '📱 0412 •••• ••••', inner.x + 36, inner.y + 70, '700 22px Outfit, sans-serif', '#f4f4f5');
    const button = ctx.createLinearGradient(inner.x + 20, 0, inner.x + inner.w - 20, 0);
    button.addColorStop(0, '#ff3d7f');
    button.addColorStop(1, '#d946ef');
    round(ctx, inner.x + 20, inner.y + 92, inner.w - 40, 34, 12, button as unknown as string);
    text(ctx, '✨ Registrarme', inner.x + inner.w / 2, inner.y + 116, '900 20px Outfit, sans-serif', '#fff', 'center');
  },
  async escama(ctx, b) {
    const inner = { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 };
    round(ctx, inner.x, inner.y, inner.w, inner.h, 18, 'rgba(15, 23, 42, 0.95)', 'rgba(74, 222, 128, 0.45)');
    text(ctx, 'Miembro activo de Escama Esmeralda', inner.x + inner.w / 2, inner.y + 38, '800 18px Outfit, sans-serif', '#bbf7d0', 'center');
    ctx.font = '900 34px Outfit, sans-serif';
    const name = 'TuNick';
    const total = ctx.measureText(name).width + 56;
    const start = inner.x + (inner.w - total) / 2;
    text(ctx, name, start, inner.y + 104, '900 34px Outfit, sans-serif', '#f4f4f5');
    scale(ctx, start + total - 22, inner.y + 92, 46);
  },
  async cumple(ctx, b) {
    const inner = { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 };
    round(ctx, inner.x, inner.y, inner.w, inner.h, 18, 'rgba(15, 23, 42, 0.95)', 'rgba(251, 191, 36, 0.5)');
    text(ctx, '¡FELIZ', inner.x + 22, inner.y + 44, '900 34px Outfit, sans-serif', '#f4f4f5');
    text(ctx, 'CUMPLEAÑOS!', inner.x + 22, inner.y + 82, '900 34px Outfit, sans-serif', '#fbbf24');
    text(ctx, '🎂 TuNick', inner.x + 22, inner.y + 114, '800 22px Outfit, sans-serif', '#a7f3d0');
    const art = await loadImage(artworkUrl(25));
    if (art) ctx.drawImage(art, inner.x + inner.w - 140, inner.y + 4, 130, 130);
  },
  async amigos(ctx, b) {
    const inner = { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 };
    round(ctx, inner.x, inner.y, inner.w, inner.h, 18, 'rgba(15, 23, 42, 0.95)', 'rgba(52, 211, 153, 0.35)');
    round(ctx, inner.x + 18, inner.y + 26, 78, 78, 16, 'rgba(16, 185, 129, 0.15)', 'rgba(52, 211, 153, 0.4)');
    const avatar = await loadImage(avatarUrl(282));
    if (avatar) ctx.drawImage(avatar, inner.x + 6, inner.y + 14, 102, 102);
    text(ctx, 'FairyNini30', inner.x + 112, inner.y + 52, '800 24px Outfit, sans-serif', '#f4f4f5');
    text(ctx, '0847 4860 6139', inner.x + 112, inner.y + 86, '700 22px monospace', '#fbbf24');
    round(ctx, inner.x + 112, inner.y + 100, 96, 32, 10, 'rgba(0,0,0,0)', 'rgba(52, 211, 153, 0.6)');
    text(ctx, 'COPIAR', inner.x + 160, inner.y + 122, '800 16px Outfit, sans-serif', '#6ee7b7', 'center');
  },
  async foro(ctx, b) {
    await comment(ctx, { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 }, 'Ophiuc0', 384, '¡Bienvenidos al foro!');
  },
  async emoji(ctx, b, n) {
    text(ctx, n.emoji ?? '✨', b.x + b.w / 2, b.y + b.h / 2 + 40, '110px sans-serif', '#fff', 'center');
  },
};

// ---------- Flyer ----------

export function updateDate(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export async function drawUpdatesFlyer(canvas: HTMLCanvasElement, update: Actualizacion, siteUrl: string) {
  const items = update.novedades.slice(0, 8);
  const height = items.length <= 4 ? 1350 : 1920;
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await Promise.all(['900 40px Outfit', '800 40px Outfit', '700 40px Outfit', '600 20px Outfit'].map((font) => document.fonts.load(font).catch(() => undefined)));

  // Fondo esmeralda con brillos y destellos
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#022c22');
  bg.addColorStop(0.5, '#030712');
  bg.addColorStop(1, '#0b1a12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, height);
  };
  glow(120, 60, 700, 'rgba(16, 185, 129, 0.45)');
  glow(980, 260, 520, 'rgba(245, 158, 11, 0.22)');
  glow(540, height, 700, 'rgba(236, 72, 153, 0.14)');
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 46; i++) {
    const x = random() * WIDTH;
    const y = random() * 360;
    // Sin destellos encima del logo y del título
    if (x < 860 && y > 36) continue;
    ctx.globalAlpha = 0.25 + random() * 0.5;
    text(ctx, random() > 0.6 ? '✦' : '·', x, y, `${12 + random() * 26}px sans-serif`, random() > 0.5 ? '#fde68a' : '#a7f3d0');
  }
  ctx.globalAlpha = 1;

  // Encabezado
  const logo = await loadImage('/images/branding/logo-emerald-city-256.png');
  if (logo) ctx.drawImage(logo, PAD, 44, (logo.width / logo.height) * 100, 100);
  text(ctx, 'EMERALD', PAD + 112, 94, '900 40px Outfit, sans-serif', '#f4f4f5');
  ctx.font = '900 40px Outfit, sans-serif';
  text(ctx, 'CITY', PAD + 116 + ctx.measureText('EMERALD').width, 94, '900 40px Outfit, sans-serif', '#34d399');
  text(ctx, 'COMUNIDAD POKÉMON GO · CARACAS', PAD + 114, 128, '700 20px Outfit, sans-serif', '#fbbf24');

  const title = ctx.createLinearGradient(PAD, 0, 760, 0);
  title.addColorStop(0, '#6ee7b7');
  title.addColorStop(0.5, '#34d399');
  title.addColorStop(1, '#fde68a');
  ctx.save();
  ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
  ctx.shadowBlur = 28;
  text(ctx, '¡NOVEDADES!', PAD - 4, 262, '900 112px Outfit, sans-serif', title as unknown as string);
  ctx.restore();
  ctx.font = '800 32px Outfit, sans-serif';
  text(ctx, wrap(ctx, update.titulo, WIDTH - PAD * 2, 1)[0] ?? '', PAD, 314, '800 32px Outfit, sans-serif', '#f4f4f5');
  text(ctx, `Lo nuevo en la página · ${updateDate(update.fecha)}`, PAD, 354, '700 22px Outfit, sans-serif', '#a7f3d0');

  // Tarjetas: dos columnas, cada una con su ejemplo dibujado
  const top = 392;
  const footer = 150;
  // Con 1 o 2 novedades, una por fila a todo el ancho (así no queda espacio vacío)
  const columns = items.length <= 2 ? 1 : 2;
  const rows = Math.ceil(items.length / columns);
  const cardW = (WIDTH - PAD * 2 - GAP * (columns - 1)) / columns;
  const cardH = Math.min(420, (height - top - footer - GAP * (rows - 1)) / rows);
  // A todo el ancho hay más espacio: el ejemplo crece y la tarjeta no queda vacía
  const exampleH = columns === 1 ? cardH - 150 : Math.min(176, cardH - 166);
  for (const [i, item] of items.entries()) {
    const x = PAD + (i % columns) * (cardW + GAP);
    const y = top + Math.floor(i / columns) * (cardH + GAP);
    round(ctx, x, y, cardW, cardH, 26, 'rgba(6, 20, 16, 0.88)', 'rgba(52, 211, 153, 0.35)');
    // Ejemplo
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 10, cardW - 20, exampleH, 18);
    ctx.clip();
    await EXAMPLES[item.ejemplo](ctx, { x: x + 10, y: y + 10, w: cardW - 20, h: exampleH }, item);
    ctx.restore();
    // Número de la novedad, sobre la esquina del ejemplo
    ctx.beginPath();
    ctx.arc(x + 22, y + 22, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();
    ctx.strokeStyle = '#022c22';
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, String(i + 1), x + 22, y + 30, '900 22px Outfit, sans-serif', '#022c22', 'center');
    // Título y texto
    let ty = y + 10 + exampleH + 40;
    ctx.font = '900 28px Outfit, sans-serif';
    for (const line of wrap(ctx, item.titulo, cardW - 44, 1)) {
      text(ctx, line, x + 22, ty, '900 28px Outfit, sans-serif', '#ffffff');
      ty += 34;
    }
    ctx.font = '600 21px Outfit, sans-serif';
    for (const line of wrap(ctx, item.texto, cardW - 44, Math.max(1, Math.min(3, Math.floor((y + cardH - ty + 10) / 27))))) {
      text(ctx, line, x + 22, ty, '600 21px Outfit, sans-serif', '#d4d4d8');
      ty += 27;
    }
  }

  // Pie
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, height - 112);
  ctx.lineTo(WIDTH - PAD, height - 112);
  ctx.stroke();
  text(ctx, `Entra y descúbrelo: ${siteUrl.replace(/^https?:\/\//, '')}`, WIDTH / 2, height - 66, '800 28px Outfit, sans-serif', '#6ee7b7', 'center');
  text(ctx, 'Más información: WhatsApp +58 422 2292700 · @emeraldcityccs', WIDTH / 2, height - 28, '700 21px Outfit, sans-serif', '#d4d4d8', 'center');
}

/** Mensaje para el grupo con la lista de novedades */
export function updatesText(update: Actualizacion, siteUrl: string): string {
  return [
    `✨ *¡Novedades en Emerald City!* — ${update.titulo}`,
    '',
    ...update.novedades.map((n, i) => `${i + 1}. *${n.titulo}*: ${n.texto}${n.enlace ? ` ${siteUrl}${n.enlace === '/' ? '' : n.enlace}` : ''}`),
    '',
    `Entra y descúbrelo: ${siteUrl} 💚`,
  ].join('\n');
}
