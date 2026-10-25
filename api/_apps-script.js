/**
 * Llamadas al Apps Script de la hoja de registros (ver apps-script/README.md).
 * Los archivos de api/ que empiezan con "_" no se publican como rutas en Vercel.
 *
 * Variables de entorno: APPS_SCRIPT_URL y APPS_SCRIPT_SECRET.
 */
export class AppsScriptError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function appsScriptConfigured() {
  return Boolean(process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_SECRET);
}

export async function callAppsScript(action, payload = {}) {
  if (!appsScriptConfigured()) {
    throw new AppsScriptError(500, 'Falta configurar APPS_SCRIPT_URL y APPS_SCRIPT_SECRET en Vercel.');
  }
  // text/plain evita que Google rechace la petición; el script lee el cuerpo como JSON
  const res = await fetch(process.env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.APPS_SCRIPT_SECRET, action, ...payload }),
    redirect: 'follow',
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppsScriptError(502, 'La hoja de registros no respondió correctamente.');
  }
  if (data.error) throw new AppsScriptError(data.duplicado ? 409 : 502, data.error);
  return data;
}
