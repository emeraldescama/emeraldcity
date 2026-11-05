# Emerald City — notas para trabajar en este repositorio

- Todo el texto visible de la página va en español (Venezuela), cercano y claro.
- **Notas de actualización:** cada cambio que se note para el público (una función nueva, una
  sección, una mejora que los miembros vayan a ver) se anota en `src/data/novedades.ts`. Si la
  última actualización de la lista es de los últimos días y todavía no se compartió, se le agrega
  la novedad; si no, se crea una actualización nueva al comienzo de la lista con su fecha. Cada
  novedad lleva un título corto, una frase sencilla y el dibujo de ejemplo (`ejemplo`) que mejor la
  muestre; si ninguno sirve, se usa `emoji` con un emoji. Los cambios internos (arreglos, panel de
  administración, rendimiento) no van.
- El panel de administración (`/admin`, pestaña ✨ Novedades) dibuja con esas notas el flyer para
  compartir en el grupo.
