/**
 * Misiones de Wild Area (del documento "Misiones para el Pre-Wild Area y Wild Area").
 * Siete días seguidos desde el lunes que elige el administrador. Cada misión se completa
 * con "¡Lo logré!" y la valida el administrador en persona.
 *
 * Números de las ilustraciones (PokeAPI): Zacian Espada Suprema 10188, Zamazenta Escudo
 * Supremo 10189, Duraludon Gigamax 10225, Kyurem Negro 10022, Kyurem Blanco 10023.
 */

export const WILD_AREA_NAMES = ['La Cacería Formidable', 'El Despertar de Duraludon', 'Lluvia del Área Silvestre', 'Ascenso Rascacielos'];

// Lunes a viernes: los Pokémon del día (incursiones y combates Max) y el huevo exclusivo
const WEEKDAYS = [
  { jefes: 'Ralts Dinamax y/o Zacian', pokemon: [280, 10188], huevo: '2 km' },
  { jefes: 'Machop Dinamax y/o Zamazenta', pokemon: [66, 10189], huevo: '5 km' },
  { jefes: 'Registeel Dinamax', pokemon: [379], huevo: '7 km' },
  { jefes: 'Regidrago Dinamax', pokemon: [895], huevo: '10 km' },
  { jefes: 'Latias y/o Latios Dinamax', pokemon: [380, 381], huevo: '12 km' },
];

// Sábado y domingo: los días del Wild Area
const WEEKEND = [
  { jefes: 'Duraludon Gigamax, Dialga Dinamax, Machamp con chaqueta, Zekrom o Kyurem Blanco', pokemon: [10225, 483, 68, 644, 10023] },
  { jefes: 'Duraludon Gigamax, Palkia Dinamax, Machamp con chaqueta, Reshiram o Kyurem Negro', pokemon: [10225, 484, 68, 643, 10022] },
];

const EGG = 0; // sin Pokémon: la página muestra un huevo

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function wildAreaTemplate(nombre, lunes) {
  const retos = [];
  WEEKDAYS.forEach((dia, i) => {
    const date = addDays(lunes, i);
    const base = { inicio: date, fin: date, pokemon: dia.pokemon, grupo: `Pokémon del día: ${dia.jefes}` };
    // De miércoles a viernes, límite 1 (pedido del administrador, 10 nov 2026)
    const limite = i >= 2 ? 1 : 2;
    retos.push(
      { ...base, titulo: `Captura un shiny de ${dia.jefes}`, puntos: 1, limite },
      { ...base, titulo: `Captura un hundo (100 %) de ${dia.jefes}`, puntos: 2, limite },
      { ...base, titulo: `Consigue un fondo de ${dia.jefes}`, puntos: 1, limite },
      { inicio: date, fin: date, pokemon: [EGG], grupo: 'Misión exclusiva del día', titulo: `Eclosiona un huevo de ${dia.huevo}`, puntos: 1, limite: 1 },
    );
  });
  WEEKEND.forEach((dia, i) => {
    const date = addDays(lunes, 5 + i);
    const raid = { inicio: date, fin: date, pokemon: dia.pokemon, grupo: 'Incursiones', descripcion: `De ${dia.jefes}.` };
    const mighty = { inicio: date, fin: date, pokemon: [10225], grupo: 'Pokémon formidables' };
    const eggs = { inicio: date, fin: date, pokemon: [EGG], grupo: 'Otros' };
    retos.push(
      { ...raid, titulo: 'Captura un shiny de incursión', puntos: 1, limite: 3 },
      { ...raid, titulo: 'Captura un hundo (100 %) de incursión', puntos: 2, limite: 3 },
      { ...raid, titulo: 'Consigue un fondo de incursión', puntos: 1, limite: 3 },
      { ...mighty, titulo: 'Captura un Pokémon formidable shiny', puntos: 2, limite: null },
      { ...mighty, titulo: 'Captura un Pokémon formidable hundo (100 %)', puntos: 1, limite: null },
      { ...eggs, titulo: 'Eclosiona un shiny de los huevos de 10 km', puntos: 1, limite: 2 },
      { ...eggs, titulo: 'Eclosiona un hundo (100 %) de los huevos de 10 km', puntos: 2, limite: 2 },
    );
  });
  // Una sola vez en todo el fin de semana
  retos.push({
    inicio: addDays(lunes, 5),
    fin: addDays(lunes, 6),
    pokemon: [201],
    grupo: 'Misión especial del fin de semana',
    titulo: 'Completa la palabra "WILD" con Unown shiny',
    descripcion: 'Vale una sola vez en todo el fin de semana.',
    puntos: 5,
    limite: 1,
  });
  return {
    nombre,
    descripcion: 'Misiones diarias del Pre-Wild Area y Wild Area para los miembros de Escama Esmeralda. Marca "¡Lo logré!", muéstraselo al admin en la quedada y suma puntos.',
    inicio: lunes,
    fin: addDays(lunes, 6),
    retos,
  };
}
