/* ============================================================
   GFG Finanzas — CALCULADORA DE BRECHA DE RETIRO
   Vive en la landing de PPR. Los supuestos salen de js/gfg-config.js.
   Depende de js/gfg.js (GFG.enviar, GFG.track, GFG.contar).
============================================================ */
(function () {
  const $ = id => document.getElementById(id);
  const elEdad = $('gc-edad');
  if (!elEdad) return;

  const cfg       = GFG.config;
  const INFLACION = cfg.inflacion;
  const ANIOS     = cfg.aniosRetiro;
  const TASAS     = cfg.escenarios;
  const pesos     = n => '$' + Math.round(n).toLocaleString('es-MX');
  const miles     = n => Math.round(n).toLocaleString('es-MX');

  const campos = {
    edad: elEdad, retiro: $('gc-retiro'), meta: $('gc-meta'),
    ahorro: $('gc-ahorro'), aporte: $('gc-aporte'), pension: $('gc-pension')
  };
  const noSe = $('gc-nose');

  /* Los supuestos visibles salen de la misma configuración que el cálculo. */
  Object.keys(TASAS).forEach(k => { $('gc-tasa-' + k).textContent = Math.round(TASAS[k] * 100) + '%'; });
  $('gc-s-inflacion').textContent = Math.round(INFLACION * 100);
  $('gc-s-anios').textContent = ANIOS;

  function fillRange(el) {
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.background = `linear-gradient(90deg, var(--rosa) 0%, var(--terracota) ${pct}%, rgba(34,45,68,.12) ${pct}%)`;
  }

  /** Proyección para una tasa anual bruta. Todo lo "real" está en pesos de hoy. */
  function proyectar(v, tasa) {
    const anios = v.retiro - v.edad;
    const n     = anios * 12;
    const i     = tasa / 12;
    const factor    = Math.pow(1 + i, n);
    const anualidad = (factor - 1) / i;

    const nominal    = v.ahorro * factor + v.aporte * anualidad;
    const deflactor  = Math.pow(1 + INFLACION, anios);
    const real       = nominal / deflactor;
    const aportado   = v.ahorro + v.aporte * n;
    const ingreso    = real / (ANIOS * 12);
    const brecha     = Math.max(0, v.meta - v.pension - ingreso);

    /* Aportación que dejaría la brecha en cero, con la misma tasa. */
    const capitalMeta = Math.max(0, v.meta - v.pension) * ANIOS * 12 * deflactor;
    const necesario   = Math.max(0, (capitalMeta - v.ahorro * factor) / anualidad);

    return { nominal, real, aportado, crecimiento: Math.max(0, nominal - aportado), ingreso, brecha, necesario };
  }

  function leer() {
    const v = {};
    Object.keys(campos).forEach(k => { v[k] = parseInt(campos[k].value, 10); });
    if (v.retiro <= v.edad) v.retiro = v.edad + 1;
    if (noSe.checked) v.pension = 0;
    v.escenario = document.querySelector('input[name="gc-escenario"]:checked').value;
    return v;
  }

  let ultimo = null;

  function pintar() {
    const v = leer();
    const r = proyectar(v, TASAS[v.escenario]);
    ultimo = { v, r };

    $('gc-edad-val').textContent    = v.edad;
    $('gc-retiro-val').textContent  = v.retiro;
    $('gc-meta-val').textContent    = miles(v.meta);
    $('gc-ahorro-val').textContent  = miles(v.ahorro);
    $('gc-aporte-val').textContent  = miles(v.aporte);
    $('gc-pension-val').textContent = noSe.checked ? '—' : miles(v.pension);
    campos.pension.disabled = noSe.checked;
    Object.values(campos).forEach(fillRange);

    const cubierta = r.brecha <= 0;
    $('gc-titulo').textContent = cubierta ? 'Con estos supuestos' : 'Tu brecha mensual estimada';
    $('gc-sub').textContent    = cubierta
      ? 'cubrirías tu meta mensual. Vale la pena confirmarlo con un diagnóstico.'
      : 'en pesos de hoy, cada mes de tu retiro';
    const elBrecha = $('gc-brecha');
    elBrecha.classList.toggle('is-ok', cubierta);
    if (cubierta) { elBrecha.textContent = 'Meta cubierta'; elBrecha.setAttribute('data-valor', 0); }
    else GFG.contar(elBrecha, r.brecha, pesos);

    /* Barra: de qué se compone tu meta mensual. */
    const pPension = Math.min(100, v.pension / v.meta * 100);
    const pPlan    = Math.min(100 - pPension, r.ingreso / v.meta * 100);
    $('gc-seg-pension').style.width = pPension + '%';
    $('gc-seg-plan').style.width    = pPlan + '%';
    $('gc-seg-brecha').style.width  = Math.max(0, 100 - pPension - pPlan) + '%';
    $('gc-l-pension').textContent = noSe.checked ? 'por estimar' : pesos(v.pension);
    $('gc-l-plan').textContent    = pesos(r.ingreso);
    $('gc-l-brecha').textContent  = pesos(r.brecha);

    $('gc-nominal').textContent     = pesos(r.nominal);
    $('gc-real').textContent        = pesos(r.real);
    $('gc-aportado').textContent    = pesos(r.aportado);
    $('gc-crecimiento').textContent = pesos(r.crecimiento);
    $('gc-necesario').textContent   = pesos(Math.ceil(r.necesario / 100) * 100);
    $('gc-cierre').hidden = cubierta;
  }

  /* Medición: inicio en la primera interacción, "completa" cuando deja de mover. */
  let iniciada = false, completada = false, reposo;
  function alInteractuar() {
    if (!iniciada) { iniciada = true; GFG.track('calculator_start', { calculadora: 'brecha' }); }
    clearTimeout(reposo);
    if (!completada) reposo = setTimeout(() => {
      completada = true;
      GFG.track('calculator_complete', { calculadora: 'brecha', escenario: ultimo.v.escenario, brecha: Math.round(ultimo.r.brecha) });
    }, 2500);
    pintar();
  }

  Object.values(campos).forEach(el => el.addEventListener('input', alInteractuar));
  noSe.addEventListener('change', alInteractuar);
  document.querySelectorAll('input[name="gc-escenario"]').forEach(el => el.addEventListener('change', alInteractuar));
  pintar();

  /* ----- Captura posterior al resultado ----- */
  const form = $('calc-form');
  const cNom = $('calc-nombre'), cWa = $('calc-whatsapp'), cMail = $('calc-correo'), cOk = $('calc-consent');

  function marcar(el, ok) {
    el.classList.toggle('error', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    $('err-' + el.id).classList.toggle('show', !ok);
    return ok;
  }
  [cNom, cWa, cMail].forEach(el => el.addEventListener('input', () => marcar(el, true)));
  cOk.addEventListener('change', () => $('calc-consent-wrap').classList.remove('error'));

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const okN = marcar(cNom, cNom.value.trim().length >= 2);
    const okW = marcar(cWa, GFG.esTel(cWa.value));
    const okM = marcar(cMail, !cMail.value.trim() || GFG.esEmail(cMail.value));
    $('calc-consent-wrap').classList.toggle('error', !cOk.checked);
    if (!okN || !okW || !okM || !cOk.checked) return;

    const { v, r } = ultimo;
    GFG.enviar({
      form,
      lead: {
        fuente:   'calculadora',
        nombre:   cNom.value.trim(),
        whatsapp: cWa.value,
        correo:   cMail.value.trim(),
        edad:     v.edad,
        tipoPlan: 'retiro',
        notas:    `Brecha ${pesos(r.brecha)}/mes (escenario ${v.escenario}) · meta ${pesos(v.meta)} · pensión ${noSe.checked ? 'no sabe' : pesos(v.pension)} · ` +
                  `ahorro ${pesos(v.ahorro)} · aporta ${pesos(v.aporte)}/mes · retiro a los ${v.retiro} · Preocupación: ${$('calc-preocupacion').value}`
      },
      onOk() {
        form.style.display = 'none';
        document.querySelector('.gc-capture-copy').style.display = 'none';
        $('calc-success').style.display = 'block';
      }
    });
  });
})();
