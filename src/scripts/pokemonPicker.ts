/**
 * Campo de texto para elegir un Pokémon por su nombre en español, con sugerencias mientras
 * se escribe (lista de public/data/pokemon.json).
 */
let names: Promise<[number, string][]> | null = null;

export function pokemonList(): Promise<[number, string][]> {
  names ??= fetch('/data/pokemon.json')
    .then((res) => res.json())
    .catch(() => {
      names = null;
      return [];
    });
  return names;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Llena las sugerencias del campo (un <datalist> con ese id) */
export async function setupPokemonInput(datalist: HTMLDataListElement) {
  if (datalist.childElementCount) return;
  const list = await pokemonList();
  datalist.replaceChildren(...list.map(([, name]) => new Option(name)));
}

/** Número del Pokémon escrito: null si está vacío, undefined si no existe */
export async function pokemonNumber(text: string): Promise<number | null | undefined> {
  const wanted = normalize(text);
  if (!wanted) return null;
  if (/^\d+$/.test(wanted)) {
    const number = Number(wanted);
    return number >= 1 && number <= 1025 ? number : undefined;
  }
  return (await pokemonList()).find(([, name]) => normalize(name) === wanted)?.[0];
}

export async function pokemonName(number: number | null): Promise<string> {
  if (!number) return '';
  return (await pokemonList()).find(([n]) => n === number)?.[1] ?? String(number);
}

const letters = (text: string) => normalize(text).replace(/[^a-z0-9]+/g, ' ').trim();

/** Distancia de edición (cuántas letras hay que cambiar), para perdonar errores de tipeo */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Pokémon escrito a mano en una hoja: "Charizard shiny", "mi favorito es gengar",
 * "Pikahu", "#25". Busca el nombre exacto, luego un nombre dentro del texto y por último
 * el más parecido (hasta 1 letra de diferencia, 2 en nombres largos). Si hay varios, el primero.
 */
export async function findPokemonInText(text: string): Promise<number | null> {
  const clean = letters(text);
  if (!clean) return null;
  const number = clean.match(/^(\d{1,4})$/) ?? clean.match(/^n\s?(\d{1,4})$/);
  if (number) return Number(number[1]) >= 1 && Number(number[1]) <= 1025 ? Number(number[1]) : null;

  const list = (await pokemonList()).map(([n, name]) => [n, letters(name)] as const);
  const exact = list.find(([, name]) => name === clean);
  if (exact) return exact[0];

  // Nombre completo dentro del texto; si hay varios, el que aparece primero
  const padded = ` ${clean} `;
  const inside = list
    .filter(([, name]) => name.length >= 3 && padded.includes(` ${name} `))
    .sort((a, b) => padded.indexOf(` ${a[1]} `) - padded.indexOf(` ${b[1]} `) || b[1].length - a[1].length);
  if (inside.length) return inside[0][0];

  // Errores de tipeo, palabra por palabra
  for (const word of clean.split(' ').filter((w) => w.length >= 4)) {
    let best: { n: number; d: number } | null = null;
    for (const [n, name] of list) {
      if (Math.abs(name.length - word.length) > 2) continue;
      const d = distance(word, name);
      if (d <= (word.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { n, d };
    }
    if (best) return best.n;
  }
  return null;
}
