/* ════════════════════════════════════════════════════
   CMG 80 — A Legacy of Excellence
   Main JavaScript — Mobile-First
   ════════════════════════════════════════════════════ */

'use strict';

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Custom Cursor — pointer devices only ───────── */
(function initCursor() {
  // Skip on touch / coarse-pointer devices
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot  = $('cursor');
  const ring = $('cursorRing');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });

  function animateRing() {
    rx += (mx - rx) * 0.1;
    ry += (my - ry) * 0.1;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  document.addEventListener('mouseover', e => {
    if (e.target.closest('a, button, [role="button"], input')) dot.style.opacity = '0.3';
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('a, button, [role="button"], input')) dot.style.opacity = '1';
  });
})();

/* ── Navigation ─────────────────────────────────── */
(function initNav() {
  const nav    = $('mainNav');
  const burger = $('navHamburger');
  const links  = $('navLinks');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 60);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  if (burger && links) {
    const openMenu = () => {
      links.classList.add('open');
      burger.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    const closeMenu = () => {
      links.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    burger.addEventListener('click', () => {
      links.classList.contains('open') ? closeMenu() : openMenu();
    });

    links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && links.classList.contains('open')) closeMenu();
    });
  }

  // Active link highlight
  const sections = $$('section[id], div[id]');
  const navLinks = $$('.nav-link');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.4 });
  sections.forEach(s => obs.observe(s));
})();

/* ── Scroll Reveal ──────────────────────────────── */
(function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

  $$('.reveal').forEach(el => obs.observe(el));
})();

/* ── Lightbox ───────────────────────────────────── */
(function initLightbox() {
  const box = $('lightbox');
  const img = $('lightboxImg');
  if (!box || !img) return;

  window.openLightbox = function(src) {
    img.src = ''; img.src = src;
    box.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  window.closeLightbox = function() {
    box.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => { img.src = ''; }, 400);
  };

  box.addEventListener('click', e => { if (e.target === box) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  // Swipe-to-close on mobile
  let touchStartY = 0, touchStartX = 0;
  box.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  box.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
    if (Math.abs(dy) > 80 && dx < 60) closeLightbox(); // swipe up/down to close
  }, { passive: true });

  $$('[role="button"]').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });
})();

/* ── RSVP v2 — Two-choice flow + Video recorder ─── */
(function initRsvp() {
  const API = '/api/rsvp';

  const choiceSection = $('rsvpChoice');
  const formYes       = $('rsvpFormYes');
  const formNo        = $('rsvpFormNo');
  const confirmEl     = $('rsvpConfirm');
  if (!choiceSection) return;

  let mediaStream    = null;
  let mediaRecorder  = null;
  let recordedChunks = [];
  let recordedBlob   = null;
  let preUploadedId  = null;   // set as soon as recording finishes — before submit
  let preUploading   = false;  // true while XHR is in flight
  let recTimer       = null;
  let recSeconds     = 0;
  const MAX_SEC      = 15;

  function onCard(e) {
    if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showForm(this.id === 'choiceYes' ? 'yes' : 'no');
    }
  }
  ['choiceYes','choiceNo'].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener('click',   onCard.bind({id}));
    el.addEventListener('keydown', onCard.bind({id}));
  });

  $('backFromYes') && $('backFromYes').addEventListener('click', showChoice);
  $('backFromNo')  && $('backFromNo').addEventListener('click',  function(){ stopCamera(true); showChoice(); });

  function showChoice() {
    choiceSection.style.display = '';
    if (formYes) formYes.style.display = 'none';
    if (formNo)  formNo.style.display  = 'none';
    confirmEl.textContent = '';
  }

  function showForm(type) {
    choiceSection.style.display = 'none';
    confirmEl.textContent = '';
    if (type === 'yes') {
      if (formYes) formYes.style.display = '';
      if (formNo)  formNo.style.display  = 'none';
    } else {
      if (formYes) formYes.style.display = 'none';
      if (formNo)  formNo.style.display  = '';
    }
  }

  var yesBtn = $('rsvpYesSubmit');
  if (yesBtn) yesBtn.addEventListener('click', function() {
    var name  = $('rsvpYesName').value.trim();
    var email = $('rsvpYesEmail').value.trim();
    if (!name) { $('rsvpYesName').focus(); flash('Please grace us with your name.', 'var(--sand-dim)'); return; }
    var fd = new FormData();
    fd.append('name', name);
    fd.append('attending', 'true');
    if (email) fd.append('email', email);
    doSubmit(fd, true, name);
  });

  var noBtn = $('rsvpNoSubmit');
  if (noBtn) noBtn.addEventListener('click', function() {
    var name = $('rsvpNoName').value.trim();
    if (!name) { $('rsvpNoName').focus(); flash('Please grace us with your name.', 'var(--sand-dim)'); return; }

    // If recording is still in progress, stop it first then wait for
    // finaliseRecording() to fire (via mediaRecorder.onstop) before submitting
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      var btn = $('rsvpNoSubmit');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Saving video…';

      // Override onstop to submit immediately after the blob is ready
      mediaRecorder.onstop = function() {
        finaliseRecording();          // sets recordedBlob
        buildAndSubmit(name);
      };
      clearInterval(recTimer);
      mediaRecorder.stop();
      return; // wait for onstop
    }

    buildAndSubmit(name);
  });

  function buildAndSubmit(name) {
    // If the pre-upload is still in flight, poll briefly (max 8 s) then submit
    if (preUploading) {
      var btn = $('rsvpNoSubmit');
      if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Uploading video\u2026'; }
      var waited = 0;
      var poll = setInterval(function() {
        waited += 200;
        if (!preUploading || waited >= 8000) {
          clearInterval(poll);
          _buildAndSubmitNow(name);
        }
      }, 200);
      return;
    }
    _buildAndSubmitNow(name);
  }

  function _buildAndSubmitNow(name) {
    var fd = new FormData();
    fd.append('name', name);
    fd.append('attending', 'false');
    if (preUploadedId) {
      // Video already on server — just pass the ID (no re-upload, fast!)
      fd.append('videoId', preUploadedId);
    } else if (recordedBlob) {
      // Fallback: pre-upload failed or was skipped, send inline
      var ext = recordedBlob.type.includes('mp4') ? '.mp4'
              : recordedBlob.type.includes('ogg') ? '.ogg'
              : '.webm';
      fd.append('video', recordedBlob, 'message' + ext);
    }
    doSubmit(fd, false, name);
  }

  function doSubmit(fd, attending, name) {
    var btn = $(attending ? 'rsvpYesSubmit' : 'rsvpNoSubmit');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Sending\u2026';

    fetch(API, { method: 'POST', body: fd })
      .then(function(r){ return r.json(); })
      .then(function(data) {
        if (data.success) {
          if (formYes) formYes.style.display = 'none';
          if (formNo)  formNo.style.display  = 'none';
          choiceSection.style.display = 'none';
          stopCamera(true);
          if (attending) {
            flash('\u2746  We are overjoyed, ' + name + '. Your presence shall illuminate this celebration.  \u2746', 'var(--gold)');
          } else {
            flash('Your love and thoughtfulness are cherished beyond words, ' + name + '. Though absent in body, you are ever present in our hearts.  \u2746', 'var(--sand)');
          }
        } else {
          btn.disabled = false;
          btn.querySelector('span').textContent = attending ? 'Confirm My Attendance' : 'Send My Heartfelt Regrets';
          flash('Something went amiss. Please try once more.', 'var(--sand-dim)');
        }
      })
      .catch(function(err) {
        console.error('[RSVP]', err);
        btn.disabled = false;
        btn.querySelector('span').textContent = attending ? 'Confirm My Attendance' : 'Send My Heartfelt Regrets';
        flash('Unable to submit. Please check your connection.', 'var(--sand-dim)');
      });
  }

  /* ── Video recording ─── */
  var startBtn = $('videoBtnStart');
  var stopBtn  = $('videoBtnStop');
  var redoBtn  = $('videoBtnRedo');
  if (startBtn) startBtn.addEventListener('click', startRecording);
  if (stopBtn)  stopBtn.addEventListener('click',  stopRecording);
  if (redoBtn)  redoBtn.addEventListener('click',  redoRecording);

  function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var ph = $('videoPlaceholder');
      if (ph) ph.querySelector('span').textContent = 'Camera not supported on this device';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(function(stream) {
        mediaStream = stream;
        var liveEl = $('videoLive');
        liveEl.srcObject = stream;
        liveEl.style.display = '';
        var pb = $('videoPlayback'); if (pb) pb.style.display = 'none';
        var ph = $('videoPlaceholder'); if (ph) ph.style.display = 'none';

        recordedChunks = []; recordedBlob = null;

        var mimes = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
        var mime = '';
        for (var i = 0; i < mimes.length; i++) {
          if (MediaRecorder.isTypeSupported(mimes[i])) { mime = mimes[i]; break; }
        }
        var opts = mime ? { mimeType: mime } : {};
        mediaRecorder = new MediaRecorder(stream, opts);
        mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = finaliseRecording;
        mediaRecorder.start(100);

        recSeconds = 0;
        updateTimer();
        recTimer = setInterval(function() {
          recSeconds++;
          updateTimer();
          if (recSeconds >= MAX_SEC) stopRecording();
        }, 1000);

        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn)  stopBtn.style.display  = '';
        var t = $('videoTimer'); if (t) t.style.display = '';
      })
      .catch(function(err) {
        console.warn('[Camera]', err);
        var ph = $('videoPlaceholder');
        if (ph) ph.querySelector('span').textContent = 'Camera access denied \u2014 you may skip this step';
      });
  }

  function updateTimer() {
    var el = $('videoTimer'); if (!el) return;
    var remaining = MAX_SEC - recSeconds;
    el.textContent = '0:' + (remaining < 10 ? '0' : '') + remaining;
    if (remaining <= 5) el.classList.add('urgent'); else el.classList.remove('urgent');
  }

  function stopRecording() {
    clearInterval(recTimer);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }

  function finaliseRecording() {
    // Strip codec params — "video/mp4; codecs=..." breaks FormData Content-Type
    var rawMime = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'video/webm';
    var mtype   = rawMime.split(';')[0].trim() || 'video/webm';
    recordedBlob = new Blob(recordedChunks, { type: mtype });

    var url = URL.createObjectURL(recordedBlob);
    var pb  = $('videoPlayback');
    if (pb) {
      // Set type so Firefox can decode the blob without metadata errors
      pb.innerHTML = '';
      var src = document.createElement('source');
      src.src  = url;
      src.type = recordedBlob.type || 'video/webm';
      pb.appendChild(src);
      pb.load();
      pb.style.display = '';
    }
    var lv  = $('videoLive'); if (lv) lv.style.display = 'none';
    var t   = $('videoTimer'); if (t) t.style.display = 'none';
    if (stopBtn)  stopBtn.style.display  = 'none';
    if (redoBtn)  redoBtn.style.display  = '';
    var badge = $('videoRecordedBadge'); if (badge) badge.style.display = '';

    stopCamera(false);

    // ── Begin background pre-upload immediately ──────────────
    // The user is still filling in their name; the video travels
    // in parallel so submit is near-instant.
    preUploadedId = null;
    preUploading  = true;
    var fd = new FormData();
    var ext = recordedBlob.type.includes('mp4') ? '.mp4'
            : recordedBlob.type.includes('ogg') ? '.ogg'
            : '.webm';
    fd.append('video', recordedBlob, 'message' + ext);
    fetch('/api/video-preupload', { method: 'POST', body: fd })
      .then(function(r){ return r.json(); })
      .then(function(data){
        preUploading = false;
        if (data && data.videoId) {
          preUploadedId = data.videoId;
          console.log('[PRE-UPLOAD] done:', preUploadedId);
        }
      })
      .catch(function(err){
        preUploading = false;
        console.warn('[PRE-UPLOAD] failed, will fall back to inline upload:', err);
      });
  }

  function redoRecording() {
    recordedBlob = null; recordedChunks = [];
    preUploadedId = null; preUploading = false;
    if (redoBtn)  redoBtn.style.display  = 'none';
    if (startBtn) startBtn.style.display = '';
    var pb = $('videoPlayback'); if (pb) { pb.src = ''; pb.style.display = 'none'; }
    var badge = $('videoRecordedBadge'); if (badge) badge.style.display = 'none';
    var lv = $('videoLive'); if (lv) { lv.srcObject = null; lv.style.display = 'none'; }
    var ph = $('videoPlaceholder'); if (ph) ph.style.display = '';
    var t  = $('videoTimer'); if (t) { t.style.display = 'none'; t.classList.remove('urgent'); }
  }

  function stopCamera(reset) {
    clearInterval(recTimer);
    if (mediaStream) { mediaStream.getTracks().forEach(function(t){ t.stop(); }); mediaStream = null; }
    if (!reset) return;
    recordedBlob = null; recordedChunks = [];
    preUploadedId = null; preUploading = false;
    var lv = $('videoLive');
    if (lv) { lv.srcObject = null; lv.style.display = 'none'; }
    var pb = $('videoPlayback');
    if (pb) { pb.src = ''; pb.style.display = 'none'; }
    var t  = $('videoTimer');
    if (t)  { t.style.display = 'none'; t.classList.remove('urgent'); }
    if (startBtn) startBtn.style.display = '';
    if (stopBtn)  stopBtn.style.display  = 'none';
    if (redoBtn)  redoBtn.style.display  = 'none';
    var badge = $('videoRecordedBadge'); if (badge) badge.style.display = 'none';
    var ph = $('videoPlaceholder'); if (ph) ph.style.display = '';
  }

  /* ── Toast notifications (replaces browser alerts) ── */
  (function initToast() {
    if ($('cmgToastContainer')) return;
    const container = document.createElement('div');
    container.id = 'cmgToastContainer';
    Object.assign(container.style, {
      position:   'fixed',
      bottom:     '32px',
      left:       '50%',
      transform:  'translateX(-50%)',
      zIndex:     '99999',
      display:    'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap:        '12px',
      pointerEvents: 'none',
      width:      'min(90vw, 480px)',
    });
    document.body.appendChild(container);
  })();

  window.cmgToast = function(msg, type) {
    // type: 'success' | 'error' | 'info'
    const container = $('cmgToastContainer');
    if (!container) return;

    const palettes = {
      success: { bg: 'linear-gradient(135deg,#1e2e12 0%,#2a3d18 100%)', border: '#c9a84c', icon: '✦', color: '#e6cc7e' },
      error:   { bg: 'linear-gradient(135deg,#1a0c0c 0%,#2d1212 100%)', border: '#b05050', icon: '✕', color: '#f5c4c4' },
      info:    { bg: 'linear-gradient(135deg,#0f1209 0%,#1e2e12 100%)', border: '#5a6a40', icon: '◈', color: '#d4c4a0' },
    };
    const p = palettes[type] || palettes.info;

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background:    p.bg,
      border:        `1px solid ${p.border}`,
      borderRadius:  '4px',
      padding:       '14px 22px',
      color:         p.color,
      fontFamily:    'var(--font-body, "Cormorant Garamond", serif)',
      fontSize:      '1rem',
      letterSpacing: '0.04em',
      lineHeight:    '1.55',
      textAlign:     'center',
      boxShadow:     '0 8px 40px rgba(0,0,0,0.6)',
      pointerEvents: 'auto',
      opacity:       '0',
      transform:     'translateY(16px)',
      transition:    'opacity .45s ease, transform .45s ease',
      display:       'flex',
      alignItems:    'center',
      gap:           '10px',
      width:         '100%',
    });

    const icon = document.createElement('span');
    icon.textContent = p.icon;
    Object.assign(icon.style, {
      color:      p.border,
      fontSize:   '1.1em',
      flexShrink: '0',
    });

    const text = document.createElement('span');
    text.textContent = msg;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateY(0)';
      });
    });

    // Auto-dismiss
    const duration = type === 'success' ? 6000 : 4500;
    setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(-12px)';
      setTimeout(() => toast.remove(), 500);
    }, duration);

    // Click to dismiss early
    toast.addEventListener('click', () => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(-12px)';
      setTimeout(() => toast.remove(), 400);
    });
  };

  function flash(msg, colorVar) {
    // Map old color-var calls to toast types
    let type = 'info';
    if (colorVar === 'var(--gold)') type = 'success';
    else if (colorVar === 'var(--sand-dim)') type = 'error';

    // Keep the inline confirmEl for screen readers
    confirmEl.textContent = msg;

    window.cmgToast(msg, type);
  }
})();


/* ── Gold Particle System ───────────────────────── */
(function initParticles() {
  const canvas = $('particles');
  if (!canvas) return;

  // Reduce particles on mobile/low-power devices
  const isLowPower = window.matchMedia('(max-width: 540px)').matches ||
                     navigator.hardwareConcurrency <= 2;
  const COUNT = isLowPower ? 40 : 100;

  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  class Particle {
    constructor(randomY = false) { this.reset(randomY); }
    reset(randomY = false) {
      this.x = Math.random() * W; this.y = randomY ? Math.random() * H : H + 6;
      this.r = Math.random() * 1.4 + 0.2; this.vy = -(Math.random() * 0.35 + 0.08);
      this.vx = (Math.random() - 0.5) * 0.15; this.alpha = Math.random() * 0.55 + 0.1;
      this.life = 0; this.maxLife = Math.random() * 240 + 80;
      this.hue = 38 + (Math.random() - 0.5) * 14;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life++; if (this.life > this.maxLife || this.y < -4) this.reset(); }
    draw() {
      const progress = this.life / this.maxLife;
      const fade = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
      ctx.save(); ctx.globalAlpha = this.alpha * fade;
      ctx.fillStyle = `hsl(${this.hue}, 62%, 56%)`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  const particles = Array.from({ length: COUNT }, () => new Particle(true));
  let raf;
  function loop() { ctx.clearRect(0, 0, W, H); particles.forEach(p => { p.update(); p.draw(); }); raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else loop(); });
  loop();
})();

/* ── Smooth anchor scroll ───────────────────────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const navH = $('mainNav')?.offsetHeight || 64;
      const top  = target.getBoundingClientRect().top + window.scrollY - navH;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();