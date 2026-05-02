/**
 * Spanish strings — promotor-facing messages (Peru).
 * Centralize tất cả UI strings tiếng Tây Ban Nha cho bot WhatsApp.
 *
 * Admin-facing (Telegram alerts, admin commands) giữ tiếng Việt — NOT here.
 *
 * Functions với args (vd START_REPLY_FAIL) được gọi với arg theo thứ tự.
 */

export const ES = {
  // Caption parsing
  EMPTY_CAPTION:
    'Caption vacío. Escribe HELP para ver los keywords y sintaxis de cada campaña.',
  PARSE_ERROR:
    'No se reconoció la sintaxis o la campaña. Escribe HELP para ver los keywords de las campañas activas.',

  // HELP
  HELP_HEADER: '📋 *Guía — Telecom Big Campaign Bot*\n',
  HELP_NO_CAMPAIGNS: 'No hay campañas activas en este momento.',
  HELP_CAMPAIGNS_LABEL: '*Campañas activas + keywords:*\n',
  HELP_START: 'Inicio del día',
  HELP_END: 'Fin del día',
  HELP_FOOTER_NOTE:
    '_El caption debe enviarse JUNTO con la imagen, no como mensaje de texto separado._',
  HELP_FOOTER_STATUS: 'Escribe STATUS para ver las campañas activas.',

  // Idempotency
  DUPLICATE_PROCESSED: 'Este mensaje ya fue procesado anteriormente.',

  // Image quality
  QUALITY_FAIL_FEEDBACK: (reason) =>
    `❌ La imagen no cumple los estándares de calidad: ${reason}. Por favor toma otra con mejor luz/enfoque.`,
  QUALITY_FAIL_REPLY: (reason) =>
    `⚠️ Imagen no aceptable (${reason}). Por favor toma otra.`,

  // Multi-image grouping
  MULTI_IMAGE_ATTACHED: (order, id) =>
    `📎 Imagen #${order} agregada al envío #${id}.`,

  // Throttle
  THROTTLED: (code) =>
    `⏳ Ya recibimos un envío para *${code}* hace poco. Espera un momento y vuelve a enviar.`,

  // Campaign lookup
  NO_TEMPLATE: (code) =>
    `La campaña *${code}* aún no tiene imagen plantilla. Contacta al admin para subir la plantilla.`,
  CAMPAIGN_NOT_FOUND: (code) =>
    `No se encontró la campaña *${code}* activa. Contacta al admin para verificar.`,

  // AI error fallback
  AI_ERROR: (msg) => `Error al evaluar con IA: ${msg}. Reintentaremos.`,

  // End-of-day status (cached path summary)
  STATUS_BOTH_OK: 'AMBAS METAS',
  STATUS_SUBS_OK_IMG_NO: 'SUBS OK, IMG NO',
  STATUS_IMG_OK_SUBS_NO: 'IMG OK, SUBS NO',
  STATUS_NEITHER: 'NINGUNA META',
  END_SUMMARY_TEMPLATE: (code, x, y, pct, score, status, feedback) =>
    `Campaña ${code}: ${x}/${y} subs (${pct}%) | imagen ${score}/100 | ${status}\n\n${feedback}`,

  // GPS out-of-zone
  OUT_OF_ZONE: (km, radius) =>
    `⚠️ GPS lejos de la sucursal HQ ${km} km (máx ${radius} km).`,

  // Start-of-day reply
  START_REPLY_OK: (name, score, feedback, target) =>
    `✅ Imagen de inicio de campaña *${name}* APROBADA (${score}/100).\n` +
    `${feedback}\n\n` +
    `Meta de hoy: ${target} suscriptores. ¡Éxito!`,
  START_REPLY_FAIL: (name, score, issues, feedback, kw, code) =>
    `⚠️ Imagen de inicio de campaña *${name}* NO APROBADA (${score}/100).\n` +
    `Problemas:\n${issues || '(ninguno)'}\n\n` +
    `${feedback}\n\n` +
    `Por favor corrige y reenvía con caption: ${kw} ${code}`,

  // STATUS command
  STATUS_NO_CAMPAIGNS: 'No hay campañas activas en este momento.',
  STATUS_HEADER: '📊 *Campañas activas:*',
  STATUS_LINE: (code, name, target) =>
    `• ${code} — ${name} (meta ${target}/día)`,

  // Text-without-image hint
  TEXT_WITHOUT_IMAGE: (kwStart, kwEnd) =>
    '⚠️ *¡Falta la imagen!*\n\n' +
    'Acabas de escribir un comando como texto.\n' +
    'El sistema requiere que envíes *junto con la imagen*:\n\n' +
    '1. Toca 📎 (adjuntar) → selecciona imagen\n' +
    '2. *Antes de enviar*, escribe el caption debajo:\n' +
    `   \`${kwStart} <código>\` (inicio del día)\n` +
    `   \`${kwEnd} <código> SUBS=<número>\` (fin del día)\n` +
    '3. Envía.\n\n' +
    'El caption debe estar *en el mismo mensaje que la imagen*, no como mensaje separado.',

  // End-of-day summaries (vision.js)
  END_OK: (name, x, y, pct, score) =>
    `✅ ¡Campaña *${name}* CUMPLIÓ la meta hoy!\n` +
    `Suscriptores: ${x}/${y} (${pct}%)\n` +
    `Imagen aprobada (${score}/100). ¡Buen trabajo!`,
  END_SUBS_OK_IMG_NO: (x, y, score, issues) =>
    `⚠️ Suscriptores OK (${x}/${y}) pero la IMAGEN no aprueba (${score}/100).\n` +
    `Problemas: ${issues}\n` +
    `Reenvía una imagen aprobada para cerrar el reporte.`,
  END_IMG_OK_SUBS_NO: (x, y, pct) =>
    `⚠️ Imagen aprobada pero los suscriptores NO CUMPLEN la meta.\n` +
    `Suscriptores: ${x}/${y} (${pct}%)\n` +
    `Reporta el motivo y un plan de recuperación para mañana.`,
  END_NEITHER: (name, x, y, pct, score) =>
    `❌ La campaña ${name} NO CUMPLE ningún criterio.\n` +
    `Suscriptores: ${x}/${y} (${pct}%)\n` +
    `Imagen: ${score}/100\n` +
    `Revisa y reporta en detalle.`,

  // wa.js media errors
  MEDIA_DOWNLOAD_FAIL:
    'No se pudo descargar la imagen de WhatsApp, por favor envíala de nuevo.',
  MEDIA_EMPTY: 'Imagen vacía, por favor envíala de nuevo.',
};
