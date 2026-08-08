// Assembly animation — ported unchanged from the Claude Design source
// ("WE EHS Suite Launch.dc.html"); only the editor-runtime wrapper is removed.
// Each [data-scene] pins while its exploded [data-part] pieces converge with
// scroll progress, [data-cal] legend rows fade in sequentially and
// [data-prog] tracks progress. Reduced motion renders the assembled state.
(() => {
  const spread = 1.6;
  const smooth = 0.14;

  const init = () => {
    const scenes = [...document.querySelectorAll('[data-scene]')].map((s) => ({
      el: s,
      parts: [...s.querySelectorAll('[data-part]')].map((p) => ({
        el: p, dx: +p.dataset.dx || 0, dy: +p.dataset.dy || 0,
      })),
      cals: [...s.querySelectorAll('[data-cal]')],
      prog: s.querySelector('[data-prog]'),
      box: s.querySelector('[data-art]'),
      vid: s.querySelector('video[data-scenevid]'),
    }));

    const fit = () => {
      for (const sc of scenes) {
        if (!sc.box || !sc.box.parentElement) continue;
        const cell = sc.box.parentElement.getBoundingClientRect();
        if (!cell.width || !cell.height) continue;
        const k = Math.min(1, (cell.width - 12) / 360, (cell.height - 12) / 620);
        sc.box.style.transform = 'scale(' + Math.max(0.5, k) + ')';
      }
    };

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let raf = 0;

    const measure = () => {
      for (const sc of scenes) {
        const r = sc.el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        sc.t = clamp(total > 0 ? -r.top / total : 0);
      }
    };

    const apply = () => {
      let moving = false;
      for (const sc of scenes) {
        const t = typeof sc.t === 'number' && isFinite(sc.t) ? sc.t : 0;
        const target = ease(clamp((t - 0.06) / 0.72));
        if (sc.e === undefined) sc.e = target;
        const d = target - sc.e;
        if (Math.abs(d) > 0.0004) { sc.e += d * smooth; moving = true; } else sc.e = target;
        const e = sc.e;
        const n = sc.parts.length;
        sc.parts.forEach((p, i) => {
          const s0 = (i / Math.max(1, n)) * 0.45;
          const k = 1 - ease(clamp((e - s0) / (1 - s0)));
          p.el.style.transform = 'translate3d(' + p.dx * spread * k + 'px,' + p.dy * spread * k + 'px,0)';
          p.el.style.opacity = 0.28 + 0.72 * (1 - k);
        });
        const m = sc.cals.length;
        sc.cals.forEach((c, i) => {
          const k = clamp((e - i / (m + 3)) * 4.5);
          c.style.opacity = k;
          c.style.transform = 'translateX(' + (1 - k) * 14 + 'px)';
        });
        if (sc.prog) sc.prog.style.transform = 'scaleX(' + e + ')';
        // Cinematic drift: footage settles from 1.1 to 1.02 as the record assembles.
        if (sc.vid) sc.vid.style.transform = 'scale(' + (1.1 - 0.08 * e) + ')';
      }
      return moving;
    };

    const loop = () => { raf = 0; if (apply()) raf = requestAnimationFrame(loop); };
    const tick = () => {
      measure();
      const moving = apply();
      if (moving && !raf) raf = requestAnimationFrame(loop);
    };

    const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rm && rm.matches) {
      for (const sc of scenes) {
        sc.t = 1; sc.e = 1;
        sc.parts.forEach((p) => { p.el.style.transform = 'none'; p.el.style.opacity = 1; });
        sc.cals.forEach((c) => { c.style.opacity = 1; c.style.transform = 'none'; });
        if (sc.prog) sc.prog.style.transform = 'scaleX(1)';
        // Reduced motion: show the still poster only, never autoplay footage.
        if (sc.vid) { sc.vid.style.opacity = 1; sc.vid.style.transform = 'none'; }
      }
      window.addEventListener('resize', fit);
      fit();
      return;
    }

    // Footage lifecycle: lazy-load a scene's clip as it approaches, fade it in
    // once playing, and pause it off-screen so only the visible scene decodes.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const sc = scenes.find((s) => s.el === entry.target);
            if (!sc || !sc.vid) continue;
            const vid = sc.vid;
            if (entry.isIntersecting) {
              if (!vid.dataset.loaded) {
                vid.dataset.loaded = '1';
                for (const [attr, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
                  if (!vid.dataset[attr]) continue;
                  const source = document.createElement('source');
                  source.src = vid.dataset[attr];
                  source.type = type;
                  vid.appendChild(source);
                }
                vid.load();
              }
              vid.play().then(() => { vid.style.opacity = 1; }).catch(() => {
                vid.style.opacity = 1; // poster remains if autoplay is refused
              });
            } else if (vid.dataset.loaded) {
              vid.pause();
            }
          }
        },
        { rootMargin: '25% 0px' },
      );
      for (const sc of scenes) if (sc.vid) io.observe(sc.el);
    } else {
      for (const sc of scenes) {
        if (!sc.vid) continue;
        const source = document.createElement('source');
        source.src = sc.vid.dataset.mp4;
        source.type = 'video/mp4';
        sc.vid.appendChild(source);
        sc.vid.load();
        sc.vid.play().catch(() => {});
        sc.vid.style.opacity = 1;
      }
    }

    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', () => { fit(); tick(); });
    fit();
    tick();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
