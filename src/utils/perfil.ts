/** Datos y ayudas compartidas por la cuenta, el foro y el panel */

export type Equipo = '' | 'instinto' | 'sabiduria' | 'valor';

export const TEAM_NAMES: Record<Exclude<Equipo, ''>, string> = {
  instinto: 'Instinto',
  sabiduria: 'Sabiduría',
  valor: 'Valor',
};

export const TEAM_COLORS: Record<Exclude<Equipo, ''>, string> = {
  instinto: '#facc15',
  sabiduria: '#3b82f6',
  valor: '#ef4444',
};

export const CATEGORY_NAMES: Record<string, string> = {
  general: 'General',
  intercambios: 'Intercambios',
  incursiones: 'Incursiones y quedadas',
  eventos: 'Eventos',
};

export const CATEGORY_HINTS: Record<string, string> = {
  general: 'Preséntate, conversa y comparte tus capturas.',
  intercambios: 'Busca intercambios con suerte, shinies y Pokémon regionales.',
  incursiones: 'Organiza incursiones, horas legendarias y quedadas.',
  eventos: 'Comenta los eventos del juego y de la comunidad.',
};

/** Ícono del perfil: sprite oficial del Pokémon (96 px, pesa 1–3 KB) */
export function avatarUrl(number: number, shiny = false): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? 'shiny/' : ''}${number}.png`;
}

/** "hace 5 min", "hace 2 h", "3 nov" */
export function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 7 * 86400) return `hace ${Math.floor(seconds / 86400)} d`;
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
}
