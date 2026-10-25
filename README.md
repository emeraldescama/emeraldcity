# Emerald City Page

Guía rápida para levantar este proyecto en una PC nueva.

## 1) Prerrequisitos

- **Git** instalado.
- **Node.js** compatible con Astro `4.16.18`: `^18.17.1 || ^20.3.0 || >=21.0.0`.
- **npm** `>=9.6.5` (se usa npm porque existe `package-lock.json`).

## 2) Clonar el repositorio

```bash
git clone https://github.com/JoseZ1701/Emerald-City-Page.git
```

## 3) Entrar al directorio

```bash
cd Emerald-City-Page
```

## 4) Instalar dependencias (respetando lockfile)

```bash
npm ci
```

## 5) Variables de entorno

Actualmente el repositorio no incluye archivos `.env` ni un archivo de ejemplo (`.env.example`), por lo que **no hay variables obligatorias documentadas** para ejecutarlo localmente.

Si en el futuro se agrega un archivo de ejemplo, copiá sus claves sin exponer secretos (por ejemplo, de `.env.example` a `.env`) y completá solo valores locales.

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
