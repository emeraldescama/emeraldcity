/**
 * Dibuja el flyer de bienvenida (1080x1350) de un entrenador nuevo, con la captura
 * de su perfil en el juego. Solo se usa en el panel de administración.
 */
const WIDTH = 1080;
const HEIGHT = 1350;

export interface NuevoEntrenador {
  entrenador: string;
  ciudad: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Ajusta el tamaño de letra para que el texto quepa en el ancho dado */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, maxSize: number, maxWidth: number): number {
  let size = maxSize;
  ctx.font = `${weight} ${size}px Outfit, sans-serif`;
  while (size > 28 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px Outfit, sans-serif`;
  }
  return size;
}

export async function drawWelcomeFlyer(canvas: HTMLCanvasElement, nuevo: NuevoEntrenador, screenshotUrl: string) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await Promise.all(
    ['900 40px Outfit', '800 40px Outfit', '700 40px Outfit'].map((font) => document.fonts.load(font).catch(() => undefined)),
  );
  const [logo, screenshot] = await Promise.all([loadImage('/images/branding/logo-emerald-city-256.png'), loadImage(screenshotUrl)]);

  // Fondo
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  };
  glow(120, 120, 760, 'rgba(16, 185, 129, 0.3)');
  glow(WIDTH, HEIGHT, 700, 'rgba(245, 158, 11, 0.16)');
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.06)';
  for (let x = 0; x <= WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  // Encabezado
  if (logo) {
    const h = 130;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, 60, 50, w, h);
  }
  ctx.font = '900 44px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('EMERALD', 190, 110);
  ctx.fillStyle = '#34d399';
  ctx.fillText('CITY', 190 + ctx.measureText('EMERALD').width + 4, 110);
  ctx.font = '700 22px Outfit, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('COMUNIDAD POKÉMON GO · CARACAS', 192, 146);

  // Título
  ctx.font = '900 84px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('¡TE DAMOS LA', 60, 300);
  ctx.fillStyle = '#34d399';
  ctx.fillText('BIENVENIDA!', 60, 390);

  // Captura del perfil, en un marco tipo teléfono
  const frame = { x: 60, y: 450, w: 400, h: 760 };
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 36);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.clip();
  if (screenshot) {
    const scale = Math.max(frame.w / screenshot.width, frame.h / screenshot.height);
    const sw = frame.w / scale;
    const sh = frame.h / scale;
    ctx.drawImage(screenshot, (screenshot.width - sw) / 2, 0, sw, Math.min(sh, screenshot.height), frame.x, frame.y, frame.w, frame.h);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 36);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Datos del entrenador
  const textX = 510;
  const textW = WIDTH - textX - 60;
  ctx.font = '800 28px Outfit, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('NUEVO ENTRENADOR', textX, 560);
  const nameSize = fitText(ctx, nuevo.entrenador, 900, 88, textW);
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText(nuevo.entrenador, textX, 560 + nameSize + 10);

  let y = 560 + nameSize + 80;
  if (nuevo.ciudad) {
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(textX + 10, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    fitText(ctx, nuevo.ciudad, 700, 34, textW - 34);
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText(nuevo.ciudad, textX + 34, y);
    y += 90;
  }

  ctx.font = '700 32px Outfit, sans-serif';
  ctx.fillStyle = '#d4d4d8';
  for (const line of ['Ya eres parte de', 'Emerald City.', 'Nos vemos en la', 'próxima quedada.']) {
    ctx.fillText(line, textX, y);
    y += 46;
  }

  // Pie
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 1262);
  ctx.lineTo(WIDTH - 60, 1262);
  ctx.stroke();
  ctx.font = '700 26px Outfit, sans-serif';
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText('Más información: WhatsApp +58 422 2292700', 60, 1308);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('@emeraldcityccs', WIDTH - 60, 1308);
  ctx.textAlign = 'left';
}

export function welcomeText(nuevo: NuevoEntrenador): string {
  return `¡Démosle la bienvenida a *${nuevo.entrenador}*${nuevo.ciudad ? ` (${nuevo.ciudad})` : ''} a Emerald City! 💚 Ya eres parte de la comunidad, nos vemos en la próxima quedada.`;
}
