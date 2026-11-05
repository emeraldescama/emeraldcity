/**
 * Flyer de las misiones de un día de Wild Area, para compartir en el grupo: temática de
 * Wild Area (cielo Dinamax, lluvia y pasto), los Pokémon del día y cada misión con sus
 * puntos y su límite. 1080x1350; los días con muchas misiones (fin de semana) salen en
 * 1080x1920, el tamaño de los estados de WhatsApp.
 */
import { artworkUrl } from '../utils/perfil';

export interface MisionFlyer {
  titulo: string;
  puntos: number;
  limite: number | null;
  grupo: string;
  pokemon: number[];
}

const WIDTH = 1080;
const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Las ilustraciones vienen de otro dominio: sin esto no se podría descargar el flyer
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Corta el texto en líneas que quepan en el ancho */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
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

export const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} DE ${MONTHS[d.getUTCMonth()]}`;
};

export async function drawMissionsFlyer(canvas: HTMLCanvasElement, nombre: string, fecha: string, misiones: MisionFlyer[]) {
  const groups = new Map<string, MisionFlyer[]>();
  for (const m of misiones) groups.set(m.grupo, [...(groups.get(m.grupo) ?? []), m]);

  // Alto: 1350 si caben; si no, 1920; con aún más misiones, las filas se achican
  const HEADER = 560;
  const FOOTER = 190;
  let rowH = 104;
  const groupH = 56;
  const content = () => misiones.length * (rowH + 14) + [...groups.keys()].filter(Boolean).length * groupH;
  const height = HEADER + content() + FOOTER <= 1350 ? 1350 : 1920;
  while (HEADER + content() + FOOTER > height && rowH > 70) rowH -= 4;

  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await Promise.all(['900 40px Outfit', '800 40px Outfit', '700 40px Outfit'].map((font) => document.fonts.load(font).catch(() => undefined)));
  // Pokémon del día: los de las misiones, sin repetir (máximo 3 en la portada)
  const dayPokemon = [...new Set(misiones.flatMap((m) => m.pokemon))].slice(0, 3);
  const [logo, ...arts] = await Promise.all([loadImage('/images/branding/logo-emerald-city-256.png'), ...dayPokemon.map((n) => loadImage(artworkUrl(n)))]);

  // Cielo Dinamax
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2a0b3d');
  sky.addColorStop(0.35, '#3b0f4a');
  sky.addColorStop(0.7, '#1d0a2e');
  sky.addColorStop(1, '#0b1f14');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, height);
  };
  glow(150, 60, 700, 'rgba(255, 61, 127, 0.45)');
  glow(950, 160, 620, 'rgba(217, 70, 239, 0.4)');
  glow(540, height * 0.6, 700, 'rgba(244, 63, 94, 0.14)');

  // Lluvia
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  for (let x = -400; x < WIDTH + 400; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height * 0.27, height);
    ctx.stroke();
  }

  // Pasto de Galar al fondo
  const hills = (y: number, color: string, amp: number) => {
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, y);
    for (let x = 0; x <= WIDTH; x += 20) ctx.lineTo(x, y + Math.sin(x / 140) * amp + Math.cos(x / 61) * amp * 0.4);
    ctx.lineTo(WIDTH, height);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  hills(height - 130, '#14532d', 18);
  hills(height - 80, '#0b2b18', 14);

  // Encabezado
  if (logo) ctx.drawImage(logo, 56, 46, (logo.width / logo.height) * 100, 100);
  ctx.font = '900 40px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('EMERALD', 168, 96);
  ctx.fillStyle = '#34d399';
  ctx.fillText('CITY', 168 + ctx.measureText('EMERALD').width + 4, 96);
  ctx.font = '700 20px Outfit, sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('ESCAMA ESMERALDA · CARACAS', 170, 128);

  // Pokémon del día, a la derecha, con brillo Dinamax
  const spots = [
    { x: 640, y: 120, s: 380 },
    { x: 560, y: 290, s: 230 },
    { x: 850, y: 290, s: 230 },
  ];
  if (arts.length) {
    glow(830, 330, 300, 'rgba(255, 61, 127, 0.35)');
    arts.forEach((art, i) => {
      if (!art) return;
      const spot = arts.length === 1 ? { x: 600, y: 110, s: 440 } : spots[i];
      ctx.save();
      ctx.shadowColor = 'rgba(255, 61, 127, 0.7)';
      ctx.shadowBlur = 40;
      ctx.drawImage(art, spot.x, spot.y, spot.s, spot.s);
      ctx.restore();
    });
  } else {
    ctx.font = '220px sans-serif';
    ctx.fillText('🥚', 700, 420);
  }

  // Título
  const title = ctx.createLinearGradient(56, 0, 600, 0);
  title.addColorStop(0, '#ff8fab');
  title.addColorStop(0.45, '#ff3d7f');
  title.addColorStop(1, '#fde68a');
  ctx.save();
  ctx.shadowColor = 'rgba(255, 61, 127, 0.6)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = title;
  ctx.font = '900 132px Outfit, sans-serif';
  ctx.fillText('WILD', 52, 300);
  ctx.fillText('AREA', 52, 418);
  ctx.restore();
  ctx.font = '800 34px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText(wrap(ctx, nombre, 560, 1)[0] ?? '', 56, 470);

  // Día
  const label = `MISIONES DEL ${dayLabel(fecha)}`;
  ctx.font = '900 26px Outfit, sans-serif';
  const pillW = ctx.measureText(label).width + 48;
  ctx.beginPath();
  ctx.roundRect(56, 494, pillW, 50, 25);
  ctx.fillStyle = 'rgba(255, 61, 127, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 61, 127, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 80, 528);

  // Misiones
  let y = HEADER + 20;
  const titleSize = Math.round(Math.min(30, rowH * 0.29));
  for (const [group, list] of groups) {
    if (group) {
      ctx.font = '900 22px Outfit, sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText(wrap(ctx, group.toUpperCase(), WIDTH - 120, 1)[0] ?? '', 60, y + 30);
      y += groupH;
    }
    for (const m of list) {
      ctx.beginPath();
      ctx.roundRect(56, y, WIDTH - 112, rowH, 22);
      ctx.fillStyle = 'rgba(10, 6, 18, 0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 61, 127, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Puntos
      const pts = `+${m.puntos} PT${m.puntos === 1 ? '' : 'S'}`;
      ctx.font = '900 28px Outfit, sans-serif';
      const ptsW = ctx.measureText(pts).width + 32;
      ctx.beginPath();
      ctx.roundRect(WIDTH - 80 - ptsW, y + rowH / 2 - 26, ptsW, 52, 16);
      ctx.fillStyle = 'rgba(255, 61, 127, 0.3)';
      ctx.fill();
      ctx.fillStyle = '#ffe4ec';
      ctx.fillText(pts, WIDTH - 64 - ptsW, y + rowH / 2 + 10);

      // Texto de la misión y su límite
      ctx.font = `800 ${titleSize}px Outfit, sans-serif`;
      ctx.fillStyle = '#ffffff';
      const lines = wrap(ctx, m.titulo, WIDTH - 200 - ptsW, rowH >= 96 ? 2 : 1);
      const limitSize = Math.round(titleSize * 0.7);
      const blockH = lines.length * titleSize * 1.15 + limitSize + 8;
      let ty = y + (rowH - blockH) / 2 + titleSize;
      for (const line of lines) {
        ctx.fillText(line, 84, ty);
        ty += titleSize * 1.15;
      }
      ctx.font = `700 ${limitSize}px Outfit, sans-serif`;
      ctx.fillStyle = '#d4d4d8';
      ctx.fillText(m.limite === null ? 'Sin límite' : `Límite: ${m.limite} ${m.limite === 1 ? 'vez' : 'veces'}`, 84, ty + 4 - titleSize * 0.15);
      y += rowH + 14;
    }
  }

  // Pie
  ctx.textAlign = 'center';
  ctx.font = '800 28px Outfit, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Marca "¡Lo logré!" en la web y muéstraselo al admin en la quedada', WIDTH / 2, height - 150);
  ctx.font = '700 24px Outfit, sans-serif';
  ctx.fillStyle = '#bbf7d0';
  ctx.fillText('emeraldcity-pi.vercel.app/eventos', WIDTH / 2, height - 108);
  ctx.font = '700 24px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.textAlign = 'left';
  ctx.fillText('Más información: WhatsApp +58 422 2292700', 56, height - 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('@emeraldcityccs', WIDTH - 56, height - 40);
  ctx.textAlign = 'left';
}

/** Mensaje para pegar en el grupo junto con el flyer */
export function missionsText(nombre: string, fecha: string, misiones: MisionFlyer[], siteUrl: string): string {
  const lines = [`🌧️ *WILD AREA · ${nombre}*`, `*Misiones del ${dayLabel(fecha).toLowerCase()}*`];
  let group: string | null = null;
  for (const m of misiones) {
    if (m.grupo !== group) {
      group = m.grupo;
      lines.push('', group ? `*${group}*` : '');
    }
    lines.push(`• ${m.titulo} — +${m.puntos} pt${m.puntos === 1 ? '' : 's'}${m.limite === null ? ' (sin límite)' : ` (límite ${m.limite})`}`);
  }
  lines.push('', `Marca «¡Lo logré!» en ${siteUrl}/eventos y muéstraselo al admin en la quedada 💚`);
  return lines.filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}
