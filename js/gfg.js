/* ============================================================
   GFG Finanzas — LÓGICA COMPARTIDA
   Medición, atribución, captura de prospectos y comportamiento
   común a las 6 páginas. Depende de js/gfg-config.js.
============================================================ */
(function () {
  'use strict';

  var C = window.GFG_CONFIG || {};
  var GFG = (window.GFG = { config: C });

  /* ---------------------------------------------------------- utilidades */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };
  var soloDigitos = function (v) { return String(v || '').replace(/\D/g, ''); };

  GFG.esEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); };
  GFG.esTel = function (v) { return /^\d{10}$/.test(soloDigitos(v)); };
  GFG.waLink = function (texto) {
    var base = 'https://wa.me/' + (C.whatsapp || '');
    return texto ? base + '?text=' + encodeURIComponent(texto) : base;
  };
  GFG.pagina = function () {
    var p = location.pathname.split('/').pop().replace('.html', '');
    return p || 'inicio';
  };

  /* ---------------------------------------------------------- medición */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  if (C.ga4Id) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(C.ga4Id);
    document.head.appendChild(g);
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', C.ga4Id);
  }

  if (/^\d+$/.test(C.metaPixelId || '')) {
    /* Snippet estándar de Meta, cargado solo si hay un ID real. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', C.metaPixelId);
    window.fbq('track', 'PageView');
  }

  /* Eventos propios → equivalente estándar de Meta. */
  var META = {
    lead_success: 'Lead',
    newsletter_success: 'Subscribe',
    calculator_complete: 'ViewContent',
    whatsapp_click: 'Contact',
    appointment_click: 'Schedule'
  };

  /** Registra un evento en GA4, Meta y dataLayer. Nunca rompe la página. */
  GFG.track = function (evento, params) {
    params = params || {};
    params.page = GFG.pagina();
    try {
      window.dataLayer.push({ event: evento, gfg: params });
      if (typeof window.gtag === 'function') window.gtag('event', evento, params);
      if (typeof window.fbq === 'function') {
        if (META[evento]) window.fbq('track', META[evento], params);
        else window.fbq('trackCustom', evento, params);
      }
    } catch (_) {}
  };

  /* ---------------------------------------------------------- atribución */
  /* Guarda la primera campaña que trajo a la persona, para que el prospecto
     llegue al CRM diciendo de qué anuncio vino. */
  (function capturarUTM() {
    var q = new URLSearchParams(location.search);
    var claves = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    var datos = {};
    claves.forEach(function (k) { if (q.get(k)) datos[k] = q.get(k).slice(0, 120); });
    if (!Object.keys(datos).length && store.get('gfg-attr')) return;
    if (!Object.keys(datos).length && document.referrer && document.referrer.indexOf(location.host) === -1) {
      datos.referrer = document.referrer.slice(0, 120);
    }
    datos.landing = GFG.pagina();
    store.set('gfg-attr', JSON.stringify(datos));
  })();

  GFG.atribucion = function () {
    try {
      var d = JSON.parse(store.get('gfg-attr') || '{}');
      return Object.keys(d).map(function (k) { return k + '=' + d[k]; }).join(' · ');
    } catch (_) { return ''; }
  };

  /* ---------------------------------------------------------- prospectos */
  function post(url, headers, cuerpo) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var corte = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(cuerpo),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { clearTimeout(corte); return r.ok; })
      .catch(function () { clearTimeout(corte); return false; });
  }

  /**
   * Manda un prospecto a la cartera en Punto25. Resuelve { ok: true } SOLO si
   * el servidor confirmó el registro; cualquier fallo de red, de clave o de
   * validación resuelve { ok: false }.
   */
  GFG.saveLead = function (lead) {
    var destino = C.punto25 || {};
    if (!destino.url || !destino.clave) return Promise.resolve({ ok: false });
    return post(destino.url, { 'Content-Type': 'application/json' }, {
      clave: destino.clave,
      fuente: lead.fuente || GFG.pagina(),
      nombre: lead.nombre || '',
      telefono: soloDigitos(lead.whatsapp),
      correo: lead.correo || '',
      edad: lead.edad ? String(lead.edad) : '',
      interes: lead.tipoPlan || '',
      notas: [lead.notas, GFG.atribucion()].filter(Boolean).join(' | ')
    }).then(function (ok) { return { ok: ok }; });
  };

  /** Mensaje de WhatsApp con los datos ya escritos, para no perder al prospecto. */
  function mensajeRespaldo(lead) {
    var l = ['Hola Guadalupe, quiero solicitar mi asesoría.'];
    if (lead.nombre) l.push('Nombre: ' + lead.nombre);
    if (lead.edad) l.push('Edad: ' + lead.edad);
    if (lead.correo) l.push('Correo: ' + lead.correo);
    if (lead.tipoPlan) l.push('Interés: ' + lead.tipoPlan);
    if (lead.notas) l.push(lead.notas);
    return l.join('\n');
  }

  function cajaError(form) {
    var caja = form.querySelector('.gfg-form-error');
    if (caja) return caja;
    caja = document.createElement('div');
    caja.className = 'gfg-form-error';
    caja.setAttribute('role', 'alert');
    caja.hidden = true;
    var boton = form.querySelector('[type="submit"]');
    boton.parentNode.insertBefore(caja, boton.nextSibling);
    return caja;
  }

  /**
   * Flujo completo de envío: bloquea el botón, guarda, y muestra éxito solo
   * si el registro se confirmó. Si falla, conserva los campos y ofrece
   * WhatsApp con la solicitud ya redactada.
   */
  GFG.enviar = function (opts) {
    var form = opts.form, lead = opts.lead;
    var boton = form.querySelector('[type="submit"]');
    var caja = cajaError(form);
    var trampa = form.querySelector('.gfg-hp');
    if (boton.disabled) return;

    /* Honeypot: los bots lo llenan, las personas no lo ven. */
    if (trampa && trampa.value) { if (opts.onOk) opts.onOk(); return; }

    caja.hidden = true;
    boton.disabled = true;
    boton.classList.add('is-loading');

    GFG.saveLead(lead).then(function (r) {
      boton.disabled = false;
      boton.classList.remove('is-loading');

      if (r.ok) {
        GFG.track(lead.fuente === 'newsletter' ? 'newsletter_success' : 'lead_success', {
          fuente: lead.fuente, interes: lead.tipoPlan || ''
        });
        if (opts.onOk) opts.onOk();
        return;
      }

      GFG.track('lead_error', { fuente: lead.fuente });
      caja.innerHTML =
        '<strong>No pudimos registrar tu solicitud.</strong> ' +
        'Tus datos siguen aquí. Envíala por WhatsApp con un toque: ya va escrita.' +
        '<a class="gfg-wa-fallback" target="_blank" rel="noopener noreferrer" href="' +
        GFG.waLink(mensajeRespaldo(lead)) + '"><i class="fab fa-whatsapp" aria-hidden="true"></i> Enviar por WhatsApp</a>';
      caja.hidden = false;
      if (opts.onError) opts.onError();
    });
  };

  /* -------------------------------------------- formulario estándar (lf-) */
  /* Páginas de producto: mismo formulario, misma lógica. Antes cada página
     traía su copia, y cuatro de ellas tenían la validación rota. */
  function formularioEstandar() {
    var form = document.getElementById('mainLeadForm');
    var exito = document.getElementById('mainLeadSuccess');
    if (!form || !exito) return;

    var campos = {
      nombre: { el: document.getElementById('lf-nombre'), ok: function (v) { return v.trim().length >= 2; } },
      edad: { el: document.getElementById('lf-edad'), ok: function (v) { var n = parseInt(v, 10); return n >= 18 && n <= 75; } },
      correo: { el: document.getElementById('lf-correo'), ok: function (v) { return !v.trim() || GFG.esEmail(v); } },
      wa: { el: document.getElementById('lf-wa'), ok: GFG.esTel }
    };
    var priv = document.getElementById('lf-priv');

    function marcar(c, ok) {
      if (!c.el) return true;
      var err = document.getElementById('err-' + c.el.id);
      c.el.classList.toggle('lferr', !ok);
      c.el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (err) err.classList.toggle('show', !ok);
      return ok;
    }

    Object.keys(campos).forEach(function (k) {
      var c = campos[k];
      if (c.el) c.el.addEventListener('input', function () { marcar(c, true); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valido = true;
      Object.keys(campos).forEach(function (k) {
        var c = campos[k];
        if (c.el && !marcar(c, c.ok(c.el.value))) valido = false;
      });
      if (priv) {
        priv.closest('.lf-privacy').classList.toggle('lferr', !priv.checked);
        if (!priv.checked) valido = false;
      }
      if (!valido) {
        var primero = form.querySelector('.lferr input, input.lferr');
        if (primero) primero.focus();
        return;
      }

      GFG.enviar({
        form: form,
        lead: {
          fuente: GFG.pagina(),
          nombre: campos.nombre.el.value.trim(),
          edad: campos.edad.el ? campos.edad.el.value.trim() : '',
          correo: campos.correo.el ? campos.correo.el.value.trim() : '',
          whatsapp: campos.wa.el.value,
          tipoPlan: form.getAttribute('data-interes') || GFG.pagina()
        },
        onOk: function () {
          form.style.display = 'none';
          exito.style.display = 'block';
          exito.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    if (priv) priv.addEventListener('change', function () {
      priv.closest('.lf-privacy').classList.remove('lferr');
    });
  }

  /* ---------------------------------------------------------- video */
  /* El recuadro de video solo existe si hay un video real configurado. */
  function video() {
    var caja = document.getElementById('video-box');
    if (!caja) return;
    var url = (C.videos || {})[GFG.pagina()];
    var envoltura = caja.closest('.video-wrap') || caja;
    if (!url) { envoltura.remove(); return; }
    envoltura.classList.add('is-on');
    var reproducir = function () {
      caja.innerHTML = '<iframe src="' + url + (url.indexOf('?') > -1 ? '&' : '?') +
        'autoplay=1" title="Video de GFG Finanzas" allow="autoplay; fullscreen" allowfullscreen ' +
        'style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>';
      GFG.track('video_play');
    };
    caja.addEventListener('click', reproducir, { once: true });
    caja.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reproducir(); }
    });
  }

  /* ---------------------------------------------------------- interacción */
  function eventosGlobales() {
    /* Clics a WhatsApp, desde cualquier botón de cualquier página. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
      if (a) GFG.track('whatsapp_click', { ubicacion: a.className.split(' ')[0] || 'link' });
    });

    /* lead_start: primera vez que alguien empieza a llenar un formulario. */
    var iniciados = {};
    document.addEventListener('focusin', function (e) {
      var form = e.target.closest && e.target.closest('form');
      if (!form || !form.id || iniciados[form.id]) return;
      if (form.id.indexOf('calc') === 0 || form.id === 'quoteForm' || form.id === 'autoForm') return;
      iniciados[form.id] = true;
      GFG.track('lead_start', { formulario: form.id });
    });

    /* Botón "agendar" posterior al envío: agenda real si existe, WhatsApp si no. */
    document.querySelectorAll('[data-gfg-agenda]').forEach(function (a) {
      if (C.agendaUrl) {
        a.href = C.agendaUrl;
        a.innerHTML = '<i class="fas fa-calendar-check" aria-hidden="true"></i> Elegir día y hora';
        a.addEventListener('click', function () { GFG.track('appointment_click'); });
      }
    });

    /* Barra de progreso de lectura. */
    var barra = document.createElement('div');
    barra.className = 'gfg-progress';
    barra.setAttribute('aria-hidden', 'true');
    document.body.appendChild(barra);
    var pendiente = false;
    var pintar = function () {
      var alto = document.documentElement.scrollHeight - window.innerHeight;
      barra.style.transform = 'scaleX(' + (alto > 0 ? Math.min(1, window.scrollY / alto) : 0) + ')';
      pendiente = false;
    };
    window.addEventListener('scroll', function () {
      if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); }
    }, { passive: true });
  }

  /** Anima un número de su valor actual a `hasta` (respeta reduced-motion). */
  GFG.contar = function (el, hasta, formato) {
    formato = formato || function (n) { return Math.round(n).toLocaleString('es-MX'); };
    var desde = parseFloat(el.getAttribute('data-valor')) || 0;
    el.setAttribute('data-valor', hasta);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || desde === hasta) {
      el.textContent = formato(hasta);
      return;
    }
    var inicio = null, dur = 450;
    cancelAnimationFrame(el._raf || 0);
    var paso = function (t) {
      if (!inicio) inicio = t;
      var p = Math.min(1, (t - inicio) / dur);
      var suave = 1 - Math.pow(1 - p, 3);
      el.textContent = formato(desde + (hasta - desde) * suave);
      if (p < 1) el._raf = requestAnimationFrame(paso);
    };
    el._raf = requestAnimationFrame(paso);
  };

  function iniciar() {
    formularioEstandar();
    video();
    eventosGlobales();
    document.documentElement.classList.add('gfg-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
