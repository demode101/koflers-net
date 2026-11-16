/* koflers.net – Spotify-Bereich der Musik-Seite
 * Holt die Daten über den eigenen Worker (koflers-spotify), nie direkt von Spotify.
 */
(function () {
  "use strict";
  var root = document.querySelector(".sp[data-api]");
  if (!root) return;

  var API = root.getAttribute("data-api");
  var html = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lang = function () { return html.lang === "en" ? "en" : "de"; };
  var L = function (de, en) { return lang() === "en" ? en : de; };

  function get(path) {
    return fetch(API + path, { credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function img(url) { return url ? API + "/img?u=" + encodeURIComponent(url) : ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mmss(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function ago(iso) {
    if (!iso) return "";
    var diff = (new Date(iso).getTime() - Date.now()) / 1000;
    var units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    try {
      var rtf = new Intl.RelativeTimeFormat(lang(), { numeric: "auto", style: "short" });
      for (var i = 0; i < units.length; i++) {
        if (Math.abs(diff) >= units[i][1]) return rtf.format(Math.round(diff / units[i][1]), units[i][0]);
      }
      return L("gerade eben", "just now");
    } catch (e) { return ""; }
  }

  /* ---------------- Läuft gerade / zuletzt gespielt ---------------- */
  var now = root.querySelector(".sp-now");
  var el = {
    cover: now.querySelector(".sp-cover"),
    status: now.querySelector(".sp-status-txt"),
    title: now.querySelector(".sp-title"),
    artist: now.querySelector(".sp-artist"),
    album: now.querySelector(".sp-album"),
    prog: now.querySelector(".sp-progress"),
    bar: now.querySelector(".sp-bar span"),
    cur: now.querySelector(".sp-cur"),
    dur: now.querySelector(".sp-dur"),
    open: now.querySelector(".sp-open")
  };
  var state = null, tickStart = 0, nowTimer = null;

  function renderNow() {
    if (!state) return;
    var t = state.track;
    if (!t) {
      now.setAttribute("data-state", "idle");
      el.status.textContent = L("Gerade still", "Silence right now");
      return;
    }
    now.setAttribute("data-state", state.playing ? "playing" : "idle");
    el.status.textContent = state.playing
      ? L("Läuft gerade", "Now playing")
      : L("Zuletzt gespielt", "Last played") + (state.played_at ? " · " + ago(state.played_at) : "");
    if (el.title.textContent !== t.title) {
      el.title.textContent = t.title;
      el.title.animate && !reduced && el.title.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: "ease-out" });
    }
    el.artist.textContent = t.artists || "";
    el.album.textContent = [t.album, t.year].filter(Boolean).join(" · ");
    var src = img(t.cover);
    if (src && el.cover.getAttribute("src") !== src) { el.cover.src = src; el.cover.alt = t.album ? "Cover: " + t.album : ""; }
    el.cover.hidden = !src;
    if (t.url) { el.open.href = t.url; el.open.hidden = false; }
    el.prog.hidden = !state.playing || !t.duration_ms;
    tickProgress();
  }

  function tickProgress() {
    if (!state || !state.playing || !state.track || !state.track.duration_ms) return;
    var pos = Math.min(state.progress_ms + (Date.now() - tickStart), state.track.duration_ms);
    el.bar.style.width = (pos / state.track.duration_ms * 100).toFixed(2) + "%";
    el.cur.textContent = mmss(pos);
    el.dur.textContent = mmss(state.track.duration_ms);
    if (pos >= state.track.duration_ms) { state.playing = false; loadNow(); }
  }

  function applyNow(d) {
    var changed = !state || !d.track || !state.track || d.track.url !== state.track.url || d.playing !== state.playing;
    state = d; tickStart = Date.now();
    renderNow();
    if (changed) loadList("recent", "/api/recent", true);
  }

  function loadNow() {
    if (ws && ws.readyState === 1) return Promise.resolve(); /* Live-Verbindung liefert selbst */
    return get("/api/now").then(applyNow).catch(function () {
      now.setAttribute("data-state", "error");
      el.status.textContent = L("Spotify gerade nicht erreichbar", "Spotify unavailable right now");
    });
  }

  function schedule() {
    clearInterval(nowTimer);
    if (document.hidden) return;
    nowTimer = setInterval(loadNow, 30000);
  }

  /* Live-Verbindung: Songwechsel kommen per Push (Worker fragt Spotify zentral ab).
     Fällt sie aus, übernimmt wieder die Abfrage alle 30 s. */
  var ws = null, wsRetry = 0, wsTimer = null;
  function live() {
    clearTimeout(wsTimer);
    if (ws || document.hidden || !("WebSocket" in window)) return;
    try { ws = new WebSocket(API.replace(/^http/, "ws") + "/live"); } catch (e) { ws = null; return; }
    ws.onopen = function () { wsRetry = 0; };
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.t !== "now") return;
      if (d.playing && d.at && d.track && d.track.duration_ms) /* Stand vom Server ggf. ein paar Sekunden alt */
        d.progress_ms = Math.min(d.track.duration_ms, d.progress_ms + Math.max(0, Math.min(15000, Date.now() - d.at)));
      applyNow(d);
    };
    ws.onclose = function () {
      ws = null;
      if (document.hidden) return;
      wsTimer = setTimeout(live, Math.min(60000, 2000 * Math.pow(2, wsRetry++)));
    };
  }
  function liveStop() { clearTimeout(wsTimer); if (ws) { ws.onclose = null; ws.close(); ws = null; } }

  setInterval(tickProgress, 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) liveStop(); else { loadNow(); live(); }
    schedule();
  });

  /* ---------------- Listen ---------------- */
  var lists = { recent: root.querySelector('[data-list="recent"]'), top: root.querySelector('[data-list="top"]') };
  var data = {};

  function renderList(which) {
    var ol = lists[which], items = data[which];
    if (!items) return;
    if (!items.length) { ol.innerHTML = '<li class="sp-empty">' + esc(L("Noch keine Daten.", "No data yet.")) + "</li>"; return; }
    ol.innerHTML = items.map(function (t) {
      var cover = t.cover ? '<img src="' + esc(img(t.cover)) + '" alt="" loading="lazy" width="44" height="44">' : '<span class="ph"></span>';
      var meta = which === "recent" ? '<span class="when">' + esc(ago(t.played_at)) + "</span>" : "";
      var inner = cover + '<span class="txt"><div class="t">' + esc(t.title) + '</div><div class="a">' + esc(t.artists) + "</div></span>" + meta;
      return "<li>" + (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + inner + "</a>" : '<div class="row">' + inner + "</div>") + "</li>";
    }).join("");
  }

  function loadList(which, path, quiet) {
    if (!quiet) lists[which].classList.add("loading");
    return get(path).then(function (d) {
      data[which] = d.items || [];
      renderList(which);
    }).catch(function () {
      if (!data[which]) lists[which].innerHTML = '<li class="sp-empty">' + esc(L("Spotify gerade nicht erreichbar.", "Spotify unavailable right now.")) + "</li>";
    }).then(function () { lists[which].classList.remove("loading"); });
  }

  /* Umschalter Top 10 */
  var seg = root.querySelectorAll(".sp-seg button");
  Array.prototype.forEach.call(seg, function (b) {
    b.addEventListener("click", function () {
      Array.prototype.forEach.call(seg, function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      loadList("top", "/api/top?range=" + b.getAttribute("data-range"));
    });
  });

  /* ---------------- Band-Cloud ---------------- */
  var cloud = document.querySelector(".cloud");
  function buildCloud() {
    if (!cloud) return;
    var fav = {};
    Array.prototype.forEach.call(cloud.children, function (s) {
      fav[s.textContent.trim().toLowerCase()] = { name: s.textContent.trim(), w: parseFloat(s.style.getPropertyValue("--w")) || 5 };
    });
    get("/api/artists?range=long").then(function (d) {
      var all = {};
      Object.keys(fav).forEach(function (k) { all[k] = { name: fav[k].name, score: fav[k].w }; });
      (d.items || []).forEach(function (a) {
        var k = a.name.toLowerCase(), boost = (31 - a.rank) / 30 * 5;
        if (all[k]) { all[k].score += boost; all[k].url = a.url; }
        else all[k] = { name: a.name, score: boost, url: a.url };
      });
      var list = Object.keys(all).map(function (k) { return all[k]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 32);
      var max = list[0] ? list[0].score : 1;
      /* größte Namen in die Mitte */
      var arranged = [];
      list.forEach(function (x, i) { if (i % 2) arranged.push(x); else arranged.unshift(x); });
      cloud.innerHTML = arranged.map(function (x) {
        var w = (1 + 9 * x.score / max).toFixed(2);
        var cls = x.score / max > .8 ? ' class="top"' : "";
        return x.url
          ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="--w:' + w + '"' + cls + ">" + esc(x.name) + "</a>"
          : '<span style="--w:' + w + '"' + cls + ">" + esc(x.name) + "</span>";
      }).join("");
    }).catch(function () { /* Lieblingsliste bleibt stehen */ });
  }

  /* ---------------- Equalizer (simuliert) ---------------- */
  var eqCv = document.querySelector("canvas.eq");
  if (eqCv) (function () {
    var ctx = eqCv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
    var N = 0, SEG = 0, lv = [], pk = [], pkT = [], vis = true, last = 0, beat = 0, nextBeat = 0, bpm = 120;
    function size() {
      var r = eqCv.getBoundingClientRect(); W = r.width; H = r.height;
      eqCv.width = W * dpr; eqCv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = Math.max(16, Math.min(72, Math.floor(W / 16))); SEG = Math.max(8, Math.floor((H - 34) / 6));
      while (lv.length < N) { lv.push(0); pk.push(0); pkT.push(0); }
    }
    size(); window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }).observe(eqCv);
    /* Tempo pro Song "erraten" (aus dem Titel abgeleitet, nicht echt) */
    function tempo() {
      var t = state && state.track ? state.track.title + state.track.artists : "";
      var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
      return 108 + Math.abs(h) % 30;
    }
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!vis || !W || document.hidden) return;
      var dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
      var playing = !!(state && state.playing), energy = playing ? 1 : .32, t = ts / 1000;
      if (ts >= nextBeat) { bpm = tempo(); beat = 1; nextBeat = ts + 60000 / bpm; }
      beat *= Math.pow(.02, dt);
      ctx.clearRect(0, 0, W, H);
      var top = 26, bottom = H - 8, area = bottom - top, gap = 3, bw = (W - 32) / N, segH = area / SEG;
      for (var i = 0; i < N; i++) {
        var x = i / (N - 1);
        var shape = Math.pow(1 - x, .9) * .55 + .25 + Math.exp(-Math.pow((x - .32) * 5, 2)) * .25;
        var noise = (Math.sin(t * 3.1 + i * 1.7) + Math.sin(t * 5.3 + i * .63) + Math.sin(t * 8.9 + i * 2.9)) / 6 + .5;
        var kick = beat * Math.exp(-x * 4) * .7;
        var target = Math.min(1, (shape * (.45 + noise * .6) + kick) * energy + (playing ? 0 : .04));
        lv[i] += (target - lv[i]) * (target > lv[i] ? .55 : .12);
        if (lv[i] >= pk[i]) { pk[i] = lv[i]; pkT[i] = ts; } else if (ts - pkT[i] > 380) pk[i] = Math.max(lv[i], pk[i] - dt * .5);
        var on = Math.round(lv[i] * SEG), bx = 16 + i * bw;
        for (var s = 0; s < SEG; s++) {
          var y = bottom - (s + 1) * segH;
          var hot = s / SEG;
          ctx.fillStyle = s < on
            ? (hot > .85 ? "#ffffff" : hot > .6 ? "#ff6a6a" : "#ff2b2b")
            : "rgba(255,255,255,.045)";
          ctx.fillRect(bx, y + 1, bw - gap, segH - 2);
        }
        var py = bottom - Math.max(1, Math.round(pk[i] * SEG)) * segH;
        ctx.fillStyle = "rgba(255,43,43,.95)";
        ctx.shadowColor = "rgba(255,43,43,.8)"; ctx.shadowBlur = 8;
        ctx.fillRect(bx, py - 2, bw - gap, 2);
        ctx.shadowBlur = 0;
      }
    }
    requestAnimationFrame(frame);
  })();

  /* ---------------- Lieblingsalben: Cover & Link ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".album[data-q]"), function (card) {
    get("/api/album?q=" + encodeURIComponent(card.getAttribute("data-q"))).then(function (a) {
      if (!a || !a.cover) return;
      var im = card.querySelector(".album-cover");
      im.src = img(a.cover); im.alt = "Cover: " + a.title; im.hidden = false;
      card.classList.add("has-cover");
      if (a.url) card.href = a.url;
    }).catch(function () { /* Platte ohne Cover bleibt stehen */ });
  });

  /* ---------------- Sprache & Start ---------------- */
  document.addEventListener("langchange", function () { renderNow(); renderList("recent"); renderList("top"); });

  loadNow();
  schedule();
  live();
  loadList("recent", "/api/recent");
  loadList("top", "/api/top?range=long");
  buildCloud();
})();
