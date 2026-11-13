/* koflers.net — main.js
   Sprache, Boot-Intro, Befehlspalette, Reveal, Plotter, Waveform, Glitch, Copy
   Keine externen Abhängigkeiten. */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");

  var store = {
    get: function (s, k) { try { return window[s].getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { window[s].setItem(k, v); } catch (e) {} }
  };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------ */
  /* Sprache                                                              */
  /* ------------------------------------------------------------------ */
  var html = document.documentElement;
  function setLang(lang) {
    html.setAttribute("lang", lang);
    store.set("localStorage", "km-lang", lang);
    var t = html.getAttribute("data-title-" + lang);
    if (t) document.title = t;
    $$("[data-ph-de]").forEach(function (el) { el.setAttribute("placeholder", el.getAttribute("data-ph-" + lang)); });
    $$("[data-aria-de]").forEach(function (el) { el.setAttribute("aria-label", el.getAttribute("data-aria-" + lang)); });
    document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  }
  var initial = store.get("localStorage", "km-lang") ||
    ((navigator.language || "de").toLowerCase().indexOf("de") === 0 ? "de" : "en");
  setLang(initial);
  $$(".lang-toggle").forEach(function (b) {
    b.addEventListener("click", function () { setLang(html.lang === "de" ? "en" : "de"); });
  });
  var L = function (de, en) { return html.lang === "en" ? en : de; };

  /* ------------------------------------------------------------------ */
  /* Mobile Menü                                                          */
  /* ------------------------------------------------------------------ */
  var nav = $(".nav"), menuBtn = $(".menu-btn");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ------------------------------------------------------------------ */
  /* Spotlight + Koordinaten-Anzeige                                      */
  /* ------------------------------------------------------------------ */
  var rx = $("#rx"), ry = $("#ry"), raf = 0, mx = 0, my = 0;
  window.addEventListener("pointermove", function (e) {
    mx = e.clientX; my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      html.style.setProperty("--mx", mx + "px");
      html.style.setProperty("--my", my + "px");
      if (rx) rx.textContent = String(Math.round(mx)).padStart(4, "0");
      if (ry) ry.textContent = String(Math.round(my + window.scrollY)).padStart(4, "0");
    });
  }, { passive: true });

  /* ------------------------------------------------------------------ */
  /* Reveal beim Scrollen                                                 */
  /* ------------------------------------------------------------------ */
  var rvs = $$(".rv");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rvs.forEach(function (el) { io.observe(el); });
  } else { rvs.forEach(function (el) { el.classList.add("in"); }); }

  /* ------------------------------------------------------------------ */
  /* Glitch / Scramble                                                    */
  /* ------------------------------------------------------------------ */
  var CH = "!<>-_\\/[]{}=+*^?#01";
  function scramble(el) {
    if (reduced || el._busy) return;
    var spans = $$("[data-l]", el);
    var target = spans.length ? spans.filter(function (s) { return s.getAttribute("data-l") === html.lang; })[0] : el;
    if (!target) return;
    if (!target._html) { target._html = target.innerHTML; target._txt = target.textContent; }
    var orig = target._txt;
    el._busy = true; el.classList.add("on");
    var f = 0, total = 18;
    (function step() {
      var out = "";
      for (var i = 0; i < orig.length; i++) {
        out += (orig[i] === " " || i < (f / total) * orig.length) ? orig[i] : CH[(Math.random() * CH.length) | 0];
      }
      target.textContent = out;
      if (++f <= total) requestAnimationFrame(step);
      else { target.innerHTML = target._html; el._busy = false; setTimeout(function () { el.classList.remove("on"); }, 120); }
    })();
  }
  $$(".glitch").forEach(function (el) {
    el.addEventListener("mouseenter", function () { scramble(el); });
  });
  setTimeout(function () { $$(".glitch").forEach(scramble); }, 400);

  /* ------------------------------------------------------------------ */
  /* Boot-Intro (nur Startseite, einmal pro Sitzung)                      */
  /* ------------------------------------------------------------------ */
  function runBoot(force) {
    var boot = $(".boot");
    if (!boot) return;
    if (force) html.classList.add("booting");
    if (!html.classList.contains("booting")) { boot.remove(); return; }
    store.set("sessionStorage", "km-booted", "1");
    boot.classList.remove("hide");
    var out = $(".boot-out", boot), bar = $(".bar i", boot);
    out.innerHTML = "";
    var lines = [
      ["koflers.net // WERKSTATT OS v1.0", ""],
      [L("Initialisiere Werkstatt", "Initializing workshop") + " .......", "ok"],
      ["[K1 MAX]    " + L("Druckbett kalibriert", "bed mesh calibrated") + " ....", "ok"],
      ["[CAMEO 5α]  " + L("Klinge erkannt", "blade detected") + " ........", "ok"],
      ["[HA]        " + L("Automationen geladen", "automations loaded") + " ...", "ok"],
      ["[AUDIO]     " + L("Synthesizer warm", "synths warming up") + " ......", "ok"],
      [L("Willkommen, Besucher.", "Welcome, visitor."), "r"]
    ];
    var i = 0, done = false;
    function finish() {
      if (done) return; done = true;
      boot.classList.add("hide");
      setTimeout(function () { html.classList.remove("booting"); }, 650);
    }
    function next() {
      if (done) return;
      if (i >= lines.length) { setTimeout(finish, 450); return; }
      var d = document.createElement("div");
      d.className = "line";
      var txt = lines[i][0], cls = lines[i][1];
      d.innerHTML = cls === "r" ? "<span class='r'>&gt; " + txt + "</span>" :
        "<span class='r'>&gt;</span> " + txt.replace(/</g, "&lt;") + (cls === "ok" ? " <span class='ok'>[OK]</span>" : "");
      out.appendChild(d);
      i++;
      bar.style.width = Math.round(i / lines.length * 100) + "%";
      setTimeout(next, 120 + Math.random() * 160);
    }
    boot.addEventListener("click", finish);
    document.addEventListener("keydown", function k() { finish(); document.removeEventListener("keydown", k); });
    next();
  }
  var forceBoot = location.hash === "#boot";
  if (forceBoot) history.replaceState(null, "", location.pathname);
  runBoot(forceBoot);

  /* ------------------------------------------------------------------ */
  /* Befehlspalette (Strg/Cmd + K)                                         */
  /* ------------------------------------------------------------------ */
  var root = html.getAttribute("data-root") || "";
  var cmds = [
    { de: "Start", en: "Home", h: "index.html", k: "home start" },
    { de: "3D-Druck", en: "3D printing", h: "3d-druck.html", k: "3d druck print k1 max stl creality" },
    { de: "Plotten", en: "Plotting", h: "plotten.html", k: "plotter cameo svg schneiden cut vinyl" },
    { de: "Home Assistant", en: "Home Assistant", h: "home-assistant.html", k: "ha smart home yaml automation" },
    { de: "Musik", en: "Music", h: "musik.html", k: "music dark wave depeche mode synth" },
    { de: "Über mich", en: "About", h: "ueber.html", k: "about kontakt contact" },
    { de: "Impressum / Offenlegung", en: "Legal notice", h: "impressum.html", k: "impressum legal" },
    { de: "Datenschutz", en: "Privacy", h: "datenschutz.html", k: "privacy dsgvo gdpr" },
    { de: "Sprache wechseln (DE/EN)", en: "Switch language (DE/EN)", a: function () { setLang(html.lang === "de" ? "en" : "de"); }, k: "language sprache english deutsch", t: "action" },
    { de: "Nach oben", en: "Back to top", a: function () { window.scrollTo(0, 0); }, k: "top oben", t: "action" },
    { de: "Intro erneut abspielen", en: "Replay intro", a: function () { location.href = root + "index.html#boot"; }, k: "boot intro", t: "action" }
  ];
  var cmdk = $(".cmdk"), cin = cmdk && $("input", cmdk), clist = cmdk && $("ul", cmdk), sel = 0, shown = [];
  function render() {
    var q = (cin.value || "").toLowerCase().trim();
    shown = cmds.filter(function (c) {
      if (!q) return true;
      return (c.de + " " + c.en + " " + c.k).toLowerCase().indexOf(q) > -1;
    });
    if (sel >= shown.length) sel = 0;
    clist.innerHTML = shown.length ? "" : "<div class='empty'>" + L("Nichts gefunden.", "Nothing found.") + "</div>";
    shown.forEach(function (c, idx) {
      var li = document.createElement("li");
      if (idx === sel) li.className = "sel";
      li.innerHTML = "<span>" + L(c.de, c.en) + "</span><small>" + (c.t === "action" ? L("Aktion", "Action") : L("Seite", "Page")) + "</small>";
      li.addEventListener("click", function () { run(c); });
      li.addEventListener("mousemove", function () { if (sel !== idx) { sel = idx; render(); } });
      clist.appendChild(li);
    });
  }
  function run(c) { close(); if (c.a) c.a(); else location.href = root + c.h; }
  function open() { if (!cmdk) return; cmdk.classList.add("open"); cin.value = ""; sel = 0; render(); setTimeout(function () { cin.focus(); }, 10); }
  function close() { if (cmdk) cmdk.classList.remove("open"); }
  if (cmdk) {
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); cmdk.classList.contains("open") ? close() : open(); }
      else if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); }
      else if (cmdk.classList.contains("open")) {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(shown.length, 1); render(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(shown.length, 1); render(); }
        else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); run(shown[sel]); }
      }
    });
    cin.addEventListener("input", function () { sel = 0; render(); });
    cmdk.addEventListener("click", function (e) { if (e.target === cmdk) close(); });
    $$(".cmd-btn").forEach(function (b) { b.addEventListener("click", open); });
    document.addEventListener("langchange", function () { if (cmdk.classList.contains("open")) render(); });
  }

  /* ------------------------------------------------------------------ */
  /* Plotter: SVG zeichnet sich selbst                                    */
  /* ------------------------------------------------------------------ */
  function plot(box) {
    var svg = $("svg", box), pen = $(".pen", box);
    if (!svg) return;
    var paths = $$("path, polyline, circle", svg);
    var lens = paths.map(function (p) { var l = p.getTotalLength ? p.getTotalLength() : 1000; p.style.strokeDasharray = l; p.style.strokeDashoffset = l; return l; });
    if (reduced) { paths.forEach(function (p) { p.style.strokeDashoffset = 0; }); return; }
    var total = lens.reduce(function (a, b) { return a + b; }, 0);
    var speed = total / 5200; // ~5,2 s pro Zeichnung
    var idx = 0, drawn = 0, last = 0;
    box.classList.add("drawing");
    function frame(t) {
      if (!last) last = t;
      var dt = t - last; last = t;
      drawn += dt * speed;
      while (idx < paths.length && drawn >= lens[idx]) { paths[idx].style.strokeDashoffset = 0; drawn -= lens[idx]; idx++; }
      if (idx >= paths.length) { box.classList.remove("drawing"); box._done = true; return; }
      var p = paths[idx];
      p.style.strokeDashoffset = lens[idx] - drawn;
      if (pen && p.getPointAtLength) {
        var pt = p.getPointAtLength(drawn), m = p.getScreenCTM(), r = box.getBoundingClientRect();
        if (m) { pen.style.left = (m.a * pt.x + m.c * pt.y + m.e - r.left) + "px"; pen.style.top = (m.b * pt.x + m.d * pt.y + m.f - r.top) + "px"; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function loadPlot(box) {
    var src = box.getAttribute("data-svg");
    if (!src || $("svg", box)) { plot(box); return; }
    fetch(src).then(function (r) { return r.text(); }).then(function (txt) {
      var tmp = document.createElement("div"); tmp.innerHTML = txt;
      var svg = $("svg", tmp); if (!svg) return;
      box.insertBefore(svg, box.firstChild); plot(box);
    }).catch(function () {
      var img = document.createElement("img"); img.src = src; img.alt = ""; img.style.cssText = "width:82%;position:relative";
      box.appendChild(img);
    });
  }
  var plots = $$(".plot-box");
  if ("IntersectionObserver" in window) {
    var pio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { pio.unobserve(e.target); loadPlot(e.target); } });
    }, { threshold: .35 });
    plots.forEach(function (b) { pio.observe(b); });
  } else plots.forEach(loadPlot);
  $$("[data-replot]").forEach(function (b) {
    b.addEventListener("click", function () { var box = document.getElementById(b.getAttribute("data-replot")); if (box && box._done) { box._done = false; plot(box); } });
  });

  /* ------------------------------------------------------------------ */
  /* Waveform / Oszilloskop                                               */
  /* ------------------------------------------------------------------ */
  $$("canvas.wave").forEach(function (cv) {
    var ctx = cv.getContext("2d"), w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var mode = cv.getAttribute("data-mode") || "osc", t0 = performance.now(), energy = 0, target = 0;
    var visible = true, hover = 0;
    function size() { var r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); window.addEventListener("resize", size);
    cv.addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); hover = (e.clientX - r.left) / r.width; target = 1; });
    cv.addEventListener("pointerleave", function () { target = 0; });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
    function draw(now) {
      requestAnimationFrame(draw);
      if (!visible || !w) return;
      var t = (now - t0) / 1000;
      energy += (target - energy) * .06;
      ctx.clearRect(0, 0, w, h);
      var mid = h / 2;
      if (mode === "bars") {
        var n = Math.floor(w / 9), bw = 5;
        for (var i = 0; i < n; i++) {
          var x = i / n;
          var v = Math.abs(Math.sin(x * 9 + t * 2.1) * .5 + Math.sin(x * 23 - t * 3.3) * .3 + Math.sin(x * 51 + t * 5) * .2);
          v = v * (.35 + .65 * Math.exp(-Math.pow((x - hover) * 4, 2) ) * energy + .25);
          var bh = Math.max(2, v * h * .8);
          ctx.fillStyle = Math.abs(x - hover) < .03 && energy > .1 ? "#ff2b2b" : "rgba(233,233,236," + (.15 + v * .5) + ")";
          ctx.fillRect(i * 9, mid - bh / 2, bw, bh);
        }
        return;
      }
      // Oszilloskop: Gitter
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; ctx.beginPath();
      for (var gx = 0; gx < w; gx += 48) { ctx.moveTo(gx + .5, 0); ctx.lineTo(gx + .5, h); }
      ctx.moveTo(0, mid + .5); ctx.lineTo(w, mid + .5); ctx.stroke();
      var layers = [[.9, "rgba(255,43,43,1)", 2], [.6, "rgba(255,43,43,.35)", 1], [.35, "rgba(233,233,236,.25)", 1]];
      layers.forEach(function (L2, li) {
        ctx.beginPath(); ctx.strokeStyle = L2[1]; ctx.lineWidth = L2[2];
        if (li === 0) { ctx.shadowColor = "rgba(255,43,43,.7)"; ctx.shadowBlur = 12; } else ctx.shadowBlur = 0;
        for (var x2 = 0; x2 <= w; x2 += 2) {
          var u = x2 / w;
          var env = Math.sin(u * Math.PI);
          var y = Math.sin(u * 14 + t * (2 + li)) * .45 + Math.sin(u * 31 - t * 3.1) * .25 + Math.sin(u * 7 + t * .7 + li) * .3;
          y += Math.sin(u * 90 + t * 9) * .12 * energy;
          var amp = h * .32 * L2[0] * env * (1 + energy * .6 * Math.exp(-Math.pow((u - hover) * 5, 2)));
          if (x2 === 0) ctx.moveTo(x2, mid + y * amp); else ctx.lineTo(x2, mid + y * amp);
        }
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    }
    if (reduced) { visible = true; draw(performance.now()); } else requestAnimationFrame(draw);
  });

  /* ------------------------------------------------------------------ */
  /* Code kopieren                                                        */
  /* ------------------------------------------------------------------ */
  $$(".copy-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      var pre = b.closest(".code").querySelector("pre");
      var txt = pre.innerText;
      var ok = function () {
        b.classList.add("done");
        var lbl = b.querySelector("[data-l='" + html.lang + "']") || b;
        var old = lbl.textContent; lbl.textContent = L("Kopiert ✓", "Copied ✓");
        setTimeout(function () { b.classList.remove("done"); lbl.textContent = old; }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, ok); else ok();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Footer: Laufzeit-Zähler                                               */
  /* ------------------------------------------------------------------ */
  var up = $("#uptime");
  if (up) {
    var since = new Date(up.getAttribute("data-since") + "T00:00:00").getTime();
    var tick = function () {
      var s = Math.max(0, Math.floor((Date.now() - since) / 1000));
      var d = Math.floor(s / 86400); s %= 86400;
      var hh = Math.floor(s / 3600); s %= 3600;
      var mm = Math.floor(s / 60), ss = s % 60;
      up.textContent = d + "d " + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    };
    tick(); setInterval(tick, 1000);
  }
})();
