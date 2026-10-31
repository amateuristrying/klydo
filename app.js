(() => {
  // Set this to your form backend's URL and sign-ups POST there as JSON.
  const SIGNUP_ENDPOINT = "";

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const G = window.gsap && window.ScrollTrigger && window.SplitText;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Theme ---------- */

  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const mode = () => {
    const t = root.getAttribute("data-theme");
    return t ? (t === "dark" ? "night" : "day") : sysDark.matches ? "night" : "day";
  };
  const toggle = $("#themeToggle");
  function syncMode() {
    const m = mode();
    root.setAttribute("data-mode", m);
    toggle.setAttribute("aria-label", m === "night" ? "Switch to day theme" : "Switch to night theme");
    gl.setNight(m === "night");
  }
  function setTheme(next, x, y) {
    const apply = () => {
      root.setAttribute("data-theme", next === "night" ? "dark" : "light");
      try { localStorage.setItem("klydo-theme", root.getAttribute("data-theme")); } catch (e) {}
      syncMode();
      gl.draw();
    };
    if (document.startViewTransition && !reduce) {
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(apply);
      vt.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 750, easing: "cubic-bezier(.76,0,.24,1)", pseudoElement: "::view-transition-new(root)" }
        );
      }).catch(() => {});
    } else apply();
  }
  toggle.addEventListener("click", (e) => {
    const r = toggle.getBoundingClientRect();
    setTheme(mode() === "night" ? "day" : "night", r.left + r.width / 2, r.top + r.height / 2);
    if (G && !reduce) gsap.fromTo(".theme-icon", { rotate: -40, scale: .6 }, { rotate: 0, scale: 1, duration: .7, ease: "back.out(2.4)", stagger: .05 });
  });

  /* ---------- Tunnel shader: one corridor that morphs into the stepped hall ---------- */

  const gl = (() => {
    const canvas = $("#tunnel");
    const state = { zoom: 0, vp: 0, morph: 0, final: 0, mx: 0, my: 0, night: 0, on: true };
    const c = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    const none = { state, draw() {}, setNight(n) { state.night = n ? 1 : 0; } };
    if (!c) { root.classList.add("no-gl"); return none; }

    const vs = `#version 300 es
      in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
    const fs = `#version 300 es
      precision highp float;
      uniform vec2 uR, uV; uniform float uT, uZ, uM, uN, uF;
      out vec4 o;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
      vec3 sky(vec2 q, float t){
        float a = fbm(q*1.3 + vec2(t*.05, -t*.04)) + q.x*.3 - .02;
        float b = fbm(q*2.1 - vec2(t*.03, t*.05) + a);
        vec3 c = mix(vec3(1.,.58,.22), vec3(.97,.38,.76), smoothstep(.24,.5,a));
        return mix(c, vec3(.74,.64,1.), smoothstep(.42,.62,b) * smoothstep(.3,.55,a));
      }
      float grid(float v, float k){
        float w = fwidth(v*k), g = abs(fract(v*k-.5)-.5);
        return (1.-smoothstep(0., w*1.2, g)) * (1.-smoothstep(.25,.6,w));
      }
      void main(){
        vec2 p = (gl_FragCoord.xy - uR*uV)/uR.y;
        vec2 room = mix(vec2(1.02,.5), vec2(3.4,.135), uM);
        float ax = abs(p.x)/room.x, ay = abs(p.y)/room.y;
        float d = max(max(ax, ay), 1e-3), z = 1./d;
        bool wall = ax > ay;
        float lat = wall ? p.y/(d*room.y) : p.x/(d*room.x);
        float dep = z*1.15 + uZ;

        vec3 bg = mix(vec3(.968,.945,.985), vec3(.065,.062,.078), uN);
        vec3 ln = mix(vec3(.06,.05,.1), vec3(.62,.6,.68), uN);

        float fade = exp(-z*.11);
        float lines = max(grid(lat, 5.)*fade, grid(dep, 1.2)*fade*.9);
        float seam = 1.-smoothstep(0., .006, abs(ax-ay)*d/(ax+ay+1e-3)*2.);
        vec3 col = mix(bg, ln, clamp(max(lines*.55, seam*.5*fade), 0., 1.));

        if(!wall && p.y > 0.){
          vec3 s = sky(p*vec2(1.,1.4), uT) * mix(1., .58, uF*uN);
          float sf = smoothstep(0., .9, z*.09);
          col = mix(s, s*vec3(1.08,.96,1.1) + .06, sf);
        }

        if(uM > 0.){
          float k = 8.;
          float t = clamp((floor(dep*k)/k - uZ - .28)/.86, 0., 1.);
          vec3 pale = mix(vec3(.99,.91,1.), vec3(.58,.2,.56), uN);
          vec3 hot = vec3(.95,.42,.74);
          vec3 dark = vec3(.02,.01,.03);
          vec3 band = mix(pale, hot, smoothstep(.0,.62,t));
          band = mix(band, dark, smoothstep(.66,.9,t));
          float f = fract(dep*k);
          band = mix(band, dark, (1.-smoothstep(0., .14, f)) * smoothstep(.25,.6,t));
          band = mix(band, hot, (1.-smoothstep(0., .1, abs(f-.5))) * smoothstep(.8,.95,t));
          band += sin(p.x*2.5+uT*.3)*.014;
          vec3 hall = wall ? dark : band;

          float inner = 1.-step(mix(0., 1., smoothstep(.55,1.,uM)), d);
          if(inner > .5){
            hall = dark;
            float bx = abs(p.x) - .66;
            if(bx > 0.){
              float ex = abs(fract(bx/.22)-.5)*.22, ey = abs(p.y);
              float r = max(ex-.085, ey-.082);
              float r2 = max(ex-.062, ey-.06);
              hall += hot * (1.-smoothstep(.001,.0045,abs(r)));
              hall += hot * .55 * (1.-smoothstep(.001,.0045,abs(r2)));
            }
          }
          col = mix(col, hall, smoothstep(.0,.5,uM));
        }

        col += (h(gl_FragCoord.xy + fract(uT)*91.) - .5) * .045;
        o = vec4(col, 1.);
      }`;

    const sh = (type, src) => {
      const s = c.createShader(type);
      c.shaderSource(s, src); c.compileShader(s);
      if (!c.getShaderParameter(s, c.COMPILE_STATUS)) console.warn(c.getShaderInfoLog(s));
      return s;
    };
    const pr = c.createProgram();
    c.attachShader(pr, sh(c.VERTEX_SHADER, vs));
    c.attachShader(pr, sh(c.FRAGMENT_SHADER, fs));
    c.linkProgram(pr);
    if (!c.getProgramParameter(pr, c.LINK_STATUS)) { root.classList.add("no-gl"); return none; }
    c.useProgram(pr);
    c.bindBuffer(c.ARRAY_BUFFER, c.createBuffer());
    c.bufferData(c.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), c.STATIC_DRAW);
    const loc = c.getAttribLocation(pr, "a");
    c.enableVertexAttribArray(loc);
    c.vertexAttribPointer(loc, 2, c.FLOAT, false, 0, 0);
    const u = Object.fromEntries(["uR", "uV", "uT", "uZ", "uM", "uN", "uF"].map((n) => [n, c.getUniformLocation(pr, n)]));

    function size() {
      const dpr = Math.min(devicePixelRatio || 1, innerWidth < 900 ? 1 : 1.5);
      const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; c.viewport(0, 0, w, h); }
    }
    addEventListener("resize", () => { size(); draw(); });

    const start = performance.now();
    function draw() {
      const t = reduce ? 4 : (performance.now() - start) / 1000;
      const s = state, f = s.final;
      const vx = (.68 + (.5 - .68) * s.vp) * (1 - f) + .5 * f + s.mx * .012;
      const vy = (.6 + (.5 - .6) * s.vp) * (1 - f) + .56 * f + s.my * .012;
      c.uniform2f(u.uR, canvas.width, canvas.height);
      c.uniform2f(u.uV, vx, vy);
      c.uniform1f(u.uT, t);
      c.uniform1f(u.uZ, (reduce ? 0 : t * .04) + s.zoom * 7 + f * 2);
      c.uniform1f(u.uM, s.morph * (1 - f));
      c.uniform1f(u.uN, s.night);
      c.uniform1f(u.uF, f);
      c.drawArrays(c.TRIANGLES, 0, 3);
    }
    size();
    return { state, draw, setNight(n) { state.night = n ? 1 : 0; } };
  })();

  syncMode();
  sysDark.addEventListener("change", syncMode);

  /* ---------- Painted meadow for the early access screen ---------- */

  const painter = (() => {
    const W = 720, H = 1000;
    const canvas = $("#paint"), bg = $("#paintBg");
    canvas.width = W; canvas.height = H;
    bg.width = 360; bg.height = 500;
    const ctx = canvas.getContext("2d"), bctx = bg.getContext("2d");
    const cache = {};

    const tint = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    };
    const rnd = (a, b) => a + Math.random() * (b - a);
    function oval(c, x, y, rx, ry, fill, rot = 0) {
      c.fillStyle = fill;
      c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill();
    }
    function shaded(c, x, y, rx, ry, col, rot = 0) {
      const g = c.createRadialGradient(x - rx * .4, y - ry * .5, 0, x, y, Math.max(rx, ry) * 1.25);
      g.addColorStop(0, tint(col, .34)); g.addColorStop(.5, col); g.addColorStop(1, tint(col, -.5));
      oval(c, x, y, rx, ry, g, rot);
    }
    // Foliage: many overlapping tufts, lit from the upper left
    function tree(c, x, y, rx, ry, col) {
      for (let i = 0; i < 60; i++) {
        const a = rnd(0, 6.28), d = Math.sqrt(Math.random());
        const px = x + Math.cos(a) * rx * d, py = y + Math.sin(a) * ry * d;
        const lit = ((px - x) / rx + (py - y) / ry) * -.34 + rnd(-.1, .1);
        oval(c, px, py, rx * rnd(.16, .3), ry * rnd(.12, .22), tint(col, Math.max(-.62, Math.min(.42, lit - .08))));
      }
    }
    function hill(c, y0, amp, ph, col, depth = 90) {
      const g = c.createLinearGradient(0, y0 - amp, 0, y0 + depth);
      g.addColorStop(0, tint(col, .26)); g.addColorStop(.3, col); g.addColorStop(1, tint(col, -.34));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 640); c.lineTo(0, y0);
      for (let x = 0; x <= 440; x += 10) c.lineTo(x, y0 + Math.sin(x * .012 + ph) * amp + Math.sin(x * .03 + ph * 2) * amp * .3);
      c.lineTo(440, 640); c.fill();
    }
    function flecks(c, n, y0, y1, cols, size) {
      for (let i = 0; i < n; i++) {
        c.fillStyle = cols[(Math.random() * cols.length) | 0];
        c.beginPath(); c.ellipse(rnd(0, 440), rnd(y0, y1), rnd(size * .5, size), rnd(size * .3, size * .7), rnd(0, 3), 0, 7); c.fill();
      }
    }
    function path(c, fill, pts) {
      c.fillStyle = fill;
      c.beginPath(); c.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 6) c.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
      c.fill();
    }
    function scene(c, night) {
      c.save();
      c.scale(W / 440, H / 640);
      const sky = c.createLinearGradient(0, 0, 0, 200);
      sky.addColorStop(0, "#eebda6"); sky.addColorStop(.4, "#f5dfb4"); sky.addColorStop(.75, "#c9dcc8"); sky.addColorStop(1, "#8fc4dc");
      c.fillStyle = sky; c.fillRect(0, 0, 440, 640);
      for (let i = 0; i < 26; i++) oval(c, rnd(0, 440), rnd(0, 120), rnd(14, 46), rnd(5, 13), `rgba(255,${200 + (i % 3) * 24},${190 + (i % 4) * 16},.5)`);

      tree(c, 386, 146, 72, 62, "#6aa89c");
      tree(c, 304, 170, 44, 30, "#7fb8a8");
      tree(c, 20, 170, 34, 46, "#9c4a2a");
      tree(c, 84, 112, 30, 92, "#2b8560");
      tree(c, 196, 106, 58, 72, "#2f8d68");
      tree(c, 262, 136, 22, 66, "#267a58");

      hill(c, 200, 9, 1.2, "#efd25a", 40);
      hill(c, 228, 11, 2.6, "#b6cf5c", 50);
      tree(c, 412, 234, 48, 28, "#2f8158");
      hill(c, 276, 13, .4, "#e6c63f", 70);

      // Long shadow of the great tree, and its canopy
      path(c, "#14604a", [-10, 312, 60, 268, 214, 262, 318, 342, 250, 356, 96, 346, -10, 356]);
      path(c, "#2e8c64", [-10, 306, 60, 268, 170, 268, 250, 304, 170, 296, 70, 300, -10, 322]);
      tree(c, 90, 322, 92, 22, "#17684e");
      tree(c, 214, 330, 66, 14, "#17684e");

      hill(c, 368, 15, 4.1, "#f4c52e", 90);
      flecks(c, 240, 360, 450, ["#ff9d2e", "#ffe27a", "#e4641f"], 3.4);
      tree(c, 336, 414, 80, 48, "#26885a");
      hill(c, 456, 12, 1.9, "#79b24c", 70);
      flecks(c, 300, 446, 530, ["#d7e36a", "#2f7f46", "#f2a13a"], 3);
      hill(c, 524, 12, 3.2, "#3f8c45", 110);
      flecks(c, 460, 520, 640, ["#f5e266", "#ef6a3a", "#f7f1e0", "#17593c", "#e23a4c"], 3.2);

      // Standing figure, far off, with a shadow across the grass
      c.save();
      c.translate(-76, 14);
      oval(c, 262, 442, 52, 5, "rgba(14,70,60,.75)", .12);
      path(c, "#16345a", [212, 438, 208, 400, 206, 372, 212, 350, 224, 346, 234, 372, 234, 400, 236, 420, 236, 438, 224, 440, 216, 440, 212, 438]);
      path(c, "#b5532c", [209, 392, 206, 372, 210, 352, 222, 348, 234, 354, 236, 372, 233, 392, 222, 396, 214, 396, 209, 392]);
      oval(c, 221, 340, 8, 9, "#c9794a");
      oval(c, 221, 332, 17, 4, "#efc05a");
      oval(c, 221, 328, 8, 5, "#d9963a");
      c.restore();

      // Seated figure from behind, cropped by the lower left corner
      path(c, "#1a2f92", [-20, 640, -24, 590, -8, 520, 52, 514, 110, 516, 138, 590, 146, 640]);
      for (let i = 0; i < 9; i++) path(c, i % 2 ? "#3650c4" : "#101f6a", [rnd(-6, 120), 640, rnd(0, 110), 600, rnd(10, 100), 560, rnd(20, 90), 526, rnd(20, 110), 560, rnd(20, 120), 600, rnd(0, 130), 640]);
      oval(c, 52, 505, 22, 16, "#c9794a");
      shaded(c, 44, 482, 84, 20, "#f0bb4a", -.1);
      shaded(c, 42, 468, 36, 22, "#d0862e", -.08);
      oval(c, 42, 484, 36, 4, "#8b2f2a", -.08);

      // Crouching figure beside the basket
      path(c, "#d7cf94", [176, 640, 170, 600, 178, 548, 214, 538, 256, 540, 268, 600, 262, 640]);
      for (let i = 0; i < 6; i++) oval(c, rnd(182, 256), rnd(570, 636), rnd(3, 9), rnd(12, 26), i % 2 ? "#a79f60" : "#f1e9b8");
      path(c, "#b5532c", [190, 552, 188, 524, 204, 506, 226, 506, 250, 510, 256, 530, 252, 556, 226, 562, 204, 560, 190, 552]);
      oval(c, 224, 494, 15, 15, "#c9794a");
      shaded(c, 224, 484, 44, 10, "#e7983a", .08);
      shaded(c, 224, 476, 19, 12, "#ad5a28");

      // Basket
      shaded(c, 322, 588, 58, 44, "#7a3417");
      c.lineWidth = 2.4;
      for (let i = 0; i < 7; i++) {
        c.strokeStyle = i % 2 ? "#3f1809" : "#b4642c";
        c.beginPath(); c.ellipse(322, 560 + i * 11, 54 - Math.abs(i - 2) * 3, 8, 0, 0, 3.14); c.stroke();
      }
      c.lineWidth = 6; c.strokeStyle = "#c98a42";
      c.beginPath(); c.ellipse(322, 552, 50, 11, 0, 0, 7); c.stroke();
      oval(c, 322, 552, 44, 8, "#3c1a0c");
      for (let i = 0; i < 22; i++) oval(c, rnd(290, 354), rnd(544, 556), rnd(3, 6), rnd(2, 4), ["#e23a4c", "#ffb13d", "#5da84f"][i % 3]);
      c.lineWidth = 4; c.strokeStyle = "#8c4a22";
      c.beginPath(); c.arc(322, 548, 44, 3.3, 6.12); c.stroke();
      c.restore();

      if (night) {
        c.globalCompositeOperation = "multiply";
        c.fillStyle = "#3f4fae"; c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "screen";
        const mx = W * .72, my = H * .12;
        const g = c.createRadialGradient(mx, my, 10, mx, my, W * .66);
        g.addColorStop(0, "rgba(186,196,255,.8)"); g.addColorStop(.24, "rgba(120,130,230,.32)"); g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "source-over";
        c.fillStyle = "#fbf3d6";
        c.beginPath(); c.arc(mx, my, W * .062, 0, 7); c.fill();
        c.fillStyle = "#f7efe0";
        for (let i = 0; i < 80; i++) { c.beginPath(); c.arc(Math.random() * W, Math.random() * H * .2, 1.5 + Math.random() * 1.6, 0, 7); c.fill(); }
      }
    }
    function hsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const M = Math.max(r, g, b), m = Math.min(r, g, b), l = (M + m) / 2, d = M - m;
      if (!d) return [0, 0, l];
      const s = d / (1 - Math.abs(2 * l - 1));
      const h = M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [h * 60, s, l];
    }
    function dots(night) {
      if (cache[night]) return cache[night];
      const under = document.createElement("canvas");
      under.width = W; under.height = H;
      const c = under.getContext("2d", { willReadFrequently: true });
      scene(c, night);
      const data = c.getImageData(0, 0, W, H).data;
      const list = [];
      const N = 165000;
      for (let i = 0; i < N; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const sx = Math.max(0, Math.min(W - 1, x + (Math.random() - .5) * 15));
        const sy = Math.max(0, Math.min(H - 1, y + (Math.random() - .5) * 15));
        const p = ((sy | 0) * W + (sx | 0)) * 4;
        let [h, s, l] = hsl(data[p], data[p + 1], data[p + 2]);
        const roll = Math.random();
        const drift = (Math.sin(x * .013 + Math.sin(y * .02) * 2) + Math.sin(y * .017 + x * .006) + Math.sin((x + y) * .031)) / 3;
        h += (Math.random() - .5) * 42;
        l += (Math.random() - .5) * .24 + drift * .07;
        if (roll > .94) h += 180;
        else if (roll > .8) { h += 42; l += .08; }
        else if (roll < .1) { h -= 34; l -= .1; }
        s = Math.min(1, s * 1.2 + .08);
        const r = i < N * .3 ? 3.4 + Math.random() * 1.2 : 2.1 + Math.random() * 1.2;
        list.push([x, y, r, `hsl(${h | 0} ${(s * 100) | 0}% ${(Math.max(.04, Math.min(.96, l)) * 100) | 0}%)`]);
      }
      return (cache[night] = list);
    }
    function paint(list, from, to) {
      for (let i = from; i < to; i++) {
        const d = list[i];
        ctx.fillStyle = d[3];
        ctx.beginPath(); ctx.arc(d[0], d[1], d[2], 0, 6.29); ctx.fill();
      }
      bctx.drawImage(canvas, 0, 0, bg.width, bg.height);
    }
    function bloom(duration) {
      const night = mode() === "night";
      const list = dots(night);
      ctx.fillStyle = night ? "#10162f" : "#efe6cf";
      ctx.fillRect(0, 0, W, H);
      if (!G || reduce || !duration) { paint(list, 0, list.length); return; }
      let done = 0;
      const p = { v: 0 };
      gsap.to(p, {
        v: 1, duration, ease: "power1.inOut",
        onUpdate() { const to = (p.v * list.length) | 0; paint(list, done, to); done = to; },
      });
    }
    return { bloom };
  })();

  /* ---------- Early access ---------- */

  const access = $("#access"), card = $("#accessCard"), form = $("#accessForm");
  const err = $("#accessError"), done = $("#accessDone");
  let lenis = null, lastFocus = null;

  function openAccess() {
    lastFocus = document.activeElement;
    access.hidden = false;
    lenis?.stop();
    document.body.style.overflow = "hidden";
    painter.bloom(1.5);
    if (G && !reduce) {
      gsap.killTweensOf([access, card]);
      gsap.timeline()
        .fromTo(access, { autoAlpha: 0 }, { autoAlpha: 1, duration: .35, ease: "none" })
        .fromTo(card, { y: 50, scale: .95, clipPath: "inset(12% 8% 12% 8% round 26px)" },
          { y: 0, scale: 1, clipPath: "inset(0% 0% 0% 0% round 26px)", duration: .95, ease: "expo.out" }, .05)
        .fromTo(".access-side > *, .access-titles > *, .access-fields > *",
          { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .7, ease: "power3.out", stagger: .045, clearProps: "transform,opacity,visibility" }, .2);
    }
    setTimeout(() => { if (!done.hidden) $("[data-close]").focus(); else $("#acName").focus(); }, 60);
  }
  function closeAccess() {
    const finish = () => {
      access.hidden = true;
      lenis?.start();
      document.body.style.overflow = "";
      lastFocus?.focus?.();
    };
    if (G && !reduce) gsap.to(access, { autoAlpha: 0, duration: .32, ease: "power2.in", onComplete: finish });
    else finish();
  }
  $$("[data-access]").forEach((b) => b.addEventListener("click", openAccess));
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeAccess));
  access.addEventListener("click", (e) => { if (e.target === access || e.target.id === "paintBg") closeAccess(); });
  addEventListener("keydown", (e) => {
    if (access.hidden) return;
    if (e.key === "Escape") closeAccess();
    if (e.key === "Tab") {
      const items = $$("button, input", card).filter((n) => n.offsetParent !== null && !n.disabled);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  async function saveSignup(entry) {
    if (SIGNUP_ENDPOINT) {
      const res = await fetch(SIGNUP_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      if (!res.ok) throw new Error("rejected");
      return;
    }
    if (window.claude?.use) {
      const [db, user] = await Promise.race([
        Promise.all([claude.use("db"), claude.use("user")]),
        wait(4000).then(() => [null, null]),
      ]);
      if (db && user) {
        const id = await user.id();
        if (id) { await db.doc("signups/" + id).set(entry); return; }
      }
    }
    try { localStorage.setItem("klydo-signup", JSON.stringify(entry)); } catch (e) {}
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#acName").value.trim(), email = $("#acEmail").value.trim();
    err.textContent = "";
    if (!name) { err.textContent = "Add your name so we know who to welcome."; $("#acName").focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "That email doesn't look right. Check it and try again."; $("#acEmail").focus(); return; }
    const submit = $("#accessSubmit");
    submit.disabled = true;
    submit.textContent = "Saving your spot";
    try {
      await saveSignup({ name, email, at: new Date().toISOString() });
    } catch (x) {
      err.textContent = "We couldn't save your spot. Try again in a moment.";
      submit.disabled = false;
      submit.textContent = "Join the list";
      return;
    }
    $("#doneTitle").textContent = `See you inside, ${name.split(/\s+/)[0]}.`;
    $("#doneSub").textContent = `We'll write to ${email} when your room is ready.`;
    form.hidden = true;
    form.style.display = "none";
    done.hidden = false;
    if (G && !reduce) gsap.from(done.children, { y: 26, autoAlpha: 0, duration: .8, ease: "expo.out", stagger: .08 });
    $("[data-close]").focus();
  });

  /* ---------- Live bits ---------- */

  const clock = $("#heroClock");
  const born = Date.now();
  setInterval(() => {
    const s = (Date.now() - born) / 1000 | 0;
    clock.textContent = [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  }, 1000);

  const wave = $("#wave");
  for (let i = 0; i < 44; i++) wave.append(document.createElement("i"));

  const NODES = [
    ["root", 260, 196, "Call Mom", 12],
    ["q", 118, 86, "Weekly question", 8],
    ["ph", 402, 76, "Old family photos", 8],
    ["vo", 436, 214, "Voice, Tue 07:42", 8],
    ["pl", 372, 330, "Family plan", 8],
    ["sk", 140, 322, "Skeptic: nothing to say", 8],
    ["sc", 76, 206, "Screen v3", 8],
  ];
  const EDGES = [["root", "q", 1], ["root", "ph"], ["root", "vo"], ["root", "pl"], ["root", "sk"], ["root", "sc"], ["q", "sk", 1], ["ph", "vo"], ["pl", "vo"]];
  const graph = $("#graph");
  const svgEl = (t, a) => { const n = document.createElementNS("http://www.w3.org/2000/svg", t); for (const k in a) n.setAttribute(k, a[k]); return n; };
  const pos = Object.fromEntries(NODES.map((n) => [n[0], n]));
  EDGES.forEach(([a, b, hot]) => graph.append(svgEl("line", { x1: pos[a][1], y1: pos[a][2], x2: pos[b][1], y2: pos[b][2], ...(hot ? { "data-hot": "1" } : {}) })));
  NODES.forEach(([id, x, y, label, r]) => {
    const g = svgEl("g", { "data-node": id });
    g.append(svgEl("circle", { cx: x, cy: y, r, ...(id === "sk" || id === "q" ? { "data-hot": "1" } : {}) }));
    const t = svgEl("text", { x, y: y + r + 16 });
    t.textContent = label;
    g.append(t);
    graph.append(g);
  });

  /* ---------- Nothing below runs without GSAP or with reduced motion ---------- */

  const stopLoader = () => $("#loader").remove();
  if (!G) { stopLoader(); gl.draw(); painter.bloom(0); return; }
  if (reduce) {
    stopLoader(); gl.draw();
    gsap.registerPlugin(ScrollTrigger);
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
  ScrollTrigger.config({ ignoreMobileResize: true });

  if (window.Lenis) {
    lenis = new Lenis({ lerp: .11, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const t = $(a.getAttribute("href"));
    if (!t) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(t, { duration: 1.6 }) : t.scrollIntoView();
  }));

  /* ---------- Load sequence ---------- */

  const lines = ["Waking the council", "Tuning the voice room", "Sharpening the dials", "Rewiring the memory"];
  const boot = { v: 0 };
  const loaderDone = new Promise((res) => {
    gsap.to(boot, {
      v: 100, duration: 1.05, ease: "power2.inOut",
      onUpdate() {
        $("#loaderFill").style.transform = `scaleX(${boot.v / 100})`;
        $("#loaderPct").textContent = (boot.v | 0) + "%";
        $("#loaderLine").textContent = lines[Math.min(3, boot.v / 25 | 0)];
      },
      onComplete: res,
    });
  });

  Promise.all([Promise.race([document.fonts.ready, wait(1500)]), loaderDone]).then(start);

  function start() {
    const intro = gsap.timeline();
    intro.to("#loader", { autoAlpha: 0, duration: .4, onComplete: stopLoader });
    buildHero(intro);
    buildGlobals();
    buildProblem();
    buildDawn();
    buildRooms();
    buildJourney();
    buildExtras();
    buildStat();
    buildFinal();
    ScrollTrigger.refresh();
  }

  /* ---------- Hero ---------- */

  function buildHero(intro) {
    const split = SplitText.create("#heroTitle", { type: "lines,words,chars", mask: "lines", linesClass: "ln" });
    const era = SplitText.create("#era", { type: "chars" });
    const copy = [".hero-foot", ".hero-copy .eyebrow"];

    intro
      .from(split.lines, { yPercent: 112, duration: 1.15, ease: "expo.out", stagger: .09 }, .25)
      .from(copy, { y: 26, autoAlpha: 0, duration: .9, ease: "power3.out", stagger: .08 }, .55)
      .from(".hero-win", { y: -30, rotate: -3, autoAlpha: 0, duration: .9, ease: "back.out(1.6)" }, .7)
      .from(".nav > *", { y: -24, autoAlpha: 0, duration: .7, ease: "power3.out", stagger: .06 }, .45);

    gsap.set("#era", { visibility: "visible" });
    gsap.set(era.chars, { autoAlpha: 0, yPercent: 60 });

    const s = gl.state;
    gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: ".hero", start: "top top", end: "+=260%", pin: true, scrub: .9 },
    })
      .to(s, { zoom: 1, duration: 1 }, 0)
      .to(split.chars, { yPercent: -125, rotate: () => gsap.utils.random(-12, 12), duration: .24, stagger: { amount: .14, from: "random" } }, 0)
      .to(copy, { y: -60, autoAlpha: 0, duration: .14 }, .02)
      .to(".hero-win", { y: -140, rotate: 8, autoAlpha: 0, duration: .2 }, .04)
      .to(s, { vp: 1, duration: .34, ease: "power2.inOut" }, .12)
      .to(s, { morph: 1, duration: .46, ease: "power2.inOut" }, .22)
      .to(era.chars, { autoAlpha: 1, yPercent: 0, duration: .08, stagger: { amount: .14 } }, .6)
      .to({}, { duration: .1 }, .9);

    addEventListener("pointermove", (e) => {
      gsap.to(s, { mx: e.clientX / innerWidth - .5, my: .5 - e.clientY / innerHeight, duration: 1.2, ease: "power3.out", overwrite: "auto" });
    }, { passive: true });

    const heroEnd = () => ScrollTrigger.getAll().find((t) => t.pin === $(".hero"))?.end ?? 0;
    const finalEl = $("#final");
    gsap.ticker.add(() => {
      const y = scrollY;
      const need = y < heroEnd() + innerHeight * 1.1 || y + innerHeight > finalEl.getBoundingClientRect().top + y;
      if (need && !document.hidden) gl.draw();
    });

    gsap.to(".hero-win", { y: "+=10", duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 2 });
  }

  /* ---------- Things that run everywhere ---------- */

  function buildGlobals() {
    gsap.to("#navProgress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: .3 } });
    gsap.to(".brand-mark", { rotate: 720, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 1 } });

    $$("[data-scramble]").forEach((el) => {
      const text = el.textContent;
      ScrollTrigger.create({
        trigger: el, start: "top 92%",
        onEnter: () => gsap.to(el, { duration: 1.1, scrambleText: { text, chars: "01/\\|<>", revealDelay: .15, speed: .6 } }),
      });
    });

    $$("[data-chars]").forEach((el) => {
      SplitText.create(el, {
        type: "lines,words,chars", mask: "lines", linesClass: "ln", autoSplit: true,
        onSplit: (self) => gsap.from(self.chars, {
          yPercent: 115, rotate: 7, duration: .95, ease: "expo.out", stagger: .014,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        }),
      });
    });

    // Heads lean with scroll speed
    const skews = gsap.quickTo("h2, .dawn-text", "skewY", { duration: .5, ease: "power3" });
    const settle = gsap.delayedCall(.14, () => skews(0)).pause();
    ScrollTrigger.create({
      onUpdate(self) {
        skews(gsap.utils.clamp(-2, 2, self.getVelocity() / -900));
        settle.restart(true);
      },
    });

    // Ticker speeds up and reverses with the scroll
    $$(".ticker-row").forEach((row) => {
      const dir = +row.dataset.dir;
      const loop = gsap.fromTo(row, { xPercent: dir > 0 ? 0 : -50 }, { xPercent: dir > 0 ? -50 : 0, duration: 34, ease: "none", repeat: -1 });
      ScrollTrigger.create({
        onUpdate(self) {
          const v = self.getVelocity() / 240;
          gsap.to(loop, { timeScale: gsap.utils.clamp(-7, 7, v === 0 ? 1 : (self.direction) * (1 + Math.abs(v))), duration: .2, overwrite: true });
          gsap.to(loop, { timeScale: self.direction, duration: 1.1, delay: .2, overwrite: "auto" });
        },
      });
    });

    if (matchMedia("(pointer: fine)").matches) {
      $$("[data-magnet]").forEach((b) => {
        const x = gsap.quickTo(b, "x", { duration: .5, ease: "power3" }), y = gsap.quickTo(b, "y", { duration: .5, ease: "power3" });
        b.addEventListener("pointermove", (e) => {
          const r = b.getBoundingClientRect();
          x((e.clientX - r.left - r.width / 2) * .28);
          y((e.clientY - r.top - r.height / 2) * .4);
        });
        b.addEventListener("pointerleave", () => { x(0); y(0); });
      });
    }
  }

  /* ---------- The still illustration and the transcript beside it ---------- */

  function buildProblem() {
    const items = gsap.utils.toArray(".chat li");
    const mm = gsap.matchMedia();
    mm.add("(min-width: 900px)", () => {
      gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: { trigger: ".problem", start: "top top", end: "+=190%", pin: true, scrub: .6 },
      })
        .from(items, { y: 46, autoAlpha: 0, scale: .92, duration: 1, stagger: 1.05 })
        .from(".dialog", { y: 60, rotate: -5, autoAlpha: 0, duration: 1, ease: "back.out(1.7)" })
        .to({}, { duration: .8 });
    });
    mm.add("(max-width: 899px)", () => {
      [...items, ".dialog"].forEach((el) => gsap.from(el, {
        y: 40, autoAlpha: 0, duration: .8, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      }));
    });
  }

  /* ---------- Grey text darkens with the scroll ---------- */

  function buildDawn() {
    const split = SplitText.create("#dawnText", { type: "words,chars" });
    gsap.set(split.chars, { opacity: .16 });
    gsap.to(split.chars, {
      opacity: 1, ease: "none", stagger: .05,
      scrollTrigger: { trigger: ".dawn", start: "top top", end: "+=210%", pin: true, scrub: .5 },
    });
  }

  /* ---------- Rooms ---------- */

  function buildRooms() {
    const track = $("#roomsTrack");
    const mm = gsap.matchMedia();

    mm.add("(min-width: 900px)", () => {
      const dist = () => track.scrollWidth - document.documentElement.clientWidth;
      const slide = gsap.to(track, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: ".rooms", start: "top top", end: () => "+=" + dist() * 1.15, pin: true, scrub: .8, invalidateOnRefresh: true },
      });
      wireRooms((panel, start, end) => ({ containerAnimation: slide, trigger: panel, start, end, scrub: true }));

      $$(".room h3").forEach((h) => gsap.fromTo(h, { xPercent: 16 }, {
        xPercent: 0, ease: "none",
        scrollTrigger: { containerAnimation: slide, trigger: h.closest(".room"), start: "left right", end: "left left", scrub: true },
      }));
    });

    mm.add("(max-width: 899px)", () => {
      wireRooms((panel) => ({ trigger: $(".stage", panel) || panel, start: "top 80%", end: "bottom 62%", scrub: .6 }));
    });
  }

  function wireRooms(st) {
    const council = $('[data-room="council"]'), design = $('[data-room="design"]');
    const voice = $('[data-room="voice"]'), map = $('[data-room="map"]'), notes = $('[data-room="notes"]');
    const span = ["left 62%", "left 2%"];

    gsap.timeline({ defaults: { ease: "power2.out" }, scrollTrigger: st(council, ...span) })
      .from(".seats li", { y: 34, autoAlpha: 0, scale: .9, duration: 1, stagger: .8 })
      .to(".idea-old p", { opacity: .35, textDecoration: "line-through", duration: .6 }, 1.2)
      .from(".idea-new", { y: 30, autoAlpha: 0, duration: 1, ease: "back.out(1.6)" });

    gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: st(design, ...span) })
      .from(".prompt", { scrambleText: { text: "", chars: "lowerCase" }, duration: .6 })
      .to(".dial u", { width: (i, el) => el.dataset.to + "%", duration: 1, ease: "power2.inOut", stagger: .1 })
      .to(".phone-wire i", { scaleX: 0, transformOrigin: "left", duration: .6, stagger: .08 }, .7)
      .to(".phone-wire", { autoAlpha: 0, duration: .4 }, 1.3)
      .fromTo(".phone", { rotate: -5 }, { rotate: 2, duration: 1.7 }, 0);

    const said = SplitText.create("#transcript", { type: "words" });
    const bars = $$("#wave i");
    const beat = gsap.to(bars, {
      scaleY: () => gsap.utils.random(.1, 1), duration: .28, ease: "sine.inOut",
      repeat: -1, repeatRefresh: true, yoyo: true, stagger: { each: .012, from: "center" }, paused: true,
    });
    gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { ...st(voice, ...span), onToggle: (s) => (s.isActive ? beat.play() : beat.pause()) },
    })
      .from(said.words, { opacity: .12, duration: .2, stagger: .1 })
      .from(voice.querySelectorAll(".chips li"), { y: 18, autoAlpha: 0, scale: .8, duration: .4, stagger: .22, ease: "back.out(2)" }, "-=.35");

    const edges = $$("#graph line");
    edges.forEach((l) => {
      const len = Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value);
      l.style.strokeDasharray = len;
      l.style.strokeDashoffset = len;
    });
    gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: st(map, ...span) })
      .from("#graph g", { scale: 0, transformOrigin: "50% 50%", transformBox: "fill-box", autoAlpha: 0, duration: .4, stagger: .12, ease: "back.out(2.4)" })
      .to(edges, { strokeDashoffset: 0, duration: .5, stagger: .05 }, .15)
      .to("#graph line[data-hot]", { stroke: "#f06fc8", strokeOpacity: 1, strokeWidth: 2.4, duration: .15 }, "+=.05")
      .to("#graph circle[data-hot]", { fill: "#f06fc8", duration: .15 }, "<")
      .from(".graph-answer", { y: 20, autoAlpha: 0, duration: .4 });

    const typed = SplitText.create("#noteLine", { type: "words,chars" });
    gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: st(notes, "left 62%", "left 6%") })
      .from(typed.chars, { autoAlpha: 0, duration: .01, stagger: .012 })
      .from(".slash span", { x: -14, autoAlpha: 0, duration: .2, stagger: .08, ease: "power2.out" })
      .from(notes.querySelectorAll(".chips li"), { y: 16, autoAlpha: 0, scale: .8, duration: .25, stagger: .1, ease: "back.out(2)" });
  }
  /* ---------- Journey, extras, stat ---------- */

  function buildJourney() {
    gsap.fromTo(".rail i", { scaleY: 0 }, {
      scaleY: 1, ease: "none",
      scrollTrigger: { trigger: "#stops", start: "top 70%", end: "bottom 62%", scrub: .5 },
    });
    $$(".stop").forEach((s, i) => {
      gsap.from(s, {
        x: () => (innerWidth < 900 ? 24 : 70), autoAlpha: .15, ease: "none",
        scrollTrigger: { trigger: s, start: "top 92%", end: "top 66%", scrub: .5 },
      });
    });
  }

  function buildExtras() {
    const tiles = $$(".tile");
    gsap.from(tiles, {
      x: () => gsap.utils.random(-140, 140) * (innerWidth < 900 ? .2 : 1), y: () => gsap.utils.random(120, 280), rotate: () => gsap.utils.random(-14, 14),
      autoAlpha: 0, ease: "power2.out", stagger: .06,
      scrollTrigger: { trigger: "#tiles", start: "top 96%", end: "top 40%", scrub: .7 },
    });
  }

  function buildStat() {
    const n = { v: 0 }, el = $("#statNum");
    gsap.to(n, {
      v: 412, ease: "none",
      onUpdate: () => (el.textContent = n.v | 0),
      scrollTrigger: { trigger: ".stat", start: "top 82%", end: "top 28%", scrub: .5 },
    });
    $$("#bars u").forEach((u) => gsap.fromTo(u, { width: 0 }, {
      width: u.dataset.w + "%", ease: "power2.out",
      scrollTrigger: { trigger: "#bars", start: "top 92%", end: "top 52%", scrub: .5 },
    }));
  }

  /* ---------- Final ---------- */

  function buildFinal() {
    gsap.to(gl.state, {
      final: 1, ease: "none",
      scrollTrigger: { trigger: "#final", start: "top bottom", end: "bottom bottom", scrub: .6 },
    });
    const word = SplitText.create("#finalWord", { type: "chars" });
    gsap.from(word.chars, {
      yPercent: 70, autoAlpha: 0, rotate: () => gsap.utils.random(-8, 8), ease: "power3.out", stagger: .09,
      scrollTrigger: { trigger: "#final", start: "top 62%", end: "bottom bottom", scrub: .7 },
    });
  }
})();
