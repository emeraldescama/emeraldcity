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
3. **Flyer semanal:** elige la semana y descarga o comparte la imagen "Eventos de esta semana", o copia el texto para el grupo de WhatsApp.

La función del servidor está en `api/admin.js` (Vercel la detecta sola).

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
