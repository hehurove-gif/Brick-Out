# Brick Out

Juego de romper bloques hecho con HTML, CSS y JavaScript, sin dependencias de compilación ni servidor.

## Ejecutar localmente

Abre `index.html` en un navegador o inicia un servidor estático, por ejemplo `python -m http.server 8000`, y visita `http://localhost:8000`.

## Desplegar en Cloudflare Pages

Este proyecto es un sitio estático: no necesita Workers, funciones, base de datos, Node.js ni proceso de build.

### Conectar el repositorio

1. En Cloudflare, ve a **Workers & Pages → Create → Pages → Connect to Git**.
2. Selecciona `hehurove-gif/Brick-Out` y la rama `main`.
3. Configura:
   - **Framework preset:** None
   - **Build command:** dejar vacío (o `exit 0` si el formulario exige un comando)
   - **Build output directory:** `/` (raíz del repositorio)
   - **Root directory:** `/` (predeterminada)
4. Guarda y despliega. Los siguientes commits en `main` se publicarán automáticamente.

También puedes cargar los archivos directamente con Wrangler: `npx wrangler pages deploy .` desde la raíz.

`index.html`, `style.css`, `script.js` y `_headers` deben permanecer en la raíz para que la página y los encabezados se sirvan correctamente. `_headers` define políticas de seguridad y evita cachear de forma prolongada los archivos no versionados. El juego no envía la imagen importada a ningún servidor: se procesa localmente en el navegador.

## Controles

- Mouse o pantalla táctil: mueve la paleta.
- Flechas izquierda/derecha o A/D: mueve la paleta.
- Espacio: lanza la pelota o la vuelve a lanzar desde una paleta pegajosa.
- P: pausa o reanuda.
- Importar imagen: convierte sus colores en un patrón de ladrillos.

## Balance

Los power-ups aparecen con una probabilidad del 11% al romper bloques, con máximo dos objetos en pantalla y al menos cuatro bloques destruidos entre apariciones. La vida extra es poco común y tiene un máximo de cinco vidas. Bola múltiple está limitada a cuatro pelotas; los efectos temporales duran entre siete y ocho segundos. Los ladrillos de materiales resistentes requieren más impactos.
