# Brick Out

Juego de romper bloques hecho con HTML, CSS y JavaScript, sin dependencias de compilación ni servidor. Los archivos del sitio viven en `public/`.

## Ejecutar localmente

Abre `public/index.html` en un navegador o inicia un servidor estático, por ejemplo `python -m http.server 8000 -d public`, y visita `http://localhost:8000`.

## Modo TikTok (fondo para videos)

Agrega parámetros a la URL para grabar el juego como fondo:

| URL | Qué hace |
| --- | --- |
| `?tiktok` | Todo junto: vertical 9:16, juega solo, sin interfaz, con efectos |
| `?auto` | La paleta juega sola; al perder, la partida se reinicia sola |
| `?clean` | Oculta barra, marcador y pie de página; el canvas se ajusta a la pantalla |
| `?portrait` | Formato vertical 9:16 |
| `?juice` | Estela de la pelota, sacudida de pantalla y más partículas |

Los parámetros se pueden combinar (por ejemplo `?auto&clean`). Para grabar, abre `?tiktok` en el celular o en el navegador con tamaño de ventana vertical y usa la grabación de pantalla. Con **P** pausas y con **Espacio** o un toque lanzas manualmente.

## Desplegar en Cloudflare

Este proyecto es un sitio estático: no necesita funciones, base de datos, Node.js ni proceso de build. `wrangler.jsonc` publica la carpeta `public/`.

### Workers (comandos por defecto de Cloudflare)

1. En Cloudflare, ve a **Workers & Pages → Create → Import a repository** y selecciona `hehurove-gif/Brick-Out`, rama `main`.
2. Deja el **Build command** vacío.
3. **Deploy command:** `npx wrangler deploy` (el predeterminado). **Preview command:** `npx wrangler preview`.

También puedes publicar desde tu computadora con `npx wrangler deploy`.

### Pages (alternativa)

Si prefieres Pages: **Framework preset** None, **Build command** vacío y **Build output directory** `public`.

`_headers` (dentro de `public/`) define políticas de seguridad y hace que el navegador revalide los archivos en cada visita. El juego no envía la imagen importada a ningún servidor: se procesa localmente en el navegador.

## Controles

- Mouse o pantalla táctil: mueve la paleta.
- Flechas izquierda/derecha o A/D: mueve la paleta.
- Espacio: lanza la pelota o la vuelve a lanzar desde una paleta pegajosa.
- P: pausa o reanuda.
- Importar imagen: convierte sus colores en un patrón de ladrillos. Si pierdes, **Iniciar** vuelve a empezar con ese mismo patrón.
  - La detección (`public/image-bricks.js`) está adaptada de SVG-Converter: compara colores en espacio Lab, arma la paleta solo con zonas de color plano (los bordes suavizados y el ruido JPEG no crean colores falsos), quita el fondo parejo conectado con el borde y asigna a cada ladrillo el color dominante de su celda. Las imágenes con transparencia (PNG) se respetan tal cual.
  - Funciona mejor con logos, personajes e ilustraciones con fondo liso. Los detalles más pequeños que un ladrillo (ojos, texto fino) se pierden por la resolución de la rejilla.

## Balance

Los power-ups aparecen con una probabilidad del 11% al romper bloques, con máximo dos objetos en pantalla y al menos cuatro bloques destruidos entre apariciones (el contador se reinicia en cada nivel). La vida extra es poco común y tiene un máximo de cinco vidas. Bola múltiple está limitada a cuatro pelotas; los efectos temporales duran entre siete y ocho segundos. Los ladrillos de materiales resistentes requieren más impactos.
