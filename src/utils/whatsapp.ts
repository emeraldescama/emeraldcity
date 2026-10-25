/**
 * Helper de WhatsApp para la comunidad Emerald City (Caracas, Venezuela)
 * Genera enlaces directos wa.me con mensajes formateados y codificados.
 */

// Teléfono oficial para Bazar Emerald (Manufactura 3D y coleccionables)
export const BAZAR_WHATSAPP_PHONE = '584222292700';

// Catálogo oficial de WhatsApp Business para Bazar Emerald
export const BAZAR_CATALOG_URL = 'https://wa.me/c/584222292700';

// Teléfono oficial para Gimmi Pass (Pases de Incursión y Pokémonedas)
export const GIMMI_PASS_WHATSAPP_PHONE = '584224050411';

// Teléfono por defecto para contacto general de la comunidad
export const DEFAULT_WHATSAPP_PHONE = BAZAR_WHATSAPP_PHONE;

/**
 * Genera el enlace al catálogo completo de WhatsApp Business de Bazar Emerald
 */
export function getBazarCatalogUrl(): string {
  return BAZAR_CATALOG_URL;
}

/**
 * Genera un enlace a WhatsApp para cotizar un producto 3D del Bazar Emerald
 * Formato del mensaje: "¡Hola Emerald City! Vengo de la web y quiero cotizar la impresión 3D: *[Nombre]*."
 *
 * @param productName Nombre del producto 3D
 * @param phone Número de destino (por defecto usa BAZAR_WHATSAPP_PHONE: +58 422-2292700)
 * @returns URL completa wa.me
 */
export function getBazarWhatsAppUrl(productName: string, phone: string = BAZAR_WHATSAPP_PHONE): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = `¡Hola Emerald City! Vengo de la web y quiero cotizar la impresión 3D: *${productName.trim()}*.`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Genera un enlace a WhatsApp para adquirir un paquete de Gimmi Pass
 * Formato del mensaje: "¡Hola! Me interesa adquirir el paquete de Gimmi Pass: *[Nombre]* (Ref: $[Precio])."
 *
 * @param packageName Nombre del paquete de Gimmi Pass
 * @param priceRef Precio referencial en USD
 * @param phone Número de destino (por defecto usa GIMMI_PASS_WHATSAPP_PHONE: +58 422-4050411)
 * @returns URL completa wa.me
 */
export function getGimmiPassWhatsAppUrl(packageName: string, priceRef: number, phone: string = GIMMI_PASS_WHATSAPP_PHONE): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPrice = priceRef.toFixed(2);
  const message = `¡Hola! Me interesa adquirir el paquete de Gimmi Pass: *${packageName.trim()}* (Ref: $${formattedPrice}).`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Genera un enlace de contacto general para la comunidad
 */
export function getGeneralContactWhatsAppUrl(customMessage?: string, phone: string = DEFAULT_WHATSAPP_PHONE): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = customMessage || '¡Hola Emerald City! Vengo desde el sitio web oficial y me gustaría unirme a la comunidad.';
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
