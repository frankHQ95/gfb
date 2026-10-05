/* ============================================================
   GFG Finanzas — CONFIGURACIÓN ÚNICA DEL SITIO
   Todo lo que cambia entre "pruebas" y "producción" vive aquí.
   Se edita una vez y aplica a las 6 páginas.
============================================================ */
window.GFG_CONFIG = {
  /* ---- Contacto ---- */
  whatsapp: '527717021729',

  /* ---- Captura de prospectos ----
     Supabase: URL del proyecto y clave pública (anon). La tabla `leads` debe
     tener RLS activo con una política que permita SOLO insertar al rol anon
     (nunca leer). Si el proyecto está pausado o borrado, los formularios
     ofrecen enviar la solicitud por WhatsApp en vez de fingir éxito. */
  supabaseUrl: 'https://waojkmqvyorojgaymnee.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhb2prbXF2eW9yb2pnYXltbmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDYyODMsImV4cCI6MjA5NDE4MjI4M30.HNwmN_fw5_5a2Mmimqlc1s0crCtO9YGX5K0s0ulZNoA',

  /* Opcional: webhook (Make, Zapier, n8n…) que recibe cada prospecto en JSON.
     Sirve para avisarle a Guadalupe al instante. Si se configura, basta con
     que Supabase O el webhook respondan bien para confirmar el envío. */
  leadWebhook: '',

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
