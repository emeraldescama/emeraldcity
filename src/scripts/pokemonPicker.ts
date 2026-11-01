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
