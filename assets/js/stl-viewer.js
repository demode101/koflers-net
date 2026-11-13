/* koflers.net — STL-Viewer (WebGL, ohne externe Bibliotheken)
   Verwendung: <div class="viewer" data-stl="assets/models/datei.stl"></div>
   Bedienung: ziehen = drehen, Mausrad/Pinch = zoomen, Doppelklick = zurücksetzen */
(function () {
  "use strict";

  function parseSTL(buf) {
    var dv = new DataView(buf);
    var isBinary = false;
    if (buf.byteLength >= 84) {
      var n = dv.getUint32(80, true);
      if (84 + n * 50 === buf.byteLength) isBinary = true;
    }
    var pos, nor;
    if (isBinary) {
      var count = dv.getUint32(80, true);
      pos = new Float32Array(count * 9); nor = new Float32Array(count * 9);
      for (var i = 0; i < count; i++) {
        var o = 84 + i * 50;
        for (var v = 0; v < 3; v++) for (var c = 0; c < 3; c++)
          pos[i * 9 + v * 3 + c] = dv.getFloat32(o + 12 + v * 12 + c * 4, true);
      }
    } else {
      var txt = new TextDecoder().decode(buf);
      var re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, m, arr = [];
      while ((m = re.exec(txt))) arr.push(+m[1], +m[2], +m[3]);
      pos = new Float32Array(arr); nor = new Float32Array(arr.length);
    }
    // Flächennormalen berechnen (robuster als die in der Datei gespeicherten)
    for (var t = 0; t < pos.length; t += 9) {
      var ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
      var bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      var l = Math.hypot(nx, ny, nz) || 1;
      for (var k = 0; k < 3; k++) { nor[t + k * 3] = nx / l; nor[t + k * 3 + 1] = ny / l; nor[t + k * 3 + 2] = nz / l; }
    }
    return { pos: pos, nor: nor };
  }

  // --- Mini-Matrix-Bibliothek (Spalten-Major) ---
  function persp(fov, a, n, f) { var t = 1 / Math.tan(fov / 2), r = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) * r, -1, 0, 0, 2 * n * f * r, 0]; }
  function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function scale(s) { return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; }

  var VS = "attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat4 mdl;varying vec3 vn;varying float vy;" +
    "void main(){vn=(mdl*vec4(n,0.)).xyz;vy=p.z;gl_Position=mvp*vec4(p,1.);}";
  var FS = "precision mediump float;varying vec3 vn;varying float vy;uniform float wire;" +
    "void main(){if(wire>.5){gl_FragColor=vec4(1.,.17,.17,.9);return;}" +
    "vec3 N=normalize(vn);vec3 L=normalize(vec3(.4,.7,.6));float d=max(dot(N,L),0.);" +
    "float rim=pow(1.-abs(N.z),4.);vec3 base=vec3(.56,.56,.6);" +
    "vec3 c=base*(.22+.78*d)+vec3(1.,.17,.17)*rim*.22;" +
    "float spec=pow(max(dot(reflect(-L,N),vec3(0.,0.,1.)),0.),24.)*.35;" +
    "gl_FragColor=vec4(c+spec,1.);}";

  function sh(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }

  function init(el) {
    var src = el.getAttribute("data-stl");
    var canvas = document.createElement("canvas");
    el.appendChild(canvas);
    var hud = el.querySelector(".hud .info");
    var gl = canvas.getContext("webgl", { antialias: true, alpha: true });
    function fail(msgDe, msgEn) {
      canvas.remove();
      var e = document.createElement("div"); e.className = "err";
      e.innerHTML = "<span data-l='de'>" + msgDe + "</span><span data-l='en'>" + msgEn + "</span>";
      el.appendChild(e);
    }
    if (!gl) { fail("WebGL ist in diesem Browser nicht verfügbar.", "WebGL is not available in this browser."); return; }

    fetch(src).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (buf) {
      var m = parseSTL(buf), P = m.pos;
      // Bounding Box
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < P.length; i += 3) for (var c = 0; c < 3; c++) { if (P[i + c] < mn[c]) mn[c] = P[i + c]; if (P[i + c] > mx[c]) mx[c] = P[i + c]; }
      var ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      var ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
      if (hud) {
        var f = function (v) { return (Math.round(v * 10) / 10).toString(); };
        hud.innerHTML = "<b>" + (P.length / 9).toLocaleString("de-AT") + "</b> △ &nbsp;·&nbsp; <b>" +
          f(mx[0] - mn[0]) + " × " + f(mx[1] - mn[1]) + " × " + f(mx[2] - mn[2]) + "</b> mm";
      }
      // Kanten für Drahtgitter
      var E = new Float32Array(P.length * 2), EN = new Float32Array(P.length * 2);
      for (var t = 0, e = 0; t < P.length; t += 9) {
        var idx = [0, 3, 3, 6, 6, 0];
        for (var q = 0; q < 6; q++) { E[e] = P[t + idx[q]]; E[e + 1] = P[t + idx[q] + 1]; E[e + 2] = P[t + idx[q] + 2]; e += 3; }
      }
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog); gl.useProgram(prog);
      var aP = gl.getAttribLocation(prog, "p"), aN = gl.getAttribLocation(prog, "n");
      var uMVP = gl.getUniformLocation(prog, "mvp"), uM = gl.getUniformLocation(prog, "mdl"), uW = gl.getUniformLocation(prog, "wire");
      function buffer(data) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
      var bP = buffer(P), bN = buffer(m.nor), bE = buffer(E), bEN = buffer(EN);
      gl.enable(gl.DEPTH_TEST);

      var rx = -1.05, ry = 0.5, zoom = 1, wire = false, auto = true, lastInput = 0;
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) auto = false;

      function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2), r = el.getBoundingClientRect();
        canvas.width = r.width * dpr; canvas.height = r.height * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      resize(); window.addEventListener("resize", resize);

      function draw() {
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var model = mul(rotX(rx), mul(rotY(ry), mul(scale(1.6 / ext), trans(-ctr[0], -ctr[1], -ctr[2]))));
        // Z-up (STL) → Y-up: zusätzliche Drehung um X um -90° ist bereits in rx-Startwert enthalten
        var view = trans(0, 0, -2.6 / zoom);
        var proj = persp(0.75, canvas.width / canvas.height, 0.05, 50);
        var mvp = mul(proj, mul(view, model));
        gl.uniformMatrix4fv(uMVP, false, new Float32Array(mvp));
        gl.uniformMatrix4fv(uM, false, new Float32Array(model));
        if (!wire) {
          gl.uniform1f(uW, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, P.length / 3);
        } else {
          gl.uniform1f(uW, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, bE); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, bEN); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.LINES, 0, E.length / 3);
        }
      }
      var visible = true;
      if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(el);
      var prev = 0;
      (function loop(now) {
        requestAnimationFrame(loop);
        var dt = prev ? (now - prev) / 1000 : 0; prev = now;
        if (!visible) return;
        if (auto && now - lastInput > 2500) ry += dt * 0.45;
        draw();
      })(0);

      // Interaktion
      var drag = null, pts = {};
      el.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".ctrl")) return;
        el.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY];
        drag = [e.clientX, e.clientY]; lastInput = performance.now();
      });
      el.addEventListener("pointermove", function (e) {
        if (!pts[e.pointerId]) return;
        var ids = Object.keys(pts);
        if (ids.length === 2) {
          var a = pts[ids[0]], b = pts[ids[1]], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
          pts[e.pointerId] = [e.clientX, e.clientY];
          a = pts[ids[0]]; b = pts[ids[1]];
          var d1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
          zoom = Math.min(4, Math.max(.4, zoom * (d1 / (d0 || d1))));
        } else if (drag) {
          ry += (e.clientX - drag[0]) * 0.01; rx += (e.clientY - drag[1]) * 0.01;
          rx = Math.max(-3.1, Math.min(0.5, rx));
          drag = [e.clientX, e.clientY]; pts[e.pointerId] = drag;
        }
        lastInput = performance.now();
      });
      function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) drag = null; }
      el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
      el.addEventListener("wheel", function (e) { e.preventDefault(); zoom = Math.min(4, Math.max(.4, zoom * Math.exp(-e.deltaY * 0.0015))); lastInput = performance.now(); }, { passive: false });
      el.addEventListener("dblclick", function () { rx = -1.05; ry = 0.5; zoom = 1; });

      var bw = el.querySelector("[data-act='wire']"), ba = el.querySelector("[data-act='auto']");
      if (bw) bw.addEventListener("click", function () { wire = !wire; bw.setAttribute("aria-pressed", wire); });
      if (ba) { ba.setAttribute("aria-pressed", auto); ba.addEventListener("click", function () { auto = !auto; lastInput = 0; ba.setAttribute("aria-pressed", auto); }); }
    }).catch(function () {
      fail("Modell konnte nicht geladen werden.<br>Hinweis: Beim lokalen Öffnen (file://) blockiert der Browser das Laden – online funktioniert es.",
           "Model could not be loaded.<br>Note: browsers block loading when opened locally (file://) – it works online.");
    });
  }

  function start() { Array.prototype.forEach.call(document.querySelectorAll(".viewer[data-stl]"), init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
