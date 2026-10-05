/* ============================================================
   GFG Finanzas — HOME
   Navegación y formularios del inicio.
   Depende de js/gfg.js (GFG.enviar, GFG.track, GFG.contar).
============================================================ */

/* ===== BARRA SUPERIOR: persiste cierre ===== */
(function () {
  const bar = document.getElementById('urgency-bar');
  if (!bar) return;
  try { if (localStorage.getItem('gfg-bar-closed') === '1') bar.style.display = 'none'; } catch (_) {}
  document.getElementById('bar-close').addEventListener('click', () => {
    bar.style.display = 'none';
    try { localStorage.setItem('gfg-bar-closed', '1'); } catch (_) {}
  });
})();

/* ===== NAVBAR SHADOW ===== */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('shadow', window.scrollY > 20);
}, { passive: true });

/* ===== HAMBURGER + FOCUS TRAP ===== */
const ham    = document.getElementById('ham');
const drawer = document.getElementById('drawer');

function getFocusable() {
  return Array.from(drawer.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
}
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const els = getFocusable();
  const first = els[0], last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function openMenu() {
  drawer.classList.add('open');
  ham.classList.add('active');
  ham.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  drawer.addEventListener('keydown', trapFocus);
  const focusable = getFocusable();
  if (focusable.length) focusable[0].focus();
}
function closeMenu() {
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open');
  ham.classList.remove('active');
  ham.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  drawer.removeEventListener('keydown', trapFocus);
  ham.focus();
}
ham.addEventListener('click', () => drawer.classList.contains('open') ? closeMenu() : openMenu());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

/* ===== FORMULARIO DE CONTACTO ===== */
(function () {
  const form = document.getElementById('lead-form');
  if (!form) return;

  function validateField(id, checkFn) {
    const input = document.getElementById(id);
    const err   = document.getElementById('err-' + id);
    const valid = checkFn(input);
    input.classList.toggle('error', !valid);
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    err.classList.toggle('show', !valid);
    return valid;
  }

  function validateAll() {
    const n  = validateField('nombre',   el => el.value.trim().length >= 2);
    const ed = validateField('edad',     el => { const v = parseInt(el.value, 10); return v >= 18 && v <= 75; });
    const em = validateField('email',    el => !el.value.trim() || GFG.esEmail(el.value));
    const t  = validateField('telefono', el => GFG.esTel(el.value));
    const s  = validateField('servicio', el => el.value !== '');
    const p  = document.getElementById('privacidad').checked;
    document.getElementById('err-privacidad').style.display = p ? 'none' : 'block';
    return n && ed && em && t && s && p;
  }

  ['nombre', 'edad', 'email', 'telefono', 'servicio'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      el.classList.remove('error');
      document.getElementById('err-' + id).classList.remove('show');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateAll()) {
      const primero = form.querySelector('.error');
      if (primero) primero.focus();
      return;
    }
    GFG.enviar({
      form,
      lead: {
        fuente:   'inicio',
        nombre:   document.getElementById('nombre').value.trim(),
        edad:     document.getElementById('edad').value.trim(),
        correo:   document.getElementById('email').value.trim(),
        whatsapp: document.getElementById('telefono').value,
        tipoPlan: document.getElementById('servicio').value
      },
      onOk() {
        form.style.display = 'none';
        document.getElementById('form-success').style.display = 'block';
      }
    });
  });
})();

/* ===== SCROLL REVEAL ===== */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('visible')); return; }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => obs.observe(el));
})();

/* ===== SMOOTH SCROLL ===== */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const target = id.length > 1 && document.querySelector(id);
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

/* ===== 3D CARD TILT ===== */
if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches && window.matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.tcard').forEach(card => {
    card.addEventListener('mousemove', function (e) {
      const r  = card.getBoundingClientRect();
      const x  = e.clientX - r.left;
      const y  = e.clientY - r.top;
      const rx = ((y - r.height / 2) / (r.height / 2)) * -6;
      const ry = ((x - r.width  / 2) / (r.width  / 2)) * 6;
      card.style.transition = 'box-shadow .15s ease, transform .08s ease';
      card.style.transform  = `perspective(960px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px) scale(1.015)`;
      card.style.setProperty('--mx', (x / r.width  * 100) + '%');
      card.style.setProperty('--my', (y / r.height * 100) + '%');
    });
    card.addEventListener('mouseleave', function () {
      card.style.transition = 'transform .55s cubic-bezier(.2,0,0,1), box-shadow .55s cubic-bezier(.2,0,0,1)';
      card.style.transform  = 'perspective(960px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
      setTimeout(() => { card.style.transition = ''; card.style.transform = ''; }, 560);
    });
  });
}

/* ===== NUMBER COUNTER ANIMATION ===== */
(function () {
  if (!('IntersectionObserver' in window)) return;
  const counterObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const raw = el.textContent.trim();
      const num = parseInt(raw.replace(/\D/g, ''), 10);
      counterObs.unobserve(el);
      if (!num) return;
      const prefix = raw.startsWith('+') ? '+' : '';
      const suffix = raw.endsWith('%') ? '%' : '';
      GFG.contar(el, num, n => prefix + Math.round(n) + suffix);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat-num').forEach(el => counterObs.observe(el));
})();

/* ===== NEWSLETTER (footer) ===== */
(function () {
  const nForm = document.getElementById('news-form');
  if (!nForm) return;
  const nEmail = document.getElementById('news-email');
  const nMsg   = document.getElementById('news-msg');

  nForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!GFG.esEmail(nEmail.value)) {
      nEmail.classList.add('error');
      nMsg.textContent = 'Escribe un correo válido, por favor.';
      nMsg.className = 'bad';
      return;
    }
    nEmail.classList.remove('error');
    nMsg.textContent = '';
    GFG.enviar({
      form: nForm,
      lead: { fuente: 'newsletter', correo: nEmail.value.trim(), estatus: 'Suscriptor', notas: 'Alta desde newsletter del footer' },
      onOk() {
        nForm.reset();
        nMsg.textContent = '¡Listo! Quedaste en la lista. 💛';
        nMsg.className = 'ok';
      }
    });
  });
})();
