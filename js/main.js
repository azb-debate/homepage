(() => {
  'use strict';

  /** ===== utils ===== */
  const qs  = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  /** ===== config loader (inline JSON) ===== */
  function loadConfig() {
    try {
      const el = byId('club-config');
      if (!el) return {};
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      console.warn('config parse failed', e);
      return {};
    }
  }

  /** ===== apply config to DOM ===== */
  function applyConfig(cfg) {
    // data-bind text fills
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      if (key && cfg[key]) el.textContent = cfg[key];
    });

    // Google Maps link from addr
    const addrEl = qs('[data-bind="addr"]');
    const addr = addrEl ? addrEl.textContent.trim() : '';
    const mapsHref = addr ? 'https://www.google.com/maps?q=' + encodeURIComponent(addr) : '';
    const mapLink = byId('map-open');
    if (mapLink && mapsHref) mapLink.href = mapsHref;

    // X link(s)
    const xHandle = (cfg.x || '').replace(/^@/, '');
    const xHref = xHandle ? 'https://x.com/' + xHandle : 'https://x.com/';
    qsa('[data-bind="x-link"]').forEach(a => { a.href = xHref; });
    qsa('.x-text[data-bind="x-link"]').forEach(a => { if (xHandle) a.textContent = '@' + xHandle; });

    // LINE button
    const lineURL = (cfg.line || '').trim();
    qsa('[data-bind="line-link"]').forEach(a => {
      if (lineURL) { a.href = lineURL; a.style.display = ''; }
      else { a.style.display = 'none'; }
    });

    // email (plain text)
    const emailSpan = qs('[data-bind="email"]');
    if (emailSpan) emailSpan.textContent = (cfg.email || '').trim() || '（後日掲載）';
  }

  /** ===== TOC active highlight (strict, single) ===== */
  function setupActiveTOC() {
    const links = qsa('nav.toc a[href^="#"]');
    const sections = links.map(a => qs(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const linkFor = (id) => links.find(a => a.getAttribute('href') === '#' + id);

    let currentId = null;
    const io = new IntersectionObserver((entries) => {
      // pick the entry with greatest intersection ratio, tie-breaker by vertical proximity to viewport center
      const center = window.innerHeight / 2;
      const best = entries
        .filter(e => e.isIntersecting)
        .map(e => {
          const r = e.target.getBoundingClientRect();
          const dist = Math.abs((r.top + r.bottom) / 2 - center);
          return { id: e.target.id, ratio: e.intersectionRatio, dist };
        })
        .sort((a,b) => (b.ratio - a.ratio) || (a.dist - b.dist))[0];

      const nextId = best ? best.id : null;
      if (nextId && nextId !== currentId) {
        // clear all first
        links.forEach(a => a.classList.remove('is-active'));
        const l = linkFor(nextId);
        if (l) l.classList.add('is-active');
        currentId = nextId;
      }
    }, {
      root: null,
      threshold: [0.25, 0.4, 0.55, 0.7, 0.85], // 厳しめに
      rootMargin: '-10% 0px -50% 0px'
    });

    sections.forEach(sec => io.observe(sec));
  }

  /** ===== footer year ===== */
  function setYear() {
    const y = new Date().getFullYear();
    const el = byId('year');
    if (el) el.textContent = y;
  }

  /** ===== boot ===== */
  try {
    const cfg = loadConfig();
    applyConfig(cfg);
    setupActiveTOC();
    setYear();

    // self-checks (開発用／表示に影響なし)
    console.assert(qs('#about') && qs('#qa'), 'Required sections exist');
    console.assert(qsa('nav.toc a.is-active').length <= 1, 'TOC active should be <= 1');
  } catch (e) {
    console.error('init error', e);
  }
})();
