/**
 * Fase 6 — Errores tipados del cliente Groq. Permiten que la cola
 * (encolarLlamadaGroq.js) distinga "esperar y reintentar" (429) de
 * "degradar a mock" (todo lo demás) sin parsear mensajes de texto.
 */

export class ErrorGroq extends Error {
  /**
   * @param {number} status - Status HTTP, o 0 si fue un fallo de red (fetch lanzó).
   * @param {string} [cuerpo] - Cuerpo crudo de la respuesta, para debug.
   * @param {string} [mensaje]
   */
  constructor(status, cuerpo = '', mensaje) {
    super(mensaje ?? `Groq respondió con status ${status}`);
    this.name = 'ErrorGroq';
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

export class ErrorRateLimit extends Error {
  /**
   * @param {number|null} retryAfterMs - Espera sugerida por el servidor en ms, o null si no vino header usable.
   * @param {string} [cuerpo]
   */
  constructor(retryAfterMs, cuerpo = '') {
    super('Groq respondió 429 (rate limit).');
    this.name = 'ErrorRateLimit';
    this.retryAfterMs = retryAfterMs;
    this.cuerpo = cuerpo;
  }
}
