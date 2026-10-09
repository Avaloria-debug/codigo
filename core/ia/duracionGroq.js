/**
 * Fase 6 — Parseo de duraciones que devuelve Groq en headers.
 *
 * `retry-after` viene en segundos ("30"). Los headers
 * `x-ratelimit-reset-requests` / `x-ratelimit-reset-tokens` vienen como
 * cuenta regresiva estilo "2m59.56s", "7.66s", "250ms" o "1h2m3s" —
 * NO como timestamp fijo (ver fase_6_ADENDUM.md, punto 2: eso es lo que
 * llevó a usar ventana móvil de 24h en vez de día calendario).
 */

const PATRON_COMPUESTO = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/;

/**
 * @param {string|null|undefined} valor
 * @returns {number|null} Milisegundos, o null si no se pudo interpretar.
 */
export function parsearDuracionGroq(valor) {
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;

  if (/^\d+(?:\.\d+)?$/.test(texto)) return Math.round(parseFloat(texto) * 1000); // segundos pelados (retry-after)

  const m = PATRON_COMPUESTO.exec(texto);
  if (!m) return null;
  const [, h, min, s, ms] = m;
  if (h == null && min == null && s == null && ms == null) return null;

  const total =
    (h ? parseFloat(h) * 3_600_000 : 0) +
    (min ? parseFloat(min) * 60_000 : 0) +
    (s ? parseFloat(s) * 1000 : 0) +
    (ms ? parseFloat(ms) : 0);
  return Math.round(total);
}
