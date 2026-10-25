/**
 * Helper de WhatsApp para la comunidad Emerald City (Caracas, Venezuela)
 * Genera enlaces directos wa.me con mensajes formateados y codificados.
 */

// Teléfono de la comunidad: información, eventos y avisos de registro
export const COMMUNITY_WHATSAPP_PHONE = '584222292700';

// Teléfono de Gimmi Pass (pedidos de compra y venta de Pokémon GO)
export const GIMMI_PASS_WHATSAPP_PHONE = '584224050411';

// Teléfono por defecto para contacto general de la comunidad
export const DEFAULT_WHATSAPP_PHONE = COMMUNITY_WHATSAPP_PHONE;

/**
 * Genera un enlace a WhatsApp para pedir información sobre un evento o quedada
 * Formato del mensaje: "¡Hola! Estoy interesado en asistir al evento de Emerald City *[Nombre]* ([Fecha]). Me gustaría saber más sobre cómo unirme a la comunidad."
 *
 * @param eventName Nombre del evento (opcional)
 * @param dateLabel Fecha legible del evento (opcional)
 * @param phone Número de destino (por defecto usa COMMUNITY_WHATSAPP_PHONE: +58 422-2292700)
 * @returns URL completa wa.me
 */
export function getEventWhatsAppUrl(eventName?: string, dateLabel?: string, phone: string = DEFAULT_WHATSAPP_PHONE): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const eventPart = eventName ? ` *${eventName.trim()}*${dateLabel ? ` (${dateLabel})` : ''}` : '';
  const message = `¡Hola! Estoy interesado en asistir al evento de Emerald City${eventPart}. Me gustaría saber más sobre cómo unirme a la comunidad.`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Genera un enlace de contacto general para la comunidad
 */
export function getGeneralContactWhatsAppUrl(customMessage?: string, phone: string = DEFAULT_WHATSAPP_PHONE): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = customMessage || '¡Hola Emerald City! Me gustaría saber más información sobre la comunidad.';
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
