// Globe Tape — interacción de la web. Sin dependencias.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Reproductor: miniatura hasta el clic, luego youtube-nocookie (rápido y sin cookies de terceros) ──
  $$(".player").forEach((p) => {
    const play = () => {
      if (p.querySelector("iframe")) return;
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${p.dataset.yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
      f.title = p.dataset.title || "YouTube video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      f.allowFullscreen = true;
      p.append(f);
    };
    p.addEventListener("click", play);
    p.addEventListener("pointerenter", () => {
      if (p.dataset.warm) return;
      p.dataset.warm = 1;
      for (const h of ["https://www.youtube-nocookie.com", "https://i.ytimg.com"]) {
        const l = document.createElement("link"); l.rel = "preconnect"; l.href = h; document.head.append(l);
      }
    }, { once: true });
  });

  // ── Transcripción larga: plegada (el texto completo ya está en el HTML para buscadores) ──
  $$(".more-tr").forEach((b) => b.addEventListener("click", () => {
    const box = document.getElementById(b.getAttribute("aria-controls"));
    const label = (b.dataset.label ??= b.textContent);
    const open = box.classList.toggle("clamp") === false;
    b.setAttribute("aria-expanded", open);
    b.textContent = open ? "Collapse transcript" : label;
  }));

  // ── Código de tiempo VHS ──
  const tc = $("[data-timecode]");
  if (tc) {
    const t0 = performance.now();
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      const p = (n) => String(Math.floor(n)).padStart(2, "0");
      tc.textContent = `${p(s / 3600)}:${p((s / 60) % 60)}:${p(s % 60)}:${p((s * 30) % 30)}`;
      requestAnimationFrame(tick);
    };
    reduced ? (tc.textContent = "00:00:00:00") : tick();
  }

  // ── Cuenta atrás al próximo vídeo ──
  const cd = $("[data-countdown]");
  if (cd) {
    const target = new Date(cd.dataset.countdown).getTime();
    const step = () => {
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      if (!s) { cd.textContent = "IT'S LIVE ▶"; return; }
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60); s %= 60;
      const p = (n) => String(n).padStart(2, "0");
      cd.textContent = `${d ? d + "d " : ""}${p(h)}h ${p(m)}m ${p(s)}s`;
      setTimeout(step, 1000);
    };
    step();
  }

  // ── Cifras que cuentan hacia arriba ──
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target;
    if (el.dataset.count != null && !reduced) {
      const n = +el.dataset.count, t0 = performance.now();
      const run = (t) => { const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(run); };
      requestAnimationFrame(run);
    }
    el.classList.add("in");
  }), { threshold: 0.15 }) : null;
  if (io) {
    $$("[data-count]").forEach((el) => io.observe(el));
    $$(".block").forEach((el) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("reveal"); io.observe(el); } });
  }

  // ── Filtros del archivo ──
  const grid = $("[data-grid]");
  if (grid) {
    const items = $$(".grid-item", grid), chips = $$("[data-filter]"), q = $("[data-search]"), empty = $("[data-empty]");
    let f = "all";
    const apply = () => {
      const text = (q.value || "").trim().toLowerCase();
      let shown = 0;
      items.forEach((it) => {
        const ok = (f === "all" || it.dataset.series === f || it.dataset.format === f) && (!text || it.dataset.text.includes(text));
        it.hidden = !ok; shown += ok;
      });
      empty.hidden = shown > 0;
    };
    chips.forEach((c) => c.addEventListener("click", () => { f = c.dataset.filter; chips.forEach((x) => x.setAttribute("aria-pressed", x === c)); apply(); }));
    q.addEventListener("input", apply);
    const hash = location.hash.slice(1);
    if (hash) { const c = chips.find((x) => x.dataset.filter === hash); c && c.click(); }
  }

  // ── Globo ──
  const cv = $("#globe");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const tip = $(".globe-tip");
  const pins = JSON.parse($("#pins").textContent);
  const RAD = Math.PI / 180;
  let land = null, W = 0, R = 0, dpr = 1;
  let rot = [-(pins[0]?.lon ?? 10) + 40, -(pins[0]?.lat ?? 20) * 0.6], vel = reduced ? 0 : 0.06, drag = null, hover = null, t = 0;

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; cv.width = cv.height = W * dpr; R = W * 0.42;
  };
  addEventListener("resize", resize); resize();

  // proyección ortográfica: [lon,lat] → [x,y,visible]
  const proj = (lon, lat) => {
    const l = (lon + rot[0]) * RAD, p = lat * RAD, p0 = -rot[1] * RAD;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
    const x = Math.cos(p) * Math.sin(l);
    const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
    return [W / 2 + R * x, W / 2 - R * y, cosc];
  };
  const path = (pts, close) => {
    // los puntos de la cara oculta se pegan al horizonte: el relleno no se desborda
    let started = false;
    for (const [lon, lat] of pts) {
      let [x, y, c] = proj(lon, lat);
      if (c < 0) { const dx = x - W / 2, dy = y - W / 2, k = R / Math.hypot(dx, dy || 1e-6); x = W / 2 + dx * k; y = W / 2 + dy * k; }
      started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true));
    }
    if (close) ctx.closePath();
  };
  const visible = (pts) => pts.some(([lon, lat]) => proj(lon, lat)[2] > 0);

  const draw = () => {
    t += 1;
    if (!drag) rot[0] += vel;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    const c = W / 2;
    // océano
    const g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
    g.addColorStop(0, "#1d4f9e"); g.addColorStop(0.65, "#0f2b5c"); g.addColorStop(1, "#08162f");
    ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fillStyle = g; ctx.fill();
    // retícula
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 20) { const pts = []; for (let lat = -90; lat <= 90; lat += 5) pts.push([lon, lat]); ctx.beginPath(); let on = false; for (const [a, b] of pts) { const [x, y, v] = proj(a, b); if (v > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; } ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 20) { ctx.beginPath(); let on = false; for (let lon = -180; lon <= 180; lon += 4) { const [x, y, v] = proj(lon, lat); if (v > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; } ctx.stroke(); }
    if (land) {
      ctx.beginPath();
      for (const r of land.land) if (visible(r)) path(r, true);
      ctx.fillStyle = "#e9c64a"; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(18,18,18,.55)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      for (const l of land.borders) { let on = false; for (const [a, b] of l) { const [x, y, v] = proj(a, b); if (v > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; } }
      ctx.strokeStyle = "rgba(18,18,18,.35)"; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // sombra + brillo de borde
    const s = ctx.createRadialGradient(c + R * 0.3, c + R * 0.35, R * 0.2, c, c, R * 1.02);
    s.addColorStop(0, "rgba(0,0,0,0)"); s.addColorStop(1, "rgba(0,0,10,.55)");
    ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fillStyle = s; ctx.fill();
    ctx.beginPath(); ctx.arc(c, c, R + 1, 0, 7); ctx.strokeStyle = "rgba(255,210,63,.5)"; ctx.lineWidth = 2; ctx.stroke();
    // pines
    for (const p of pins) {
      const [x, y, v] = proj(p.lon, p.lat);
      p.sx = x; p.sy = y; p.v = v;
      if (v <= 0.05) continue;
      const k = 0.5 + 0.5 * v, pulse = (((t / 60 + p.lat / 7) % 1) + 1) % 1; // latitudes negativas: el módulo de JS conserva el signo
      ctx.beginPath(); ctx.arc(x, y, (6 + pulse * 16) * k, 0, 7); ctx.strokeStyle = `rgba(255,59,48,${(1 - pulse) * 0.8})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, (hover === p ? 9 : 6) * k, 0, 7); ctx.fillStyle = "#ff3b30"; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#121212"; ctx.stroke();
    }
    if (hover && hover.v > 0.05) { tip.style.left = hover.sx / W * 100 + "%"; tip.style.top = hover.sy / W * 100 + "%"; }
    requestAnimationFrame(draw);
  };

  fetch("/assets/land.json").then((r) => r.json()).then((d) => (land = d));
  requestAnimationFrame(draw);

  const local = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * (W / b.width), (e.clientY - b.top) * (W / b.width)]; };
  const pick = ([x, y]) => pins.filter((p) => p.v > 0.05).find((p) => Math.hypot(p.sx - x, p.sy - y) < 16);
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, r: [...rot], moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      rot = [drag.r[0] + dx * 0.35, Math.max(-70, Math.min(70, drag.r[1] - dy * 0.35))];
    }
    const p = pick(local(e));
    if (p !== hover) {
      hover = p || null;
      cv.style.cursor = p ? "pointer" : "";
      if (p) { tip.innerHTML = `<img src="${p.img}" alt=""><p></p>`; tip.querySelector("p").textContent = p.t; tip.hidden = false; vel = 0; }
      else { tip.hidden = true; vel = reduced ? 0 : 0.06; }
    }
  });
  cv.addEventListener("pointerup", (e) => {
    const was = drag; drag = null;
    if (was && !was.moved) { const p = pick(local(e)); if (p) location.href = `/videos/${p.id}/`; }
  });
  cv.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; vel = reduced ? 0 : 0.06; });
})();
