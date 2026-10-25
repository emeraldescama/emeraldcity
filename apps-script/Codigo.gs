/**
 * Emerald City · Conexión entre la web y la hoja de registros.
 *
 * Se pega en la hoja de Google (Extensiones → Apps Script) y se publica como
 * "Aplicación web". La web le envía los registros del formulario /unirse, le pide
 * la lista pública de "Haz amigos" y las bienvenidas pendientes del panel.
 *
 * Instrucciones completas en apps-script/README.md.
 */

// Debe ser igual a la variable APPS_SCRIPT_SECRET de Vercel. Cámbiala por una frase larga.
const SECRET = 'CAMBIA-ESTA-CLAVE';

const SHEET_NAME = 'Registro web';
const FOLDER_NAME = 'Emerald City · Capturas de perfil';
const HEADERS = [
  'Fecha',
  'ID',
  'Nombre de entrenador',
  'Nombre y apellido',
  'Ciudad o país',
  'Código de amistad',
  '¿Tiene Campfire?',
  'Nombre en Campfire',
  'Edad',
  'Aparece en "Haz amigos"',
  'Captura de perfil',
  'Bienvenida enviada',
];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ error: 'Petición no válida.' });
  }
  if (request.secret !== SECRET) return json({ error: 'No autorizado.' });

  try {
    switch (request.action) {
      case 'registrar':
        return json(registrar(request.registro));
      case 'amigos':
        return json({ amigos: amigos() });
      case 'bienvenidas':
        return json({ bienvenidas: bienvenidas() });
      case 'captura':
        return json(captura(request.id));
      case 'marcarBienvenida':
        return json(marcarBienvenida(request.id));
      default:
        return json({ error: 'Acción desconocida.' });
    }
  } catch (err) {
    return json({ error: err.message || String(err) });
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let tab = book.getSheetByName(SHEET_NAME);
  if (!tab) {
    tab = book.insertSheet(SHEET_NAME);
    tab.appendRow(HEADERS);
    tab.setFrozenRows(1);
    tab.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return tab;
}

function rows() {
  const values = sheet().getDataRange().getValues();
  return values.slice(1).map((row, i) => ({ row, line: i + 2 }));
}

function folder() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function fileIdFromUrl(url) {
  const match = String(url).match(/\/d\/([^/]+)/);
  return match ? match[1] : null;
}

function registrar(registro) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const code = String(registro.codigo);
    const exists = rows().some(({ row }) => String(row[COL['Código de amistad']]).replace(/\D/g, '') === code);
    if (exists) return { error: 'Ese código de amistad ya está registrado en la comunidad.', duplicado: true };

    const id = Utilities.getUuid().slice(0, 8);
    const blob = Utilities.newBlob(Utilities.base64Decode(registro.captura), 'image/jpeg', `${registro.entrenador}-${id}.jpg`);
    const file = folder().createFile(blob);

    sheet().appendRow([
      new Date(),
      id,
      registro.entrenador,
      registro.nombre,
      registro.ciudad,
      // Como texto, para que la hoja no lo convierta en número
      `'${code.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}`,
      registro.campfire ? 'Sí' : 'No',
      registro.campfireNombre || '',
      registro.edad,
      registro.mostrarEnAmigos ? 'Sí' : 'No',
      file.getUrl(),
      '',
    ]);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

/** Lista pública: solo nombre de entrenador, código y ciudad de quienes aceptaron aparecer */
function amigos() {
  return rows()
    .filter(({ row }) => row[COL['Aparece en "Haz amigos"']] === 'Sí' && row[COL['Código de amistad']])
    .map(({ row }) => ({
      entrenador: String(row[COL['Nombre de entrenador']]),
      codigo: String(row[COL['Código de amistad']]).replace(/\D/g, ''),
      ciudad: String(row[COL['Ciudad o país']]),
    }))
    .reverse();
}

function bienvenidas() {
  return rows()
    .filter(({ row }) => !row[COL['Bienvenida enviada']])
    .map(({ row }) => ({
      id: String(row[COL['ID']]),
      fecha: new Date(row[COL['Fecha']]).toISOString(),
      entrenador: String(row[COL['Nombre de entrenador']]),
      nombre: String(row[COL['Nombre y apellido']]),
      ciudad: String(row[COL['Ciudad o país']]),
    }))
    .reverse();
}

function findById(id) {
  const match = rows().find(({ row }) => String(row[COL['ID']]) === String(id));
  if (!match) throw new Error('No se encontró ese registro.');
  return match;
}

function captura(id) {
  const { row } = findById(id);
  const fileId = fileIdFromUrl(row[COL['Captura de perfil']]);
  if (!fileId) throw new Error('El registro no tiene captura.');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { tipo: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function marcarBienvenida(id) {
  const { line } = findById(id);
  sheet().getRange(line, COL['Bienvenida enviada'] + 1).setValue(new Date());
  return { ok: true };
}
