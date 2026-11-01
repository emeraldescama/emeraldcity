/**
 * Genera public/data/pokemon.json: [número, nombre en español] de cada Pokémon, para elegir
 * el ícono del perfil. Se corre a mano cuando salen Pokémon nuevos:
 *   node scripts/pokemon-nombres.mjs
 */
import { writeFileSync } from 'node:fs';

const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const SPANISH = '7';

const res = await fetch(CSV);
if (!res.ok) throw new Error(`No se pudo leer la lista de Pokémon (${res.status})`);
const names = [];
for (const row of (await res.text()).split('\n').slice(1)) {
  const [id, language, name] = row.split(',');
  if (language === SPANISH && name) names.push([Number(id), name]);
}
names.sort((a, b) => a[0] - b[0]);
writeFileSync(new URL('../public/data/pokemon.json', import.meta.url), JSON.stringify(names));
console.log(`${names.length} Pokémon`);
