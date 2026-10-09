/**
 * Fase 6 — Registro de uso para vigilar los tres límites de Groq
 * (RPM, TPM, RPD). Decisión (fase_6_ADENDUM.md, punto 2): TODO con
 * ventanas móviles sobre timestamps reales, nunca contra un string de
 * fecha ni contra `estadoMundo.diaActual` (que es tiempo de juego).
 *
 * - RPM / TPM: ventana móvil de 60s.
 * - RPD: ventana móvil de 24h — cada llamada libera su cupo 24h
 *   después de hacerse. Groq expone los resets como cuenta regresiva
 *   ("2m59.56s"), no como medianoche fija.
 *
 * Un único array de `{ t, tokens }` alimenta las tres ventanas. Es
 * serializable a JSON (con timestamps reales sobrevive a recargar la
 * página); Fase 7 decide si lo persiste — acá sólo vive en memoria.
 *
 * Los límites no se guardan acá: se pasan en cada consulta (vienen de
 * la configuración, que puede cambiar de plan/modelo).
 */

import { relojReal } from './tiempo.js';

export const VENTANA_MINUTO_MS = 60_000;
export const VENTANA_DIA_MS = 86_400_000;

/**
 * @param {object} [config]
 * @param {() => number} [config.reloj] - ms epoch; inyectable.
 * @param {{ llamadas: {t: number, tokens: number}[] }} [config.estadoInicial] - Salida previa de `serializar()`.
 */
export function crearRegistroUso({ reloj = relojReal, estadoInicial = null } = {}) {
  let _llamadas = Array.isArray(estadoInicial?.llamadas)
    ? estadoInicial.llamadas
        .filter((l) => Number.isFinite(l?.t) && Number.isFinite(l?.tokens))
        .map((l) => ({ t: l.t, tokens: l.tokens }))
        .sort((a, b) => a.t - b.t)
    : [];

  function ahora() {
    return reloj();
  }

  function purgar() {
    const limite = ahora() - VENTANA_DIA_MS;
    _llamadas = _llamadas.filter((l) => l.t > limite);
  }

  function _enVentana(ventanaMs) {
    const t0 = ahora();
    return _llamadas.filter((l) => t0 - l.t < ventanaMs);
  }

  function registrar({ tokens }) {
    _llamadas.push({ t: ahora(), tokens });
  }

  /**
   * Cuánto esperar (ms) para que entre una llamada nueva de
   * `tokensEstimados` sin pasar RPM ni TPM. 0 = puede ir ya.
   * Si `tokensEstimados` solo ya supera el TPM, el chequeo de tokens se
   * saltea (esperar no lo arreglaría nunca) y decide el servidor.
   */
  function msHastaCupoMinuto(tokensEstimados, { rpm, tpm }) {
    purgar();
    const t0 = ahora();
    const enMin = _enVentana(VENTANA_MINUTO_MS);
    let conteo = enMin.length;
    let tokens = enMin.reduce((acc, l) => acc + l.tokens, 0);
    const chequearTokens = tokensEstimados <= tpm;

    let espera = 0;
    let i = 0;
    while ((conteo >= rpm || (chequearTokens && tokens + tokensEstimados > tpm)) && i < enMin.length) {
      espera = enMin[i].t + VENTANA_MINUTO_MS - t0;
      conteo -= 1;
      tokens -= enMin[i].tokens;
      i += 1;
    }
    return Math.max(0, espera);
  }

  function agotadoDiario(rpd) {
    purgar();
    return _llamadas.length >= rpd;
  }

  /** ms hasta que se libere un cupo diario; 0 si no está agotado. */
  function msHastaCupoDiario(rpd) {
    purgar();
    if (_llamadas.length < rpd) return 0;
    return Math.max(0, _llamadas[_llamadas.length - rpd].t + VENTANA_DIA_MS - ahora());
  }

  /** Para el panel de testing de Fase 8. */
  function resumen() {
    purgar();
    const enMin = _enVentana(VENTANA_MINUTO_MS);
    return {
      llamadasUltimoMinuto: enMin.length,
      tokensUltimoMinuto: enMin.reduce((acc, l) => acc + l.tokens, 0),
      llamadasUltimas24h: _llamadas.length,
    };
  }

  function serializar() {
    purgar();
    return { llamadas: _llamadas.map((l) => ({ ...l })) };
  }

  return { ahora, purgar, registrar, msHastaCupoMinuto, agotadoDiario, msHastaCupoDiario, resumen, serializar };
}
