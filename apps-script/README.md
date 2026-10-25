# Conectar la web con la hoja de registros

El formulario de `/unirse`, la lista de **Haz amigos** y las **Bienvenidas** del panel guardan y leen los datos de la hoja de Google de Emerald City a través de este script.

## 1. Pegar el script en la hoja

1. Abre la hoja de registros en Google Sheets.
2. Ve a **Extensiones → Apps Script**.
3. Borra lo que haya en `Código.gs` y pega todo el contenido de [`Codigo.gs`](./Codigo.gs).
4. En la línea `const SECRET = 'CAMBIA-ESTA-CLAVE';` cambia el texto por una clave larga que solo sepan ustedes (por ejemplo, tres palabras y unos números). Guárdala: la necesitas en el paso 3.
5. Pulsa **Guardar** (ícono de disquete).

## 2. Publicarlo como aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. En el engranaje de *Seleccionar tipo* elige **Aplicación web**.
3. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**.
4. Pulsa **Implementar** y acepta los permisos que pide Google (usa la cuenta dueña de la hoja). Si aparece "Google no verificó esta aplicación", entra en *Configuración avanzada → Ir a (nombre del proyecto)*: es tu propio script.
5. Copia la **URL de la aplicación web** (termina en `/exec`).

Los registros de la web se agregan **en la misma pestaña donde llegaban las respuestas del Google Form** (la que tiene la columna *Marca temporal*). El script reconoce sus columnas por el título (nombre de entrenador, código, edad, Campfire, captura…) y agrega al final solo las que falten: *Aparece en "Haz amigos"*, *Bienvenida enviada* e *ID web*. A los miembros que ya estaban les pone "Antes de la web" en *Bienvenida enviada*, para que no aparezcan como bienvenidas pendientes. Las capturas nuevas se guardan en una carpeta de tu Drive llamada **Emerald City · Capturas de perfil**.

**Haz amigos** muestra a todos los miembros con código de amistad, también a los del formulario anterior. Para sacar a alguien de la lista, escribe **No** en su fila, en la columna *Aparece en "Haz amigos"*.

### Comprobar que reconoció bien las columnas

En el editor de Apps Script, elige la función **revisarColumnas** en la barra de arriba y pulsa **Ejecutar**. En el *Registro de ejecución* verás qué columna usa para cada dato y cuántos miembros salen en Haz amigos. Si alguna no es la correcta, cambia el título de esa columna en la hoja para que sea más claro (por ejemplo "Código de amistad") o avísanos. Si los miembros están en otra pestaña, escribe su nombre en `SHEET_NAME`, al principio del script.

## 3. Configurar Vercel

En Vercel → **Settings → Environment Variables** agrega:

| Variable | Valor |
| --- | --- |
| `APPS_SCRIPT_URL` | La URL `/exec` del paso 2 |
| `APPS_SCRIPT_SECRET` | La misma clave que pusiste en `SECRET` |

Vuelve a desplegar el proyecto para que tome las variables.

## Si cambias el script más adelante

Después de editarlo, ve a **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. Así la URL sigue siendo la misma.

## Privacidad

La lista pública de **Haz amigos** solo muestra nombre de entrenador, código de amistad y ciudad o país. El nombre real, la edad, Campfire y la captura quedan solo en la hoja y en el panel de administración.
