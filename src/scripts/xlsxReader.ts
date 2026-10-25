/**
 * Lee la primera hoja de un archivo de Excel (.xlsx) como filas de texto, sin librerías
 * externas: un .xlsx es un ZIP con XML, que el navegador descomprime con DecompressionStream.
 */

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('El archivo no parece un Excel (.xlsx) válido.');

  const entries = new Map<string, ZipEntry>();
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipFile(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
  const data = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('El Excel usa una compresión que no podemos leer. Descárgalo como CSV.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

/** "C12" → 2 (columna desde 0) */
function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export async function readXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = readZipDirectory(bytes);

  // Ruta de la primera hoja según el libro
  const workbook = parseXml((await readZipFile(bytes, entries, 'xl/workbook.xml')) ?? '');
  const firstSheet = workbook.getElementsByTagName('sheet')[0];
  const relId = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = parseXml((await readZipFile(bytes, entries, 'xl/_rels/workbook.xml.rels')) ?? '<Relationships/>');
  const target = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === relId)?.getAttribute('Target');
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target}`) : 'xl/worksheets/sheet1.xml';
  const sheetXml = await readZipFile(bytes, entries, sheetPath);
  if (!sheetXml) throw new Error('No encontramos la hoja dentro del Excel.');

  const sharedXml = await readZipFile(bytes, entries, 'xl/sharedStrings.xml');
  const shared = sharedXml
    ? Array.from(parseXml(sharedXml).getElementsByTagName('si')).map((si) =>
        Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''),
      )
    : [];

  const rows: string[][] = [];
  for (const row of Array.from(parseXml(sheetXml).getElementsByTagName('row'))) {
    const values: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach((cell, position) => {
      const ref = cell.getAttribute('r');
      const index = ref ? columnIndex(ref) : position;
      const type = cell.getAttribute('t');
      const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      let value = raw;
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = Array.from(cell.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      else if (type === 'b') value = raw === '1' ? 'Sí' : 'No';
      // Números largos (como códigos de amistad) a veces vienen en notación científica
      else if (!type && /e/i.test(raw) && Number.isFinite(Number(raw))) value = String(Math.round(Number(raw)));
      values[index] = value;
    });
    rows.push(Array.from(values, (v) => v ?? ''));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}
