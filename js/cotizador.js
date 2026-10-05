/* ============================================================
   GFG Finanzas — COTIZADOR DE RETIRO Y PPR (cotizador.html)
   Motor de proyección PPR + AFORE, cotizaciones guardadas y PDF.
   Depende de js/gfg-config.js y js/gfg.js (GFG.track, GFG.waLink).

   Mantenimiento:
   - Inflación y tasas salen de js/gfg-config.js (se pueden ajustar
     en pantalla, en "Supuestos").
   - PRODUCTO reúne los cargos y el bono del plan de referencia.
     Revisar contra el folleto vigente de la aseguradora cada año,
     en especial el valor de la UDI.
   - Las cotizaciones guardadas viven solo en este navegador
     (localStorage); no se envían a ningún servidor.
   ============================================================ */
(function () {
  'use strict';

  const GFG = window.GFG || {};
  const CFG = GFG.config || {};

  /* ---------------------------------------------------------- parámetros */
  const PRODUCTO = {
    edadVida: 85,                 // hasta qué edad se reparte el fondo
    cargoInicial: 500,            // cargo fijo del primer mes
    adminTrimestral: 0.036 / 4,   // administración, sobre saldo inicial
    gestionMensual: 0.001,        // gestión de inversión
    cargoComprometidoUdi: 15,     // cargo fijo mensual desde el mes 19, en UDI
    udi: 6.842488736986298,       // valor de la UDI — actualizar
    mesesBono: 12,
    aniosEspera: 10               // comparación "si empiezas después"
  };
  const AFORE = { rendimiento: 0.10, aportacion: 0.065, rentaVitalicia: 0.048, semanasMinimas: 1250 };
  const TOPE_DEDUCIBLE = 5 * (CFG.umaAnual || 0);   // Art. 151 LISR: 5 UMA anuales
  /* Seguro de vida de referencia, por edad (desde 25) y sexo:
     [suma asegurada, prima mensual protección amplia, prima mensual máximo respaldo].
     Es la misma tabla del cotizador de vida.html: si cambian las tarifas, actualizar ambas. */
  const VIDA = {
    edadInicial: 25,
    mujer: [[1750000, 459.47, 739.18], [1700000, 456.28, 728.60], [1680000, 453.54, 717.27], [1660000, 452.37, 707.10], [1425000, 451.40, 679.17], [1390000, 453.83, 676.80], [1350000, 456.06, 671.53], [1290000, 458.49, 666.29], [1235000, 452.25, 649.64], [1182000, 452.49, 640.96], [1130000, 451.45, 632.05], [1080000, 451.79, 624.41], [1030000, 452.15, 616.77], [975000, 459.43, 606.76], [870000, 453.65, 590.70], [810000, 458.29, 579.76], [760000, 458.37, 576.38], [710000, 455.19, 568.62], [660000, 456.54, 562.64], [610000, 456.95, 554.47], [560000, 456.47, 532.58], [510000, 453.06, 561.98], [500000, 471.96, 581.51]],
    hombre: [[1580000, 457.97, 710.51], [1540000, 458.98, 706.13], [1385000, 459.36, 671.72], [1344000, 439.91, 654.72], [1310000, 455.94, 668.12], [1280000, 452.01, 656.69], [1250000, 454.18, 653.97], [1220000, 456.69, 651.69], [1135000, 455.05, 636.46], [1045000, 453.24, 621.87], [975000, 453.14, 608.39], [965000, 458.82, 611.47], [870000, 452.77, 591.84], [860000, 456.89, 584.26], [770000, 457.27, 569.10], [690000, 458.81, 564.14], [635000, 452.66, 545.87], [600000, 457.22, 535.34], [560000, 456.37, 546.97], [516250, 452.62, 574.77], [500000, 457.06, 639.79], [500000, 494.85, 677.30]]
  };
  const CLAVE_GUARDADAS = 'gfg-cotizaciones';
  const CLAVE_MODO = 'gfg-cotizador-asesora';

  /* ---------------------------------------------------------- utilidades */
  const $ = (id) => document.getElementById(id);
  const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
  const soloNum = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
  const factor = (tasa, anios) => Math.pow(1 + tasa, anios);
  const tasaMensual = (anual) => Math.pow(1 + anual, 1 / 12) - 1;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  };

  /* ---------------------------------------------------------- motor PPR */
  function perfilCargos(tipo) {
    return tipo === 'deducible'
      ? { iva: 1.16, baseAmplia: true }
      : { iva: 1, baseAmplia: false };
  }

  /** Bono sobre la aportación base del primer año, según plazo y monto anual. */
  function tasaBono(plazo, mensual) {
    const anual = Math.max(0, mensual) * 12;
    const cortes = [0, 12000, 36000, 60000, 90000];
    let banda = 0;
    cortes.forEach((c, i) => { if (anual >= c) banda = i; });
    let fila = [0, 0, 0, 0, 0];
    if (plazo >= 20) fila = [0, 0.55, 0.65, 0.75, 1];
    else if (plazo >= 15) fila = [0, 0.30, 0.40, 0.50, 0.60];
    else if (plazo >= 10) fila = [0, 0.05, 0.15, 0.25, 0.35];
    return fila[banda] || 0;
  }

  const enRangoExtra = (anio, desde, hasta) => desde > 0 && hasta >= desde && anio >= desde && anio <= hasta;

  /**
   * Simula el fondo mes a mes. Los primeros 18 meses de aportación forman el
   * "saldo inicial" (con cargo de administración); del mes 19 en adelante, el
   * "saldo comprometido" (con cargo fijo en UDI). Ambos pagan gestión.
   */
  function simular(o) {
    const meses = Math.max(0, Math.round(o.aniosAlRetiro * 12));
    const mesesAporte = Math.max(0, Math.round(Math.min(o.aniosAlRetiro, o.aniosAporte) * 12));
    const mesesIniciales = Math.min(18, mesesAporte);
    const aniosEfectivos = mesesAporte > 0 ? Math.ceil(mesesAporte / 12) : 0;
    const r = tasaMensual(o.rendimiento);
    const cargos = perfilCargos(o.tipo);
    const bono = o.unica > 0 ? 0 : tasaBono(o.plazoBono, o.mensual);

    let inicial = 0, comprometido = 0, aportado = 0, bonoAcreditado = 0, aporteAnio = 0;
    const filas = [];

    for (let m = 1; m <= meses; m++) {
      const anio = Math.ceil(m / 12);
      const crecimiento = factor(o.incremento, anio - 1);
      const base = m <= mesesAporte ? o.mensual * crecimiento : 0;
      const extra = m <= mesesAporte && enRangoExtra(anio, o.extraDesde, o.extraHasta)
        ? (o.extraAnual * crecimiento) / 12 : 0;
      const aporte = base + extra + (m === 1 ? o.unica : 0);
      const bonoMes = m <= Math.min(PRODUCTO.mesesBono, mesesAporte) ? base * bono : 0;
      bonoAcreditado += bonoMes;
      aporteAnio += aporte;

      const aIni = m <= mesesIniciales ? aporte + bonoMes : 0;
      const aCom = m > 18 && m <= mesesAporte ? aporte : 0;

      const baseIni = inicial + aIni;
      const intIni = baseIni * r;
      const fijoIni = m === 1 ? -PRODUCTO.cargoInicial : 0;
      const adminIni = m % 3 === 0 ? -(baseIni * PRODUCTO.adminTrimestral * cargos.iva) : 0;
      const baseGestIni = cargos.baseAmplia ? baseIni + intIni + fijoIni + adminIni : baseIni + intIni;
      inicial = baseIni + intIni + fijoIni + adminIni - baseGestIni * PRODUCTO.gestionMensual * cargos.iva;

      const baseCom = comprometido + aCom;
      const intCom = baseCom * r;
      const fijoCom = m > 18
        ? -(PRODUCTO.cargoComprometidoUdi * PRODUCTO.udi * factor(o.inflacion, anio - 1) * cargos.iva) : 0;
      const baseGestCom = cargos.baseAmplia ? baseCom + intCom + fijoCom : baseCom + intCom;
      comprometido = baseCom + intCom + fijoCom - baseGestCom * PRODUCTO.gestionMensual * cargos.iva;

      aportado += aporte;

      if (m % 12 === 0 || m === meses) {
        const nominal = inicial + comprometido;
        filas.push({
          anio, aporteAnio, aportado, nominal,
          real: nominal / factor(o.inflacion, m / 12),
          disponible: aniosEfectivos > 0 && anio >= aniosEfectivos ? nominal : comprometido
        });
        aporteAnio = 0;
      }
    }
    const nominal = inicial + comprometido;
    return { nominal, real: nominal / factor(o.inflacion, meses / 12), aportado, bono, bonoAcreditado, filas };
  }

  /** Aportación mensual que alcanza una pensión futura objetivo (bisección). */
  function mensualParaPension(objetivoFuturo, base) {
    if (objetivoFuturo <= 0 || base.aniosAlRetiro <= 0) return 0;
    const mesesPension = base.mesesPension;
    let lo = 500, hi = 200000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const pension = simular(Object.assign({}, base, { mensual: mid, unica: 0, extraAnual: 0 })).nominal / mesesPension;
      if (Math.abs(pension - objetivoFuturo) < 5) { lo = hi = mid; break; }
      if (pension < objetivoFuturo) lo = mid; else hi = mid;
    }
    return Math.max(minimoPorPlazo(base.plazoBono), Math.ceil(((lo + hi) / 2) / 100) * 100);
  }

  const minimoPorPlazo = (plazo) => (plazo < 15 ? 3000 : 2000);

  /* ---------------------------------------------------------- seguro de vida */
  /** Tarifa de referencia. Fuera de la tabla usa la edad más cercana y la marca como aproximada. */
  function tarifaVida(edad, genero) {
    const tabla = VIDA[genero] || VIDA.mujer;
    const max = VIDA.edadInicial + tabla.length - 1;
    const usada = Math.min(max, Math.max(VIDA.edadInicial, edad));
    const f = tabla[usada - VIDA.edadInicial];
    return { suma: f[0], amplia: f[1], maxima: f[2], edadUsada: usada, exacta: usada === edad, max };
  }
  const pesos2 = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------------------------------------------------------- AFORE */
  function proyectarAfore(s) {
    const vacio = { activo: false, saldo: 0, rentaFut: 0, semanas: 0, derecho: false };
    if (!s.afore) return vacio;
    if (!s.sbc || !s.anioAlta) return Object.assign(vacio, { activo: true, incompleto: true });
    const anios = s.retiro - s.edad;
    const r = AFORE.rendimiento;
    const aporteAnual = s.sbc * 12 * AFORE.aportacion;
    const saldo = s.saldoAfore * factor(r, anios) + aporteAnual * (factor(r, anios) - 1) / r;
    const historicas = s.semanas > 0 ? s.semanas : Math.max(0, Math.round((new Date().getFullYear() - s.anioAlta) * 52));
    const semanas = historicas + Math.round(anios * 52);
    const derecho = semanas >= AFORE.semanasMinimas;
    const i = AFORE.rentaVitalicia / 12;
    const n = Math.max(1, (PRODUCTO.edadVida - s.retiro) * 12);
    const rentaFut = derecho ? saldo * i / (1 - Math.pow(1 + i, -n)) : 0;
    return { activo: true, saldo, rentaFut, semanas, derecho };
  }

  /* ---------------------------------------------------------- lectura del formulario */
  const radio = (nombre) => (document.querySelector('input[name="' + nombre + '"]:checked') || {}).value;

  function leer() {
    const edad = Math.round(soloNum($('cz-edad').value));
    const retiro = parseInt($('cz-retiro').value, 10) || 65;
    const unicaActiva = radio('cz-modo') === 'unica';
    return {
      nombre: $('cz-nombre').value.trim(),
      whatsapp: String($('cz-wa').value || '').replace(/\D/g, ''),
      edad, retiro,
      meta: soloNum($('cz-meta').value),
      afore: $('cz-afore').checked,
      sbc: soloNum($('cz-sbc').value),
      anioAlta: Math.round(soloNum($('cz-alta').value)),
      saldoAfore: soloNum($('cz-saldo').value),
      semanas: Math.round(soloNum($('cz-semanas').value)),
      modo: unicaActiva ? 'unica' : 'mensual',
      mensual: unicaActiva ? 0 : soloNum($('cz-mensual').value),
      unica: unicaActiva ? soloNum($('cz-unica').value) : 0,
      conIncremento: $('cz-incremento').checked,
      plazo: parseInt($('cz-plazo').value, 10) || 20,
      tipo: radio('cz-tipo') === 'deducible' ? 'deducible' : 'no_deducible',
      isr: Math.min(45, Math.max(0, soloNum($('cz-isr').value))) / 100,
      extraAnual: unicaActiva ? 0 : soloNum($('cz-extra').value),
      extraDesde: parseInt($('cz-extra-desde').value, 10) || 0,
      extraHasta: parseInt($('cz-extra-hasta').value, 10) || 0,
      genero: radio('cz-genero') === 'hombre' ? 'hombre' : 'mujer',
      conVida: $('cz-vida-incluir').checked,
      rendimiento: parseFloat(radio('cz-tasa')) || 0.08,
      inflacion: Math.min(15, Math.max(0, soloNum($('cz-inflacion').value))) / 100
    };
  }

  function escribir(s) {
    const pon = (id, v) => { const el = $(id); if (el) el.value = v; };
    const marca = (nombre, valor) => {
      const el = document.querySelector('input[name="' + nombre + '"][value="' + valor + '"]');
      if (el) el.checked = true;
    };
    const dinero = (n) => (n ? Math.round(n).toLocaleString('es-MX') : '');
    pon('cz-nombre', s.nombre || ''); pon('cz-wa', s.whatsapp || '');
    pon('cz-edad', s.edad || ''); pon('cz-retiro', s.retiro || 65); pon('cz-meta', dinero(s.meta));
    $('cz-afore').checked = !!s.afore;
    pon('cz-sbc', dinero(s.sbc)); pon('cz-alta', s.anioAlta || ''); pon('cz-saldo', dinero(s.saldoAfore)); pon('cz-semanas', s.semanas || '');
    marca('cz-modo', s.modo || 'mensual');
    pon('cz-mensual', dinero(s.mensual)); pon('cz-unica', dinero(s.unica));
    $('cz-incremento').checked = s.conIncremento !== false;
    pon('cz-plazo', s.plazo || 20);
    marca('cz-tipo', s.tipo || 'no_deducible');
    pon('cz-isr', s.isr ? Math.round(s.isr * 100) : 30);
    pon('cz-extra', dinero(s.extraAnual));
    marca('cz-genero', s.genero || 'mujer');
    $('cz-vida-incluir').checked = s.conVida !== false;
    marca('cz-tasa', String(s.rendimiento || tasaPorDefecto()));
    pon('cz-inflacion', s.inflacion != null ? +(s.inflacion * 100).toFixed(1) : (CFG.inflacion || 0.04) * 100);
    opcionesExtra(s.extraDesde, s.extraHasta);
  }

  /* ---------------------------------------------------------- cálculo completo */
  function calcular(s) {
    const anios = s.retiro - s.edad;
    if (!(s.edad >= 18 && s.edad <= 70) || anios < 1) return { ok: false, motivo: 'Indica una edad entre 18 y 70, menor a la edad de retiro.' };

    const unica = s.modo === 'unica';
    const aniosAporte = unica ? 1 : Math.min(anios, s.plazo);
    const mesesPension = Math.max(12, (PRODUCTO.edadVida - s.retiro) * 12);
    const incremento = !unica && s.conIncremento ? s.inflacion : 0;
    const base = {
      aniosAlRetiro: anios, aniosAporte, plazoBono: unica ? 0 : s.plazo,
      mensual: s.mensual, unica: s.unica, incremento,
      extraAnual: s.extraAnual, extraDesde: s.extraDesde, extraHasta: s.extraHasta,
      rendimiento: s.rendimiento, inflacion: s.inflacion, tipo: s.tipo, mesesPension
    };

    const inflTotal = factor(s.inflacion, anios);
    const afore = proyectarAfore(s);
    const aforeHoy = afore.rentaFut / inflTotal;
    const metaFut = s.meta * inflTotal;
    const objetivoPprFut = Math.max(0, metaFut - afore.rentaFut);
    const baseSugerida = Object.assign({}, base, {
      aniosAporte: Math.min(anios, s.plazo), plazoBono: s.plazo,
      incremento: s.conIncremento ? s.inflacion : 0
    });
    const sugerida = s.meta > 0 ? mensualParaPension(objetivoPprFut, baseSugerida) : 0;

    const hayAporte = s.mensual > 0 || s.unica > 0;
    const sim = hayAporte ? simular(base) : null;
    const r = { ok: true, anios, aniosAporte, mesesPension, afore, aforeHoy, metaFut, objetivoPprFut, sugerida,
                fondoObjetivo: objetivoPprFut * mesesPension, hayAporte, unica, inflTotal };
    if (!sim) return r;

    r.sim = sim;
    r.pensionFut = sim.nominal / mesesPension;
    r.pensionHoy = r.pensionFut / inflTotal;
    r.cubiertoHoy = aforeHoy + r.pensionHoy;
    r.brechaHoy = Math.max(0, s.meta - r.cubiertoHoy);
    r.crecimiento = Math.max(0, sim.nominal - sim.aportado);
    r.minimo = unica ? 0 : minimoPorPlazo(s.plazo);
    r.bajoMinimo = !unica && s.mensual > 0 && s.mensual < r.minimo;

    /* Beneficio fiscal estimado: aportación deducible (con tope de 5 UMA) × tasa de ISR. */
    r.fiscal = null;
    if (s.tipo === 'deducible' && s.isr > 0) {
      let primero = 0, total = 0, reinvertido = 0, topado = false;
      sim.filas.forEach((f, i) => {
        const deducible = TOPE_DEDUCIBLE > 0 ? Math.min(f.aporteAnio, TOPE_DEDUCIBLE) : f.aporteAnio;
        if (deducible < f.aporteAnio) topado = true;
        const dev = deducible * s.isr;
        if (i === 0) primero = dev;
        total += dev;
        reinvertido = reinvertido * (1 + s.rendimiento) + dev;
        f.fiscal = dev > 0 || reinvertido > 0 ? reinvertido : 0;
      });
      r.fiscal = { primero, total, reinvertido, topado };
    }

    /* Seguro de vida de referencia para su edad y sexo */
    r.vida = tarifaVida(s.edad, s.genero);
    const despues = tarifaVida(r.vida.edadUsada + 10, s.genero);
    r.vida.espera = despues.edadUsada > r.vida.edadUsada && despues.suma < r.vida.suma
      ? { edad: despues.edadUsada, suma: despues.suma, perdida: r.vida.suma - despues.suma } : null;

    /* ¿Y si empieza después? Mismo plan, menos años para crecer. */
    r.espera = null;
    if (anios - PRODUCTO.aniosEspera >= 1) {
      const tarde = simular(Object.assign({}, base, {
        aniosAlRetiro: anios - PRODUCTO.aniosEspera,
        aniosAporte: unica ? 1 : Math.min(anios - PRODUCTO.aniosEspera, s.plazo)
      }));
      r.espera = { nominal: tarde.nominal, diferencia: Math.max(0, sim.nominal - tarde.nominal) };
    }
    return r;
  }

  /* ---------------------------------------------------------- pintado */
  let ultimo = null;   // { s, r }
  let grafica = null, datosGrafica = null;
  let contactoDado = false;   // ya dejó su contacto en esta visita

  function texto(id, v) { const el = $(id); if (el) el.textContent = v; }
  /** Cifra que cuenta hasta su nuevo valor en vez de cambiar de golpe. */
  function cifra(id, n, sufijo) {
    const el = $(id);
    if (!el) return;
    if (GFG.contar) GFG.contar(el, Math.round(n), (x) => pesos(x) + (sufijo || ''));
    else el.textContent = pesos(n) + (sufijo || '');
  }
  /** El ícono del botón cambia un momento para confirmar la acción. */
  function confirmar(boton, icono) {
    const i = boton && boton.querySelector('i');
    if (!i) return;
    const antes = i.className;
    i.className = icono + ' cz-pop';
    boton.classList.add('is-ok');
    setTimeout(() => { i.className = antes; boton.classList.remove('is-ok'); }, 1600);
  }
  function ver(id, si) { const el = $(id); if (el) el.hidden = !si; }

  function pintar() {
    const s = leer();
    const r = calcular(s);
    ultimo = { s, r };

    /* Campos que dependen de otros */
    ver('cz-afore-campos', s.afore);
    ver('cz-campo-mensual', s.modo === 'mensual');
    ver('cz-campo-unica', s.modo === 'unica');
    ver('cz-bloque-mensual', s.modo === 'mensual');
    ver('cz-campo-isr', s.tipo === 'deducible');
    texto('cz-retiro-val', s.retiro + ' años');
    texto('cz-plazo-val', s.plazo + ' años');

    const listo = r.ok && r.hayAporte;
    ver('cz-vacio', !listo);
    ver('cz-resultado', listo);
    document.querySelectorAll('[data-cz-accion]').forEach((b) => { b.disabled = !listo; });

    if (!r.ok) {
      texto('cz-vacio-texto', r.motivo);
      texto('cz-barra-cifra', '—');
      ver('cz-sugerida', false);
      return;
    }

    /* Aportación sugerida para la meta */
    const haySugerida = s.meta > 0;
    ver('cz-sugerida', haySugerida);
    if (haySugerida) {
      texto('cz-sugerida-monto', r.sugerida > 0 ? pesos(r.sugerida) + ' al mes' : 'Tu AFORE ya cubriría esta meta');
      texto('cz-sugerida-nota', r.sugerida > 0
        ? 'Para ' + pesos(s.meta) + '/mes de hoy a los ' + s.retiro + ', con ' + Math.min(r.anios, s.plazo) + ' años de aportación.'
        : 'Con los datos de AFORE capturados no haría falta un PPR para llegar a ' + pesos(s.meta) + '/mes.');
      $('cz-usar-sugerida').hidden = !(r.sugerida > 0) || s.modo !== 'mensual' || Math.round(s.mensual) === r.sugerida;
    }

    if (!listo) {
      texto('cz-vacio-texto', haySugerida && r.sugerida > 0
        ? 'Captura la aportación del plan (o usa la sugerida) para ver la proyección.'
        : 'Captura la aportación del plan para ver la proyección.');
      texto('cz-barra-cifra', '—');
      return;
    }

    const sim = r.sim;
    texto('cz-r-nombre', s.nombre ? 'Plan de retiro de ' + s.nombre : 'Plan de retiro');
    texto('cz-r-resumen', [
      s.edad + ' → ' + s.retiro + ' años',
      r.unica ? 'aportación única' : r.aniosAporte + ' años aportando',
      s.tipo === 'deducible' ? 'deducible (Art. 151)' : 'no deducible (Art. 93)',
      Math.round(s.rendimiento * 100) + '% anual'
    ].join(' · '));

    cifra('cz-k-fondo', sim.nominal);
    texto('cz-k-fondo-hoy', 'Equivale a ' + pesos(sim.real) + ' de hoy');
    cifra('cz-k-pension', r.pensionHoy);
    texto('cz-k-pension-fut', pesos(r.pensionFut) + '/mes en pesos de ' + (new Date().getFullYear() + r.anios));
    cifra('cz-k-aportado', sim.aportado);
    texto('cz-k-crecimiento', '+ ' + pesos(r.crecimiento) + ' de crecimiento estimado');
    cifra('cz-barra-cifra', r.pensionHoy, '/mes');

    /* Cobertura de la meta */
    ver('cz-cobertura', s.meta > 0);
    if (s.meta > 0) {
      const pA = Math.min(100, r.aforeHoy / s.meta * 100);
      const pP = Math.min(100 - pA, r.pensionHoy / s.meta * 100);
      $('cz-seg-afore').style.width = pA + '%';
      $('cz-seg-ppr').style.width = pP + '%';
      $('cz-seg-brecha').style.width = Math.max(0, 100 - pA - pP) + '%';
      texto('cz-l-afore', !r.afore.activo ? 'no incluido' : r.afore.incompleto ? 'faltan datos' : r.afore.derecho ? pesos(r.aforeHoy) : 'sin derecho');
      texto('cz-l-ppr', pesos(r.pensionHoy));
      texto('cz-l-brecha', pesos(r.brechaHoy));
      texto('cz-cobertura-titulo', r.brechaHoy <= 0
        ? 'Meta de ' + pesos(s.meta) + '/mes cubierta'
        : 'Cubre ' + Math.round(Math.min(100, r.cubiertoHoy / s.meta * 100)) + '% de la meta de ' + pesos(s.meta) + '/mes');
    }
    ver('cz-afore-nota', r.afore.activo && !r.afore.incompleto);
    if (r.afore.activo && !r.afore.incompleto) {
      texto('cz-afore-nota', r.afore.derecho
        ? 'AFORE: ' + r.afore.semanas.toLocaleString('es-MX') + ' semanas estimadas al retiro y saldo proyectado de ' + pesos(r.afore.saldo) + '.'
        : 'AFORE: ' + r.afore.semanas.toLocaleString('es-MX') + ' semanas estimadas; se requieren ' + AFORE.semanasMinimas.toLocaleString('es-MX') + ' para pensión.');
    }

    /* Avisos */
    ver('cz-aviso-minimo', r.bajoMinimo);
    if (r.bajoMinimo) texto('cz-aviso-minimo', 'El mínimo del plan a ' + s.plazo + ' años es ' + pesos(r.minimo) + ' al mes.');
    ver('cz-aviso-plazo', !r.unica && r.anios < s.plazo);
    if (!r.unica && r.anios < s.plazo) texto('cz-aviso-plazo', 'Faltan ' + r.anios + ' años para el retiro: se aporta ' + r.aniosAporte + ', no ' + s.plazo + '.');

    /* Tarjetas secundarias */
    ver('cz-t-fiscal', !!r.fiscal);
    if (r.fiscal) {
      texto('cz-fiscal-1', pesos(r.fiscal.primero));
      texto('cz-fiscal-total', pesos(r.fiscal.total));
      texto('cz-fiscal-nota', 'Estimado con ISR de ' + Math.round(s.isr * 100) + '%' +
        (r.fiscal.topado ? ' y tope deducible de ' + pesos(TOPE_DEDUCIBLE) + ' al año (5 UMA)' : '') +
        '. Depende de tu situación fiscal; también aplica el límite de 10% de tus ingresos.');
    }
    ver('cz-t-bono', sim.bono > 0);
    if (sim.bono > 0) {
      texto('cz-bono-monto', pesos(sim.bonoAcreditado));
      texto('cz-bono-nota', Math.round(sim.bono * 100) + '% sobre la aportación base del primer año. Ya está incluido en el fondo; sujeto a las condiciones del plan.');
    }
    ver('cz-t-espera', !!r.espera);
    if (r.espera) {
      texto('cz-espera-monto', '− ' + pesos(r.espera.diferencia));
      texto('cz-espera-nota', 'Con el mismo plan empezando en ' + PRODUCTO.aniosEspera + ' años, el fondo sería de ' + pesos(r.espera.nominal) + '.');
    }

    pintarVida(s, r);
    pintarTabla(s, r);
    pintarGrafica(s, r);
  }

  function pintarVida(s, r) {
    const v = r.vida;
    texto('cz-vida-chip', 'Tarifa para ' + s.edad + ' años');
    texto('cz-vida-precio', pesos2(v.amplia));
    texto('cz-vida-suma', pesos(v.suma));
    texto('cz-vida-amplia', pesos2(v.amplia) + ' / mes');
    texto('cz-vida-maxima', pesos2(v.maxima) + ' / mes');
    texto('cz-vida-meta', (s.genero === 'mujer' ? 'Mujer' : 'Hombre') + ' · ' + s.edad + ' años' + (v.exacta
      ? ' · protección amplia.'
      : ' · referencia aproximada, tomada del dato de ' + v.edadUsada + ' años. La cotización exacta se revisa con la aseguradora.'));
    ver('cz-vida-espera', !!v.espera);
    if (v.espera) {
      texto('cz-vida-espera-txt', 'Con prácticamente el mismo pago, a los ' + v.espera.edad + ' años esa protección baja a ' +
        pesos(v.espera.suma) + ': ' + pesos(v.espera.perdida) + ' menos de respaldo para la familia.');
    }
    /* Qué parte del fondo proyectado respalda desde el primer día */
    const pct = r.sim.nominal > 0 ? Math.min(100, Math.round(v.suma / r.sim.nominal * 100)) : 0;
    $('cz-vida-barra').style.width = pct + '%';
    texto('cz-vida-relacion', 'Protege desde hoy el equivalente al ' + pct + '% del fondo que este plan tardaría ' + r.anios + ' años en construir.');
  }

  function pintarTabla(s, r) {
    const conFiscal = !!r.fiscal;
    $('cz-th-fiscal').hidden = !conFiscal;
    $('cz-tabla-cuerpo').innerHTML = r.sim.filas.map((f) =>
      '<tr><td>' + f.anio + '</td><td>' + (s.edad + f.anio) + '</td><td>' + pesos(f.aporteAnio) + '</td><td>' + pesos(f.aportado) +
      '</td><td><strong>' + pesos(f.nominal) + '</strong></td><td>' + pesos(f.real) + '</td>' +
      (conFiscal ? '<td>' + pesos(f.fiscal || 0) + '</td>' : '') + '</tr>').join('');
  }

  function pintarGrafica(s, r) {
    const lienzo = $('cz-grafica');
    if (!lienzo || typeof window.Chart === 'undefined') return;
    const filas = r.sim.filas;
    const datos = {
      labels: filas.map((f) => s.edad + f.anio),
      datasets: [
        { label: 'Fondo proyectado', data: filas.map((f) => Math.round(f.nominal)), borderColor: '#B76E79', backgroundColor: 'rgba(183,110,121,.16)', fill: true, tension: .35, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Aportado', data: filas.map((f) => Math.round(f.aportado)), borderColor: '#222D44', backgroundColor: 'rgba(34,45,68,.06)', fill: true, tension: .2, pointRadius: 0, borderWidth: 2, borderDash: [5, 4] }
      ]
    };
    datosGrafica = datos;
    if (grafica) { grafica.data = datos; grafica.update('none'); return; }
    grafica = new window.Chart(lienzo, configGrafica(datos));
  }

  /** Configuración nueva en cada llamada: Chart.js no admite compartir opciones entre gráficas. */
  function configGrafica(datos) {
    const fuente = (size) => ({ family: 'Poppins', size });
    return {
      type: 'line', data: datos,
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: fuente(12) } },
          tooltip: { callbacks: { title: (t) => 'A los ' + t[0].label + ' años', label: (c) => ' ' + c.dataset.label + ': ' + pesos(c.parsed.y) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: fuente(11) }, title: { display: true, text: 'Edad', font: fuente(11) } },
          y: { grid: { color: 'rgba(34,45,68,.07)' }, ticks: { font: fuente(11), callback: (v) => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1e3) + 'k' } }
        }
      }
    };
  }

  /* ---------------------------------------------------------- opciones dependientes */
  function tasaPorDefecto() { return (CFG.escenarios || {}).medio || 0.08; }

  function opcionesExtra(desde, hasta) {
    const plazo = parseInt($('cz-plazo').value, 10) || 20;
    [['cz-extra-desde', desde || 1], ['cz-extra-hasta', hasta || plazo]].forEach((par) => {
      const sel = $(par[0]);
      const actual = Math.min(plazo, parseInt(sel.value, 10) || par[1]);
      sel.innerHTML = '';
      for (let i = 1; i <= plazo; i++) sel.add(new Option('Año ' + i, i, false, i === actual));
    });
  }

  /* ---------------------------------------------------------- resumen en texto */
  function resumen(paraCliente) {
    const { s, r } = ultimo;
    const l = [];
    l.push(paraCliente
      ? 'Hola' + (s.nombre ? ' ' + s.nombre.split(' ')[0] : '') + ', te comparto tu cotización de retiro con GFG Finanzas:'
      : 'Hola Guadalupe, hice mi cotización de retiro y quiero revisarla contigo:');
    if (!paraCliente && s.nombre) l.push('Nombre: ' + s.nombre);
    l.push('Edad: ' + s.edad + ' · Retiro a los ' + s.retiro);
    if (s.meta > 0) l.push('Meta: ' + pesos(s.meta) + '/mes (pesos de hoy)');
    l.push(r.unica ? 'Aportación única: ' + pesos(s.unica)
      : 'Aportación: ' + pesos(s.mensual) + '/mes por ' + r.aniosAporte + ' años' + (s.conIncremento ? ', con incremento anual' : ''));
    l.push('Plan ' + (s.tipo === 'deducible' ? 'deducible (Art. 151)' : 'no deducible (Art. 93)'));
    l.push('Fondo estimado al retiro: ' + pesos(r.sim.nominal) + ' (' + pesos(r.sim.real) + ' de hoy)');
    l.push('Pensión mensual estimada: ' + pesos(r.pensionHoy) + ' de hoy');
    if (r.fiscal) l.push('Beneficio fiscal estimado 1er año: ' + pesos(r.fiscal.primero));
    if (s.conVida) l.push('Seguro de vida de referencia: ' + pesos2(r.vida.amplia) + '/mes por ' + pesos(r.vida.suma) + ' de suma asegurada');
    l.push('');
    l.push('Estimación con ' + Math.round(s.rendimiento * 100) + '% anual e inflación de ' + +(s.inflacion * 100).toFixed(1) + '%. No es una oferta ni garantiza rendimientos.');
    return l.join('\n');
  }

  /* ---------------------------------------------------------- prospecto a la cartera */
  /** Lo esencial de la cotización, para que llegue junto con el contacto. */
  function notaDeCotizacion() {
    const { s, r } = ultimo;
    return [
      s.meta > 0 ? 'Meta ' + pesos(s.meta) + '/mes' : '',
      r.unica ? 'aportación única ' + pesos(s.unica) : 'aporta ' + pesos(s.mensual) + '/mes por ' + r.aniosAporte + ' años',
      'retiro a los ' + s.retiro,
      s.tipo === 'deducible' ? 'deducible' : 'no deducible',
      'fondo ' + pesos(r.sim.nominal),
      'pensión ' + pesos(r.pensionHoy) + ' de hoy',
      s.conVida ? 'vida ref. ' + pesos2(r.vida.amplia) + '/mes' : ''
    ].filter(Boolean).join(' · ');
  }

  /** Manda el contacto a la cartera de Guadalupe. Nunca interrumpe lo que la persona estaba haciendo. */
  function enviarProspecto(nombre, whatsapp, origen) {
    if (!GFG.saveLead || !ultimo || !ultimo.r.ok || !ultimo.r.hayAporte) return Promise.resolve({ ok: false });
    return GFG.saveLead({
      fuente: 'cotizador', nombre, whatsapp, edad: ultimo.s.edad, tipoPlan: 'retiro',
      notas: (origen ? origen + ' · ' : '') + notaDeCotizacion()
    }).then((res) => { if (res.ok && GFG.track) GFG.track('lead_success', { fuente: 'cotizador' }); return res; });
  }

  /* ---------------------------------------------------------- avisos breves */
  let avisoT;
  function aviso(msg, accion) {
    const caja = $('cz-toast');
    caja.innerHTML = '';
    caja.appendChild(document.createTextNode(msg));
    if (accion) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = accion.texto;
      b.addEventListener('click', () => { accion.hacer(); caja.classList.remove('is-on'); });
      caja.appendChild(b);
    }
    caja.classList.add('is-on');
    clearTimeout(avisoT);
    avisoT = setTimeout(() => caja.classList.remove('is-on'), accion ? 6000 : 2600);
  }

  /* ---------------------------------------------------------- cotizaciones guardadas */
  function guardadas() { try { return JSON.parse(store.get(CLAVE_GUARDADAS) || '[]'); } catch (_) { return []; } }
  function persistir(lista) { return store.set(CLAVE_GUARDADAS, JSON.stringify(lista.slice(0, 200))); }

  function pintarGuardadas() {
    const lista = guardadas();
    texto('cz-guardadas-n', lista.length ? String(lista.length) : '');
    const ul = $('cz-guardadas-lista');
    ul.innerHTML = '';
    ver('cz-guardadas-vacio', !lista.length);
    lista.forEach((c) => {
      const li = document.createElement('li');
      const abrir = document.createElement('button');
      abrir.type = 'button'; abrir.className = 'cz-g-abrir';
      const nombre = document.createElement('strong'); nombre.textContent = c.s.nombre || 'Sin nombre';
      const det = document.createElement('span');
      det.textContent = new Date(c.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' · ' + pesos(c.pension) + '/mes · fondo ' + pesos(c.fondo);
      abrir.append(nombre, det);
      abrir.addEventListener('click', () => { escribir(c.s); pintar(); cerrarPanel(); aviso('Cotización de ' + (c.s.nombre || 'cliente') + ' cargada'); });
      const borrar = document.createElement('button');
      borrar.type = 'button'; borrar.className = 'cz-g-borrar'; borrar.setAttribute('aria-label', 'Eliminar cotización de ' + (c.s.nombre || 'cliente'));
      borrar.innerHTML = '<i class="fas fa-trash-can" aria-hidden="true"></i>';
      borrar.addEventListener('click', () => {
        const antes = guardadas();
        persistir(antes.filter((x) => x.id !== c.id)); pintarGuardadas();
        aviso('Cotización eliminada', { texto: 'Deshacer', hacer: () => { persistir(antes); pintarGuardadas(); } });
      });
      li.append(abrir, borrar);
      ul.appendChild(li);
    });
  }

  function guardar() {
    const { s, r } = ultimo;
    if (!s.nombre) { $('cz-nombre').focus(); aviso('Escribe el nombre del cliente para guardar'); return; }
    const lista = guardadas().filter((c) => !(c.s.nombre === s.nombre && c.s.whatsapp === s.whatsapp));
    lista.unshift({ id: Date.now().toString(36), fecha: Date.now(), s, fondo: Math.round(r.sim.nominal), pension: Math.round(r.pensionHoy) });
    if (persistir(lista)) {
      pintarGuardadas();
      /* Con WhatsApp del cliente, la cotización también entra a la cartera de seguimiento. */
      if (s.whatsapp.length === 10 && (CFG.punto25 || {}).clave) {
        aviso('Guardada. Enviando a tu cartera…');
        enviarProspecto(s.nombre, s.whatsapp, 'Cotizada por la asesora').then((res) =>
          aviso(res.ok ? 'Guardada y enviada a tu cartera' : 'Guardada aquí; no se pudo enviar a tu cartera'));
      } else aviso((CFG.punto25 || {}).clave ? 'Guardada aquí. Con su WhatsApp también entra a tu cartera' : 'Guardada en este dispositivo'); confirmar(document.querySelector('[data-cz-accion="guardar"]'), 'fas fa-check'); GFG.track && GFG.track('quote_saved');
    }
    else aviso('Este navegador no permite guardar');
  }

  function abrirPanel() { $('cz-panel').classList.add('is-on'); $('cz-panel').setAttribute('aria-hidden', 'false'); $('cz-panel-cerrar').focus(); }
  function cerrarPanel() { $('cz-panel').classList.remove('is-on'); $('cz-panel').setAttribute('aria-hidden', 'true'); }

  /* ---------------------------------------------------------- PDF */
  function cargar(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function descargarPdf(boton) {
    const { s, r } = ultimo;
    boton.disabled = true; boton.classList.add('is-loading');
    try {
      if (!window.jspdf) await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (!window.jspdf.jsPDF.API.autoTable) await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
      const W = pdf.internal.pageSize.getWidth(), M = 44;
      const NAVY = [34, 45, 68], ROSA = [183, 110, 121], GRIS = [92, 92, 108];
      const hoy = new Date();
      const fecha = hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

      /* Encabezado */
      pdf.setFillColor.apply(pdf, NAVY); pdf.rect(0, 0, W, 96, 'F');
      pdf.setTextColor(212, 146, 156); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('GFG', M, 46, { charSpace: 4 });
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(7.5); pdf.text('FINANZAS', M, 60, { charSpace: 3 });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(15); pdf.text('Cotización de retiro', W - M, 44, { align: 'right' });
      pdf.setFontSize(9); pdf.setTextColor(200, 205, 215); pdf.text(fecha, W - M, 60, { align: 'right' });

      /* Cliente */
      let y = 130;
      pdf.setTextColor.apply(pdf, NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
      pdf.text(s.nombre ? 'Plan de retiro de ' + s.nombre : 'Plan de retiro', M, y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor.apply(pdf, GRIS);
      y += 18;
      pdf.text('Edad actual: ' + s.edad + ' años   ·   Retiro: ' + s.retiro + ' años   ·   ' +
        (r.unica ? 'Aportación única' : 'Plazo de aportación: ' + r.aniosAporte + ' años') + '   ·   Plan ' +
        (s.tipo === 'deducible' ? 'deducible (Art. 151 LISR)' : 'no deducible (Art. 93 LISR)'), M, y);

      /* Cifras principales */
      y += 26;
      const cajas = [
        ['Fondo estimado al retiro', pesos(r.sim.nominal), pesos(r.sim.real) + ' en pesos de hoy'],
        ['Pensión mensual estimada', pesos(r.pensionHoy), 'en pesos de hoy · ' + pesos(r.pensionFut) + ' futuros'],
        [r.unica ? 'Aportación única' : 'Aportación mensual', pesos(r.unica ? s.unica : s.mensual), 'Total aportado: ' + pesos(r.sim.aportado)]
      ];
      const cw = (W - M * 2 - 20) / 3;
      cajas.forEach((c, i) => {
        const x = M + i * (cw + 10);
        pdf.setFillColor(247, 241, 239); pdf.roundedRect(x, y, cw, 78, 8, 8, 'F');
        pdf.setFontSize(8); pdf.setTextColor.apply(pdf, GRIS); pdf.text(c[0].toUpperCase(), x + 12, y + 20);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor.apply(pdf, i === 1 ? ROSA : NAVY); pdf.text(c[1], x + 12, y + 46);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor.apply(pdf, GRIS); pdf.text(c[2], x + 12, y + 64);
      });
      y += 100;

      /* Detalle */
      const detalle = [];
      if (s.meta > 0) {
        detalle.push(['Meta mensual al retiro (pesos de hoy)', pesos(s.meta)]);
        if (r.afore.activo && !r.afore.incompleto) detalle.push(['Pensión AFORE estimada (pesos de hoy)', r.afore.derecho ? pesos(r.aforeHoy) : 'Sin derecho estimado']);
        detalle.push(['Cubierto con AFORE + PPR (pesos de hoy)', pesos(r.cubiertoHoy)]);
        detalle.push(['Brecha por cubrir', r.brechaHoy > 0 ? pesos(r.brechaHoy) + ' al mes' : 'Meta cubierta']);
        if (r.sugerida > 0) detalle.push(['Aportación mensual sugerida para la meta', pesos(r.sugerida)]);
      }
      detalle.push(['Crecimiento estimado del fondo', pesos(r.crecimiento)]);
      if (!r.unica) detalle.push(['Incremento anual de la aportación', s.conIncremento ? 'Sí, al ritmo de la inflación' : 'No']);
      if (s.extraAnual > 0 && !r.unica) detalle.push(['Aportación adicional anual', pesos(s.extraAnual) + ' (años ' + s.extraDesde + ' a ' + s.extraHasta + ')']);
      if (r.fiscal) {
        detalle.push(['Beneficio fiscal estimado, primer año', pesos(r.fiscal.primero)]);
        detalle.push(['Beneficio fiscal estimado, suma del plazo', pesos(r.fiscal.total)]);
      }
      if (r.sim.bono > 0) detalle.push(['Bono estimado del primer año (incluido en el fondo)', pesos(r.sim.bonoAcreditado)]);
      if (s.conVida) {
        detalle.push(['Seguro de vida de referencia · suma asegurada', pesos(r.vida.suma)]);
        detalle.push(['Seguro de vida · protección amplia / máximo respaldo', pesos2(r.vida.amplia) + ' / ' + pesos2(r.vida.maxima) + ' al mes']);
      }
      pdf.autoTable({
        startY: y, margin: { left: M, right: M }, theme: 'plain', body: detalle,
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 0, right: 0 }, textColor: NAVY, lineColor: [228, 226, 222], lineWidth: { bottom: .6 } },
        columnStyles: { 0: { textColor: GRIS }, 1: { halign: 'right', fontStyle: 'bold' } }
      });
      y = pdf.lastAutoTable.finalY + 22;

      /* Gráfica: se dibuja aparte, a tamaño fijo, para que salga igual desde el teléfono */
      const libre = pdf.internal.pageSize.getHeight() - 104 - y;   // hasta el pie legal
      if (datosGrafica && window.Chart && libre > 120) {
        const alto = Math.min(200, libre - 12), ancho = W - M * 2;
        const caja = document.createElement('div');
        caja.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + ancho * 2 + 'px;height:' + alto * 2 + 'px';
        const lienzo = document.createElement('canvas');
        caja.appendChild(lienzo); document.body.appendChild(caja);
        const cfg = configGrafica(JSON.parse(JSON.stringify(datosGrafica)));
        cfg.options.devicePixelRatio = 1;
        const copia = new window.Chart(lienzo, cfg);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor.apply(pdf, NAVY); pdf.text('Evolución estimada del fondo', M, y);
        pdf.addImage(lienzo.toDataURL('image/png', 1), 'PNG', M, y + 8, ancho, alto, undefined, 'FAST');
        copia.destroy(); caja.remove();
      }

      /* Desglose anual */
      pdf.addPage();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor.apply(pdf, NAVY); pdf.text('Desglose año por año', M, 56);
      const cab = ['Año', 'Edad', 'Aportación anual', 'Aportado', 'Fondo', 'Fondo (pesos de hoy)'];
      if (r.fiscal) cab.push('Beneficio fiscal reinvertido');
      pdf.autoTable({
        startY: 70, margin: { left: M, right: M, bottom: 96 }, head: [cab],
        body: r.sim.filas.map((f) => {
          const fila = [f.anio, s.edad + f.anio, pesos(f.aporteAnio), pesos(f.aportado), pesos(f.nominal), pesos(f.real)];
          if (r.fiscal) fila.push(pesos(f.fiscal || 0));
          return fila;
        }),
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, halign: 'right', textColor: NAVY },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'right' },
        alternateRowStyles: { fillColor: [247, 245, 243] },
        columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' } }
      });

      /* Pie en todas las páginas */
      const legal = 'Simulación informativa basada en supuestos seleccionados: rendimiento de ' + Math.round(s.rendimiento * 100) +
        '% anual bruto, inflación de ' + +(s.inflacion * 100).toFixed(1) + '% anual y fondo repartido hasta los ' + PRODUCTO.edadVida +
        ' años. Los resultados son estimaciones, no garantizan rendimientos ni sustituyen una propuesta contractual, asesoría fiscal o evaluación de perfil. ' +
        'Inflación, costos, retiros, impuestos y comportamiento del mercado pueden modificar el resultado. La cotización formal la emite la aseguradora.';
      const H = pdf.internal.pageSize.getHeight();
      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setDrawColor(228, 226, 222); pdf.line(M, H - 84, W - M, H - 84);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor.apply(pdf, GRIS);
        pdf.text(pdf.splitTextToSize(legal, W - M * 2), M, H - 70);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor.apply(pdf, NAVY);
        pdf.text('Guadalupe F. Godínez · GFG Finanzas · WhatsApp ' + (CFG.whatsapp || '').replace(/^52(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3'), M, H - 26);
        pdf.setFont('helvetica', 'normal'); pdf.text(p + ' / ' + total, W - M, H - 26, { align: 'right' });
      }

      const limpio = (s.nombre || 'retiro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      pdf.save('cotizacion-gfg-' + (limpio || 'retiro') + '.pdf');
      GFG.track && GFG.track('quote_pdf');
      aviso('PDF descargado'); setTimeout(() => confirmar(boton, 'fas fa-check'), 0);
    } catch (e) {
      aviso('No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.');
    } finally {
      boton.disabled = false; boton.classList.remove('is-loading');
    }
  }

  /* ---------------------------------------------------------- arranque */
  function iniciar() {
    if (!$('cz-app')) return;

    /* Supuestos por defecto, desde la configuración del sitio */
    const esc = CFG.escenarios || { conservador: 0.06, medio: 0.08, crecimiento: 0.10 };
    ['conservador', 'medio', 'crecimiento'].forEach((k) => {
      const inp = $('cz-tasa-' + k);
      if (!inp) return;
      inp.value = String(esc[k]);
      texto('cz-tasa-' + k + '-val', Math.round(esc[k] * 100) + '%');
    });
    $('cz-inflacion').value = +((CFG.inflacion || 0.04) * 100).toFixed(1);
    opcionesExtra();

    /* Montos con separador de miles mientras se escribe */
    document.querySelectorAll('[data-cz-dinero]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const d = inp.value.replace(/\D/g, '').slice(0, 10);
        inp.value = d ? Number(d).toLocaleString('es-MX') : '';
      });
    });

    /* Recalcular en vivo */
    let espera, iniciado = false, completado = false, reposo;
    const recalcular = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        pintar();
        if (!iniciado) { iniciado = true; GFG.track && GFG.track('calculator_start', { calculadora: 'cotizador' }); }
        clearTimeout(reposo);
        if (!completado && ultimo && ultimo.r.ok && ultimo.r.hayAporte) {
          reposo = setTimeout(() => { completado = true; GFG.track && GFG.track('calculator_complete', { calculadora: 'cotizador' }); }, 3000);
        }
      }, 120);
    };
    $('cz-form').addEventListener('input', recalcular);
    $('cz-form').addEventListener('change', recalcular);
    $('cz-form').addEventListener('submit', (e) => e.preventDefault());
    /* Controles ligados al formulario pero dibujados en el resultado (seguro de vida) */
    document.querySelectorAll('[form="cz-form"]').forEach((el) => el.addEventListener('change', recalcular));
    $('cz-plazo').addEventListener('input', () => opcionesExtra());

    $('cz-usar-sugerida').addEventListener('click', () => {
      $('cz-mensual').value = ultimo.r.sugerida.toLocaleString('es-MX');
      pintar();
      aviso('Aportación sugerida aplicada');
    });

    /* Acciones */
    const acciones = {
      pdf: (b) => {
        /* Quien cotiza por su cuenta deja su contacto antes del PDF, una vez por visita. */
        /* Sin destino configurado no se pide nada: no se recaban datos que no van a ningún lado. */
        const hayDestino = !!((CFG.punto25 || {}).url && (CFG.punto25 || {}).clave);
        if (document.body.classList.contains('cz-pro') || contactoDado || !hayDestino) return descargarPdf(b);
        $('cz-c-nombre').value = ultimo.s.nombre;
        ver('cz-c-error', false);
        $('cz-contacto').classList.add('is-on'); $('cz-contacto').setAttribute('aria-hidden', 'false');
        ($('cz-c-nombre').value ? $('cz-c-wa') : $('cz-c-nombre')).focus();
      },
      whatsapp: () => {
        const pro = document.body.classList.contains('cz-pro');
        const { s } = ultimo;
        const url = pro
          ? (s.whatsapp.length === 10 ? 'https://wa.me/52' + s.whatsapp : 'https://wa.me/') + '?text=' + encodeURIComponent(resumen(true))
          : GFG.waLink(resumen(false));
        window.open(url, '_blank', 'noopener');
        if (!pro && GFG.track) GFG.track('whatsapp_click', { ubicacion: 'cotizador' });
      },
      copiar: () => {
        const t = resumen(document.body.classList.contains('cz-pro'));
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
          .then(() => { aviso('Resumen copiado'); confirmar(document.querySelector('[data-cz-accion="copiar"]'), 'fas fa-check'); })
          .catch(() => aviso('No se pudo copiar en este navegador'));
      },
      guardar: () => guardar(),
      vida: () => {
        const { s, r } = ultimo;
        const pro = document.body.classList.contains('cz-pro');
        const cuerpo = (s.genero === 'mujer' ? 'mujer' : 'hombre') + ', ' + s.edad + ' años: ' + pesos2(r.vida.amplia) +
          ' al mes por ' + pesos(r.vida.suma) + ' de suma asegurada (protección amplia) o ' + pesos2(r.vida.maxima) + ' al mes con máximo respaldo.';
        const msg = pro
          ? 'Hola' + (s.nombre ? ' ' + s.nombre.split(' ')[0] : '') + ', además de tu plan de retiro te recomiendo blindarlo con un seguro de vida. Referencia para ' + cuerpo + ' ¿Lo revisamos?'
          : 'Hola Guadalupe, hice mi proyección de retiro y quiero blindar mi inversión con un seguro de vida. Vi esta referencia para ' + cuerpo;
        const url = pro
          ? (s.whatsapp.length === 10 ? 'https://wa.me/52' + s.whatsapp : 'https://wa.me/') + '?text=' + encodeURIComponent(msg)
          : GFG.waLink(msg);
        window.open(url, '_blank', 'noopener');
        GFG.track && GFG.track('vida_interes', { origen: 'cotizador' });
      }
    };
    document.querySelectorAll('[data-cz-accion]').forEach((b) => {
      b.addEventListener('click', () => acciones[b.getAttribute('data-cz-accion')](b));
    });

    $('cz-nueva').addEventListener('click', () => {
      const antes = leer();
      escribir({ tipo: 'no_deducible', modo: 'mensual', retiro: 65, plazo: 20, conIncremento: true, rendimiento: tasaPorDefecto(), inflacion: CFG.inflacion || 0.04 });
      pintar();
      $('cz-nombre').focus();
      aviso('Formulario limpio', { texto: 'Deshacer', hacer: () => { escribir(antes); pintar(); } });
    });

    /* Modo asesora */
    const modo = $('cz-modo-asesora');
    const aplicarModo = (si) => {
      document.body.classList.toggle('cz-pro', si);
      modo.checked = si;
      texto('cz-wa-texto', si ? 'Enviar al cliente' : 'Enviar a Guadalupe');
      texto('cz-vida-cta-texto', si ? 'Recomendar al cliente' : 'Quiero blindar mi inversión');
      if (si) pintarGuardadas();
    };
    aplicarModo(store.get(CLAVE_MODO) === '1');
    modo.addEventListener('change', () => { store.set(CLAVE_MODO, modo.checked ? '1' : '0'); aplicarModo(modo.checked); });

    /* Hoja de contacto previa al PDF */
    const cerrarContacto = () => { $('cz-contacto').classList.remove('is-on'); $('cz-contacto').setAttribute('aria-hidden', 'true'); };
    $('cz-contacto-fondo').addEventListener('click', cerrarContacto);
    $('cz-c-cerrar').addEventListener('click', cerrarContacto);
    $('cz-contacto-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = $('cz-c-nombre').value.trim();
      const wa = $('cz-c-wa').value.replace(/\D/g, '');
      const falta = nombre.length < 2 ? 'Escribe tu nombre.' : wa.length !== 10 ? 'Tu WhatsApp debe tener 10 dígitos.'
        : !$('cz-c-ok').checked ? 'Acepta el aviso de privacidad para continuar.' : '';
      ver('cz-c-error', !!falta);
      if (falta) { texto('cz-c-error', falta); return; }
      const trampa = e.target.querySelector('.gfg-hp');
      contactoDado = true;
      if (!$('cz-nombre').value.trim()) { $('cz-nombre').value = nombre; pintar(); }
      cerrarContacto();
      if (!(trampa && trampa.value)) enviarProspecto(nombre, wa, 'Descargó su cotización');
      descargarPdf(document.querySelector('[data-cz-accion="pdf"]'));
    });

    $('cz-abrir-guardadas').addEventListener('click', abrirPanel);
    $('cz-panel-cerrar').addEventListener('click', cerrarPanel);
    $('cz-panel-fondo').addEventListener('click', cerrarPanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarPanel(); cerrarContacto(); } });

    pintar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
