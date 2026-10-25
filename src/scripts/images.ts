const MAX_SIDE = 1600;
// Vercel acepta hasta 4.5 MB por petición; el base64 ocupa un 33% más que la imagen
const MAX_UPLOAD_BYTES = 2.8 * 1024 * 1024;

/** Reduce la imagen a 1600 px y la convierte a JPEG para que suba rápido */
export async function compressImage(file: File): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length * 0.75 <= MAX_UPLOAD_BYTES) return { base64, dataUrl };
  }
  throw new Error('La imagen es demasiado pesada. Prueba con una más pequeña.');
}
