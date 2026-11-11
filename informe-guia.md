# Wealth statement: cómo se redacta

Guía para la tarea programada que escribe el informe semanal (domingo 20:00) y el mensual (día 1, 9:00).
No contiene datos: las cifras salen cada vez de `resumen.json`, que vive en `informes/` (fuera de GitHub).

## Pasos

1. `node informe.js semanal` (o `mensual`) en la carpeta del proyecto. Imprime la carpeta creada,
   `informes/AAAA-MM-DD-<tipo>/`, con las capturas (`patrimonio.png`, `rendimiento.png`, `posiciones.png`,
   `flujos.png` y, en el mensual, `plan.png`) y `resumen.json`.
   Si falla con «Tiempo agotado esperando los datos», `sync.js` no está publicando o `clave.txt` no es la buena:
   no inventes cifras; escribe un correo corto avisando del fallo y envíalo igual.
2. Lee `resumen.json`. Todas las cifras del informe salen de ahí; no las redondees de forma que cambien el sentido.
3. Busca contexto: noticias de la semana (o del mes) de cada acción y de las gestoras de los fondos,
   y el contexto de mercado (índices, bancos centrales, EUR/USD, oro, tipos). Usa Bigdata.com si está
   disponible y, si no, la búsqueda web. Cita la fuente de cada noticia con un enlace.
4. Escribe `informe.html` en esa carpeta con la estructura de abajo.
5. `node enviar.js informes/AAAA-MM-DD-<tipo>` para enviarlo. Genera también el informe en PDF
   (`Patrimonio-AAAA-MM-DD-<tipo>.pdf`, A4) y lo adjunta al correo; si el PDF falla, el correo sale igual sin él.
   Si falla el envío, deja el error en `error.txt` de la carpeta y no reintentes en bucle.

## Estructura del correo

- `<title>`: «Patrimonio · semana del D al D de mes» o «Patrimonio · cierre de <mes> AAAA».
- **Cabecera**: patrimonio total en grande, cambio de la semana (o del mes) en € y %, separando cuánto viene
  de aportaciones y cuánto del mercado (`cambio_7d − aportaciones_7d`).
- **Resumen en 3–4 frases**: qué ha pasado y por qué, en lenguaje llano.
- **Patrimonio**: imagen `cid:patrimonio.png`.
- **Rendimiento**: rentabilidad de la semana/mes, en el año y desde el inicio; imagen `cid:rendimiento.png`.
- **Posiciones**: las 3 que más suben y las 3 que más bajan desde el informe anterior (`desde_anterior`;
  si no hay informe anterior, usa la rentabilidad acumulada y dilo), y una línea por cada posición con lo
  relevante (noticia, resultados, movimiento del sector). Imagen `cid:posiciones.png`.
- **Diversificación**: exposición por país y concentración; imagen `cid:flujos.png`. Señala si algo se aleja
  de los objetivos de `objetivos` (por ejemplo, acciones por encima del 12 %).
- **Contexto de mercado**: 4–6 puntos breves con enlace a la fuente.
- **Plan**: próximos pasos de `plan` y en qué estado están. En el mensual, imagen `cid:plan.png`.
- **Escenarios**: qué podría pasar con la cartera en un escenario favorable, uno central y uno adverso,
  explicado como contexto, sin recomendaciones de compra o venta ni precios objetivo.
- **Pie**: «Informe generado automáticamente con tus datos. No es asesoramiento financiero.»

## Formato

- Cada sección es una fila de la tabla de 640 px (título de 18 px en su propia fila, contenido en la siguiente):
  así el PDF mantiene cada título junto a su contenido.
- HTML de correo: una sola columna de 640 px, estilos en línea (`style="…"`), sin JavaScript ni CSS externo.
- Colores de la marca: azul `#3872FF`, negro `#111111`, gris `#676D7E`, fondo `#F9F9F9`, tarjetas blancas,
  verde `#4A7D5B` para subidas y rojo `#C9443A` para bajadas. Fuente: Inter, con Arial de respaldo.
- Imágenes: `<img src="cid:NOMBRE.png" width="640" style="width:100%;max-width:640px;border-radius:12px">`.
- Español de España, tono cercano y claro, cifras con formato español (1.234,56 €; 3,4 %).
