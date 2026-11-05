/**
 * Notas de actualización para el público. Cada vez que la página cambia de forma visible
 * para los miembros, se agrega una entrada al comienzo de esta lista (la más reciente
 * primero). El panel (pestaña Novedades) dibuja con ellas un flyer para compartir.
 *
 * "ejemplo" elige el dibujo que acompaña a cada novedad en el flyer:
 *   likes · mencion · avisos · wildarea · registro · escama · cumple · amigos · foro · emoji
 */
export type Ejemplo = 'likes' | 'mencion' | 'avisos' | 'wildarea' | 'registro' | 'escama' | 'cumple' | 'amigos' | 'foro' | 'emoji';

export interface Novedad {
  titulo: string;
  texto: string;
  ejemplo: Ejemplo;
  /** Para "emoji": el emoji grande que se dibuja */
  emoji?: string;
  /** Dónde verlo en la página */
  enlace?: string;
}

export interface Actualizacion {
  id: string;
  fecha: string;
  titulo: string;
  novedades: Novedad[];
}

export const ACTUALIZACIONES: Actualizacion[] = [
  {
    id: '2026-11-wild-area',
    fecha: '2026-11-05',
    titulo: 'Wild Area, foro más vivo y cumpleaños',
    novedades: [
      {
        titulo: 'Misiones del Wild Area',
        texto: 'Cada día se desbloquean misiones nuevas. Toca «¡Lo logré!» y suma puntos.',
        ejemplo: 'wildarea',
        enlace: '/eventos',
      },
      {
        titulo: 'Regístrate con tu teléfono',
        texto: 'Si eres de Escama Esmeralda, escribe tu número y entras al instante.',
        ejemplo: 'registro',
        enlace: '/eventos',
      },
      {
        titulo: 'La escama verde',
        texto: 'Los miembros activos de Escama Esmeralda la lucen en el foro.',
        ejemplo: 'escama',
        enlace: '/foro',
      },
      {
        titulo: 'Me gusta en el foro',
        texto: 'Dale ❤️ a los comentarios que más te gusten.',
        ejemplo: 'likes',
        enlace: '/foro',
      },
      {
        titulo: 'Responde y menciona',
        texto: 'Contesta un comentario en particular o llama a alguien con @.',
        ejemplo: 'mencion',
        enlace: '/foro',
      },
      {
        titulo: 'Avisos 🔔',
        texto: 'Te avisamos cuando te mencionan o responden a tu comentario.',
        ejemplo: 'avisos',
        enlace: '/foro',
      },
      {
        titulo: 'Cumpleaños',
        texto: 'El día de tu cumpleaños sale tu flyer en el inicio y en el foro.',
        ejemplo: 'cumple',
        enlace: '/',
      },
      {
        titulo: 'Haz amigos con tu Pokémon',
        texto: 'Tu Pokémon favorito ahora acompaña tu código de amistad.',
        ejemplo: 'amigos',
        enlace: '/amigos',
      },
    ],
  },
];
