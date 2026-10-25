/**
 * Recibe el formulario de /unirse y guarda al nuevo miembro en la base de datos.
 */
import { DbError, addMember } from './_miembros.js';

const MIN_AGE = 16;
// La captura llega ya reducida desde el navegador; así cabe de sobra en la base de datos
const MAX_SCREENSHOT_BYTES = 700 * 1024;

class FormError extends Error {}

function text(value, label, max, required = true) {
  const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (required && !clean) throw new FormError(`Falta completar: ${label}.`);
  if (clean.length > max) throw new FormError(`${label} no puede tener más de ${max} caracteres.`);
  return clean;
}

function validate(body) {
  const codigo = String(body.codigo ?? '').replace(/\D/g, '');
  if (codigo.length !== 12) throw new FormError('El código de amistad debe tener 12 números.');

  const edad = Number(body.edad);
  if (!Number.isInteger(edad) || edad < 1 || edad > 120) throw new FormError('La edad no es válida.');
  if (edad < MIN_AGE) throw new FormError(`La comunidad admite personas desde los ${MIN_AGE} años.`);

  const campfire = body.campfire === true;
  const captura = typeof body.captura === 'string' ? body.captura : '';
  const bytes = Buffer.from(captura, 'base64');
  if (!bytes.length) throw new FormError('Falta la captura de tu perfil.');
  if (bytes.length > MAX_SCREENSHOT_BYTES) throw new FormError('La captura es demasiado pesada.');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new FormError('La captura no es una imagen válida.');

  return {
    entrenador: text(body.entrenador, 'Nombre de entrenador', 30),
    nombre: text(body.nombre, 'Nombre y apellido', 80),
    ciudad: text(body.ciudad, 'Ciudad o país', 60),
    codigo,
    campfire,
    campfireNombre: campfire ? text(body.campfireNombre, 'Nombre en Campfire', 30) : '',
    edad,
    mostrarEnAmigos: body.mostrarEnAmigos === true,
    captura,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const body = req.body || {};
  // Campo oculto: solo los bots lo llenan
  if (body.sitio) return res.status(200).json({ ok: true });

  try {
    const registro = validate(body);
    const { captura, ...datos } = registro;
    await addMember(datos, captura);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof FormError) return res.status(400).json({ error: err.message });
    const status = err instanceof DbError ? err.status : 500;
    return res.status(status).json({ error: err.message || 'No se pudo guardar tu registro.' });
  }
}
