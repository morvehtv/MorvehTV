# MorvehTV para Smart TV

App para Android TV, Google TV y Fire TV (también funciona en móviles y tablets Android) que carga morvehtv.com con navegación completa por mando a distancia.

## La app

- **Intro:** al abrir la app suena y se ve una intro animada de unos 4 segundos, con sonido creado para la app. Se salta con cualquier botón y solo sale al abrir la app, no al volver del reproductor (`assets/tv/intro.mp3` y la sección INTRO de `tv.css`).

La app tiene su propia interfaz, al estilo de una plataforma de streaming. El catálogo se lee directamente de morvehtv.com, así que todo lo que publiques en la web aparece en la app.

- **Inicio:** un destacado grande y filas de Seguir viendo, Novedades, cada categoría y Mi lista. Al moverte por las tarjetas, el destacado muestra la información del título seleccionado.
- **Ficha:** póster, nota, año, duración, géneros, sinopsis, reparto, episodios (en series) y más títulos.
- **Reproducir (ExoPlayer):** la app abre la película en segundo plano, detecta la dirección real del vídeo (MP4, HLS/m3u8, DASH o el stream de movie-engine) y la reproduce con ExoPlayer a pantalla completa. Recuerda por dónde ibas y continúa desde ahí. Si un vídeo no se puede abrir en ExoPlayer, se usa automáticamente el reproductor de la web.
- **Buscar:** con un teclado en pantalla pensado para el mando.
- **Mi lista y Seguir viendo:** se guardan en la propia tele.
- **Contenido nuevo automático:** la app revisa la web cada 5 minutos y al volver a ella. Si publicas algo nuevo, aparece solo en las filas con la etiqueta NUEVO (durante 3 días o hasta abrirlo) y sale un aviso. En las series, al abrir la ficha se comprueba si hay episodios nuevos.
- **Web clásica:** en el menú lateral, para usar la web tal cual.

## Mando

| Botón | Qué hace |
|---|---|
| Flechas | Moverse por la interfaz |
| OK | Abrir o pulsar |
| ◀ en el borde izquierdo | Menú lateral (categorías, buscar, mi lista…) |
| Atrás | Volver. En el inicio: sube al destacado, abre el menú y, a la segunda, sale |
| Mantener OK | Modo cursor, para los controles del reproductor (idioma, servidor…) |

**En el reproductor** (ExoPlayer, a pantalla completa):

| Botón | Qué hace |
|---|---|
| Play/Pausa u OK | Pausar o reanudar |
| ◀ / ▶ o ⏪ / ⏩ | Retroceder o avanzar 10 s; al mantener, 30 s y luego 60 s |
| ▲ / ▼ | Mostrar los controles: barra de tiempo, subtítulos, audio y velocidad |
| Atrás | Volver a la ficha del contenido |

Si se usa el reproductor de la web porque ExoPlayer no pudo con ese vídeo, Play/Pausa y OK funcionan con un clic en el centro del reproductor. Para avanzar, usa el modo cursor.

## Archivos principales

- `app/src/main/assets/tv/`: la interfaz de la app (`index.html`, `tv.css`, `tv.js`).
- `app/src/main/assets/tvnav.js`: navegación con el mando dentro de la web y el modo reproductor.
- `app/src/main/java/com/morvehtv/tv/MainActivity.java`: la app Android y la detección del vídeo.
- `app/src/main/java/com/morvehtv/tv/PlayerActivity.java`: el reproductor ExoPlayer.

Cada vez que se sube un cambio a GitHub, se compila sola y se publica una release con el APK (`v` + `versionName`).

## Generar el APK

### Opción A: con GitHub, sin instalar nada
1. Crea un repositorio en GitHub y sube esta carpeta.
2. Ve a la pestaña **Actions**. Se compila sola en unos 5 minutos.
3. Abre la ejecución terminada y descarga **MorvehTV-apk** (es un .zip con el `.apk` dentro).

### Opción B: con Android Studio
1. Abre la carpeta `MorvehTV` con Android Studio.
2. Elige **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
3. El APK queda en `app/build/outputs/apk/`.

## Instalarlo en la tele

- **Android TV / Google TV:** activa *Ajustes → Sistema → Información → pulsa 7 veces "Compilación del SO"* para activar las opciones de desarrollador y permite "Orígenes desconocidos". Después pasa el APK con un USB, o sube el APK a internet e instálalo con la app **Downloader**.
- **Fire TV:** instala **Downloader** desde la tienda de Amazon, activa *Ajustes → Mi Fire TV → Opciones para desarrolladores → Instalar apps desconocidas → Downloader*, y descarga el APK escribiendo su enlace.
- **Por cable o red (adb):** `adb connect IP_DE_LA_TELE` y luego `adb install MorvehTV.apk`.

La app aparecerá en la fila de apps de la tele con su banner.

## Personalizar

- **Dominios permitidos:** en `MainActivity.java`, `ALLOWED_HOSTS`. Si al pulsar "Play" sale "Enlace externo bloqueado", añade ahí el dominio del servidor de vídeo. Los reproductores incrustados (iframes) no se bloquean.
- **Menú lateral:** la lista `MENU` al principio de `app/src/main/assets/tvnav.js`.
- **Buscador:** el menú usa `https://morvehtv.com/?s=texto`, la búsqueda estándar de WordPress. Si tu web usa otra dirección de búsqueda, cámbiala en `tvnav.js`.
- **Icono y banner:** `app/src/main/res/mipmap-*/ic_launcher.png` y `drawable-xhdpi/banner.png` (320×180 dp; el archivo mide 640×360 px).

## Publicar en Google Play
El APK se firma con la clave `morvehtv.jks` (contraseña `morvehtv2026`). Guarda una copia: sin ella no podrás publicar actualizaciones de la app. Además, sube `targetSdk` al nivel que pida Play en ese momento.
