/**
 * Flyer de cumpleaños (1080x1350): nombre de entrenador, código de amistad y la ilustración
 * de su Pokémon favorito. Se dibuja en el navegador, en el foro y en el panel.
 */
import { artworkUrl, MONTH_NAMES } from '../utils/perfil';

const WIDTH = 1080;
const HEIGHT = 1350;

export interface Cumpleanero {
  entrenador: string;
  codigo: string;
  pokemon: number;
  shiny: boolean;
  /** "YYYY-MM-DD" o al menos "MM-DD" al final */
  fecha: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // La ilustración viene de otro dominio: sin esto no se podría descargar el flyer
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Tamaño de letra para que el texto quepa en el ancho */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number, min = 40): number {
  let size = max;
  ctx.font = `${weight} ${size}px Outfit, sans-serif`;
  while (size > min && ctx.measureText(text).width > width) {
    size -= 4;
    ctx.font = `${weight} ${size}px Outfit, sans-serif`;
  }
  return size;
}

/** Números pseudoaleatorios fijos por nombre: el confeti sale igual cada vez */
function seeded(text: string) {
  let seed = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function drawCake(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const layer = (top: number, width: number, height: number, color: string) => {
    ctx.beginPath();
    ctx.roundRect(x + (300 - width) / 2, top, width, height, 18);
    ctx.fillStyle = color;
    ctx.fill();
  };
  layer(y + 150, 300, 110, '#10b981');
  layer(y + 70, 230, 95, '#fbbf24');
  // Glaseado
  ctx.fillStyle = '#f4f4f5';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + 55 + i * 38, y + 72, 19, 0, Math.PI);
    ctx.fill();
  }
  // Velas y llamas
  for (const dx of [105, 150, 195]) {
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(x + dx - 7, y + 10, 14, 60);
    ctx.beginPath();
    ctx.ellipse(x + dx, y - 6, 9, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }
}

export async function drawBirthdayFlyer(canvas: HTMLCanvasElement, persona: Cumpleanero) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await Promise.all(['900 40px Outfit', '800 40px Outfit', '700 40px Outfit'].map((font) => document.fonts.load(font).catch(() => undefined)));
  const [logo, art] = await Promise.all([loadImage('/images/branding/logo-emerald-city-256.png'), loadImage(artworkUrl(persona.pokemon, persona.shiny))]);

  // Fondo con brillos
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  };
  glow(100, 80, 760, 'rgba(16, 185, 129, 0.32)');
  glow(WIDTH, 700, 700, 'rgba(245, 158, 11, 0.22)');
  glow(200, HEIGHT, 600, 'rgba(236, 72, 153, 0.14)');

  // Confeti
  const random = seeded(persona.entrenador);
  const colors = ['#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#f4f4f5'];
  for (let i = 0; i < 70; i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    // Sin confeti encima de los textos: encabezado y título, nombre y código, pie
    if ((x < 680 && y < 500) || (y > 870 && y < 1220) || y > 1240) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.globalAlpha = 0.35 + random() * 0.5;
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    if (random() > 0.5) ctx.fillRect(-9, -4, 18, 8);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, 5 + random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Encabezado
  if (logo) ctx.drawImage(logo, 60, 50, (logo.width / logo.height) * 120, 120);
  ctx.font = '900 44px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('EMERALD', 190, 106);
  ctx.fillStyle = '#34d399';
  ctx.fillText('CITY', 190 + ctx.measureText('EMERALD').width + 4, 106);
  ctx.font = '700 22px Outfit, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('COMUNIDAD POKÉMON GO · CARACAS', 192, 142);

  // Título
  ctx.font = '900 96px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('¡FELIZ', 60, 300);
  ctx.fillStyle = '#fbbf24';
  fit(ctx, 'CUMPLEAÑOS!', 900, 104, 500);
  ctx.fillText('CUMPLEAÑOS!', 60, 400);

  const [, month, day] = persona.fecha.slice(-10).split('-').map(Number);
  if (month && day) {
    ctx.font = '800 32px Outfit, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText(`${day} DE ${MONTH_NAMES[month - 1].toUpperCase()}`, 64, 460);
  }

  // Pokémon favorito con su halo
  ctx.beginPath();
  ctx.arc(790, 620, 250, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
  ctx.stroke();
  if (art) ctx.drawImage(art, 560, 390, 460, 460);

  // Velas de pastel dibujadas (un emoji se vería distinto en cada teléfono)
  drawCake(ctx, 70, 560);

  // Nombre de entrenador
  ctx.fillStyle = '#f4f4f5';
  const nameSize = fit(ctx, persona.entrenador, 900, 120, WIDTH - 120, 56);
  ctx.textAlign = 'center';
  ctx.fillText(persona.entrenador, WIDTH / 2, 960 + nameSize * 0.3);

  // Código de amistad
  if (persona.codigo) {
    ctx.beginPath();
    ctx.roundRect(140, 1040, WIDTH - 280, 150, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.stroke();
    ctx.font = '800 24px Outfit, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('CÓDIGO DE AMISTAD · ¡ENVÍALE UN REGALO!', WIDTH / 2, 1088);
    ctx.font = '900 64px Outfit, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(persona.codigo.replace(/(\d{4})(?=\d)/g, '$1 '), WIDTH / 2, 1162);
  } else {
    ctx.font = '700 34px Outfit, sans-serif';
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText('Toda la comunidad te desea un gran día 💚', WIDTH / 2, 1120);
  }
  ctx.textAlign = 'left';

  // Pie
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 1250);
  ctx.lineTo(WIDTH - 60, 1250);
  ctx.stroke();
  ctx.font = '700 26px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('Con cariño, Emerald City 💚', 60, 1302);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('@emeraldcityccs', WIDTH - 60, 1302);
  ctx.textAlign = 'left';
}

/** Mensaje para el grupo; con el teléfono, lo etiqueta (@584121234567) */
export function birthdayMessage(persona: Cumpleanero, telefono = ''): string {
  const who = telefono ? `@${telefono} (*${persona.entrenador}*)` : `*${persona.entrenador}*`;
  return `🎂 ¡Hoy está de cumpleaños ${who}! Toda la comunidad de Emerald City te desea un día lleno de shinies 💚${
    persona.codigo ? `\nEnvíale un regalo: ${persona.codigo.replace(/(\d{4})(?=\d)/g, '$1 ')}` : ''
  }`;
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'),
  );
}
