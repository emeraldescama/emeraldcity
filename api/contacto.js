/**
 * "Tengo intercambio con suerte": abre WhatsApp con el miembro que aceptó recibir
 * mensajes. El teléfono no aparece en la lista pública; solo se usa en esta redirección.
 *
 *   GET /api/contacto?codigo=123412341234
 */
import { DbError, contactPhone } from './_miembros.js';

export default async function handler(req, res) {
  const codigo = String(req.query?.codigo ?? '').replace(/\D/g, '');
  if (req.method !== 'GET' || codigo.length !== 12) {
    return res.status(400).send('Enlace no válido.');
  }
  try {
    const member = await contactPhone(codigo);
    if (!member) {
      return res.status(404).send('Este entrenador no recibe mensajes por WhatsApp. Puedes agregarlo con su código de amistad.');
    }
    const message = `¡Hola ${member.entrenador}! Te encontré en "Haz amigos" de Emerald City. Tengo un intercambio con suerte contigo en Pokémon GO, ¿lo coordinamos?`;
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `https://wa.me/${member.telefono}?text=${encodeURIComponent(message)}`);
  } catch (err) {
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).send(err.message || 'No se pudo abrir WhatsApp.');
  }
}
