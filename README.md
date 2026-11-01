# Emerald City Page

Guía rápida para levantar este proyecto en una PC nueva.

## 1) Prerrequisitos

- **Git** instalado.
- **Node.js** compatible con Astro `4.16.18`: `^18.17.1 || ^20.3.0 || >=21.0.0`.
- **npm** `>=9.6.5` (se usa npm porque existe `package-lock.json`).

## 2) Clonar el repositorio

```bash
git clone https://github.com/emeraldescama/emeraldcity.git
```

## 3) Entrar al directorio

```bash
cd emeraldcity
```

## 4) Instalar dependencias (respetando lockfile)

```bash
npm ci
```

## 5) Variables de entorno

El sitio se compila sin variables. Solo el **panel de administración** (`/admin`) las necesita, y se configuran en Vercel (**Settings → Environment Variables**):

| Variable | Valor |
| --- | --- |
| `ADMIN_PIN` | PIN del equipo organizador. Usa **8 dígitos o más**. |
| `SESSION_SECRET` | Opcional. Texto largo y secreto para firmar las cookies de sesión del panel y de los likes. Si no existe, se usa una clave derivada del PIN y la base de datos. |
| `GITHUB_TOKEN` | Token de GitHub que puede escribir en el repositorio (ver abajo). |
| `GITHUB_REPO` | Opcional. Por defecto `emeraldescama/emeraldcity`. |
| `GITHUB_BRANCH` | Opcional. Por defecto `main`. |

Para crear el token: GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. En *Repository access* elige solo `emeraldcity` y en *Permissions → Contents* marca **Read and write**.

Después de guardar las variables, vuelve a desplegar el proyecto en Vercel para que las tome.

### Cómo funciona el panel

1. Entra a `/admin` con el PIN.
2. **Eventos:** sube el flyer, completa título, tipo, fecha, hora y lugar, y pulsa *Publicar evento*. El panel guarda el evento en `src/content/eventos/` y el flyer en `public/images/eventos/` con un commit en GitHub; Vercel recompila el sitio y el evento aparece en *Noticias y Quedadas* y en la cuenta regresiva del inicio en 1–2 minutos.
3. **Flyer semanal** (también lo puede descargar cualquier visitante con el botón *Descargar imagen de la semana* en *Noticias y Quedadas*): elige la semana y descarga o comparte la imagen "Eventos de esta semana", o copia el texto para el grupo de WhatsApp.

La función del servidor está en `api/admin.js` (Vercel la detecta sola).

### Eventos automáticos

Todos los días a las 6:17 AM (hora de Caracas) la acción de GitHub **Sincronizar eventos** (`.github/workflows/sync-eventos.yml`) ejecuta `scripts/sync-eventos.mjs`. El script lee el calendario público de eventos de Pokémon GO (LeekDuck, vía ScrapedDuck) y publica los de los próximos 35 días con las reglas de la comunidad:

| Evento | Lugar | Hora |
| --- | --- | --- |
| Día de la Comunidad | Parque del Este | 2:00 – 5:00 PM |
| Día de Incursiones | Plaza Los Palos Grandes | 2:00 – 5:00 PM |
| Día Dinamax con un legendario | Plaza Los Palos Grandes | 2:00 – 5:00 PM |
| GO Tour, GO Fest y Wild Area (globales) | Plaza Los Palos Grandes | Desde las 10:00 AM, cada día |

Cada evento lleva un flyer generado con la temática de Emerald City y la ilustración oficial de sus Pokémon (de PokeAPI, guardada en `public/images/pokemon/`), además de un enlace a los detalles oficiales del evento. Los eventos automáticos aparecen en el panel con la marca **Automático** y se pueden editar como cualquier otro; el script nunca sobrescribe un evento existente. Si eliminas uno desde el panel, queda anotado en `data/eventos-descartados.json` y no se vuelve a crear.

Para ejecutarlo a mano: `npm run sync-eventos`, o en GitHub → **Actions → Sincronizar eventos → Run workflow**.

### Miembros: registro, "Haz amigos" y bienvenidas

El formulario de `/unirse` guarda a cada miembro en la base de datos de la página; `/amigos` muestra los códigos de amistad, y el panel tiene las pestañas **Miembros** (tabla, buscador, ocultar de Haz amigos, eliminar, **Descargar Excel**, importar la hoja anterior) y **Bienvenidas** (flyer de bienvenida con la captura del perfil).

**Conectar la base de datos (una sola vez):**

1. En Vercel, entra al proyecto → pestaña **Storage** → **Create Database**.
2. Elige **Neon** (Serverless Postgres) → plan **Free** → ponle un nombre (por ejemplo `emerald-miembros`) → **Create**.
3. Cuando pregunte, conéctala al proyecto de la página (**Connect**). Vercel agrega sola la variable `DATABASE_URL`, y la tabla de miembros se crea sola la primera vez.
4. Ve a **Deployments** → **⋯** del último → **Redeploy**.

**Traer a los miembros que ya estaban en la hoja de Google:** en la hoja, *Archivo → Descargar → Microsoft Excel (.xlsx)* (o .csv); luego en el panel, pestaña **Miembros → Importar hoja anterior**. La página reconoce las columnas por su título (también teléfono y la columna de la captura, que no se importa), muestra qué encontró antes de importar y no duplica a nadie. Volver a importar la hoja actualiza los datos de los miembros importados antes.

**Haz amigos:** cada tarjeta tiene una manito para recomendar a quien envía regalos (un voto por dispositivo; desde 3 votos sale la marca "Envía regalos") y, si el miembro lo aceptó, el botón "Tengo intercambio con suerte", que abre WhatsApp con él vía `/api/contacto`. El teléfono nunca aparece en la lista pública. Para los miembros importados, el permiso de mensajes se activa desde la tabla de Miembros (columna WhatsApp).

### Cuentas y foro

- Los miembros crean su cuenta en `/cuenta` con su código de amistad y una contraseña. Si se registraron con teléfono, también deben escribirlo (así nadie crea la cuenta de otro con un código público).
- Las cuentas nuevas quedan **pendientes** hasta que se aprueban en el panel, pestaña **Cuentas y foro**. Ahí también se bloquean, se borran y se reinicia la contraseña (el panel muestra una temporal para enviarla por WhatsApp).
- El foro (`/foro`) solo lo ven las cuentas aprobadas. Con la sesión del panel abierta, el administrador puede fijar temas y borrar cualquier mensaje.
- Los íconos de perfil son los sprites de PokeAPI; la lista de nombres en español está en `public/data/pokemon.json` (se regenera con `node scripts/pokemon-nombres.mjs`).
- Las tablas (`cuentas`, `foro_temas`, `foro_mensajes`) se crean solas en la misma base de datos Neon.

### Eventos y retos (Escama Esmeralda)

- La página `/eventos` muestra las dinámicas (por ejemplo, rumbo a Wild Area), el reto del día y la tabla de puntos con el Pokémon de perfil de cada participante.
- Participan los miembros **activos** de Escama Esmeralda (no están de baja y su suscripción no venció) que tienen su cuenta de la web aprobada y vinculada. La lista se lee en vivo de `https://escama-6jm5.vercel.app/api/data` (vista pública, sin pagos ni teléfonos) y se guarda 5 minutos en memoria. Si la página cambia de dirección, define `ESCAMA_URL` en Vercel.
- En el panel, pestaña **Dinámicas**: crear dinámicas y retos (los retos aparecen desde su fecha de inicio), revisar las capturas (aprobar suma los puntos; la captura se borra al revisarla) y vincular a cada miembro de Escama con su cuenta (el panel sugiere la cuenta cuando el alias o el nombre coinciden).

### Cumpleaños

- El registro (`/unirse`) pide el cumpleaños (día y mes) y, opcional, el Pokémon favorito. Los miembros pueden cambiarlos en `/cuenta` (el Pokémon del perfil es su favorito) y el administrador en Miembros → Editar.
- Cada día, al abrir el foro, la web crea sola un tema en la categoría **Cumpleaños** por cada miembro que cumple años (hora de Caracas), con su flyer: nombre de entrenador, código de amistad (solo si aparece en Haz amigos) y su Pokémon favorito. Quien cumple el 29 de febrero lo celebra el 28 en los años no bisiestos.
- En el panel, pestaña **Cumpleaños**: los de hoy y los próximos 30 días, con el flyer para descargar o compartir en WhatsApp.

## 6) Levantar servidor de desarrollo

```bash
npm run dev
```

Abrí la URL local que muestra Astro en consola (por defecto suele ser `http://localhost:4321`).

## 7) Build de producción y preview

Crear build:

```bash
npm run build
```

Previsualizar build:

```bash
npm run preview
```
