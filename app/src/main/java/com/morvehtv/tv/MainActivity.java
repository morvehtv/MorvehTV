package com.morvehtv.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * App de Smart TV para morvehtv.com.
 *
 * Toda la navegación con el mando se gestiona aquí y en assets/tvnav.js:
 *  - Flechas: mueven el foco entre elementos de la web (o el cursor en modo cursor).
 *  - OK: pulsa el elemento enfocado. Mantener OK: activa/desactiva el modo cursor.
 *  - Flecha izquierda en el borde: abre el menú lateral de categorías y búsqueda.
 *  - Atrás: cierra ventanas/menús, sale de pantalla completa, vuelve a la página anterior.
 *  - Play/Pausa, Avance y Retroceso del mando: controlan el vídeo.
 */
public class MainActivity extends Activity {

    /** Página de inicio de la app. */
    static final String SITE = "https://morvehtv.com";
    /** Interfaz propia de la app (assets/tv), servida dentro del dominio de la web. */
    static final String APP_PREFIX = SITE + "/__tv/";
    static final String HOME = APP_PREFIX + "index.html";

    /**
     * Dominios que se pueden abrir dentro de la app como página principal.
     * El resto (normalmente anuncios y redirecciones) se bloquean.
     * Si tu reproductor abre una página de otro dominio, añádelo aquí.
     */
    static final String[] ALLOWED_HOSTS = {
            "morvehtv.com",
    };

    private static final long LONG_PRESS_MS = 600;

    private WebView web;
    private FrameLayout fullscreen;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private ImageView cursor;
    private ProgressBar progress;
    private TextView toast;
    private View errorView;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String tvnavJs = "";

    private boolean cursorMode = false;
    private float cursorX, cursorY;
    private boolean editing = false;
    private boolean centerLongHandled = false;
    private long lastBackPress = 0;
    private boolean mainFrameError = false;

    // ---- ExoPlayer: detección del vídeo real que pide la página del reproductor
    private static final int REQ_PLAYER = 41;
    private volatile boolean capturing = false;
    private volatile String captureTitle = null, capturePage = null, captureSub = null;
    private volatile boolean launching = false;
    private String userAgent = null;
    private String lastPlayerPage = null;

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.web);
        fullscreen = findViewById(R.id.fullscreen);
        cursor = findViewById(R.id.cursor);
        progress = findViewById(R.id.progress);
        toast = findViewById(R.id.toast);
        errorView = findViewById(R.id.error);
        findViewById(R.id.retry).setOnClickListener(v -> retry());

        tvnavJs = readAsset("tvnav.js");
        setupWebView();

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME);
        }
        web.requestFocus();

        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        if (prefs.getInt("hints", 0) < 3) {
            prefs.edit().putInt("hints", prefs.getInt("hints", 0) + 1).apply();
            handler.postDelayed(() -> showToast(getString(R.string.hint), 6000), 2500);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        hideSystemUi();
        // al volver a la app, comprueba si hay contenido nuevo en la web
        js("window.__tvApp && __tvApp.check()");
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);           // sin ventanas emergentes
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Agente de usuario de Chrome normal (sin la marca "wv" de WebView) para que
        // la web y los reproductores se comporten como en un navegador.
        String ua = s.getUserAgentString().replace("; wv", "").replace("Version/4.0 ", "");
        s.setUserAgentString(ua);
        userAgent = ua;

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cm.setAcceptThirdPartyCookies(web, true);   // sesión y reproductores incrustados
        }

        web.setBackgroundColor(0xFF000000);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.addJavascriptInterface(new Bridge(), "TVBridge");

        web.setWebViewClient(new WebViewClient() {
            // Android 7 o superior
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (Build.VERSION.SDK_INT >= 21 && !req.isForMainFrame()) return false;
                return blockNavigation(req.getUrl());
            }

            // Android 4.4 a 6
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return blockNavigation(Uri.parse(url));
            }

            // Sirve la interfaz de la app desde assets/tv como si fuera parte de la web
            // (así puede leer el catálogo y la sesión del usuario sin problemas).
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (capturing) {
                    Map<String, String> h = req.getRequestHeaders();
                    checkMedia(u, h == null ? null : h.get("Referer"));
                }
                return serveApp(u);
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (capturing) checkMedia(url, null);
                return serveApp(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                mainFrameError = false;
                capturing = false;   // cada página del reproductor vuelve a pedirlo al cargar
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectNav();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                injectNav();
                if (!mainFrameError) errorView.setVisibility(View.GONE);
            }

            // Android 6 o superior
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    mainFrameError = true;
                    showError();
                }
            }

            // Android 4.4 y 5 (solo informa de errores de la página principal)
            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int code, String desc, String failingUrl) {
                if (Build.VERSION.SDK_INT < 23) {
                    mainFrameError = true;
                    showError();
                }
            }

            // Los Android anteriores a 7.1 no reconocen los certificados raíz modernos
            // (p. ej. Let's Encrypt). Solo en esos aparatos aceptamos ese caso concreto;
            // cualquier otro error de certificado se rechaza.
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                if (Build.VERSION.SDK_INT < 25 && error.getPrimaryError() == SslError.SSL_UNTRUSTED) {
                    handler.proceed();
                } else {
                    handler.cancel();
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // Si la tele se queda sin memoria, reiniciamos la pantalla en vez de cerrar la app.
                recreate();
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                if (p >= 100) progress.setVisibility(View.GONE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                enterFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                // Evita el icono gris de "play" que pone WebView antes de cargar el vídeo.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
    }

    // ------------------------------------------------------------------ ExoPlayer

    private static final java.util.regex.Pattern MEDIA = java.util.regex.Pattern.compile(
            "(\\.(m3u8|mpd|mp4|m4v|mkv|webm|mov)(\\?|#|$))|/movie-engine/v1/stream/", java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern SUB = java.util.regex.Pattern.compile(
            "(\\.(vtt|srt)(\\?|#|$))|/movie-engine/v1/subtitle/", java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern NOT_MEDIA = java.util.regex.Pattern.compile(
            "youtube|youtu\\.be|googlevideo|doubleclick|googlesyndication|imasdk|adservice|/ads?/|trailer|preroll|vast",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    /** Se llama (en segundo plano) por cada petición mientras se busca el vídeo de la película. */
    private void checkMedia(String url, String referer) {
        if (url == null || !url.startsWith("http")) return;
        if (SUB.matcher(url).find()) { captureSub = url; return; }
        if (!MEDIA.matcher(url).find() || NOT_MEDIA.matcher(url).find()) return;
        capturing = false;
        final String ref = referer != null ? referer : capturePage;
        // espera un instante por si llegan los subtítulos justo después
        handler.postDelayed(() -> launchPlayer(url, ref, captureTitle), 600);
    }

    private void launchPlayer(String url, String referer, String title) {
        if (launching) return;
        launching = true;
        capturing = false;
        lastPlayerPage = capturePage;
        // para el vídeo de la página y vuelve a la ficha de la app mientras se reproduce
        js("Array.prototype.forEach.call(document.querySelectorAll('video'),function(v){try{v.pause();v.removeAttribute('src');v.load()}catch(e){}})");
        if (customView != null) exitFullscreen();
        setCursorMode(false);
        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra(PlayerActivity.EXTRA_URL, url);
        i.putExtra(PlayerActivity.EXTRA_REFERER, referer);
        i.putExtra(PlayerActivity.EXTRA_TITLE, title);
        i.putExtra(PlayerActivity.EXTRA_SUBTITLE, captureSub);
        i.putExtra(PlayerActivity.EXTRA_USER_AGENT, userAgent);
        i.putExtra(PlayerActivity.EXTRA_KEY, capturePage != null ? capturePage.replaceAll("#.*$", "") : url);
        startActivityForResult(i, REQ_PLAYER);
        web.loadUrl(HOME);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PLAYER) return;
        launching = false;
        if (resultCode == RESULT_FIRST_USER && lastPlayerPage != null) {
            // ExoPlayer no pudo con este vídeo: se usa el reproductor de la web
            web.loadUrl(lastPlayerPage.replaceAll("#.*$", "") + "#tvweb");
        }
    }

    private WebResourceResponse serveApp(String url) {
        if (url == null || !url.startsWith(APP_PREFIX)) return null;
        String path = url.substring(APP_PREFIX.length());
        int cut = path.indexOf('?');
        if (cut >= 0) path = path.substring(0, cut);
        cut = path.indexOf('#');
        if (cut >= 0) path = path.substring(0, cut);
        if (path.isEmpty()) path = "index.html";
        if (path.contains("..")) return null;
        String mime = path.endsWith(".js") ? "application/javascript"
                : path.endsWith(".css") ? "text/css"
                : path.endsWith(".png") ? "image/png"
                : path.endsWith(".svg") ? "image/svg+xml"
                : "text/html";
        try {
            InputStream in = getAssets().open("tv/" + path);
            WebResourceResponse r = new WebResourceResponse(mime, "UTF-8", in);
            if (Build.VERSION.SDK_INT >= 21) {
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-store");
                h.put("Access-Control-Allow-Origin", SITE);
                r.setResponseHeaders(h);
                r.setStatusCodeAndReasonPhrase(200, "OK");
            }
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean blockNavigation(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (!scheme.startsWith("http")) return true;   // intent://, market://, etc.
        if (isAllowedHost(u.getHost())) return false;
        showToast(getString(R.string.external_blocked), 2000);
        return true;
    }

    private boolean isAllowedHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase();
        for (String h : ALLOWED_HOSTS) {
            if (host.equals(h) || host.endsWith("." + h)) return true;
        }
        return false;
    }

    private void injectNav() {
        if (!tvnavJs.isEmpty()) web.evaluateJavascript(tvnavJs, null);
    }

    private void js(String code) {
        web.evaluateJavascript("try{" + code + "}catch(e){}", null);
    }

    private void showError() {
        progress.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
        findViewById(R.id.retry).requestFocus();
    }

    private void retry() {
        errorView.setVisibility(View.GONE);
        String url = web.getUrl();
        if (url == null || url.startsWith("about:") || url.startsWith("data:")) {
            web.loadUrl(HOME);
        } else {
            web.reload();
        }
        web.requestFocus();
    }

    // ------------------------------------------------------------------ pantalla completa

    private void enterFullscreen(View view, WebChromeClient.CustomViewCallback cb) {
        if (customView != null) {
            cb.onCustomViewHidden();
            return;
        }
        customView = view;
        customCallback = cb;
        fullscreen.addView(view, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        fullscreen.setVisibility(View.VISIBLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
    }

    private void exitFullscreen() {
        if (customView == null) return;
        fullscreen.removeView(customView);
        fullscreen.setVisibility(View.GONE);
        customView = null;
        if (customCallback != null) {
            WebChromeClient.CustomViewCallback cb = customCallback;
            customCallback = null;
            cb.onCustomViewHidden();
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web.requestFocus();
        hideSystemUi();
    }

    // ------------------------------------------------------------------ mando a distancia

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        final int code = e.getKeyCode();
        final boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        final boolean first = down && e.getRepeatCount() == 0;

        // Pantalla de error: navegación nativa normal (botón Reintentar).
        if (errorView.getVisibility() == View.VISIBLE) {
            if (code == KeyEvent.KEYCODE_BACK) {
                if (!down) finish();
                return true;
            }
            return super.dispatchKeyEvent(e);
        }

        switch (code) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                if (!down && e.getRepeatCount() == 0 && !e.isCanceled()) handleBack();
                return true;

            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_PROG_RED:
            case KeyEvent.KEYCODE_BOOKMARK:
                if (first) toggleCursor();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_SPACE:
                if (editing && code == KeyEvent.KEYCODE_SPACE) return super.dispatchKeyEvent(e);
                if (first) media("toggle");
                return true;

            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                if (first) media("ff");
                return true;

            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                if (first) media("rw");
                return true;

            case KeyEvent.KEYCODE_PAGE_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                if (down) js("window.scrollBy(0, innerHeight*0.8)");
                return true;

            case KeyEvent.KEYCODE_PAGE_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                if (down) js("window.scrollBy(0, -innerHeight*0.8)");
                return true;
        }

        boolean isArrow = code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN
                || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT;
        boolean isOk = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER || code == KeyEvent.KEYCODE_BUTTON_A;

        if (!isArrow && !isOk) return super.dispatchKeyEvent(e);

        // Escribiendo en un cuadro de texto: el texto y el Enter van a la web.
        if (editing && !cursorMode) {
            if (isOk || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT) {
                return super.dispatchKeyEvent(e);
            }
        }

        // OK: pulsación corta = pulsar, pulsación larga = modo cursor.
        if (isOk) {
            if (down) {
                if (e.getRepeatCount() == 0) {
                    centerLongHandled = false;
                } else if (!centerLongHandled && e.getEventTime() - e.getDownTime() >= LONG_PRESS_MS) {
                    centerLongHandled = true;
                    toggleCursor();
                }
            } else if (!centerLongHandled && !e.isCanceled()) {
                if (cursorMode) clickAtCursor();
                else if (customView != null) media("toggle");
                else activate();
            }
            return true;
        }

        // Flechas
        if (cursorMode) {
            if (down) moveCursor(code, e.getRepeatCount());
            return true;
        }
        if (customView != null) {
            // Pantalla completa: ◀ ▶ retroceden/avanzan; ▲ ▼ activan el cursor para los controles del reproductor.
            if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if (down) media(code == KeyEvent.KEYCODE_DPAD_LEFT ? "rw" : "ff");
            } else if (first) {
                setCursorMode(true);
                moveCursor(code, 0);
            }
            return true;
        }
        if (down) {
            String dir = code == KeyEvent.KEYCODE_DPAD_UP ? "up"
                    : code == KeyEvent.KEYCODE_DPAD_DOWN ? "down"
                    : code == KeyEvent.KEYCODE_DPAD_LEFT ? "left" : "right";
            web.evaluateJavascript("window.__tvnav ? __tvnav.move('" + dir + "') : null", r -> {
                if ("null".equals(r)) {
                    // El script aún no estaba inyectado (página cargando): inyecta y reintenta.
                    injectNav();
                    js("window.__tvnav && __tvnav.move('" + dir + "')");
                }
            });
        }
        return true;
    }

    private void handleBack() {
        if (customView != null) {
            js("document.fullscreenElement && document.exitFullscreen()");
            exitFullscreen();
            setCursorMode(false);
            js("window.__tvnav && __tvnav.isPlayer && __tvnav.isPlayer() && __tvnav.back()");
            return;
        }
        if (cursorMode) {
            setCursorMode(false);
            return;
        }
        web.evaluateJavascript("window.__tvnav ? __tvnav.back() : false", r -> {
            if ("true".equals(r)) return;
            boolean exit = "\"exit\"".equals(r);   // la interfaz de la app pide salir
            if (!exit && web.canGoBack()) {
                web.goBack();
                return;
            }
            long now = SystemClock.uptimeMillis();
            if (now - lastBackPress < 2500) {
                finish();
            } else {
                lastBackPress = now;
                showToast(getString(R.string.press_back_again), 2500);
            }
        });
    }

    private void activate() {
        web.evaluateJavascript("window.__tvnav ? JSON.stringify(__tvnav.activate()) : null", r -> {
            JSONObject o = parseJsResult(r);
            if (o != null && o.optBoolean("tap")) {
                tapAt(web, (float) o.optDouble("x"), (float) o.optDouble("y"));
            }
        });
    }

    private void media(String action) {
        web.evaluateJavascript("window.__tvnav ? JSON.stringify(__tvnav.media('" + action + "')) : null", r -> {
            JSONObject o = parseJsResult(r);
            if (o != null && o.optBoolean("ok")) return;          // el vídeo se controló directamente
            if (o != null && o.optBoolean("noseek")) {
                showToast(getString(R.string.seek_hint), 3000);
                return;
            }
            if (!"toggle".equals(action)) return;
            // reproductor de otro servidor: un clic en el centro pausa o reanuda
            if (customView != null) {
                tapCenter(customView);
            } else if (o != null && o.optBoolean("tap")) {
                tapAt(web, (float) o.optDouble("x"), (float) o.optDouble("y"));
            }
        });
    }

    /** evaluateJavascript devuelve el resultado codificado como JSON (una cadena con comillas). */
    private static JSONObject parseJsResult(String r) {
        try {
            if (r == null || "null".equals(r) || "undefined".equals(r)) return null;
            String json = new org.json.JSONTokener(r).nextValue().toString();
            if ("null".equals(json)) return null;
            return new JSONObject(json);
        } catch (Exception ex) {
            return null;
        }
    }

    // ------------------------------------------------------------------ toques simulados

    private void tapCenter(View target) {
        tapAt(target, target.getWidth() / 2f, target.getHeight() / 2f);
    }

    /** Simula un toque real (cuenta como gesto del usuario, útil para reproductores). */
    private void tapAt(View target, float x, float y) {
        final long t = SystemClock.uptimeMillis();
        MotionEvent d = pointerEvent(t, t, MotionEvent.ACTION_DOWN, x, y);
        target.dispatchTouchEvent(d);
        d.recycle();
        handler.postDelayed(() -> {
            MotionEvent u = pointerEvent(t, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y);
            target.dispatchTouchEvent(u);
            u.recycle();
        }, 60);
    }

    /** Evento de puntero tipo ratón: en los reproductores equivale a un clic real (pausa/reproduce). */
    private static MotionEvent pointerEvent(long down, long when, int action, float x, float y) {
        MotionEvent.PointerProperties[] pp = { new MotionEvent.PointerProperties() };
        pp[0].id = 0;
        pp[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords[] pc = { new MotionEvent.PointerCoords() };
        pc[0].x = x;
        pc[0].y = y;
        pc[0].pressure = 1f;
        pc[0].size = 1f;
        int buttons = action == MotionEvent.ACTION_UP ? 0 : MotionEvent.BUTTON_PRIMARY;
        return MotionEvent.obtain(down, when, action, 1, pp, pc, 0, buttons, 1f, 1f, 0, 0,
                android.view.InputDevice.SOURCE_MOUSE, 0);
    }

    // ------------------------------------------------------------------ modo cursor

    private void toggleCursor() {
        setCursorMode(!cursorMode);
        showToast(getString(cursorMode ? R.string.cursor_on : R.string.cursor_off), 2500);
    }

    private void setCursorMode(boolean on) {
        if (on == cursorMode) return;
        cursorMode = on;
        if (on) {
            View root = findViewById(R.id.root);
            if (cursorX <= 0 && cursorY <= 0) {
                cursorX = root.getWidth() / 2f;
                cursorY = root.getHeight() / 2f;
            }
            placeCursor();
            cursor.setVisibility(View.VISIBLE);
            cursor.bringToFront();
        } else {
            cursor.setVisibility(View.GONE);
        }
    }

    private void moveCursor(int code, int repeat) {
        View root = findViewById(R.id.root);
        float density = getResources().getDisplayMetrics().density;
        float step = Math.min(10 + repeat * 3, 48) * density;   // acelera al mantener pulsado
        float w = root.getWidth(), h = root.getHeight();
        float edge = 24 * density;

        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP:    cursorY -= step; break;
            case KeyEvent.KEYCODE_DPAD_DOWN:  cursorY += step; break;
            case KeyEvent.KEYCODE_DPAD_LEFT:  cursorX -= step; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: cursorX += step; break;
        }
        // Al llegar arriba o abajo, desplaza la página.
        if (customView == null) {
            if (cursorY < edge) js("window.scrollBy(0," + (-(int) (step / density) * 2) + ")");
            if (cursorY > h - edge) js("window.scrollBy(0," + ((int) (step / density) * 2) + ")");
        }
        cursorX = Math.max(0, Math.min(w - 1, cursorX));
        cursorY = Math.max(0, Math.min(h - 1, cursorY));
        placeCursor();
    }

    private void placeCursor() {
        // La punta de la flecha está a (3,2)/24 del icono.
        float size = cursor.getLayoutParams().width;
        cursor.setX(cursorX - size * 3f / 24f);
        cursor.setY(cursorY - size * 2f / 24f);
    }

    private void clickAtCursor() {
        View target = customView != null ? customView : web;
        int[] loc = new int[2];
        target.getLocationInWindow(loc);
        View root = findViewById(R.id.root);
        int[] rloc = new int[2];
        root.getLocationInWindow(rloc);
        tapAt(target, cursorX + rloc[0] - loc[0], cursorY + rloc[1] - loc[1]);
    }

    // ------------------------------------------------------------------ avisos

    private final Runnable hideToast = () -> toast.setVisibility(View.GONE);

    private void showToast(String msg, int ms) {
        toast.setText(msg);
        toast.setVisibility(View.VISIBLE);
        toast.bringToFront();
        if (cursorMode) cursor.bringToFront();
        handler.removeCallbacks(hideToast);
        handler.postDelayed(hideToast, ms);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    // ------------------------------------------------------------------ puente JS → app

    public class Bridge {
        @JavascriptInterface
        public void setEditing(boolean value) {
            handler.post(() -> editing = value);
        }

        @JavascriptInterface
        public void toggleCursor() {
            handler.post(MainActivity.this::toggleCursor);
        }

        @JavascriptInterface
        public void setPlaying(boolean playing) {
            handler.post(() -> {
                if (playing) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else if (customView == null) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** La página del reproductor empieza: busca el vídeo real para abrirlo en ExoPlayer. */
        @JavascriptInterface
        public void startCapture(String title, String pageUrl) {
            captureTitle = title;
            capturePage = pageUrl;
            captureSub = null;
            launching = false;
            capturing = true;
            // si en 25 s no aparece un vídeo reconocible, se queda el reproductor de la web
            handler.postDelayed(() -> capturing = false, 25000);
        }

        /** La página ya conoce la dirección del vídeo (reproductor propio de la web). */
        @JavascriptInterface
        public void playUrl(String url, String title, String pageUrl) {
            if (!capturing || url == null || !url.startsWith("http")) return;
            capturing = false;
            if (pageUrl != null) capturePage = pageUrl;
            handler.post(() -> launchPlayer(url, pageUrl, title));
        }

        /** Clic real (cuenta como gesto del usuario) en coordenadas de pantalla de la web. */
        @JavascriptInterface
        public void click(float x, float y) {
            handler.post(() -> tapAt(web, x, y));
        }

        /** Aviso breve en pantalla (visible también a pantalla completa). */
        @JavascriptInterface
        public void osd(String msg) {
            handler.post(() -> showToast(msg, 1500));
        }

        @JavascriptInterface
        public void reload() {
            handler.post(() -> web.reload());
        }

        @JavascriptInterface
        public void exitApp() {
            handler.post(MainActivity.this::finish);
        }
    }
}
