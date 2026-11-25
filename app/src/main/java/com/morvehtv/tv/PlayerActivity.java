package com.morvehtv.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Reproductor ExoPlayer a pantalla completa, manejado con el mando:
 *  OK / Play-Pausa: pausar o reanudar · ◀ ▶ / ⏪ ⏩: retroceder o avanzar 10 s (más al mantener)
 *  ▲ ▼: mostrar los controles (subtítulos, audio, velocidad) · Atrás: volver a la ficha.
 * Si el vídeo no se puede reproducir aquí, devuelve RESULT_FIRST_USER para usar el reproductor de la web.
 */
public class PlayerActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_REFERER = "referer";
    public static final String EXTRA_SUBTITLE = "subtitle";
    public static final String EXTRA_KEY = "key";
    public static final String EXTRA_USER_AGENT = "ua";

    private ExoPlayer player;
    private PlayerView view;
    private TextView titleView, osd;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private String url, referer, subtitle, key, userAgent;
    private int attempt = 0;        // 0: tipo por extensión · 1: probar como HLS · 2: probar como DASH
    private boolean finished = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_player);
        view = findViewById(R.id.player);
        titleView = findViewById(R.id.title);
        osd = findViewById(R.id.osd);

        Intent in = getIntent();
        url = in.getStringExtra(EXTRA_URL);
        referer = in.getStringExtra(EXTRA_REFERER);
        subtitle = in.getStringExtra(EXTRA_SUBTITLE);
        userAgent = in.getStringExtra(EXTRA_USER_AGENT);
        key = in.getStringExtra(EXTRA_KEY);
        if (key == null) key = url;
        String title = in.getStringExtra(EXTRA_TITLE);
        titleView.setText(title == null ? "" : title);

        view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        view.setControllerShowTimeoutMs(3500);
        view.setControllerAutoShow(true);
        view.setKeepScreenOn(true);
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility ->
                titleView.setVisibility(visibility));
        view.requestFocus();

        start(savedPosition());
    }

    // ------------------------------------------------------------------ reproducción

    private void start(long position) {
        if (url == null) { fail(); return; }
        releasePlayer();

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(20000)
                .setReadTimeoutMs(30000);
        if (userAgent != null) http.setUserAgent(userAgent);
        Map<String, String> headers = new HashMap<>();
        if (referer != null) {
            headers.put("Referer", referer);
            Uri r = Uri.parse(referer);
            if (r.getScheme() != null && r.getHost() != null) headers.put("Origin", r.getScheme() + "://" + r.getHost());
        }
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null && !cookies.isEmpty()) headers.put("Cookie", cookies);
        http.setDefaultRequestProperties(headers);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(10000)
                .build();
        view.setPlayer(player);

        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        String mime = mimeFor(url, attempt);
        if (mime != null) item.setMimeType(mime);
        if (subtitle != null) {
            item.setSubtitleConfigurations(Collections.singletonList(
                    new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle))
                            .setMimeType(subtitle.toLowerCase(Locale.ROOT).contains(".srt") ? MimeTypes.APPLICATION_SUBRIP : MimeTypes.TEXT_VTT)
                            .setLanguage("es")
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .build()));
        }
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                long pos = player != null ? player.getCurrentPosition() : 0;
                // si el tipo de vídeo no se conocía, se prueba como HLS y luego como DASH
                if (!hasKnownExtension(url) && attempt < 2 && pos < 1000) {
                    attempt++;
                    handler.post(() -> start(0));
                } else {
                    fail();
                }
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    prefs().edit().remove(key).apply();
                    finishOk();
                }
            }
        });
        player.setMediaItem(item.build(), Math.max(0, position));
        player.prepare();
        player.setPlayWhenReady(true);
        if (position > 0) showOsd(getString(R.string.player_resume, fmt(position)));
    }

    private static boolean hasKnownExtension(String u) {
        String p = Uri.parse(u).getPath();
        p = p == null ? "" : p.toLowerCase(Locale.ROOT);
        return p.endsWith(".m3u8") || p.endsWith(".mpd") || p.endsWith(".mp4") || p.endsWith(".mkv")
                || p.endsWith(".webm") || p.endsWith(".m4v") || p.endsWith(".mov") || p.endsWith(".ts");
    }

    private static String mimeFor(String u, int attempt) {
        String p = Uri.parse(u).getPath();
        p = p == null ? "" : p.toLowerCase(Locale.ROOT);
        if (p.endsWith(".m3u8") || u.contains(".m3u8")) return MimeTypes.APPLICATION_M3U8;
        if (p.endsWith(".mpd")) return MimeTypes.APPLICATION_MPD;
        if (hasKnownExtension(u)) return null;
        if (attempt == 1) return MimeTypes.APPLICATION_M3U8;
        if (attempt == 2) return MimeTypes.APPLICATION_MPD;
        return null;
    }

    private void fail() {
        if (finished) return;
        finished = true;
        Toast.makeText(this, R.string.player_error, Toast.LENGTH_LONG).show();
        setResult(RESULT_FIRST_USER);
        finish();
    }

    private void finishOk() {
        if (finished) return;
        finished = true;
        setResult(RESULT_OK);
        finish();
    }

    // ------------------------------------------------------------------ posición guardada

    private SharedPreferences prefs() { return getSharedPreferences("player", MODE_PRIVATE); }

    private long savedPosition() {
        long p = prefs().getLong(key, 0);
        return p > 30000 ? p - 3000 : 0;   // reanuda un poco antes de donde lo dejaste
    }

    private void savePosition() {
        if (player == null) return;
        long pos = player.getCurrentPosition(), dur = player.getDuration();
        if (dur > 0 && dur != C.TIME_UNSET && pos > dur - 90000) prefs().edit().remove(key).apply();  // casi terminado
        else if (pos > 30000) prefs().edit().putLong(key, pos).apply();
    }

    // ------------------------------------------------------------------ mando

    private int seekStreak = 0;
    private long lastSeek = 0;

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        boolean first = down && e.getRepeatCount() == 0;
        boolean controls = view.isControllerFullyVisible();

        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_SPACE:
                if (first) toggle(code);
                return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                if (down) seek(+1, e.getRepeatCount());
                return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                if (down) seek(-1, e.getRepeatCount());
                return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                // ◀ ▶ siempre avanzan/retroceden, salvo que se esté en la fila de botones inferior
                if (!controls || !focusInBottomBar()) {
                    if (down) seek(code == KeyEvent.KEYCODE_DPAD_RIGHT ? +1 : -1, e.getRepeatCount());
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (!controls) {
                    if (first) toggle(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
                if (!controls) {
                    if (first) view.showController();
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                // Atrás: sale del reproductor y vuelve a la ficha del contenido
                if (!down && !e.isCanceled()) {
                    savePosition();
                    finishOk();
                }
                return true;
        }
        return super.dispatchKeyEvent(e);
    }

    /** ¿El foco está en un botón de la barra inferior (subtítulos, ajustes…)? */
    private boolean focusInBottomBar() {
        View f = getCurrentFocus();
        if (f == null) return false;
        int id = f.getId();
        return id != View.NO_ID && id != androidx.media3.ui.R.id.exo_play_pause
                && id != androidx.media3.ui.R.id.exo_rew && id != androidx.media3.ui.R.id.exo_ffwd
                && id != androidx.media3.ui.R.id.exo_prev && id != androidx.media3.ui.R.id.exo_next
                && id != R.id.player;
    }

    private void toggle(int code) {
        if (player == null) return;
        boolean play = code == KeyEvent.KEYCODE_MEDIA_PLAY
                || (code != KeyEvent.KEYCODE_MEDIA_PAUSE && !player.getPlayWhenReady());
        if (play && player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
        player.setPlayWhenReady(play);
        showOsd(play ? "▶" : "❚❚  " + fmt(player.getCurrentPosition()) + durText());
        if (!play) view.showController();
    }

    private void seek(int dir, int repeat) {
        if (player == null) return;
        long now = System.currentTimeMillis();
        seekStreak = (now - lastSeek < 700 && repeat > 0) ? seekStreak + 1 : 0;
        lastSeek = now;
        long step = seekStreak > 20 ? 60000 : seekStreak > 6 ? 30000 : 10000;   // acelera al mantener pulsado
        long dur = player.getDuration();
        long to = player.getCurrentPosition() + dir * step;
        if (dur > 0 && dur != C.TIME_UNSET) to = Math.min(to, dur - 1000);
        to = Math.max(0, to);
        player.seekTo(to);
        showOsd((dir > 0 ? "+" : "−") + (step / 1000) + " s   " + fmt(to) + durText());
    }

    private String durText() {
        long d = player == null ? C.TIME_UNSET : player.getDuration();
        return d > 0 && d != C.TIME_UNSET ? " / " + fmt(d) : "";
    }

    private static String fmt(long ms) {
        long s = Math.max(0, ms / 1000), h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, sec) : String.format(Locale.ROOT, "%d:%02d", m, sec);
    }

    private final Runnable hideOsd = () -> osd.setVisibility(View.GONE);

    private void showOsd(String text) {
        osd.setText(text);
        osd.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideOsd);
        handler.postDelayed(hideOsd, 1600);
    }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        savePosition();
        if (player != null) player.setPlayWhenReady(false);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        savePosition();
        releasePlayer();
        super.onDestroy();
    }

    private void releasePlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
