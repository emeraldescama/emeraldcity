/**
 * "Tengo intercambio con suerte": abre WhatsApp con el entrenador si aceptó recibir
 * mensajes; si no, con la comunidad, que ayuda a coordinarlo. El teléfono no aparece
 * en la lista pública; solo se usa en esta redirección.
 *
 *   GET /api/contacto?codigo=123412341234
 */
import { DbError, contactInfo } from './_miembros.js';

const COMMUNITY_PHONE = '584222292700';

export default async function handler(req, res) {
  const codigo = String(req.query?.codigo ?? '').replace(/\D/g, '');
  if (req.method !== 'GET' || codigo.length !== 12) {
    return res.status(400).send('Enlace no válido.');
  }
  try {
    const member = await contactInfo(codigo);
    if (!member) return res.status(404).send('Ese entrenador ya no está en la lista.');

    const formattedCode = codigo.replace(/(\d{4})(?=\d)/g, '$1 ');
    const [phone, message] = member.telefono
      ? [member.telefono, `¡Hola ${member.entrenador}! Te encontré en "Haz amigos" de Emerald City. Tengo un intercambio con suerte contigo en Pokémon GO, ¿lo coordinamos?`]
      : [COMMUNITY_PHONE, `¡Hola Emerald City! Tengo un intercambio con suerte con el entrenador *${member.entrenador}* (código ${formattedCode}). ¿Me ayudan a contactarlo?`];
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).send(err.message || 'No se pudo abrir WhatsApp.');
  }
}
