# MorvehTV para Smart TV

App para Android TV, Google TV y Fire TV (también funciona en móviles y tablets Android) que carga morvehtv.com con navegación completa por mando a distancia.

## Cómo se usa con el mando

| Botón | Qué hace |
|---|---|
| Flechas | Mueven el foco (recuadro amarillo) entre películas, botones y menús |
| OK | Abre o pulsa lo que está enfocado |
| ◀ en el borde izquierdo | Abre el menú lateral: Inicio, Buscar, Películas, Series, Documentales, Anime, Telenovelas… |
| Mantener OK (o botón Menú / Rojo) | Activa o desactiva el **modo cursor** (una flecha que se mueve con las flechas), para los controles del reproductor |
| Atrás | Cierra menús y ventanas (tráiler), sale de pantalla completa o vuelve a la página anterior. Si lo pulsas dos veces en la página de inicio, sale de la app |
| Play/Pausa | Reproduce o pausa el vídeo |
| ⏩ / ⏪ | Avanza o retrocede 10 s (en reproductores incrustados de otro servidor, usa el modo cursor) |
| Canal + / Canal − | Sube o baja la página |

La app también bloquea las ventanas emergentes y las redirecciones a otros dominios (anuncios), arregla la pantalla completa de los reproductores y evita que la tele se apague mientras ves algo en pantalla completa.

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
