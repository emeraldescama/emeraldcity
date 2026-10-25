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

**Traer a los miembros que ya estaban en la hoja de Google:** en la hoja, *Archivo → Descargar → Valores separados por comas (.csv)*; luego en el panel, pestaña **Miembros → Importar hoja anterior**. La página reconoce las columnas por su título, muestra qué encontró antes de importar y no duplica códigos que ya existan.

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
