/*
 * MorvehTV · navegación con mando a distancia (se inyecta en cada página).
 * Lo llama la app nativa: __tvnav.move(dir), activate(), back(), media(action).
 */
(function () {
  'use strict';
  if (location.pathname.indexOf('/__tv/') === 0) return;   // la interfaz propia tiene su navegación
  if (window.__tvnav) { window.__tvnav.refresh(); return; }

  // Compatibilidad con el navegador de Android 4.4 / 5.
  var EP = window.Element && Element.prototype;
  if (EP && !EP.matches) {
    EP.matches = EP.webkitMatchesSelector || EP.msMatchesSelector || function (sel) {
      var m = (this.ownerDocument || document).querySelectorAll(sel), i = m.length;
      while (--i >= 0 && m[i] !== this) {}
      return i > -1;
    };
  }
  if (EP && !EP.closest) {
    EP.closest = function (sel) {
      var el = this;
      while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; }
      return null;
    };
  }

  var ORIGIN = 'https://morvehtv.com';
  var APP_URL = ORIGIN + '/__tv/index.html';
  var MENU = [
    ['◀ Volver a la app', '#app'],
    ['Inicio de la web', '/'],
    ['Buscar', '#search'],
    ['Películas', '/peliculas/'],
    ['Series', '/series/'],
    ['Documentales', '/documentales/'],
    ['Docuseries', '/docuseries/'],
    ['Películas anime', '/peliculas-anime/'],
    ['Series anime', '/series-anime/'],
    ['Telenovelas', '/telenovelas/'],
    ['Mi cuenta', '/movie-engine-login/'],
    ['Modo cursor', '#cursor'],
    ['Recargar', '#reload']
  ];

  var Bridge = window.TVBridge || {
    setEditing: function () {}, toggleCursor: function () {}, setPlaying: function () {},
    reload: function () { location.reload(); }, exitApp: function () {}
  };
  if (!Bridge.osd) Bridge.osd = function () {};

  var SEL = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=option]',
    '[tabindex]:not([tabindex="-1"])', '[onclick]', '[data-toggle]', '[data-bs-toggle]',
    'iframe', 'video', 'label[for]'
  ].join(',');

  var cur = null;          // elemento con el foco del mando
  var menuOpen = false;
  var menuIndex = 0;
  var menuEl = null;

  // ------------------------------------------------------------ estilos

  function addStyle() {
    if (document.getElementById('tvnav-style')) return;
    var st = document.createElement('style');
    st.id = 'tvnav-style';
    st.textContent = [
      '.tvnav-focus{outline:4px solid #FFC107 !important;outline-offset:3px !important;',
      'box-shadow:0 0 0 7px rgba(255,193,7,.28),0 10px 28px rgba(0,0,0,.65) !important;border-radius:6px;}',
      '.tvnav-card{transform:scale(1.06) !important;transition:transform .12s ease-out !important;z-index:3 !important;}',
      'iframe.tvnav-focus,video.tvnav-focus{outline-offset:-4px !important;}',
      '*{-webkit-tap-highlight-color:transparent !important;}',
      'html{scroll-behavior:auto !important;}',
      '#tvnav-menu{position:fixed;top:0;left:0;bottom:0;width:340px;z-index:2147483646;',
      'background:linear-gradient(180deg,#1d0b2b 0%,#120618 100%);box-shadow:8px 0 40px rgba(0,0,0,.7);',
      'transform:translateX(-110%);transition:transform .18s ease-out;padding:28px 0;overflow-y:auto;',
      'font-family:system-ui,-apple-system,Roboto,Arial,sans-serif;}',
      '#tvnav-menu.open{transform:none;}',
      '#tvnav-menu .tvm-logo{color:#fff;font-size:30px;font-weight:800;padding:0 32px 22px;letter-spacing:.5px}',
      '#tvnav-menu .tvm-logo b{color:#FFC107}',
      '#tvnav-menu .tvm-item{display:block;margin:4px 16px;padding:13px 18px;border-radius:10px;color:#ddd;',
      'font-size:21px;line-height:1.2;white-space:nowrap;}',
      '#tvnav-menu .tvm-item.sel{background:#FFC107;color:#000;font-weight:700;}',
      '#tvnav-menu .tvm-item.here:not(.sel){color:#FFC107;}',
      '#tvnav-menu input{width:100%;box-sizing:border-box;font-size:20px;padding:10px 12px;border-radius:8px;',
      'border:2px solid #FFC107;background:#fff;color:#000;margin-top:8px;display:none}',
      '#tvnav-menu .tvm-item.searching input{display:block}',
      '#tvnav-menu .tvm-hint{color:#8a7f95;font-size:15px;padding:18px 34px 0;line-height:1.5}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  // ------------------------------------------------------------ utilidades

  function vw() { return window.innerWidth || document.documentElement.clientWidth; }
  function vh() { return window.innerHeight || document.documentElement.clientHeight; }

  function isBig(r) { return r.width * r.height > vw() * vh() * 0.6; }

  function isText(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    if (el.tagName !== 'INPUT') return false;
    var t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'password', 'url', 'tel', 'number'].indexOf(t) >= 0;
  }

  var hiddenCache = null;   // caché de ancestros ocultos durante un mismo cálculo

  function ancestorHidden(p) {
    if (!p || p === document.body || p === document.documentElement) return false;
    if (hiddenCache && hiddenCache.has(p)) return hiddenCache.get(p);
    var ps = getComputedStyle(p);
    var res = parseFloat(ps.opacity) < 0.05 || ps.visibility === 'hidden' || ancestorHidden(p.parentElement);
    if (hiddenCache) hiddenCache.set(p, res);
    return res;
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
    if (parseFloat(s.opacity) < 0.05) return false;
    if (el.offsetParent === null && s.position !== 'fixed' && el.tagName !== 'BODY') return false;
    // ancestros ocultos con opacidad 0 (menús desplegables cerrados, etc.)
    return !ancestorHidden(el.parentElement);
  }

  // Si hay una ventana emergente (modal) abierta, la navegación se limita a ella.
  var scopeIsGeneric = false;

  function scopeRoot() {
    scopeIsGeneric = false;
    if (menuOpen && menuEl) return menuEl;
    if (playerBox && document.contains(playerBox)) return playerBox;
    var modals = document.querySelectorAll(
      'dialog[open],[aria-modal="true"],.modal.show,.modal.in,.modal.open,.modal.active,.modal.is-open,' +
      '.mfp-wrap,.fancybox-container,.lity,.lightbox.open,[class*="modal"][class*="open"],' +
      '[class*="modal"][class*="active"],[class*="popup"][class*="open"],[class*="popup"][class*="active"]');
    for (var i = modals.length - 1; i >= 0; i--) {
      var m = modals[i];
      if (m.id === 'tvnav-menu') continue;
      if (visible(m) && m.querySelector(SEL)) return m;
    }
    // Detección genérica: capa fija que cubre el centro de la pantalla.
    var hit = document.elementFromPoint(vw() / 2, vh() / 2);
    while (hit && hit !== document.body && hit !== document.documentElement) {
      var s = getComputedStyle(hit);
      if (s.position === 'fixed') {
        var r = hit.getBoundingClientRect();
        if (r.width >= vw() * 0.5 && r.height >= vh() * 0.5 && hit.querySelector(SEL) &&
            hit.id !== 'tvnav-menu') { scopeIsGeneric = true; return hit; }
        break;
      }
      hit = hit.parentElement;
    }
    return document.body || document.documentElement;
  }

  function candidates() {
    hiddenCache = typeof Map !== 'undefined' ? new Map() : null;
    var root = scopeRoot();
    var all = root.querySelectorAll(SEL);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled) continue;
      if (el.closest && el.closest('#tvnav-menu')) continue;
      if (!visible(el)) continue;
      var r = el.getBoundingClientRect();
      var media = el.tagName === 'IFRAME' || el.tagName === 'VIDEO';
      if (!media && isBig(r)) continue;            // contenedores enormes con onclick
      if (media && (r.width < 120 || r.height < 70)) continue; // iframes de anuncios/píxeles
      // Si está dentro de otro elemento pulsable, nos quedamos con el de fuera.
      var p = el.parentElement, nested = false;
      while (p && p !== root) {
        if (p.matches && p.matches(SEL) && p.tagName !== 'LABEL' && !isBig(p.getBoundingClientRect())) {
          nested = true; break;
        }
        p = p.parentElement;
      }
      if (!nested) out.push(el);
    }
    hiddenCache = null;
    return out;
  }

  function inViewport(r) {
    return r.bottom > 0 && r.top < vh() && r.right > 0 && r.left < vw();
  }

  function firstInView(list) {
    var best = null, bs = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (!inViewport(r)) continue;
      var s = r.top * 3 + r.left;
      if (s < bs) { bs = s; best = list[i]; }
    }
    return best || list[0] || null;
  }

  // ------------------------------------------------------------ navegación espacial

  function score(dir, a, b) {
    var acx = a.left + a.width / 2, acy = a.top + a.height / 2;
    var bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    var primary, orthGap, orthCenter;
    if (dir === 'right' || dir === 'left') {
      if (dir === 'right' && !(bcx > acx + 2 && b.right > a.right)) return -1;
      if (dir === 'left' && !(bcx < acx - 2 && b.left < a.left)) return -1;
      primary = dir === 'right' ? Math.max(0, b.left - a.right) : Math.max(0, a.left - b.right);
      var ov = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      orthGap = ov > 0 ? 0 : -ov;
      orthCenter = Math.abs(bcy - acy);
      // En horizontal no saltamos a otra fila lejana (eso es trabajo de arriba/abajo).
      if (orthGap > Math.min(a.height, b.height) * 0.75) return -1;
    } else {
      if (dir === 'down' && !(bcy > acy + 2 && b.bottom > a.bottom)) return -1;
      if (dir === 'up' && !(bcy < acy - 2 && b.top < a.top)) return -1;
      primary = dir === 'down' ? Math.max(0, b.top - a.bottom) : Math.max(0, a.top - b.bottom);
      var ovx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      orthGap = ovx > 0 ? 0 : -ovx;
      orthCenter = Math.abs(bcx - acx);
    }
    return primary + orthGap * 3 + orthCenter * 0.15;
  }

  function findBest(dir, list, from) {
    var a = from.getBoundingClientRect();
    var best = null, bs = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === from || el.contains(from) || from.contains(el)) continue;
      var s = score(dir, a, el.getBoundingClientRect());
      if (s >= 0 && s < bs) { bs = s; best = el; }
    }
    return best;
  }

  // Busca el botón siguiente/anterior de un carrusel cerca del elemento.
  function carouselButton(el, dir) {
    var words = dir === 'right'
      ? ['next', 'siguiente', 'right', 'forward']
      : ['prev', 'anterior', 'left', 'back'];
    var p = el.parentElement;
    for (var depth = 0; p && p !== document.body && depth < 6; depth++, p = p.parentElement) {
      var btns = p.querySelectorAll('button,a,[role=button],[class*="next"],[class*="prev"],[class*="arrow"],[class*="nav"]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.contains(el)) continue;
        var id = ((b.className && b.className.baseVal !== undefined ? b.className.baseVal : b.className) + ' ' +
          (b.getAttribute('aria-label') || '') + ' ' + (b.id || '')).toLowerCase();
        for (var w = 0; w < words.length; w++) {
          if (id.indexOf(words[w]) >= 0 && /arrow|nav|btn|button|slick|swiper|owl|glide|splide|carousel|slider|next|prev/.test(id)) {
            if (visible(b) && !isBig(b.getBoundingClientRect())) return b;
          }
        }
      }
    }
    return null;
  }

  // Comprueba si el elemento queda recortado por un contenedor (carrusel).
  function clippedBy(el) {
    var r = el.getBoundingClientRect();
    var p = el.parentElement;
    while (p && p !== document.body) {
      var s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflow !== 'visible') {
        var pr = p.getBoundingClientRect();
        if (r.left < pr.left - 2 || r.right > pr.right + 2) return p;
      }
      p = p.parentElement;
    }
    return null;
  }

  function bringIntoView(el, dir) {
    var clip = clippedBy(el);
    if (clip) {
      var r = el.getBoundingClientRect(), pr = clip.getBoundingClientRect();
      var before = clip.scrollLeft;
      clip.scrollLeft += (r.left + r.width / 2) - (pr.left + pr.width / 2);
      if (clip.scrollLeft === before && (dir === 'left' || dir === 'right')) {
        var btn = carouselButton(el, dir);
        if (btn) btn.click();
      }
    }
    var rr = el.getBoundingClientRect();
    var margin = Math.min(140, vh() * 0.18);
    if (rr.top < margin || rr.bottom > vh() - margin) {
      var target = rr.height > vh() - 2 * margin
        ? rr.top - margin
        : rr.top + rr.height / 2 - vh() / 2;
      window.scrollBy(0, target);
    }
  }

  function setFocus(el, dir) {
    if (!el) return;
    if (cur && cur !== el) cur.classList.remove('tvnav-focus', 'tvnav-card');
    cur = el;
    el.classList.add('tvnav-focus');
    var r = el.getBoundingClientRect();
    if (el.tagName !== 'IFRAME' && el.tagName !== 'VIDEO' && el.querySelector('img') && r.width < vw() * 0.5) {
      el.classList.add('tvnav-card');
    }
    // Saca el foco del teclado de un reproductor incrustado o de un cuadro de texto.
    var ae = document.activeElement;
    if (ae && ae !== el && (ae.tagName === 'IFRAME' || isText(ae))) { try { ae.blur(); } catch (e) {} }
    if (!isText(el) && el.tagName !== 'IFRAME') {
      try {
        if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) {
          el.setAttribute('tabindex', '-1');
        }
        el.focus({ preventScroll: true });
      } catch (e) {}
    }
    bringIntoView(el, dir);
  }

  function move(dir) {
    addStyle();
    if (menuOpen) { menuMove(dir); return true; }
    // reproductor: ◀ ▶ retroceden y avanzan si el vídeo es accesible
    if (playerBox && (dir === 'left' || dir === 'right') && cur && (cur.tagName === 'IFRAME' || cur.tagName === 'VIDEO')) {
      var r = media(dir === 'left' ? 'rw' : 'ff');
      if (r && r.noseek) Bridge.osd('Para avanzar usa el cursor: mantén OK');
      return true;
    }
    var list = candidates();
    if (!cur || !document.contains(cur) || list.indexOf(cur) < 0) {
      if (cur) cur.classList.remove('tvnav-focus', 'tvnav-card');
      cur = null;
      // Si el elemento anterior desapareció, empezamos por el primero visible.
      setFocus(firstInView(list), dir);
      if (!cur && dir === 'left') openMenu();
      return true;
    }
    var best = findBest(dir, list, cur);
    if (best) {
      // Si el elemento está muy lejos fuera de pantalla en vertical, mejor desplazar primero.
      var br = best.getBoundingClientRect();
      if ((dir === 'down' && br.top > vh() * 1.6) || (dir === 'up' && br.bottom < -vh() * 0.6)) {
        window.scrollBy(0, (dir === 'down' ? 1 : -1) * vh() * 0.6);
        var vis = list.filter(function (e) { return inViewport(e.getBoundingClientRect()); });
        var near = findBest(dir, vis, cur);
        if (near) { setFocus(near, dir); return true; }
        return true;
      }
      setFocus(best, dir);
      return true;
    }
    // Sin destino en esa dirección:
    if (dir === 'left' && playerBox) return true;
    if (dir === 'left') {
      var btnL = carouselButton(cur, 'left');
      if (btnL && clippedBy(cur)) { btnL.click(); return true; }
      openMenu();
    } else if (dir === 'right') {
      var btnR = carouselButton(cur, 'right');
      if (btnR) btnR.click();
    } else {
      window.scrollBy(0, (dir === 'down' ? 1 : -1) * vh() * 0.6);
    }
    return true;
  }

  // ------------------------------------------------------------ pulsar (OK)

  function dpr() {
    var scale = (window.visualViewport && window.visualViewport.scale) || 1;
    return (window.devicePixelRatio || 1) * scale;
  }

  function tapOf(el) {
    var r = el.getBoundingClientRect();
    var x = Math.max(1, Math.min(vw() - 1, r.left + r.width / 2));
    var y = Math.max(1, Math.min(vh() - 1, r.top + r.height / 2));
    return { tap: true, x: x * dpr(), y: y * dpr() };
  }

  function activate() {
    addStyle();
    if (menuOpen) { menuActivate(); return null; }
    if (playerBox && cur && (cur.tagName === 'IFRAME' || cur.tagName === 'VIDEO')) return media('toggle');
    if (!cur || !document.contains(cur)) { move('down'); return null; }
    var el = cur;
    if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO') {
      bringIntoView(el);
      return tapOf(el);                       // toque real en el reproductor
    }
    if (isText(el)) {
      el.focus();
      try { el.click(); } catch (e) {}
      return null;
    }
    if (el.tagName === 'SELECT') {
      el.focus();
      return tapOf(el);                       // abre el desplegable nativo
    }
    // Si el centro del elemento es visible, usamos un toque real (cuenta como gesto del usuario).
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx > 0 && cy > 0 && cx < vw() && cy < vh()) {
      var hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === el || el.contains(hit))) return tapOf(el);
    }
    try { el.click(); } catch (e) {}
    return null;
  }

  // ------------------------------------------------------------ Atrás

  function back() {
    if (menuOpen) { closeMenu(); return true; }
    if (playerMode) {
      // vuelve a la ficha de la app (la app recuerda dónde estabas)
      try { var v = document.querySelectorAll('video'); for (var i = 0; i < v.length; i++) v[i].pause(); } catch (e) {}
      location.replace(APP_URL);
      return true;
    }
    var ae = document.activeElement;
    if (isText(ae)) { ae.blur(); return true; }
    if (document.fullscreenElement) { document.exitFullscreen(); return true; }
    var root = scopeRoot();
    if (root !== document.body && root !== document.documentElement) {
      var close = root.querySelector(
        '[class*="close"],[aria-label*="close"],[aria-label*="Close"],[aria-label*="cerrar"],[aria-label*="Cerrar"],[data-dismiss],[data-bs-dismiss],[title*="cerrar"],[title*="close"]');
      if (!close) {
        var bs = root.querySelectorAll('button,a,span,div');
        for (var i = 0; i < bs.length; i++) {
          var t = (bs[i].textContent || '').trim();
          if (t === '×' || t === '✕' || t === 'X' || t === 'x' || t === '✖') { close = bs[i]; break; }
        }
      }
      if (close) { close.click(); }
      else if (scopeIsGeneric) { return false; }
      else {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
        root.style.display = 'none';
      }
      // Detiene vídeos que sigan sonando dentro de la ventana (p. ej. tráiler).
      var vids = root.querySelectorAll('video');
      for (var v = 0; v < vids.length; v++) { try { vids[v].pause(); } catch (e) {} }
      var ifr = root.querySelectorAll('iframe');
      for (var f = 0; f < ifr.length; f++) { var src = ifr[f].src; ifr[f].src = 'about:blank'; ifr[f].dataset.tvnavSrc = src; }
      cur = null;
      setTimeout(function () { move('down'); }, 250);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ vídeo

  // Busca el vídeo que se puede controlar: en la página o dentro de reproductores del mismo dominio.
  function allVideos(doc, depth, out) {
    out = out || [];
    var v = doc.querySelectorAll('video');
    for (var i = 0; i < v.length; i++) out.push(v[i]);
    if (depth < 3) {
      var f = doc.querySelectorAll('iframe');
      for (var j = 0; j < f.length; j++) {
        try { var d = f[j].contentDocument; if (d) allVideos(d, depth + 1, out); } catch (e) {}   // otro dominio: inaccesible
      }
    }
    return out;
  }

  function mainVideo() {
    var vids = allVideos(document, 0), best = null, area = 0;
    for (var i = 0; i < vids.length; i++) {
      if (isTrailerEl(vids[i])) continue;
      if (!vids[i].paused) return vids[i];
      var r = vids[i].getBoundingClientRect(), a = r.width * r.height;
      if (a >= area) { area = a; best = vids[i]; }
    }
    return best;
  }

  function isTrailerEl(el) {
    return !!(el.closest && el.closest('[class*="trailer"],[id*="trailer"]'));
  }

  function mainPlayerFrame() {
    if (playerMedia && document.contains(playerMedia)) return playerMedia;
    var ifr = document.querySelectorAll('iframe'), best = null, area = 0;
    for (var i = 0; i < ifr.length; i++) {
      var r = ifr[i].getBoundingClientRect(), a = r.width * r.height;
      if (r.width >= 200 && r.height >= 120 && a > area && visible(ifr[i]) && !isTrailerEl(ifr[i])) { area = a; best = ifr[i]; }
    }
    return best;
  }

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function media(action) {
    var v = mainVideo();
    if (v) {
      if (action === 'toggle') {
        if (v.paused || v.ended) { try { var pr = v.play(); if (pr && pr['catch']) pr['catch'](function () {}); } catch (e) {} Bridge.osd('▶  Reproduciendo'); }
        else { v.pause(); Bridge.osd('❚❚  Pausa  ·  ' + fmt(v.currentTime) + (v.duration ? ' / ' + fmt(v.duration) : '')); }
      } else if (action === 'ff' || action === 'rw') {
        var step = action === 'ff' ? 10 : -10;
        var to = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + step));
        v.currentTime = to;
        Bridge.osd((step > 0 ? '+10 s  ▶▶  ' : '◀◀  −10 s  ') + fmt(to) + (v.duration ? ' / ' + fmt(v.duration) : ''));
      }
      return { ok: true };
    }
    var f = mainPlayerFrame();
    if (f) {
      if (action === 'toggle') { bringIntoView(f); return tapOf(f); }
      return { noseek: true };
    }
    return null;
  }

  // ------------------------------------------------------------ menú lateral

  function buildMenu() {
    if (menuEl && document.contains(menuEl)) return;
    menuEl = document.createElement('div');
    menuEl.id = 'tvnav-menu';
    var html = '<div class="tvm-logo">Morveh<b>TV</b></div>';
    var path = location.pathname;
    for (var i = 0; i < MENU.length; i++) {
      var here = MENU[i][1] === path ? ' here' : '';
      html += '<div class="tvm-item' + here + '" data-i="' + i + '">' + MENU[i][0] +
        (MENU[i][1] === '#search' ? '<input type="search" placeholder="Título, actor…" enterkeyhint="search">' : '') +
        '</div>';
    }
    html += '<div class="tvm-hint">▶ o Atrás: cerrar menú<br>Mantén OK: modo cursor</div>';
    menuEl.innerHTML = html;
    (document.body || document.documentElement).appendChild(menuEl);
    var input = menuEl.querySelector('input');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        var q = input.value.trim();
        if (q) location.href = ORIGIN + '/?s=' + encodeURIComponent(q);
      }
    });
  }

  function paintMenu() {
    var items = menuEl.querySelectorAll('.tvm-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('sel', i === menuIndex);
    var sel = items[menuIndex];
    if (sel) {
      var r = sel.getBoundingClientRect(), mr = menuEl.getBoundingClientRect();
      if (r.bottom > mr.bottom - 40) menuEl.scrollTop += r.bottom - mr.bottom + 60;
      if (r.top < mr.top + 40) menuEl.scrollTop -= mr.top - r.top + 60;
    }
  }

  function openMenu() {
    addStyle();
    buildMenu();
    menuOpen = true;
    menuIndex = 0;
    for (var i = 0; i < MENU.length; i++) if (MENU[i][1] === location.pathname) menuIndex = i;
    menuEl.offsetWidth; // fuerza el repintado para la animación
    menuEl.classList.add('open');
    paintMenu();
  }

  function closeMenu() {
    if (!menuEl) return;
    menuOpen = false;
    menuEl.classList.remove('open');
    var s = menuEl.querySelector('.searching');
    if (s) { s.classList.remove('searching'); s.querySelector('input').blur(); }
  }

  function menuMove(dir) {
    var s = menuEl.querySelector('.searching');
    if (s) { s.classList.remove('searching'); s.querySelector('input').blur(); }
    if (dir === 'up') menuIndex = Math.max(0, menuIndex - 1);
    else if (dir === 'down') menuIndex = Math.min(MENU.length - 1, menuIndex + 1);
    else if (dir === 'right') { closeMenu(); return; }
    paintMenu();
  }

  function menuActivate() {
    var target = MENU[menuIndex][1];
    if (target === '#search') {
      var item = menuEl.querySelectorAll('.tvm-item')[menuIndex];
      item.classList.add('searching');
      var input = item.querySelector('input');
      input.focus();
      try { input.click(); } catch (e) {}
      return;
    }
    if (target === '#app') { closeMenu(); location.href = APP_URL; return; }
    if (target === '#cursor') { closeMenu(); Bridge.toggleCursor(); return; }
    if (target === '#reload') { closeMenu(); Bridge.reload(); return; }
    closeMenu();
    location.href = ORIGIN + target;
  }

  // ------------------------------------------------------------ eventos

  document.addEventListener('focusin', function (e) {
    if (isText(e.target)) Bridge.setEditing(true);
  }, true);
  document.addEventListener('focusout', function (e) {
    if (isText(e.target)) Bridge.setEditing(false);
  }, true);
  document.addEventListener('play', function () { Bridge.setPlaying(true); }, true);
  document.addEventListener('pause', function () { Bridge.setPlaying(false); }, true);
  document.addEventListener('ended', function () { Bridge.setPlaying(false); }, true);

  // Si el usuario toca/hace clic con el cursor, el foco del mando sigue a ese elemento.
  document.addEventListener('click', function (e) {
    if (e.isTrusted === false || !e.target || !e.target.closest) return;
    var el = e.target.closest(SEL);
    if (el && el !== cur && !el.closest('#tvnav-menu') && visible(el)) {
      if (cur) cur.classList.remove('tvnav-focus', 'tvnav-card');
      cur = el;
      el.classList.add('tvnav-focus');
    }
  }, true);

  // Bloquea ventanas emergentes de anuncios.
  try { window.open = function () { return null; }; } catch (e) {}

  function refresh() {
    addStyle();
    if (menuEl && !document.contains(menuEl)) { menuEl = null; menuOpen = false; }
    if (!cur || !document.contains(cur)) {
      cur = null;
      var list = candidates();
      // Foco inicial: el primer elemento del contenido (saltando la cabecera si se puede).
      var main = document.querySelector('main, #primary, #content, .site-content, article');
      var pick = null;
      if (main) {
        for (var i = 0; i < list.length; i++) {
          if (main.contains(list[i]) && inViewport(list[i].getBoundingClientRect())) { pick = list[i]; break; }
        }
      }
      setFocus(pick || firstInView(list));
    }
  }

  // ------------------------------------------------------------ modo reproductor (#tvplay)

  var playerHash = location.hash;
  var playerMode = playerHash === '#tvplay' || playerHash === '#tvweb';
  // #tvplay: se intenta abrir en ExoPlayer · #tvweb: reproductor de la web (ExoPlayer no pudo)
  var exoCapture = playerHash === '#tvplay' && !!(window.TVBridge && window.TVBridge.startCapture);
  var playerBox = null, playerMedia = null;

  // Pantalla completa: el navegador solo la permite tras un gesto del usuario, así que se pide a la app
  // un clic real sobre una capa transparente que, al recibirlo, pone el reproductor a pantalla completa.
  function goFullscreen(media) {
    if (!Bridge.click) return;
    var vid = media.tagName === 'VIDEO' ? media : null;
    var target = vid || media;
    var c = document.createElement('div');
    c.id = 'tvfs-catcher';
    c.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;background:transparent;visibility:visible';
    var done = false;
    function handler(e) {
      if (done) return; done = true;
      try { e.preventDefault(); e.stopPropagation(); } catch (x) {}
      var fn = target.requestFullscreen || target.webkitRequestFullscreen || target.webkitRequestFullScreen || target.mozRequestFullScreen;
      try {
        if (fn) { var pr = fn.call(target); if (pr && pr['catch']) pr['catch'](function () {}); }
        else if (vid && vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
      } catch (x) {}
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 50);
    }
    c.addEventListener('click', handler, true);
    c.addEventListener('mouseup', handler, true);
    c.addEventListener('touchend', handler, true);
    (document.body || document.documentElement).appendChild(c);
    var x = Math.round(window.innerWidth / 2), y = Math.round(window.innerHeight / 2);
    Bridge.click(x * dpr(), y * dpr());
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 2500);
  }

  function autoStart(media) {
    var v = mainVideo();
    var delay = exoCapture ? 6000 : 0;   // con ExoPlayer, la pantalla completa web solo si no se abre
    if (v && exoCapture) {
      var src = v.currentSrc || v.src || '';
      if (!src) { var so = v.querySelector('source[src]'); if (so) src = so.src; }
      if (/^https?:/.test(src) && Bridge.playUrl) {
        var t = document.querySelector('meta[property="og:title"]');
        Bridge.playUrl(src, (t && t.getAttribute('content')) || document.title, location.href);
        return;
      }
    }
    if (v) {
      // vídeo accesible: se reproduce directamente
      if (v.paused) { try { var pr = v.play(); if (pr && pr['catch']) pr['catch'](function () {}); } catch (e) {} }
      setTimeout(function () { goFullscreen(v.ownerDocument === document ? v : media); }, 300 + delay);
    } else {
      // reproductor de otro servidor: un clic en el centro lo pone en marcha
      if (Bridge.click) { var t = tapOf(media); Bridge.click(t.x, t.y); }
      setTimeout(function () { goFullscreen(media); }, 1200 + delay);
    }
  }

  function startPlayer() {
    var st = document.createElement('style');
    st.textContent = [
      '#tvplay-wait{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#0a0910;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;',
      'font-family:system-ui,Roboto,Arial,sans-serif;visibility:visible !important}',
      '#tvplay-wait *{visibility:visible !important}',
      '#tvfs-catcher{visibility:visible !important}',
      '#tvplay-wait .sp{width:56px;height:56px;border-radius:50%;border:6px solid rgba(255,255,255,.15);',
      'border-top-color:#FFC107;animation:tvspin .8s linear infinite;-webkit-animation:tvspin .8s linear infinite}',
      '@keyframes tvspin{to{transform:rotate(360deg)}}@-webkit-keyframes tvspin{to{-webkit-transform:rotate(360deg)}}',
      '#tvplay-wait p{margin-top:22px;font-size:22px;color:#cfcad8}#tvplay-wait small{margin-top:10px;font-size:16px;color:#8f889c}',
      'html.tvplay,html.tvplay body{overflow:hidden !important;background:#000 !important}',
      'html.tvplay body *{visibility:hidden !important}',
      'html.tvplay .tvplay-box,html.tvplay .tvplay-box *{visibility:visible !important}',
      'html.tvplay .tvplay-box{position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;',
      'max-width:none !important;max-height:none !important;margin:0 !important;padding:0 !important;z-index:2147483000 !important;',
      'background:#000 !important;transform:none !important;-webkit-transform:none !important;display:flex !important;flex-direction:column !important}',
      'html.tvplay .tvplay-box iframe,html.tvplay .tvplay-box video{flex:1 1 auto !important;width:100% !important;height:100% !important;',
      'max-width:none !important;max-height:none !important;border:0 !important;min-height:0 !important}',
      'html.tvplay .tvplay-box .tvnav-focus{outline:none !important;box-shadow:none !important}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
    var wait = document.createElement('div');
    wait.id = 'tvplay-wait';
    wait.style.pointerEvents = 'none';   // deja pasar el clic de arranque al reproductor que hay debajo
    wait.innerHTML = '<div class="sp"></div><p>Abriendo reproductor…</p><small>Atrás: volver a la ficha</small>';
    (document.body || document.documentElement).appendChild(wait);

    function isTrailer(el) {
      var id = ((el.className && el.className.baseVal !== undefined ? '' : el.className) + ' ' + (el.id || '') + ' ' +
        (el.textContent || '') + ' ' + (el.getAttribute('href') || '')).toLowerCase();
      return /trailer|tráiler/.test(id) || !!(el.closest && el.closest('[class*="trailer"],[id*="trailer"]'));
    }
    function clickPlay() {
      var box = document.getElementById('movie-engine-player');
      if (box) { try { box.scrollIntoView(); } catch (e) {} }
      var c = document.querySelectorAll('a[href*="movie-engine-player"], .play-btn, [class*="play-now"], [class*="btn-play"], ' +
        'button[class*="play"], a[class*="play"], [class*="play-button"], [aria-label*="play"], [aria-label*="Play"], [aria-label*="reproducir"], [aria-label*="Reproducir"]');
      for (var i = 0; i < c.length; i++) {
        if (!isTrailer(c[i]) && !(c[i].closest && c[i].closest('#tvplay-wait'))) {
          try { c[i].click(); } catch (e) {}
          break;
        }
      }
      // el clic en un enlace "#..." cambia la dirección: lo dejamos como estaba para que Atrás funcione bien
      try { if (location.hash !== playerHash) history.replaceState(null, '', location.pathname + location.search + playerHash); } catch (e) {}
    }
    function findMedia() {
      var list = document.querySelectorAll('video, iframe'), best = null, area = 0;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (isTrailer(el) || (el.closest && el.closest('#tvplay-wait'))) continue;
        var r = el.getBoundingClientRect(), a = r.width * r.height;
        var src = (el.getAttribute('src') || '').toLowerCase();
        if (r.width < 200 || r.height < 110 || /doubleclick|googlesyndication|adservice|\/ads?\//.test(src)) continue;
        if (a > area) { area = a; best = el; }
      }
      return best;
    }
    function enter(media) {
      var box = document.getElementById('movie-engine-player');
      if (!box || !box.contains(media)) box = media.parentElement || media;
      if (box === document.body) box = media;
      playerBox = box;
      playerMedia = media;
      box.classList.add('tvplay-box');
      document.documentElement.classList.add('tvplay');
      // con ExoPlayer, la pantalla de carga sigue hasta que se abre (o hasta que se usa la web)
      if (!exoCapture && wait.parentNode) wait.parentNode.removeChild(wait);
      else setTimeout(function () { if (wait.parentNode) wait.parentNode.removeChild(wait); }, 6000);
      cur = null;
      setFocus(media);
      setTimeout(function () { autoStart(media); }, 900);
    }
    if (exoCapture) {
      var t = document.querySelector('meta[property="og:title"]');
      var title = (t && t.getAttribute('content')) || (document.querySelector('h1') || {}).textContent || document.title;
      try { Bridge.startCapture(String(title).replace(/\s+/g, ' ').trim(), location.href); } catch (e) { exoCapture = false; }
    }
    clickPlay();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var m = findMedia();
      if (m) { clearInterval(iv); enter(m); return; }
      if (tries === 6 || tries === 16) clickPlay();
      if (tries > 50) {
        clearInterval(iv);
        if (wait.parentNode) wait.parentNode.removeChild(wait);
        playerMode = false;   // no se encontró: se deja la página normal para usarla con el mando
        refresh();
      }
    }, 400);
  }

  window.__tvnav = {
    move: move,
    activate: activate,
    back: back,
    media: media,
    refresh: refresh,
    isPlayer: function () { return !!playerMode; },
    openMenu: openMenu
  };

  addStyle();
  function boot() {
    if (playerMode) startPlayer(); else refresh();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 200); });
  } else {
    setTimeout(boot, 200);
  }
})();
