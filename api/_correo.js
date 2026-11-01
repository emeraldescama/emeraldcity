/**
 * Correo diario con los cumpleaños de la comunidad.
 *
 * Se envía desde una cuenta de Gmail con una "contraseña de aplicación". Variables de entorno
 * (Vercel → Settings → Environment Variables):
 *   GMAIL_USER           el Gmail que envía, por ejemplo emeraldcity@gmail.com
 *   GMAIL_APP_PASSWORD   la contraseña de aplicación de 16 letras de esa cuenta
 *   CORREO_CUMPLEANOS    a quién le llega (varios, separados por coma)
 *   SITE_URL             opcional, la dirección de la página para los enlaces
 */
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { caracasToday } from './_escama.js';
import { ensureBirthdays } from './_cuentas.js';
import { DbError, run } from './_miembros.js';

const SITE_URL = (process.env.SITE_URL || 'https://emeraldcity-pi.vercel.app').replace(/\/$/, '');
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

let pokemonNames;
function pokemonName(number) {
  if (!number) return '';
  try {
    pokemonNames ??= new Map(JSON.parse(readFileSync(new URL('../public/data/pokemon.json', import.meta.url), 'utf8')));
  } catch {
    pokemonNames = new Map();
  }
  return pokemonNames.get(number) ?? `#${number}`;
}

/** Qué falta configurar para poder mandar el correo ([] si está todo) */
export function missingEmailSettings() {
  return ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'CORREO_CUMPLEANOS'].filter((name) => !process.env[name]?.trim());
}

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formatCode = (code) => String(code ?? '').replace(/(\d{4})(?=\d)/g, '$1 ');

/** Quienes cumplen años hoy, con el tema del foro que se abrió para cada uno */
async function todaysBirthdays(today) {
  await ensureBirthdays();
  const rows = await run((sql) =>
    sql.query(
      `SELECT t.id AS tema, m.entrenador, m.nombre, m.ciudad, m.codigo, m.telefono, m.mostrar, coalesce(c.avatar, m.pokemon) AS pokemon, c.shiny
       FROM foro_temas t JOIN miembros m ON m.id = t.cumple_miembro LEFT JOIN cuentas c ON c.miembro_id = m.id
       WHERE t.cumple_fecha = $1 ORDER BY lower(m.entrenador)`,
      [today],
    ),
  );
  return rows.map((r) => ({
    ...r,
    pokemon: r.pokemon === null || r.pokemon === undefined ? null : Number(r.pokemon),
    // El código va en el mensaje del grupo solo si el miembro aparece en "Haz amigos"
    publico: r.mostrar === true || r.mostrar === 't' || r.mostrar === 'true',
  }));
}

function groupMessage(person) {
  const who = person.telefono ? `@${person.telefono} (*${person.entrenador}*)` : `*${person.entrenador}*`;
  return `🎂 ¡Hoy está de cumpleaños ${who}! Toda la comunidad de Emerald City te desea un día lleno de shinies 💚${
    person.codigo && person.publico ? `\nEnvíale un regalo: ${formatCode(person.codigo)}` : ''
  }`;
}

function emailContent(people, today, test) {
  const [, month, day] = today.split('-').map(Number);
  const dateText = `${day} de ${MONTHS[month - 1]}`;
  const names = people.map((p) => p.entrenador).join(', ');
  const subject = `${test ? '[Prueba] ' : ''}🎂 ${people.length ? `Hoy cumple${people.length === 1 ? '' : 'n'} años: ${names}` : 'Hoy nadie cumple años'} · Emerald City`;

  const cards = people
    .map((p) => {
      const art = p.pokemon ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.shiny ? 'shiny/' : ''}${p.pokemon}.png` : '';
      const lines = [
        p.nombre && `<b>Nombre:</b> ${escape(p.nombre)}`,
        p.ciudad && `<b>Ciudad:</b> ${escape(p.ciudad)}`,
        p.codigo && `<b>Código de amistad:</b> ${escape(formatCode(p.codigo))}${p.publico ? '' : ' <i>(no aparece en Haz amigos: no va en el mensaje del grupo)</i>'}`,
        `<b>WhatsApp:</b> ${p.telefono ? `<a href="https://wa.me/${escape(p.telefono)}" style="color:#059669">+${escape(p.telefono)}</a>` : 'sin teléfono registrado'}`,
        p.pokemon && `<b>Pokémon favorito:</b> ${escape(pokemonName(p.pokemon))}${p.shiny ? ' ✨' : ''}`,
      ].filter(Boolean);
      return `
      <div style="border:1px solid #d1fae5;border-radius:16px;padding:16px;margin:16px 0;background:#f0fdf4">
        ${art ? `<img src="${art}" alt="" width="120" height="120" style="float:right;margin-left:12px">` : ''}
        <h2 style="margin:0 0 8px;font-size:22px;color:#064e3b">🎂 ${escape(p.entrenador)}</h2>
        <p style="margin:0;line-height:1.6;color:#1f2937">${lines.join('<br>')}</p>
        <p style="margin:12px 0 4px;font-size:13px;color:#047857"><b>Mensaje para el grupo (cópialo y pégalo):</b></p>
        <pre style="white-space:pre-wrap;font-family:inherit;background:#fff;border:1px dashed #6ee7b7;border-radius:10px;padding:10px;margin:0;color:#111827">${escape(groupMessage(p))}</pre>
        <p style="margin:12px 0 0"><a href="${SITE_URL}/foro#t/${escape(p.tema)}" style="color:#059669;font-weight:bold">Ver su flyer en el foro →</a></p>
        <div style="clear:both"></div>
      </div>`;
    })
    .join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#111827">
    <h1 style="color:#059669;margin-bottom:4px">Cumpleaños de hoy · ${dateText}</h1>
    <p style="margin-top:0;color:#4b5563">${
      people.length
        ? `${people.length === 1 ? 'Hoy cumple' : 'Hoy cumplen'} años ${people.length} miembro${people.length === 1 ? '' : 's'} de Emerald City.`
        : 'Este es un correo de prueba: hoy nadie de la comunidad cumple años. Cuando alguien cumpla, llegará un correo como este con sus datos.'
    }</p>
    ${cards}
    <p style="font-size:12px;color:#6b7280;margin-top:24px">Para etiquetar a la persona en el grupo de WhatsApp, pega el mensaje; si el número no se pone azul, bórralo, escribe @ y elige a la persona. El flyer se descarga desde el enlace del foro (con la sesión del panel abierta también ves su número ahí).<br>Panel: <a href="${SITE_URL}/admin" style="color:#059669">${SITE_URL}/admin</a></p>
  </div>`;

  const text = [
    `Cumpleaños de hoy · ${dateText}`,
    '',
    ...(people.length
      ? people.flatMap((p) => [
          `🎂 ${p.entrenador}`,
          p.codigo ? `Código: ${formatCode(p.codigo)}` : '',
          `WhatsApp: ${p.telefono ? `+${p.telefono}` : 'sin teléfono'}`,
          `Flyer: ${SITE_URL}/foro#t/${p.tema}`,
          '',
          groupMessage(p),
          '',
        ])
      : ['Correo de prueba: hoy nadie cumple años.']),
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');

  return { subject, html, text };
}

/**
 * Manda el correo del día. Sin "test", solo si alguien cumple años y una sola vez por
 * día (aunque se llame varias veces). Con "test" se manda siempre, para probar.
 */
export async function sendBirthdayEmail({ test = false } = {}) {
  const missing = missingEmailSettings();
  if (missing.length) throw new DbError(500, `Falta configurar en Vercel: ${missing.join(', ')}.`);
  const today = caracasToday();
  const people = await todaysBirthdays(today);
  if (!test) {
    if (!people.length) return { enviado: false, motivo: 'Hoy nadie cumple años.' };
    const sent = await run((sql) => sql.query(`SELECT valor FROM ajustes WHERE clave = 'correo_cumpleanos'`));
    if (sent[0]?.valor === today) return { enviado: false, motivo: 'El correo de hoy ya se había enviado.' };
  }

  const { subject, html, text } = emailContent(people, today, test);
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER.trim(), pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
  });
  try {
    await transport.sendMail({
      from: `"Emerald City" <${process.env.GMAIL_USER.trim()}>`,
      to: process.env.CORREO_CUMPLEANOS,
      subject,
      html,
      text,
    });
  } catch (err) {
    const auth = /auth|credentials|535|534/i.test(String(err.message));
    throw new DbError(502, auth ? 'Gmail rechazó la contraseña de aplicación. Revisa GMAIL_USER y GMAIL_APP_PASSWORD en Vercel.' : `No se pudo enviar el correo (${err.message}).`);
  }

  if (!test) {
    await run((sql) =>
      sql.query(`INSERT INTO ajustes (clave, valor) VALUES ('correo_cumpleanos', $1) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`, [today]),
    );
  }
  return { enviado: true, cumpleaneros: people.map((p) => p.entrenador), para: process.env.CORREO_CUMPLEANOS };
}
