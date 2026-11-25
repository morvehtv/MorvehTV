/*
 * MorvehTV · interfaz de TV estilo plataforma de streaming.
 * Lee el catálogo de la propia web (mismo dominio) y lo muestra con navegación por mando.
 * La app nativa llama a window.__tvnav.move(dir) / activate() / back() / media().
 * Escrito en ES5 para que funcione también en Android 4.4.
 */
(function () {
  'use strict';

  var ORIGIN = location.protocol + '//' + location.host;
  var APP_URL = ORIGIN + '/__tv/index.html';
  var Bridge = window.TVBridge || { toggleCursor: function () {}, reload: function () { location.reload(); }, exitApp: function () {} };

  // ------------------------------------------------------------------ compatibilidad
  var EP = Element.prototype;
  if (!EP.matches) EP.matches = EP.webkitMatchesSelector || function (s) {
    var m = document.querySelectorAll(s), i = m.length; while (--i >= 0 && m[i] !== this) {} return i > -1;
  };
  if (!EP.closest) EP.closest = function (s) {
    var e = this; while (e && e.nodeType === 1) { if (e.matches(s)) return e; e = e.parentElement; } return null;
  };
  function fitRem() { document.documentElement.style.fontSize = (window.innerWidth / 96) + 'px'; }
  fitRem();
  window.addEventListener('resize', fitRem);
  function rem() { return window.innerWidth / 96; }

  // ------------------------------------------------------------------ catálogo
  var CATS = [
    { id: 'peliculas', name: 'Películas', path: '/peliculas/', icon: 'movie' },
    { id: 'series', name: 'Series', path: '/series/', icon: 'tv' },
    { id: 'documentales', name: 'Documentales', path: '/documentales/', icon: 'doc' },
    { id: 'docuseries', name: 'Docuseries', path: '/docuseries/', icon: 'docs' },
    { id: 'peliculas-anime', name: 'Películas anime', path: '/peliculas-anime/', icon: 'anime' },
    { id: 'series-anime', name: 'Series anime', path: '/series-anime/', icon: 'anime' },
    { id: 'telenovelas', name: 'Telenovelas', path: '/telenovelas/', icon: 'novela' }
  ];
  function catById(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }

  var ICONS = {
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    movie: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
    tv: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z',
    doc: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    docs: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z',
    anime: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    show: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
    novela: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    list: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
    user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    web: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    play: 'M8 5v14l11-7z',
    info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    exit: 'M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24"><path d="' + ICONS[n] + '"/></svg>'; }

  // ------------------------------------------------------------------ utilidades
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function text(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  // texto con espacios entre bloques (evita que "4.1" y "Electra" queden pegados)
  function textSp(el) {
    if (!el) return '';
    var out = [], doc = el.ownerDocument || document;
    var w = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */, null, false), n;
    while ((n = w.nextNode())) {
      var pn = n.parentNode && n.parentNode.nodeName;
      if (pn !== 'SCRIPT' && pn !== 'STYLE' && pn !== 'NOSCRIPT') out.push(n.nodeValue);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  var store = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    sget: function (k, def) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, 2600);
  }

  // TMDB: elige el tamaño de imagen adecuado
  function sized(url, size) {
    if (!url) return url;
    return url.replace(/(image\.tmdb\.org\/t\/p\/)(w\d+|original)\//, '$1' + size + '/');
  }

  // ------------------------------------------------------------------ red
  function parseHtml(html) {
    try {
      var d = new DOMParser().parseFromString(html, 'text/html');
      if (d && d.body) return d;
    } catch (e) {}
    var doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = html;
    return doc;
  }

  var pending = {};
  function fetchDoc(url, cb) {
    if (pending[url]) { pending[url].push(cb); return; }
    pending[url] = [cb];
    var x = new XMLHttpRequest();
    var done = false;
    function finish(err, doc) {
      if (done) return; done = true;
      var cbs = pending[url]; delete pending[url];
      for (var i = 0; i < cbs.length; i++) { try { cbs[i](err, doc); } catch (e) { if (window.console) console.error(e); } }
    }
    x.open('GET', url, true);
    try { x.timeout = 20000; } catch (e) {}
    x.onload = function () {
      if (x.status >= 200 && x.status < 400) finish(null, parseHtml(x.responseText));
      else finish(x.status === 404 ? 'notfound' : 'http ' + x.status);
    };
    x.onerror = function () { finish('net'); };
    x.ontimeout = function () { finish('timeout'); };
    x.send();
  }

  function abs(href) {
    if (!href) return null;
    href = href.trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (href.indexOf('//') === 0) return location.protocol + href;
    if (href.charAt(0) === '/') return ORIGIN + href;
    return null;
  }

  var NOT_ITEM = /^(page|category|categoria|categorias|tag|tags|etiqueta|author|autor|feed|wp-content|wp-admin|wp-json|wp-includes|comments|genre|genres|genero|generos|year|ano|release|search|buscar|movie-engine-login|movie-engine-dashboard|cart|checkout|my-account|mi-cuenta|cuenta|login|register|__tv|cast|actor|actores|director|directores)$/i;

  // Devuelve la URL normalizada si el enlace apunta a una ficha (película, serie, episodio…).
  function itemUrl(href) {
    var u = abs(href);
    if (!u || u.indexOf(ORIGIN) !== 0) return null;
    var path = u.slice(ORIGIN.length).split(/[?#]/)[0];
    var segs = path.split('/').filter(function (s) { return s; });
    if (segs.length !== 2 || NOT_ITEM.test(segs[0]) || segs[1] === 'page' || segs[1] === 'feed') return null;
    return ORIGIN + '/' + segs[0] + '/' + segs[1] + '/';
  }

  function kindOf(url) {
    var seg = url.slice(ORIGIN.length).split('/')[1] || '';
    if (/^(movies?|peliculas?|films?)$/i.test(seg)) return 'movie';
    if (/^(episodes?|episodios?|capitulos?)$/i.test(seg)) return 'ep';
    return 'serie';
  }
  var KIND_NAME = { movie: 'Película', serie: 'Serie', ep: 'Episodio' };

  function slugTitle(url) {
    var s = url.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cleanTitle(t) {
    t = (t || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*\b(4K|2160p|1080p|720p|480p|Full HD|HD|CAM)\b.*$/i, '');
    t = t.replace(/\s+\d{1,2}[.,]\d+\s*$/, '').replace(/\s*\((19|20)\d{2}\)\s*$/, '');
    t = t.replace(/\s*[-–|]\s*MorvehTV.*$/i, '');
    return t.trim();
  }

  function imgUrl(el) {
    if (!el) return null;
    var cands = [];
    var imgs = el.tagName === 'IMG' ? [el] : $all('img, source', el);
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      var s = im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || im.getAttribute('data-original') ||
        im.getAttribute('data-srcset') || im.getAttribute('srcset') || im.getAttribute('src') || '';
      s = s.split(',')[0].trim().split(' ')[0];
      if (s && !/^data:/.test(s) && !/flagcdn|gravatar|emoji|\.svg(\?|$)|placeholder|blank\.gif|logo/i.test(s)) cands.push(s);
    }
    var bg = el.querySelectorAll ? $all('[style*="background"], [data-bg]', el) : [];
    if (el.getAttribute && el.getAttribute('style')) bg.unshift(el);
    for (var j = 0; j < bg.length; j++) {
      var st = bg[j].getAttribute('data-bg') || bg[j].getAttribute('style') || '';
      var m = st.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/) || (/^https?:/.test(st) ? [0, st] : null);
      if (m) cands.push(m[1]);
    }
    return cands.length ? abs(cands[0]) : null;
  }

  // ------------------------------------------------------------------ lectura de listados
  function parseList(doc) {
    var root = doc.querySelector('main, #primary, #main, .site-main, #content') || doc.body;
    var anchors = root.getElementsByTagName('a');
    var map = {}, order = [];
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var u = itemUrl(a.getAttribute('href'));
      if (!u) continue;
      var it = map[u];
      if (!it) { it = map[u] = { url: u, kind: kindOf(u) }; order.push(it); }
      collectCard(it, a, root);
    }
    for (var k = 0; k < order.length; k++) if (!order[k].title) order[k].title = slugTitle(order[k].url);
    return order;
  }

  function cardOf(a, u, root) {
    var c = a, p = a.parentElement, n = 0;
    while (p && p !== root && n < 4) {
      var links = p.getElementsByTagName('a'), same = true;
      for (var i = 0; i < links.length; i++) {
        var lu = itemUrl(links[i].getAttribute('href'));
        if (lu && lu !== u) { same = false; break; }
      }
      if (!same) break;
      c = p; p = p.parentElement; n++;
    }
    return c;
  }

  function collectCard(it, a, root) {
    var card = cardOf(a, it.url, root);
    if (!it.poster) it.poster = imgUrl(card);
    if (!it.title) {
      var h = card.querySelector('h1, h2, h3, h4, [class*="title"]');
      var t = h ? text(h) : '';
      if (!t) { var im = card.querySelector('img[alt]'); t = im ? im.getAttribute('alt') : ''; }
      if (!t) t = a.getAttribute('title') || text(a);
      t = cleanTitle(t);
      if (t && t.length < 120) it.title = t;
    }
    var tx = textSp(card);
    if (!it.year) { var y = tx.match(/\b(19[2-9]\d|20[0-4]\d)\b/); if (y) it.year = y[1]; }
    if (!it.rating) {
      var r = tx.match(/(?:^|\s)(\d{1,2}[.,]\d{1,3})(?:\s|$|\/)/);
      if (r) { var v = parseFloat(r[1].replace(',', '.')); if (v > 0 && v <= 10) it.rating = v.toFixed(1); }
    }
    if (!it.quality) { var q = tx.match(/\b(4K|2160p|1080p|720p)\b/i); if (q) it.quality = q[1].replace('P', 'p'); }
  }

  // ------------------------------------------------------------------ lectura de fichas
  function parseDetail(doc, url) {
    function meta(p) {
      var m = doc.querySelector('meta[property="' + p + '"], meta[name="' + p + '"]');
      return m ? (m.getAttribute('content') || '') : '';
    }
    var d = { url: url, kind: kindOf(url) };
    d.title = cleanTitle(meta('og:title') || text(doc.querySelector('h1')) || doc.title) || slugTitle(url);
    var og = meta('og:image');
    d.poster = og && !/cropped-|logo|favicon/i.test(og) ? abs(og) : null;
    var main = doc.querySelector('main, #primary, article, .site-main') || doc.body;
    if (!d.poster) {
      var tm = main.querySelector('img[src*="tmdb"], img[data-src*="tmdb"]');
      d.poster = tm ? imgUrl(tm) : null;
    }
    // sinopsis: el párrafo más largo
    var best = '';
    $all('p, .overview, [class*="synopsis"], [class*="sinopsis"], [class*="overview"], [class*="description"]', main).forEach(function (p) {
      var t = text(p);
      if (t.length > best.length && t.length < 2000 && !/cookies|©|derechos reservados/i.test(t)) best = t;
    });
    d.desc = best.length > 60 ? best : (meta('og:description') || meta('description') || best);
    var tx = textSp(main);
    var r = tx.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s*\/\s*10\b/);
    if (r) d.rating = parseFloat(r[1].replace(',', '.')).toFixed(1);
    var rt = tx.match(/\b(\d{1,2}h\s?\d{1,2}m|\d{1,2}h|\d{2,3}\s?min)\b/i);
    if (rt) d.runtime = rt[1];
    var yr = tx.match(/\b(19[2-9]\d|20[0-4]\d)\b/);
    if (yr) d.year = yr[1];
    // géneros
    var genres = [];
    $all('a[href*="/genre"], a[href*="/genero"], a[href*="/category/"], a[rel~="tag"], [class*="genre"] a, [class*="genero"] a', doc).forEach(function (a) {
      var g = text(a);
      if (g && g.length < 25 && genres.indexOf(g) < 0 && genres.length < 4) genres.push(g);
    });
    d.genres = genres;
    var dir = tx.match(/Direct(?:or|ora|ed by)[:\s]+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.'-]+(?:\s[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.'-]+){0,3})/);
    if (dir) d.director = dir[1];
    // reparto: fotos de TMDB con nombre en el alt
    var cast = [], seen = {};
    $all('img', main).forEach(function (im) {
      var src = imgUrl(im), alt = (im.getAttribute('alt') || '').trim();
      if (!src || !/tmdb/.test(src) || !alt || alt === d.title || seen[alt] || src === d.poster) return;
      if (cast.length < 16) { seen[alt] = 1; cast.push({ name: alt, photo: sized(src, 'w185') }); }
    });
    d.cast = cast;
    // episodios
    var eps = [], es = {};
    $all('a[href]', doc).forEach(function (a) {
      var u = abs(a.getAttribute('href'));
      if (!u || u.indexOf(ORIGIN) !== 0 || es[u] || u.replace(/\/$/, '') === url.replace(/\/$/, '')) return;
      var path = u.slice(ORIGIN.length);
      if (/^\/(episodes?|episodios?|capitulos?)\//i.test(path) || /\/(temporada|season)[-\/]?\d+/i.test(path)) {
        es[u] = 1;
        var t = text(a) || slugTitle(u);
        var num = (t + ' ' + path).match(/(\d+)\s*x\s*(\d+)|[st](?:emporada|eason)?[-\s]?(\d+)[-\s]*(?:e|ep|episodio|capitulo|x)[-\s]?(\d+)/i);
        eps.push({ url: u, title: cleanTitle(t).slice(0, 90) || slugTitle(u), num: num ? (num[1] || num[3]) + 'x' + (num[2] || num[4]) : '' });
      }
    });
    d.episodes = eps.slice(0, 300);
    if (eps.length && d.kind === 'movie') d.kind = 'serie';
    return d;
  }

  // ------------------------------------------------------------------ caché de datos
  var DETAIL_TTL = 24 * 3600 * 1000, LIST_TTL = 3 * 60 * 1000;
  var details = {};

  function getDetail(url, cb, force) {
    if (!force) {
      if (details[url]) return cb(null, details[url]);
      var c = store.get('d:' + url);
      if (c && Date.now() - c.t < DETAIL_TTL) { details[url] = c.d; return cb(null, c.d); }
    }
    fetchDoc(url, function (err, doc) {
      if (err) return cb(err);
      var d = parseDetail(doc, url);
      details[url] = d;
      store.set('d:' + url, { t: Date.now(), d: d });
      cb(null, d);
    });
  }

  function getList(path, page, cb, force) {
    var key = 'l:' + path + ':' + page;
    var c = store.sget(key);
    if (!force && c && Date.now() - c.t < LIST_TTL) return cb(null, c.items, c.more);
    var url = ORIGIN + path + (page > 1 ? 'page/' + page + '/' : '');
    fetchDoc(url, function (err, doc) {
      if (err) return cb(err, []);
      var items = parseList(doc);
      var more = !!doc.querySelector('a.next, a[rel="next"], link[rel="next"], .nav-next a, a[href*="/page/' + (page + 1) + '/"]');
      store.sset(key, { t: Date.now(), items: items, more: more });
      cb(null, items, more);
    });
  }

  // Cola de pósters: si el listado no trae imagen, la saca de la ficha (3 a la vez).
  var queue = [], running = 0, waiting = {};
  function needPoster(item, cb) {
    if (item.poster) return cb(item.poster);
    var d = details[item.url] || (store.get('d:' + item.url) || {}).d;
    if (d) { fill(item, d); return cb(item.poster); }
    if (waiting[item.url]) { waiting[item.url].push(cb); return; }
    waiting[item.url] = [cb];
    queue.push(item);
    pump();
  }
  function pump() {
    while (running < 3 && queue.length) {
      (function (item) {
        running++;
        getDetail(item.url, function (err, d) {
          running--;
          if (d) fill(item, d);
          var cbs = waiting[item.url] || []; delete waiting[item.url];
          for (var i = 0; i < cbs.length; i++) cbs[i](item.poster);
          pump();
        });
      })(queue.shift());
    }
  }
  function fill(item, d) {
    if (!item.poster && d.poster) item.poster = d.poster;
    if (d.title && (!item.title || item.title === slugTitle(item.url))) item.title = d.title;
    if (!item.year && d.year) item.year = d.year;
    if (!item.rating && d.rating) item.rating = d.rating;
    if (d.kind) item.kind = d.kind;
  }

  // ------------------------------------------------------------------ mi lista y seguir viendo
  function slim(it) { return { url: it.url, title: it.title, poster: it.poster, year: it.year, rating: it.rating, kind: it.kind }; }
  function myList() { return store.get('mylist', []); }
  function inList(url) { var l = myList(); for (var i = 0; i < l.length; i++) if (l[i].url === url) return true; return false; }
  function toggleList(it) {
    var l = myList().filter(function (x) { return x.url !== it.url; });
    var added = l.length === myList().length;
    if (added) l.unshift(slim(it));
    store.set('mylist', l.slice(0, 200));
    toast(added ? 'Añadido a Mi lista' : 'Quitado de Mi lista');
    return added;
  }
  function getHistory() { return store.get('history', []); }
  function addHistory(it, epUrl) {
    var h = getHistory().filter(function (x) { return x.url !== it.url; });
    var s = slim(it); s.ep = epUrl || null; s.t = Date.now();
    h.unshift(s);
    store.set('history', h.slice(0, 30));
  }

  // ------------------------------------------------------------------ contenido nuevo
  var NEW_DAYS = 3, CHECK_MS = 5 * 60 * 1000;
  function newMap() {
    var m = store.get('newItems', {}), now = Date.now(), out = {};
    for (var u in m) if (now - m[u] < NEW_DAYS * 864e5) out[u] = m[u];
    return out;
  }
  function isNew(url) { return !!newMap()[url]; }
  function markSeen(url) { var m = newMap(); if (m[url]) { delete m[url]; store.set('newItems', m); } }

  var lastCheck = 0, checking = false;
  // Revisa la web y, si hay títulos que la app no había visto, actualiza las filas y avisa.
  function checkNew(forceNow) {
    if (checking || (!forceNow && Date.now() - lastCheck < 60000)) return;
    checking = true; lastCheck = Date.now();
    var paths = ['/'].concat(CATS.map(function (c) { return c.path; }));
    var seen = store.get('seen', null), firstRun = !seen;
    seen = seen || {};
    var fresh = [], freshSet = {}, lists = {}, left = paths.length;
    paths.forEach(function (path) {
      getList(path, 1, function (err, items) {
        if (!err && items) {
          lists[path] = items;
          items.forEach(function (it) {
            if (!seen[it.url]) {
              seen[it.url] = Date.now();
              if (!firstRun && !freshSet[it.url]) { freshSet[it.url] = 1; fresh.push(it); }
            }
          });
        }
        if (--left) return;
        checking = false;
        // guarda lo visto (máx. 5000 direcciones)
        var keys = Object.keys(seen);
        if (keys.length > 5000) keys.sort(function (a, b) { return seen[a] - seen[b]; }).slice(0, keys.length - 5000).forEach(function (k) { delete seen[k]; });
        store.set('seen', seen);
        if (fresh.length) {
          var m = newMap();
          fresh.forEach(function (it) { m[it.url] = Date.now(); });
          store.set('newItems', m);
          toast(fresh.length === 1 ? 'Nuevo en MorvehTV: ' + fresh[0].title : fresh.length + ' títulos nuevos en MorvehTV');
        }
        if (screen && screen.update) screen.update(lists);
      }, true);
    });
  }

  // ------------------------------------------------------------------ reproducción
  function play(item, epUrl) {
    addHistory(item, epUrl);
    saveStack();
    // al volver del reproductor (Atrás) se aterriza en la ficha de este contenido
    var top = stack[stack.length - 1];
    if (!(top && top.s === 'detail' && top.url === item.url)) {
      stack.push({ s: 'detail', url: item.url, item: slim(item) });
      top = stack[stack.length - 1];
    }
    top.f = epUrl || 'd-play';
    store.sset('tvstack', stack);
    location.href = (epUrl || item.url) + '#tvplay';
  }

  // ------------------------------------------------------------------ navegación con el mando
  var cur = null, lastContent = null, railOpen = false;
  var handlers = {}, hid = 0;
  function on(el, h) { var k = 'h' + (++hid); el.setAttribute('data-h', k); handlers[k] = h; if (!el.classList.contains('f')) el.classList.add('f'); return el; }
  function handler(el) { return el && handlers[el.getAttribute('data-h')]; }

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && el.offsetParent !== null;
  }

  function focusables() {
    var root = railOpen ? $('#rail') : $('#app .screen');
    return root ? $all('.f', root).filter(visible) : [];
  }

  function score(dir, a, b) {
    var acx = a.left + a.width / 2, acy = a.top + a.height / 2, bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    var primary, gap, center;
    if (dir === 'left' || dir === 'right') {
      if (dir === 'right' && !(bcx > acx + 2 && b.right > a.right)) return -1;
      if (dir === 'left' && !(bcx < acx - 2 && b.left < a.left)) return -1;
      primary = dir === 'right' ? Math.max(0, b.left - a.right) : Math.max(0, a.left - b.right);
      var ov = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      gap = ov > 0 ? 0 : -ov; center = Math.abs(bcy - acy);
      if (gap > Math.min(a.height, b.height) * 0.6) return -1;
    } else {
      if (dir === 'down' && !(bcy > acy + 2 && b.bottom > a.bottom)) return -1;
      if (dir === 'up' && !(bcy < acy - 2 && b.top < a.top)) return -1;
      primary = dir === 'down' ? Math.max(0, b.top - a.bottom) : Math.max(0, a.top - b.bottom);
      var ovx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      gap = ovx > 0 ? 0 : -ovx; center = Math.abs(bcx - acx);
    }
    return primary + gap * 3 + center * 0.15;
  }

  function findBest(dir, list, from) {
    var a = from.getBoundingClientRect(), best = null, bs = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === from) continue;
      var s = score(dir, a, list[i].getBoundingClientRect());
      if (s >= 0 && s < bs) { bs = s; best = list[i]; }
    }
    return best;
  }

  function setFocus(el, silent) {
    if (!el) return;
    if (cur && cur !== el) cur.classList.remove('focus');
    // al entrar en otra fila, vuelve a la última tarjeta usada en ella
    var track = el.closest('.track');
    if (track && cur && cur.closest('.track') !== track && track._last && track.contains(track._last) && !silent) el = track._last;
    ensureVisible(el);
    cur = el;
    el.classList.add('focus');
    if (track) track._last = el;
    if (!el.closest('#rail')) lastContent = el;
    else {
      // mantiene visible la opción elegida del menú lateral
      var rail = $('#rail'), et = el.offsetTop, eb = et + el.offsetHeight;
      if (eb > rail.scrollTop + rail.clientHeight - rem()) rail.scrollTop = eb - rail.clientHeight + rem();
      else if (et < rail.scrollTop + 4 * rem()) rail.scrollTop = Math.max(0, et - 4 * rem());
    }
    var h = handler(el);
    if (h && h.focus) h.focus(el);
  }

  function ensureVisible(el) {
    var track = el.closest('.track');
    if (track) {
      var vp = track.parentNode, pad = 3 * rem();
      var L = el.getBoundingClientRect().left - track.getBoundingClientRect().left;
      var R = L + el.offsetWidth, x = track._x || 0, w = vp.clientWidth - pad;
      if (L - x < 0) x = L;
      else if (R - x > w - 2 * rem()) x = R - w + 2 * rem();
      x = Math.max(0, x);
      if (x !== track._x) { track._x = x; tf(track, 'translateX(' + (-x) + 'px)'); }
    }
    var sc = el.closest('.scroller');
    if (sc) {
      var sec = el.closest('.sec') || el;
      var top = sec.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      var vh = sc.parentNode.clientHeight, bottom = top + sec.offsetHeight, snap = sc.getAttribute('data-snap');
      var y = sc._y || 0;
      if (el.closest('.nosnap')) y = 0;
      else if (snap) y = top;
      else if (top < y + rem()) y = top - rem();
      else if (bottom > y + vh - rem()) y = Math.min(top - rem(), bottom - vh + 2 * rem());
      if (!snap) y = Math.min(y, Math.max(0, sc.offsetHeight - vh + 4 * rem()));
      y = Math.max(0, y);
      if (y !== sc._y) { sc._y = y; tf(sc, 'translateY(' + (-y) + 'px)'); }
    }
  }
  function tf(el, v) { el.style.webkitTransform = v; el.style.transform = v; }

  function move(dir) {
    if (!cur || !document.body.contains(cur) || !visible(cur)) { setFocus(defaultFocus()); return true; }
    var list = focusables();
    var best = findBest(dir, list, cur);
    // al subir a una fila de botones, se entra siempre por el primero (p. ej. «Ver ahora»)
    if (best && dir === 'up') { var bb = best.closest('.btns'); if (bb && !cur.closest('.btns')) best = $('.f', bb) || best; }
    if (best) { setFocus(best); return true; }
    if (railOpen) { if (dir === 'right') closeRail(); return true; }
    if (dir === 'left') openRail();
    else if (dir === 'down' && screen && screen.more) screen.more();
    return true;
  }

  function activate() {
    var h = handler(cur);
    if (h && h.ok) h.ok(cur);
    return null;
  }

  function defaultFocus() {
    if (railOpen) return $('#rail .ri.on') || $('#rail .ri');
    if (screen && screen.first) { var f = screen.first(); if (f) return f; }
    return focusables()[0];
  }

  // ------------------------------------------------------------------ menú lateral
  var RAIL = [
    { id: 'search', name: 'Buscar', icon: 'search', go: function () { navTo({ s: 'search' }); } },
    { id: 'home', name: 'Inicio', icon: 'home', go: function () { navTo({ s: 'home' }); } }
  ];
  CATS.forEach(function (c) { RAIL.push({ id: c.id, name: c.name, icon: c.icon, go: function () { navTo({ s: 'cat', id: c.id }); } }); });
  RAIL.push({ id: 'mylist', name: 'Mi lista', icon: 'list', sep: true, go: function () { navTo({ s: 'mylist' }); } });
  RAIL.push({ id: 'account', name: 'Mi cuenta', icon: 'user', go: function () { saveStack(); location.href = ORIGIN + '/movie-engine-login/'; } });
  RAIL.push({ id: 'web', name: 'Web clásica', icon: 'web', go: function () { saveStack(); location.href = ORIGIN + '/'; } });
  RAIL.push({ id: 'exit', name: 'Salir', icon: 'exit', go: function () { Bridge.exitApp(); } });

  function buildRail() {
    var r = $('#rail');
    r.innerHTML = '<div class="logo"><span class="mini">M<b>TV</b></span><span class="full">Morveh<b>TV</b></span></div>';
    RAIL.forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'ri' + (it.sep ? ' sep' : '');
      d.setAttribute('data-rail', it.id);
      d.innerHTML = icon(it.icon) + '<span>' + esc(it.name) + '</span>';
      on(d, { ok: function () { closeRail(true); it.go(); } });
      r.appendChild(d);
    });
  }
  function markRail(id) {
    $all('#rail .ri').forEach(function (d) { d.classList.toggle('on', d.getAttribute('data-rail') === id); });
  }
  function openRail() {
    railOpen = true;
    document.body.classList.add('rail-open');
    setFocus($('#rail .ri.on') || $('#rail .ri[data-rail="home"]'));
  }
  function closeRail(noFocus) {
    railOpen = false;
    $('#rail').scrollTop = 0;
    document.body.classList.remove('rail-open');
    if (cur) cur.classList.remove('focus');
    if (!noFocus) setFocus(lastContent && document.body.contains(lastContent) ? lastContent : defaultFocus(), true);
  }

  // ------------------------------------------------------------------ pantallas y pila
  var stack = store.sget('tvstack', null) || [{ s: 'home' }];
  var screen = null;
  function saveStack() {
    var top = stack[stack.length - 1];
    if (top && cur && !cur.closest('#rail')) top.f = focusKey(cur);
    store.sset('tvstack', stack);
  }
  function focusKey(el) { return el.getAttribute('data-key') || el.id || ''; }
  function navTo(route) {
    stack = route.s === 'home' ? [{ s: 'home' }] : [{ s: 'home' }, route];
    render();
  }
  function push(route) { saveStack(); stack.push(route); render(); }

  function render() {
    store.sset('tvstack', stack);
    var route = stack[stack.length - 1];
    var app = $('#app');
    app.innerHTML = '';
    cur = null; lastContent = null;
    var el = document.createElement('div');
    el.className = 'screen';
    app.appendChild(el);
    var fn = { home: screenHome, cat: screenCat, detail: screenDetail, search: screenSearch, mylist: screenMyList }[route.s] || screenHome;
    screen = fn(el, route) || {};
    markRail(route.s === 'cat' ? route.id : route.s === 'detail' ? '' : route.s);
    restoreFocus(route);
  }
  function restoreFocus(route) {
    if (cur && document.body.contains(cur)) return;   // ya recuperado mientras se cargaban los datos
    var el = null;
    if (route.f) el = $('#app [data-key="' + route.f.replace(/"/g, '') + '"]') || document.getElementById(route.f);
    setFocus(el && visible(el) ? el : defaultFocus(), true);
  }
  // si el elemento que se quería recuperar aparece más tarde (datos cargando), se enfoca entonces
  function maybeRestore(container) {
    var route = stack[stack.length - 1];
    if (!route.f || railOpen) return;
    var el = $('[data-key="' + route.f.replace(/"/g, '') + '"]', container);
    if (el && (!cur || cur.classList.contains('btn'))) { route.f = null; setFocus(el, true); }
  }

  // ------------------------------------------------------------------ piezas de interfaz
  function metaLine(it) {
    var p = [];
    if (it.rating) p.push('<b>★ ' + esc(it.rating) + '</b>');
    if (it.year) p.push(esc(it.year));
    if (it.runtime) p.push(esc(it.runtime));
    if (it.kind) p.push(KIND_NAME[it.kind] || '');
    if (it.quality) p.push('<span class="hd">' + esc(it.quality) + '</span>');
    return p.join('<span class="dot">•</span>');
  }

  function makeCard(it, opts) {
    opts = opts || {};
    var c = document.createElement('div');
    c.className = 'card';
    c.setAttribute('data-key', it.url);
    c.innerHTML = '<div class="poster"><img alt=""><div class="ph">' + esc(it.title) + '</div>' +
      (it.rating ? '<span class="badge">★ ' + esc(it.rating) + '</span>' : '') +
      (isNew(it.url) ? '<span class="new">NUEVO</span>' : '') +
      (opts.bar ? '<div class="bar" style="width:' + opts.bar + '%"></div>' : '') +
      '</div><div class="cap">' + esc(it.title) + '</div>';
    var img = c.querySelector('img');
    img.onload = function () { img.className = 'ok'; var ph = c.querySelector('.ph'); if (ph) ph.style.display = 'none'; };
    img.onerror = function () { img.style.display = 'none'; };
    needPoster(it, function (p) {
      if (p) img.src = sized(p, 'w342');
      var cap = c.querySelector('.cap'); if (cap && it.title) cap.textContent = it.title;
    });
    on(c, { ok: function () { if (opts.ok) opts.ok(it); else push({ s: 'detail', url: it.url, item: slim(it) }); }, focus: opts.focus ? function () { opts.focus(it); } : null });
    return c;
  }

  function skelRow(title) {
    var s = document.createElement('div');
    s.className = 'sec';
    var h = '<h2>' + esc(title) + '</h2><div class="row-vp"><div class="track">';
    for (var i = 0; i < 7; i++) h += '<div class="card skel"><div class="poster"></div></div>';
    s.innerHTML = h + '</div></div>';
    return s;
  }

  function fillRow(sec, title, items, opts) {
    opts = opts || {};
    sec.innerHTML = '<h2>' + esc(title) + (opts.count ? '<small>' + opts.count + '</small>' : '') + '</h2><div class="row-vp"><div class="track"></div></div>';
    var track = sec.querySelector('.track');
    items.forEach(function (it) { track.appendChild(makeCard(it, opts)); });
    if (opts.all) {
      var m = document.createElement('div');
      m.className = 'card more';
      m.setAttribute('data-key', 'more:' + title);
      m.innerHTML = '<div class="poster">Ver todo →</div><div class="cap">&nbsp;</div>';
      on(m, { ok: opts.all });
      track.appendChild(m);
    }
    return track;
  }

  function button(label, ic, cls, ok, key) {
    var b = document.createElement('span');
    b.className = 'btn ' + (cls || '');
    b.innerHTML = (ic ? icon(ic) : '') + esc(label);
    if (key) b.setAttribute('data-key', key);
    on(b, { ok: ok });
    return b;
  }

  // ------------------------------------------------------------------ INICIO
  function screenHome(el) {
    el.className = 'screen home';
    el.innerHTML = '<div class="billboard"><div class="bb-bg"></div><div class="bb-shade"></div><div class="bb-info">' +
      '<div class="kicker">Destacado</div><div class="bb-title">MorvehTV</div><div class="meta"></div><div class="desc">Cargando catálogo…</div>' +
      '<div class="btns"></div></div></div><div class="rows-vp"><div class="scroller" data-snap="1"></div></div>';
    var bb = { bg: $('.bb-bg', el), title: $('.bb-title', el), meta: $('.meta', el), desc: $('.desc', el), kicker: $('.kicker', el) };
    var btns = $('.btns', el), rows = $('.scroller', el);
    var current = null, featured = null, bbTimer = null;

    var bPlay = button('Ver ahora', 'play', 'primary nosnap', function () { if (current) playItem(current); }, 'bb-play');
    var bInfo = button('Más info', 'info', 'nosnap', function () { if (current) push({ s: 'detail', url: current.url, item: slim(current) }); }, 'bb-info');
    var bList = button('Mi lista', 'plus', 'nosnap', function () { if (current) { toggleList(current); listBtn(); } }, 'bb-list');
    [bPlay, bInfo, bList].forEach(function (b) {
      btns.appendChild(b);
      var h = handler(b); h.focus = function () { tf(rows, 'translateY(0)'); rows._y = 0; bb.kicker.textContent = featured === current ? 'Destacado' : 'Seleccionado'; };
    });
    function listBtn() {
      var inl = current && inList(current.url);
      bList.innerHTML = icon(inl ? 'check' : 'plus') + (inl ? 'En mi lista' : 'Mi lista');
    }

    function show(it, kicker) {
      current = it;
      bb.kicker.textContent = kicker || '';
      bb.title.textContent = it.title;
      bb.meta.innerHTML = metaLine(it);
      listBtn();
      var d = details[it.url];
      bb.desc.textContent = d && d.desc ? d.desc : '';
      setBg(it.poster);
      clearTimeout(bbTimer);
      bbTimer = setTimeout(function () {
        getDetail(it.url, function (err, d2) {
          if (!d2 || current !== it) return;
          fill(it, d2);
          if (d2.runtime) it.runtime = d2.runtime;
          bb.meta.innerHTML = metaLine(it);
          bb.desc.textContent = d2.desc || '';
          bb.title.textContent = it.title;
          setBg(it.poster);
        });
      }, 250);
    }
    var bgUrl = null;
    function setBg(p) {
      if (!p || p === bgUrl) return;
      bgUrl = p;
      var big = sized(p, 'w780');
      bb.bg.className = 'bb-bg';
      var im = new Image();
      im.onload = function () { if (bgUrl !== p) return; bb.bg.style.backgroundImage = 'url("' + big + '")'; bb.bg.className = 'bb-bg show'; };
      im.src = big;
    }
    var cardOpts = { focus: function (it) { show(it, ''); }, ok: null };

    // filas
    var defs = [];
    var hist = getHistory();
    if (hist.length) defs.push({ title: 'Seguir viendo', items: hist, opts: { bar: 35 } });
    defs.push({ title: 'Novedades', path: '/' });
    CATS.forEach(function (c) { defs.push({ title: c.name, path: c.path, cat: c }); });
    var ml = myList();
    if (ml.length) defs.push({ title: 'Mi lista', items: ml });

    var loaded = 0, total = 0, anyItems = false;
    defs.forEach(function (def) {
      var sec = skelRow(def.title);
      rows.appendChild(sec);
      function put(items) {
        var sig = items.map(function (x) { return x.url + (isNew(x.url) ? '*' : ''); }).join('|');
        if (sig === def.sig) return;          // sin cambios: no se repinta
        def.sig = sig;
        if (!items.length) { sec.style.display = 'none'; return; }
        sec.style.display = '';
        anyItems = true;
        var o = { focus: cardOpts.focus, bar: def.opts && def.opts.bar, all: def.cat ? function () { navTo({ s: 'cat', id: def.cat.id }); } : null };
        if (def.title === 'Seguir viendo') o.ok = function (it) { playItem(it, it.ep); };
        var hadKey = cur && sec.contains(cur) ? focusKey(cur) : null;
        fillRow(sec, def.title, items.slice(0, 20), o);
        if (hadKey) setFocus($('[data-key="' + hadKey.replace(/"/g, '') + '"]', sec) || $('.card', sec), true);
        if (!featured && def.path === '/') { featured = items[0]; if (!current || cur === bPlay) show(featured, 'Destacado'); }
        maybeRestore(sec);
      }
      def.put = put;
      if (def.items) { put(def.items); return; }
      total++;
      getList(def.path, 1, function (err, items) {
        loaded++;
        put(items || []);
        if (!featured && items && items.length) { featured = items[0]; show(featured, 'Destacado'); }
        if (loaded === total && !anyItems) {
          bb.title.textContent = 'Sin conexión';
          bb.desc.textContent = 'No se ha podido cargar el catálogo. Comprueba la conexión e inténtalo de nuevo.';
          btns.innerHTML = '';
          btns.appendChild(button('Reintentar', null, 'primary nosnap', function () { try { sessionStorage.clear(); } catch (e) {} location.reload(); }));
          btns.appendChild(button('Web clásica', 'web', 'nosnap', function () { location.href = ORIGIN + '/'; }));
          setFocus($('.btn', btns), true);
        }
      });
    });
    if (hist.length) show(hist[0], 'Seguir viendo');

    return {
      first: function () { return bPlay; },
      // llega contenido nuevo: se actualizan las filas afectadas sin perder la posición
      update: function (lists) {
        defs.forEach(function (def) { if (def.path && lists[def.path] && def.put) def.put(lists[def.path]); });
      }
    };
  }

  function playItem(it, epUrl) {
    if (epUrl || it.kind !== 'serie') return play(it, epUrl);
    // serie: abrir la ficha para elegir episodio
    push({ s: 'detail', url: it.url, item: slim(it) });
  }

  // ------------------------------------------------------------------ CATEGORÍA / cuadrículas
  function gridScreen(el, title, sub) {
    el.className = 'screen';
    el.innerHTML = '<div class="head"><h1>' + esc(title) + '</h1><p>' + esc(sub || '') + '</p></div><div class="grid-vp"><div class="scroller"><div class="grid"></div></div></div>';
    return $('.grid', el);
  }
  function gridRows(grid, items) {
    // cada fila de la cuadrícula es una .sec para que el desplazamiento vertical funcione
    var pad = parseFloat(getComputedStyle(grid).paddingLeft) || 0;
    var perRow = Math.max(1, Math.floor(((grid.clientWidth || window.innerWidth * 0.85) - pad) / (13 * rem())));
    var last = grid.lastElementChild;
    var i = 0;
    if (last && last.children.length < perRow) {
      while (i < items.length && last.children.length < perRow) last.appendChild(makeCard(items[i++]));
    }
    for (; i < items.length; i += perRow) {
      var row = document.createElement('div');
      row.className = 'sec';
      row.style.padding = '0';
      items.slice(i, i + perRow).forEach(function (it) { row.appendChild(makeCard(it)); });
      grid.appendChild(row);
    }
  }

  function screenCat(el, route) {
    var c = catById(route.id) || CATS[0];
    var grid = gridScreen(el, c.name, 'Cargando…');
    var sub = $('.head p', el);
    var page = 0, more = true, busy = false, count = 0;
    function load() {
      if (busy || !more) return;
      busy = true; page++;
      getList(c.path, page, function (err, items, hasMore) {
        busy = false;
        more = !!hasMore && items.length > 0;
        if (err && page === 1) { sub.textContent = 'No se ha podido cargar.'; return; }
        count += items.length;
        sub.textContent = count ? count + (more ? '+' : '') + ' títulos' : 'Todavía no hay títulos en esta sección.';
        gridRows(grid, items);
        if (page === 1 && (!cur || !document.body.contains(cur))) setFocus($('.card', grid), true);
        maybeRestore(grid);
      });
    }
    load();
    return {
      first: function () { return $('.card', grid); },
      more: load,
      onFocusRow: null
    };
  }

  function screenMyList(el) {
    var grid = gridScreen(el, 'Mi lista', '');
    var l = myList();
    $('.head p', el).textContent = l.length ? l.length + ' títulos guardados' : '';
    if (!l.length) {
      grid.innerHTML = '<div class="empty">Todavía no has guardado nada.<br>Pulsa «Mi lista» en cualquier película o serie para tenerla aquí.</div>';
    } else gridRows(grid, l);
    return { first: function () { return $('.card', grid); } };
  }

  // ------------------------------------------------------------------ FICHA
  function screenDetail(el, route) {
    var it = route.item || { url: route.url, title: slugTitle(route.url), kind: kindOf(route.url) };
    markSeen(it.url);
    el.className = 'screen detail';
    el.innerHTML = '<div class="scroller"><div class="hero sec nosnap"><div class="bb-bg"></div><div class="bb-shade"></div><div class="bb-info">' +
      '<div class="kicker"></div><div class="bb-title"></div><div class="meta"></div><div class="genres"></div><div class="desc"></div><div class="credits"></div><div class="btns"></div>' +
      '</div></div></div>';
    var sc = $('.scroller', el), btns = $('.btns', el);
    var playBtn, listB;

    function paint(d) {
      $('.kicker', el).textContent = KIND_NAME[d.kind] || '';
      $('.bb-title', el).textContent = d.title;
      $('.meta', el).innerHTML = metaLine(d);
      $('.genres', el).innerHTML = (d.genres || []).map(function (g) { return '<span class="chip">' + esc(g) + '</span>'; }).join('');
      $('.desc', el).textContent = d.desc || '';
      $('.credits', el).textContent = d.director ? 'Dirección: ' + d.director : '';
      if (d.poster) $('.bb-bg', el).style.backgroundImage = 'url("' + sized(d.poster, 'w780') + '")';
    }
    function buildButtons(d) {
      btns.innerHTML = '';
      var eps = d.episodes || [];
      if (eps.length) {
        var h = getHistory(), last = null;
        for (var i = 0; i < h.length; i++) if (h[i].url === it.url && h[i].ep) { last = h[i].ep; break; }
        var target = last || eps[0].url;
        playBtn = button(last ? 'Continuar' : 'Ver episodio 1', 'play', 'primary', function () { play(it, target); }, 'd-play');
      } else {
        playBtn = button('Reproducir', 'play', 'primary', function () { play(it); }, 'd-play');
      }
      btns.appendChild(playBtn);
      listB = button(inList(it.url) ? 'En mi lista' : 'Mi lista', inList(it.url) ? 'check' : 'plus', '', function () {
        var added = toggleList(it);
        listB.innerHTML = icon(added ? 'check' : 'plus') + (added ? 'En mi lista' : 'Mi lista');
      }, 'd-list');
      btns.appendChild(listB);
      btns.appendChild(button('Ver en la web', 'web', '', function () { saveStack(); location.href = it.url; }, 'd-web'));
    }
    function sections(d) {
      if (d.episodes && d.episodes.length) {
        var s = document.createElement('div');
        s.className = 'sec';
        s.innerHTML = '<h2>Episodios <small>' + d.episodes.length + '</small></h2>';
        d.episodes.forEach(function (ep, i) {
          var row = document.createElement('div');
          row.className = 'ep';
          row.setAttribute('data-key', ep.url);
          row.innerHTML = '<span class="num">' + esc(ep.num || (i + 1)) + '</span><span class="t">' + esc(ep.title) + '</span>' + icon('play');
          on(row, { ok: function () { play(it, ep.url); } });
          // cada episodio es su propia sección para que la lista se desplace línea a línea
          var wrap = document.createElement('div');
          wrap.className = 'sec';
          wrap.style.padding = '0';
          wrap.appendChild(row);
          s.appendChild(wrap);
        });
        sc.appendChild(s);
      }
      if (d.cast && d.cast.length) {
        var c = document.createElement('div');
        c.className = 'sec';
        c.innerHTML = '<h2>Reparto</h2><div class="row-vp" style="height:14rem"><div class="track"></div></div>';
        var tr = $('.track', c);
        d.cast.forEach(function (p) {
          var e = document.createElement('div');
          e.className = 'person';
          e.innerHTML = '<div class="ph2"><img src="' + esc(p.photo) + '" alt=""></div><div class="n">' + esc(p.name) + '</div>';
          on(e, {});
          tr.appendChild(e);
        });
        sc.appendChild(c);
      }
      // más títulos de la misma sección
      var cat = null;
      for (var i = 0; i < CATS.length; i++) {
        var l = store.sget('l:' + CATS[i].path + ':1');
        if (l && l.items.some(function (x) { return x.url === it.url; })) { cat = CATS[i]; break; }
      }
      cat = cat || (it.kind === 'movie' ? CATS[0] : CATS[1]);
      var sec = skelRow('Más ' + cat.name.toLowerCase());
      sc.appendChild(sec);
      getList(cat.path, 1, function (err, items) {
        items = (items || []).filter(function (x) { return x.url !== it.url; });
        if (!items.length) { if (sec.parentNode) sec.parentNode.removeChild(sec); return; }
        fillRow(sec, 'Más ' + cat.name.toLowerCase(), items.slice(0, 20), { all: function () { navTo({ s: 'cat', id: cat.id }); } });
        maybeRestore(sec);
      });
    }

    paint(it);
    buildButtons(it);
    getDetail(it.url, function (err, d) {
      if (err) { $('.desc', el).textContent = 'No se ha podido cargar la ficha. Pulsa Reproducir para intentarlo en la web.'; sections({}); return; }
      fill(it, d);
      if (d.runtime) it.runtime = d.runtime;
      var merged = {};
      for (var k in d) merged[k] = d[k];
      merged.rating = it.rating || d.rating; merged.year = it.year || d.year; merged.quality = it.quality;
      paint(merged);
      var hadFocus = cur && btns.contains(cur);
      var key = cur ? focusKey(cur) : '';
      buildButtons(d);
      if (hadFocus) setFocus($('[data-key="' + key + '"]', btns) || playBtn, true);
      sections(d);
      maybeRestore(sc);
      // comprueba en segundo plano si la ficha ha cambiado (p. ej. episodios nuevos)
      var before = JSON.stringify([d.episodes && d.episodes.length, d.desc, d.poster]);
      var cached = store.get('d:' + it.url);
      if (cached && Date.now() - cached.t < 60000) return;   // recién descargada: no hace falta
      getDetail(it.url, function (e2, fresh) {
        if (!fresh || stack[stack.length - 1] !== route) return;
        if (JSON.stringify([fresh.episodes && fresh.episodes.length, fresh.desc, fresh.poster]) === before) return;
        var more = (fresh.episodes || []).length - (d.episodes || []).length;
        saveStack();
        render();
        if (more > 0) toast(more === 1 ? 'Hay 1 episodio nuevo' : 'Hay ' + more + ' episodios nuevos');
      }, true);
    });
    return { first: function () { return playBtn; } };
  }

  // ------------------------------------------------------------------ BÚSQUEDA
  function screenSearch(el, route) {
    el.className = 'screen search';
    el.innerHTML = '<div class="kbd-wrap"><div class="q"></div><div class="kbd"></div></div>' +
      '<div class="res-vp"><div class="head"><h1>Buscar</h1><p>Escribe con el teclado de la izquierda</p></div>' +
      '<div class="grid-vp"><div class="scroller"><div class="grid"></div></div></div></div>';
    var q = route.q || '', qEl = $('.q', el), kbd = $('.kbd', el), grid = $('.grid', el), sub = $('.res-vp .head p', el);
    var keys = 'abcdefghijklmnñopqrstuvwxyz1234567890'.split('');
    keys.forEach(function (k) {
      var b = document.createElement('span');
      b.className = 'key'; b.textContent = k; b.setAttribute('data-key', 'k-' + k);
      on(b, { ok: function () { setQ(q + k); } });
      kbd.appendChild(b);
    });
    [['espacio', 'w3', function () { if (q && q.slice(-1) !== ' ') setQ(q + ' '); }],
     ['⌫ borrar', 'w2', function () { setQ(q.slice(0, -1)); }],
     ['limpiar', 'w2', function () { setQ(''); }]].forEach(function (x) {
      var b = document.createElement('span');
      b.className = 'key ' + x[1]; b.textContent = x[0]; b.setAttribute('data-key', 'k-' + x[0]);
      on(b, { ok: x[2] });
      kbd.appendChild(b);
    });
    var timer = null, seq = 0;
    function paintQ() { qEl.innerHTML = q ? esc(q) + '<span class="caret"></span>' : '<span class="caret"></span><i>Título…</i>'; }
    function setQ(v) {
      q = v; route.q = q; store.sset('tvstack', stack); paintQ();
      clearTimeout(timer);
      timer = setTimeout(run, 650);
    }
    function run() {
      var my = ++seq;
      grid.innerHTML = '';
      if (q.trim().length < 2) { sub.textContent = 'Escribe al menos 2 letras'; return; }
      sub.textContent = 'Buscando «' + q.trim() + '»…';
      fetchDoc(ORIGIN + '/?s=' + encodeURIComponent(q.trim()), function (err, doc) {
        if (my !== seq) return;
        if (err) { sub.textContent = 'No se ha podido buscar. Inténtalo de nuevo.'; return; }
        var items = parseList(doc);
        sub.textContent = items.length ? items.length + ' resultados' : 'Sin resultados para «' + q.trim() + '»';
        gridRows(grid, items);
      });
    }
    paintQ();
    if (q) run();
    return { first: function () { return $('.key', kbd); } };
  }

  // ------------------------------------------------------------------ Atrás
  function back() {
    if (railOpen) {
      if (stack.length <= 1) return 'exit';
      closeRail();
      return true;
    }
    if (stack.length > 1) {
      stack.pop();
      render();
      return true;
    }
    // inicio: primero sube al destacado, luego abre el menú, después sale
    var first = screen && screen.first && screen.first();
    if (first && cur !== first) { setFocus(first); return true; }
    openRail();
    return true;
  }

  // ------------------------------------------------------------------ INTRO
  var intro = null, introAudio = null, introTimers = [];
  function playIntro() {
    if (store.sget('introDone')) return;          // solo al abrir la app, no al volver del reproductor
    store.sset('introDone', 1);
    intro = document.createElement('div');
    intro.id = 'intro';
    var rays = '';
    for (var r = 0; r < 8; r++) rays += '<i style="-webkit-transform:rotate(' + (r * 22.5) + 'deg);transform:rotate(' + (r * 22.5) + 'deg)"></i>';
    var word = '', letters = 'MORVEHTV'.split('');
    letters.forEach(function (ch, i) {
      var d = (1.3 + i * 0.075).toFixed(3) + 's';
      word += '<span class="' + (i >= 6 ? 'y' : '') + '" style="-webkit-animation-delay:' + d + ',' + (2.5 + i * 0.05).toFixed(2) + 's;animation-delay:' + d + ',' + (2.5 + i * 0.05).toFixed(2) + 's">' + ch + '</span>';
    });
    var sparks = '';
    function burst(n, delay, scale) {
      for (var k = 0; k < n; k++) {
        var ang = Math.round(k * 360 / n + Math.random() * 14);
        var dl = (delay + Math.random() * 0.12).toFixed(2);
        sparks += '<div class="i-spark" style="-webkit-transform:rotate(' + ang + 'deg);transform:rotate(' + ang + 'deg)">' +
          '<b style="-webkit-animation-delay:' + dl + 's;animation-delay:' + dl + 's;width:' + scale + 'rem;height:' + scale + 'rem"></b></div>';
      }
    }
    burst(18, 0.65, 0.7);
    burst(12, 2.5, 0.45);
    intro.innerHTML = '<div class="i-glow"></div><div class="i-rays">' + rays + '</div><div class="i-line"></div>' +
      '<div class="i-flash"></div><div class="i-ring"></div>' + sparks +
      '<div class="i-logo"><div class="i-icon">' + icon('play') + '</div><div class="i-word">' + word + '</div></div>' +
      '<div class="i-tag">Películas · Series · Anime</div>';
    document.body.appendChild(intro);
    try {
      introAudio = new Audio('intro.mp3');
      introAudio.volume = 0.9;
      var pr = introAudio.play();
      if (pr && pr['catch']) pr['catch'](function () {});
    } catch (e) {}
    introTimers.push(setTimeout(function () { if (intro) intro.className = 'out'; }, 3700));
    introTimers.push(setTimeout(endIntro, 4500));
  }
  function endIntro() {
    introTimers.forEach(clearTimeout); introTimers = [];
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    intro = null;
  }
  function skipIntro() {
    if (!intro) return;
    introTimers.forEach(clearTimeout); introTimers = [];
    intro.className = 'skip out';
    if (introAudio) {
      var a = introAudio, v = a.volume;
      var fade = setInterval(function () { v -= 0.15; if (v <= 0) { clearInterval(fade); try { a.pause(); } catch (e) {} } else a.volume = v; }, 40);
    }
    setTimeout(endIntro, 320);
  }
  function guard(fn) {
    return function (x) { if (intro) { skipIntro(); return true; } return fn(x); };
  }

  // ------------------------------------------------------------------ API para la app nativa
  window.__tvnav = {
    move: guard(move),
    activate: guard(activate),
    back: guard(back),
    media: function () { return null; },
    refresh: function () {},
    openMenu: openRail
  };
  // la app nativa avisa al volver a primer plano
  window.__tvApp = { check: function (force) { checkNew(!!force); } };

  // teclado de ordenador (para pruebas en el navegador)
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode, r = null;
    if (k === 37) r = move('left'); else if (k === 38) r = move('up'); else if (k === 39) r = move('right'); else if (k === 40) r = move('down');
    else if (k === 13) r = activate(); else if (k === 8 || k === 27) r = back();
    else return;
    e.preventDefault();
  });

  buildRail();
  render();
  playIntro();
  setTimeout(function () { checkNew(true); }, 15000);
  setInterval(function () { checkNew(true); }, CHECK_MS);
})();
