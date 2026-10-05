/* ============================================================
   GFG Finanzas — CONFIGURACIÓN ÚNICA DEL SITIO
   Todo lo que cambia entre "pruebas" y "producción" vive aquí.
   Se edita una vez y aplica a las 6 páginas.
============================================================ */
window.GFG_CONFIG = {
  /* ---- Contacto ---- */
  whatsapp: '527717021729',

  /* ---- Captura de prospectos ----
     Cada formulario y el cotizador mandan el prospecto a la cartera de
     Guadalupe en Punto25 (su panel de seguimiento). `clave` es la puerta de
     entrada de esa cartera: sólo permite agregar prospectos, no leerlos.
     Se crea o se apaga desde Punto25 (convex/entradas.ts). Si el envío falla,
     el formulario ofrece mandar la solicitud por WhatsApp en vez de fingir éxito. */
  punto25: {
    url: 'https://secret-goldfish-155.convex.site/leads',
    clave: ''
  },

  /* ---- Medición ----
     Vacío = no se carga nada. GA4: 'G-XXXXXXXXXX'. Pixel: solo números. */
  ga4Id: '',
  metaPixelId: '',

  /* ---- Agenda ----
     Link de Calendly / Cal.com / Google Calendar con disponibilidad real.
     Vacío = el botón posterior al formulario lleva a WhatsApp. */
  agendaUrl: '',

  /* ---- Videos ----
     URL de embed (YouTube/Vimeo). Vacío = el recuadro de video no se muestra. */
  videos: { ppr: '', seguros: '' },

  /* ---- Supuestos de los simuladores (revisar cada enero) ---- */
  umaAnual: 42794.64,        // UMA anual vigente — confirmar con el INEGI al inicio de cada año
  inflacion: 0.04,           // inflación anual asumida
  aniosRetiro: 20,           // años que debe durar el capital una vez retirado
  escenarios: {              // tasas brutas anuales ilustrativas, antes de costos del producto
    conservador: 0.06,
    medio: 0.08,
    crecimiento: 0.10
  }
};
