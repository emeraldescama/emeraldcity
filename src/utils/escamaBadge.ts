/**
 * Insignia de los miembros activos de Escama Esmeralda: una escama verde que brilla.
 * Al pasar el cursor (o tocarla en el celular) dice "Miembro activo de Escama Esmeralda".
 * Los estilos (.escama-badge) están en Layout.astro.
 */
const scaleSvg = (id: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ecfccb"/><stop offset="0.4" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/>
    </linearGradient>
  </defs>
  <path d="M12 2.2c4.7 3.3 7.7 7.2 7.7 11.3a7.7 7.7 0 0 1-15.4 0c0-4.1 3-8 7.7-11.3z" fill="url(#${id})" stroke="#dcfce7" stroke-width="0.9"/>
  <path d="M7.6 13.4c0-2.6 1.7-5 4.4-7.1 2.7 2.1 4.4 4.5 4.4 7.1" fill="none" stroke="#f0fdf4" stroke-opacity="0.75" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M12 10.2c1.5 1.2 2.4 2.5 2.4 3.9a2.4 2.4 0 0 1-4.8 0c0-1.4.9-2.7 2.4-3.9z" fill="#f0fdf4" fill-opacity="0.6"/>
</svg>`;

export const ESCAMA_TIP = 'Miembro activo de Escama Esmeralda';

// Cada escama necesita su propio degradado: si compartieran el mismo id y el primero
// estuviera en una parte oculta de la página, el navegador no pintaría las demás
let count = 0;

export function escamaBadge(size: 'sm' | 'md' = 'sm') {
  const badge = document.createElement('span');
  badge.className = `escama-badge ${size === 'md' ? 'escama-badge-md' : ''}`;
  badge.tabIndex = 0;
  badge.dataset.tip = ESCAMA_TIP;
  badge.title = ESCAMA_TIP;
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', ESCAMA_TIP);
  badge.innerHTML = scaleSvg(`escama-verde-${++count}`);
  // En el celular no hay cursor: al tocarla se muestra el texto un momento
  badge.addEventListener('click', (event) => {
    event.stopPropagation();
    badge.classList.add('escama-badge-tip');
    setTimeout(() => badge.classList.remove('escama-badge-tip'), 2200);
  });
  return badge;
}
