/**
 * Emerald City · Conexión entre la web y la hoja de registros.
 *
 * Se pega en la hoja de Google (Extensiones → Apps Script) y se publica como
 * "Aplicación web". La web le envía los registros del formulario /unirse, le pide
 * la lista pública de "Haz amigos" y las bienvenidas pendientes del panel.
 *
 * Los registros de la web se agregan en la MISMA pestaña donde llegaban las respuestas
 * del Google Form: el script reconoce sus columnas por el título (entrenador, código,
 * edad…) y agrega al final solo las columnas que falten. Así "Haz amigos" incluye a
 * todos los miembros, también a los que se registraron con el formulario anterior.
 *
 * Para ver qué columna reconoció para cada dato: elige la función revisarColumnas
 * arriba y pulsa Ejecutar; el resultado sale en el registro de ejecución.
 *
 * Instrucciones completas en apps-script/README.md.
 */

// Debe ser igual a la variable APPS_SCRIPT_SECRET de Vercel. Cámbiala por una frase larga.
const SECRET = 'CAMBIA-ESTA-CLAVE';

// Pestaña donde están los miembros. Vacío = la pestaña de respuestas del formulario
// (la que tiene la columna "Marca temporal"), o la primera pestaña.
const SHEET_NAME = '';

const FOLDER_NAME = 'Emerald City · Capturas de perfil';
const LEGACY_WELCOME = 'Antes de la web';

/**
 * Datos que maneja la web. `match` reconoce la columna por su título (sin tildes ni
 * mayúsculas); si ninguna coincide, se crea una columna nueva con `header`.
 */
const FIELDS = [
  { key: 'fecha', header: 'Marca temporal', match: (h) => /marca temporal|timestamp|^fecha$/.test(h) },
  { key: 'campfireNombre', header: 'Nombre en Campfire', match: (h) => h.includes('campfire') && /nombre|usuario|user|nick/.test(h) },
  { key: 'campfire', header: '¿Tiene Campfire?', match: (h) => h.includes('campfire') },
  { key: 'entrenador', header: 'Nombre de entrenador', match: (h) => /entrenador|trainer|nick/.test(h) && !h.includes('codigo') },
  { key: 'nombre', header: 'Nombre y apellido', match: (h) => /apellido|nombre completo|^nombre$/.test(h) },
  { key: 'codigo', header: 'Código de amistad', match: (h) => /codigo|friend code/.test(h) },
  { key: 'ciudad', header: 'Ciudad o país', match: (h) => /ciudad|pais|zona|ubicacion|donde/.test(h) },
  { key: 'edad', header: 'Edad', match: (h) => /edad/.test(h) },
  { key: 'captura', header: 'Captura de perfil', match: (h) => /captura|foto|imagen|screenshot|perfil/.test(h) },
  { key: 'mostrar', header: 'Aparece en "Haz amigos"', match: (h) => h.includes('haz amigos') },
  { key: 'bienvenida', header: 'Bienvenida enviada', match: (h) => h.includes('bienvenida') },
  { key: 'id', header: 'ID web', match: (h) => h === 'id web' },
];

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

// ---------- Hoja y columnas ----------

function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function sheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (SHEET_NAME) {
    const named = book.getSheetByName(SHEET_NAME);
    if (!named) throw new Error(`No existe la pestaña "${SHEET_NAME}".`);
    return named;
  }
  const tabs = book.getSheets();
  const formTab = tabs.find((tab) => {
    const first = tab.getLastColumn() ? tab.getRange(1, 1).getValue() : '';
    return /marca temporal|timestamp/.test(normalize(first));
  });
  return formTab || tabs[0];
}

/**
 * Devuelve { campo: número de columna (desde 0) } y crea las columnas que falten.
 * Cuando crea "Bienvenida enviada", marca a los miembros que ya estaban para que
 * no aparezcan como bienvenidas pendientes.
 */
function columns(tab) {
  const lastColumn = tab.getLastColumn();
  const headers = lastColumn ? tab.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalize) : [];
  const map = {};
  const used = new Set();
  for (const field of FIELDS) {
    const index = headers.findIndex((h, i) => h && !used.has(i) && field.match(h));
    if (index >= 0) {
      map[field.key] = index;
      used.add(index);
    }
  }

  for (const field of FIELDS) {
    if (map[field.key] !== undefined) continue;
    const index = tab.getLastColumn();
    tab.getRange(1, index + 1).setValue(field.header);
    map[field.key] = index;
    const existingRows = tab.getLastRow() - 1;
    if (field.key === 'bienvenida' && existingRows > 0) {
      tab.getRange(2, index + 1, existingRows, 1).setValue(LEGACY_WELCOME);
    }
  }
  return map;
}

function rows() {
  const tab = sheet();
  const col = columns(tab);
  const values = tab.getDataRange().getValues();
  const list = values.slice(1).map((row, i) => ({ row, line: i + 2 }));
  return { tab, col, list };
}

/** Los códigos guardados como número pierden los ceros iniciales: se recuperan */
function cleanCode(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 0 && digits.length < 12 ? digits.padStart(12, '0') : digits;
}

function folder() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

/** Acepta enlaces de Drive de la web (/d/ID/) y del Google Form (?id=ID) */
function fileIdFromUrl(url) {
  const match = String(url).match(/\/d\/([^/?]+)|[?&]id=([^&]+)/);
  return match ? match[1] || match[2] : null;
}

// ---------- Acciones ----------

function registrar(registro) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { tab, col, list } = rows();
    const code = String(registro.codigo);
    if (list.some(({ row }) => cleanCode(row[col.codigo]) === code)) {
      return { error: 'Ese código de amistad ya está registrado en la comunidad.', duplicado: true };
    }

    const id = Utilities.getUuid().slice(0, 8);
    const blob = Utilities.newBlob(Utilities.base64Decode(registro.captura), 'image/jpeg', `${registro.entrenador}-${id}.jpg`);
    const file = folder().createFile(blob);

    const values = {
      fecha: new Date(),
      entrenador: registro.entrenador,
      nombre: registro.nombre,
      ciudad: registro.ciudad,
      // Como texto, para que la hoja no lo convierta en número
      codigo: `'${code.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}`,
      campfire: registro.campfire ? 'Sí' : 'No',
      campfireNombre: registro.campfireNombre || '',
      edad: registro.edad,
      captura: file.getUrl(),
      mostrar: registro.mostrarEnAmigos ? 'Sí' : 'No',
      bienvenida: '',
      id,
    };
    const row = new Array(tab.getLastColumn()).fill('');
    for (const key of Object.keys(values)) row[col[key]] = values[key];
    tab.appendRow(row);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lista pública: nombre de entrenador, código y ciudad. Incluye a los miembros del
 * formulario anterior; se ocultan quienes tengan "No" en "Aparece en Haz amigos".
 */
function amigos() {
  const { col, list } = rows();
  return list
    .filter(({ row }) => normalize(row[col.mostrar]) !== 'no' && cleanCode(row[col.codigo]).length === 12)
    .map(({ row }) => ({
      entrenador: String(row[col.entrenador]).trim(),
      codigo: cleanCode(row[col.codigo]),
      ciudad: String(row[col.ciudad] || '').trim(),
    }))
    .filter((amigo) => amigo.entrenador)
    .reverse();
}

function bienvenidas() {
  const { col, list } = rows();
  return list
    .filter(({ row }) => row[col.id] && !row[col.bienvenida])
    .map(({ row }) => ({
      id: String(row[col.id]),
      fecha: new Date(row[col.fecha]).toISOString(),
      entrenador: String(row[col.entrenador]),
      nombre: String(row[col.nombre]),
      ciudad: String(row[col.ciudad] || ''),
    }))
    .reverse();
}

function findById(id) {
  const data = rows();
  const match = data.list.find(({ row }) => String(row[data.col.id]) === String(id));
  if (!match) throw new Error('No se encontró ese registro.');
  return { ...data, ...match };
}

function captura(id) {
  const { row, col } = findById(id);
  const fileId = fileIdFromUrl(row[col.captura]);
  if (!fileId) throw new Error('El registro no tiene captura.');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { tipo: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function marcarBienvenida(id) {
  const { tab, col, line } = findById(id);
  tab.getRange(line, col.bienvenida + 1).setValue(new Date());
  return { ok: true };
}

/** Ejecútala desde el editor para ver qué columna usa el script para cada dato */
function revisarColumnas() {
  const tab = sheet();
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
  const col = columns(tab);
  const lines = FIELDS.map((f) => `${f.header} → columna ${col[f.key] + 1}: "${headers[col[f.key]] ?? f.header}"`);
  Logger.log(`Pestaña: ${tab.getName()}\n${lines.join('\n')}\nMiembros en Haz amigos: ${amigos().length}`);
}
