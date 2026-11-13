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
- P o Esc: pausa o reanuda (en pantalla completa Esc solo sale de ella).
- F o el botón **Pantalla completa**: entra y sale de pantalla completa (Esc también sale). En pantalla completa, tocar la pantalla reanuda una pausa.
- Importar imagen: primero eliges cuántos bloques usar (de 20 a 300) con un deslizador y una vista previa; la rejilla sigue la forma de la imagen y los bloques son cuadrados, así que con cifras altas sirve para simular píxeles. Convierte sus colores en un patrón de ladrillos. Si pierdes, **Iniciar** vuelve a empezar con ese mismo patrón.
  - La detección (`public/image-bricks.js`) está adaptada de SVG-Converter: compara colores en espacio Lab, arma la paleta solo con zonas de color plano (los bordes suavizados y el ruido JPEG no crean colores falsos), quita el fondo parejo conectado con el borde y asigna a cada ladrillo el color dominante de su celda. Las imágenes con transparencia (PNG) se respetan tal cual.
  - Funciona mejor con logos, personajes e ilustraciones con fondo liso. Los detalles más pequeños que un ladrillo (ojos, texto fino) se pierden por la resolución de la rejilla.

## Niveles y dificultad

El tamaño del nivel crece poco a poco para que el primero sea corto:

| Nivel | Capas | Columnas | Golpes en total | Resistencia máxima |
| --- | --- | --- | --- | --- |
| 1 | 3 | 7 | 28 | 2 |
| 2 | 5 | 8 | 72 | 3 |
| 3 | 7 | 8 | 128 | 4 |
| 4 en adelante | 9 | 8 | 200 | 5 |

La dificultad va por capas: las primeras y las del fondo se rompen fácil y el centro es el reto. En el nivel completo es **muy fácil, fácil, medio, difícil, muy difícil, difícil, medio, fácil, muy fácil** (1-2-3-4-5-4-3-2-1 golpes). Cada ladrillo muestra un segmento por golpe necesario; el color solo es decorativo (8 tonos por nivel, que cambian de paleta en cada nivel). Todo se ajusta en `levelPlan` y `LAYER_PROFILE` de `public/script.js`.

## Power-ups

La primera vez que consigues un power-up, el juego se pausa y aparece una tarjeta que explica qué hace (se cierra con Espacio, Enter, un toque o el botón). Se registra en tu navegador y la lista **Power-ups** del pie de página marca los que ya descubriste. En `?tiktok`, `?auto` y `?clean` no hay avisos ni registro.

## Balance

Los power-ups aparecen con una probabilidad del 11% al romper bloques, que sube 3 puntos por cada segundo que la pelota lleva rebotando sin tocar la paleta (hasta 45%), con máximo dos objetos en pantalla y al menos cuatro bloques destruidos entre apariciones (el contador se reinicia en cada nivel). La vida extra es poco común y tiene un máximo de cinco vidas. Bola múltiple está limitada a cuatro pelotas; los efectos temporales duran entre siete y ocho segundos. Los ladrillos de materiales resistentes requieren más impactos.
