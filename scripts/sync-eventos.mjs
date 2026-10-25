/**
 * Publica automáticamente los eventos oficiales de Pokémon GO con las reglas de Emerald City.
 *
 * Lee el calendario público de LeekDuck (vía ScrapedDuck), elige los eventos en los que la
 * comunidad se reúne y crea para cada uno su archivo en src/content/eventos/ y un flyer
 * con la temática de Emerald City en public/images/eventos/.
 *
 * Reglas de la comunidad:
 *   - Día de la Comunidad            → Parque del Este, 2:00 a 5:00 PM
 *   - Día de Incursiones             → Plaza Los Palos Grandes, 2:00 a 5:00 PM
 *   - Día Dinamax con legendario     → Plaza Los Palos Grandes, 2:00 a 5:00 PM
 *   - GO Tour, GO Fest y Wild Area   → Plaza Los Palos Grandes, desde las 10:00 AM (cada día)
 *
 * Nunca modifica un evento que ya existe (así se respetan los cambios hechos desde /admin) y
 * no vuelve a crear los que se eliminaron desde el panel (data/eventos-descartados.json).
 *
 * Uso: node scripts/sync-eventos.mjs   (lo ejecuta a diario .github/workflows/sync-eventos.yml)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json';
const EVENTS_DIR = join(ROOT, 'src/content/eventos');
const FLYERS_DIR = join(ROOT, 'public/images/eventos');
const DISCARDED_FILE = join(ROOT, 'data/eventos-descartados.json');
const DAYS_AHEAD = 35;

const PARQUE_DEL_ESTE = 'Parque del Este, Caracas';
const PALOS_GRANDES = 'Plaza Los Palos Grandes, Caracas';

// Legendarios y singulares: un día Dinamax solo cuenta si trae alguno de estos
const LEGENDARIES = `Articuno Zapdos Moltres Mewtwo Mew Raikou Entei Suicune Lugia Ho-Oh Celebi Regirock Regice
Registeel Latias Latios Kyogre Groudon Rayquaza Jirachi Deoxys Uxie Mesprit Azelf Dialga Palkia Heatran Regigigas
Giratina Cresselia Phione Manaphy Darkrai Shaymin Arceus Victini Cobalion Terrakion Virizion Tornadus Thundurus
Reshiram Zekrom Landorus Kyurem Keldeo Meloetta Genesect Xerneas Yveltal Zygarde Diancie Hoopa Volcanion Type:
Silvally Tapu Cosmog Cosmoem Solgaleo Lunala Necrozma Magearna Marshadow Zeraora Meltan Melmetal Zacian Zamazenta
Eternatus Kubfu Urshifu Zarude Regieleki Regidrago Glastrier Spectrier Calyrex Enamorus Wo-Chien Chien-Pao Ting-Lu
Chi-Yu Koraidon Miraidon Okidogi Munkidori Fezandipiti Ogerpon Terapagos Pecharunt Nihilego Buzzwole Pheromosa
Xurkitree Celesteela Kartana Guzzlord Poipole Naganadel Stakataka Blacephalon`.split(/\s+/);

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MONTH_NAMES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// ---------- Reglas ----------

function translateNames(text) {
  return text
    .replace(/\bShadow (\S+)/g, '$1 Oscuro')
    .replace(/\bSuper Mega\b/g, 'Súper Mega')
    .replace(/,? and /g, ' y ')
    .trim();
}

function isGlobal(name) {
  return /global/i.test(name);
}

/** Días (YYYY-MM-DD) que abarca un evento según su hora local */
function eventDays(start, end) {
  const days = [];
  const last = end.slice(0, 10);
  for (let day = start.slice(0, 10); day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Convierte un evento del calendario en los encuentros de Emerald City (uno por día) */
function toMeetups(source) {
  const { eventID, name, eventType, start, end, link } = source;
  const details = `Detalles oficiales del evento: ${link}`;

  if (eventType === 'community-day') {
    const classic = /classic/i.test(name);
    const pokemon = translateNames(name.replace(/Community Day( Classic)?/i, ''));
    return [{
      id: `auto-${eventID}`,
      type: 'Día de la Comunidad',
      title: `Día de la Comunidad${classic ? ' Clásico' : ''}${pokemon ? `: ${pokemon}` : ''}`,
      date: start.slice(0, 10),
      time: '14:00',
      hours: '2:00 – 5:00 PM',
      location: PARQUE_DEL_ESTE,
      description: `Día de la Comunidad oficial de Pokémon GO. Nos reunimos en el Parque del Este de 2:00 a 5:00 PM para jugar en grupo. ${details}`,
    }];
  }

  const isRaidDay = eventType === 'raid-day';
  const isLegendaryMax = eventType === 'max-battles' && LEGENDARIES.some((p) => new RegExp(`\\b${p}\\b`).test(name));
  if (isRaidDay || isLegendaryMax) {
    const subject = isRaidDay
      ? translateNames(name.replace(/Raid Day/i, ''))
      : translateNames(name.replace(/Max Battle Day/i, '').replace(/\b(Dynamax|Gigantamax) /g, ''));
    // "Chandelure Súper Mega" → "Día de Incursiones Súper Mega: Chandelure"
    const superMega = subject.includes('Súper Mega');
    const label = `Día de Incursiones${superMega ? ' Súper Mega' : ''}${isRaidDay ? '' : ' Dinamax'}`;
    const pokemon = subject.replace('Súper Mega', '').replace(/\s+/g, ' ').trim();
    return [{
      id: `auto-${eventID}`,
      type: 'Incursiones',
      title: pokemon ? `${label}: ${pokemon}` : label,
      date: start.slice(0, 10),
      time: '14:00',
      hours: '2:00 – 5:00 PM',
      location: PALOS_GRANDES,
      description: `Nos reunimos en la Plaza Los Palos Grandes de 2:00 a 5:00 PM para hacer las incursiones en grupo. ${details}`,
    }];
  }

  const bigEvents = { 'pokemon-go-tour': 'GO Tour', 'pokemon-go-fest': 'GO Fest', 'wild-area': 'Wild Area' };
  if (bigEvents[eventType] && isGlobal(name)) {
    const baseTitle = name.replace(/\s*[-–:•]\s*Global/i, '').replace(/\bGlobal\b/i, '').replace(/\s+/g, ' ').trim();
    const days = eventDays(start, end);
    return days.map((date, i) => ({
      id: `auto-${eventID}${days.length > 1 ? `-dia-${i + 1}` : ''}`,
      type: bigEvents[eventType],
      title: days.length > 1 ? `${baseTitle} · Día ${i + 1}` : baseTitle,
      flyerTitle: baseTitle,
      flyerLabel: days.length > 1 ? `${bigEvents[eventType]} · Día ${i + 1}` : undefined,
      date,
      time: '10:00',
      hours: 'Desde las 10:00 AM',
      location: PALOS_GRANDES,
      description: `Nos reunimos en la Plaza Los Palos Grandes desde las 10:00 AM. ${details}`,
    }));
  }

  return [];
}

// ---------- Flyer ----------

const asset = (file) => readFileSync(join(ROOT, 'scripts/assets', file)).toString('base64');
let assets;

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

/** Corta el título en líneas de un ancho aproximado (Outfit Black ≈ 0.58 em por carácter) */
function wrapTitle(title) {
  for (const size of [104, 92, 80, 68, 58]) {
    const maxChars = Math.floor(960 / (size * 0.58));
    const lines = [];
    let line = '';
    for (const word of title.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChars) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= 3 && lines.every((l) => l.length <= maxChars)) return { size, lines };
  }
  return { size: 58, lines: [title.slice(0, 30), `${title.slice(30, 57)}…`] };
}

function flyerSvg(meetup) {
  assets ??= { logo: asset('logo-200.png'), black: asset('outfit-900.woff2'), bold: asset('outfit-700.woff2') };
  const d = new Date(`${meetup.date}T12:00:00Z`);
  const dateLabel = `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} DE ${MONTH_NAMES[d.getUTCMonth()]}`;
  const accent = meetup.type === 'Día de la Comunidad' ? '#fbbf24' : '#34d399';
  const { size, lines } = wrapTitle(meetup.flyerTitle ?? meetup.title);
  const titleTop = 470;
  const titleText = lines
    .map((line, i) => `<text x="60" y="${titleTop + i * size * 1.08}" class="black" font-size="${size}" fill="#f4f4f5">${escapeXml(line)}</text>`)
    .join('');
  const typeLabel = escapeXml((meetup.flyerLabel ?? meetup.type).toUpperCase());
  const pillWidth = Math.round(typeLabel.length * 18.5 + 64);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs>
<style>
@font-face{font-family:'OutfitFlyer';font-weight:900;src:url(data:font/woff2;base64,${assets.black}) format('woff2')}
@font-face{font-family:'OutfitFlyer';font-weight:700;src:url(data:font/woff2;base64,${assets.bold}) format('woff2')}
text{font-family:'OutfitFlyer','Arial Black',Arial,sans-serif}
.black{font-weight:900}.bold{font-weight:700}
</style>
<radialGradient id="glowA" cx="0.1" cy="0.08" r="0.75"><stop offset="0" stop-color="#10b981" stop-opacity="0.32"/><stop offset="1" stop-color="#10b981" stop-opacity="0"/></radialGradient>
<radialGradient id="glowB" cx="1" cy="1" r="0.65"><stop offset="0" stop-color="#f59e0b" stop-opacity="0.18"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#10b981" stroke-opacity="0.07"/></pattern>
</defs>
<rect width="1080" height="1350" fill="#030712"/>
<rect width="1080" height="1350" fill="url(#grid)"/>
<rect width="1080" height="1350" fill="url(#glowA)"/>
<rect width="1080" height="1350" fill="url(#glowB)"/>
<circle cx="930" cy="330" r="250" fill="none" stroke="${accent}" stroke-opacity="0.16" stroke-width="34"/>
<path d="M680 330H1180" stroke="${accent}" stroke-opacity="0.16" stroke-width="34"/>
<circle cx="930" cy="330" r="62" fill="#030712" stroke="${accent}" stroke-opacity="0.3" stroke-width="20"/>
<image x="56" y="52" width="110" height="130" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${assets.logo}" href="data:image/png;base64,${assets.logo}"/>
<text x="186" y="112" class="black" font-size="46" fill="#f4f4f5">EMERALD<tspan fill="#34d399">CITY</tspan></text>
<text x="188" y="150" class="bold" font-size="22" fill="#fbbf24" letter-spacing="1.5">COMUNIDAD POKÉMON GO · CARACAS</text>
<rect x="60" y="300" width="${pillWidth}" height="58" rx="29" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.6" stroke-width="2"/>
<text x="92" y="339" class="black" font-size="28" fill="${accent}" letter-spacing="2">${typeLabel}</text>
${titleText}
<rect x="60" y="890" width="960" height="250" rx="32" fill="#0f172a" fill-opacity="0.9" stroke="#10b981" stroke-opacity="0.35" stroke-width="2"/>
<text x="104" y="960" class="black" font-size="40" fill="#fbbf24" letter-spacing="1">${escapeXml(dateLabel)}</text>
<text x="104" y="1032" class="black" font-size="54" fill="#f4f4f5">${escapeXml(meetup.hours)}</text>
<circle cx="117" cy="1090" r="11" fill="#34d399"/>
<text x="142" y="1101" class="bold" font-size="32" fill="#d4d4d8">${escapeXml(meetup.location)}</text>
<path d="M60 1240H1020" stroke="#10b981" stroke-opacity="0.4" stroke-width="2"/>
<text x="60" y="1296" class="bold" font-size="28" fill="#f4f4f5">Únete: WhatsApp +58 422 2292700</text>
<text x="1020" y="1296" class="bold" font-size="28" fill="#fbbf24" text-anchor="end">@emeraldcityccs</text>
</svg>
`;
}

// ---------- Sincronización ----------

function caracasToday() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function main() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`No se pudo leer el calendario (${res.status})`);
  const feed = await res.json();

  const discarded = new Set(existsSync(DISCARDED_FILE) ? JSON.parse(readFileSync(DISCARDED_FILE, 'utf8')) : []);
  const today = caracasToday();
  const limit = addDays(today, DAYS_AHEAD);
  const created = [];

  for (const source of feed) {
    for (const meetup of toMeetups(source)) {
      const id = meetup.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80);
      const jsonPath = join(EVENTS_DIR, `${id}.json`);
      if (meetup.date < today || meetup.date > limit || discarded.has(id) || existsSync(jsonPath)) continue;

      const flyer = `/images/eventos/${id}.svg`;
      writeFileSync(join(FLYERS_DIR, `${id}.svg`), flyerSvg(meetup));
      const { title, date, time, location, type, description } = meetup;
      writeFileSync(jsonPath, `${JSON.stringify({ title, date, time, location, type, description, flyer }, null, 2)}\n`);
      created.push(`${date} ${time}  ${title}  (${location})`);
    }
  }

  console.log(created.length ? `Eventos nuevos:\n${created.join('\n')}` : 'No hay eventos nuevos.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
