/**
 * Fase 6 — Cola + control de límites + backoff (doc técnico, sección 5).
 *
 * Diferencias respecto al pseudocódigo original (ver fase_6_ADENDUM.md):
 * - No recibe `estadoMundo`: el RPD ya no depende del día de juego.
 * - Es async, y las llamadas sobre un mismo `registroUso` se serializan
 *   (una a la vez): dos llamadas simultáneas no pueden pasar ambas el
 *   chequeo de cupo antes de que ninguna registre su uso.
 * - Registra los tokens REALES (`usage.total_tokens`) cuando el servidor
 *   los devuelve, y el estimado sólo como fallback. Esto es lo que
 *   permite a Fase 8 calibrar el presupuesto contra el modelo real.
 *
 * Devuelve siempre un objeto (nunca lanza por errores de Groq):
 *   { agotado:false, texto, recortado, tokensUsados }        // éxito
 *   { agotado:true,  texto:null, motivo }                    // sin cupo → mock
 *   { agotado:false, texto:null, error:true, motivo }        // fallo → mock
 */

import { llamarGroq } from './llamarGroq.js';
import { limpiarRespuesta } from './limpiarRespuesta.js';
import { ErrorGroq, ErrorRateLimit } from './errores.js';
import { dormirReal } from './tiempo.js';

const MAX_VUELTAS = 25; // salvaguarda contra loops de espera si un reloj inyectado no avanza

const _colasPorRegistro = new WeakMap();

async function _procesar(mensajes, tokensEstimados, config, registroUso, { fetch, dormir }) {
  const { rpm, rpd, tpm } = config.limites;
  let reintentos429 = 0;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    if (registroUso.agotadoDiario(rpd)) {
      return {
        agotado: true,
        texto: null,
        motivo: 'rpd_agotado',
        msHastaCupoDiario: registroUso.msHastaCupoDiario(rpd),
      };
    }

    const espera = registroUso.msHastaCupoMinuto(tokensEstimados, { rpm, tpm });
    if (espera > 0) {
      await dormir(espera);
      continue;
    }

    try {
      const r = await llamarGroq(mensajes, config, { fetch });
      const tokensReales = Number.isFinite(r.usage?.total_tokens) ? r.usage.total_tokens : null;
      const tokensUsados = tokensReales ?? tokensEstimados;
      registroUso.registrar({ tokens: tokensUsados });

      const limpio = limpiarRespuesta(r.texto, r.finishReason);
      if (!limpio) {
        return { agotado: false, texto: null, error: true, motivo: 'respuesta_vacia', tokensUsados };
      }
      return { agotado: false, texto: limpio.texto, recortado: limpio.recortado, tokensUsados };
    } catch (e) {
      if (e instanceof ErrorRateLimit) {
        reintentos429 += 1;
        if (reintentos429 > config.maxReintentos429) {
          return { agotado: false, texto: null, error: true, motivo: 'rate_limit_persistente' };
        }
        const esperaMs = e.retryAfterMs ?? config.backoffBaseMs * 2 ** (reintentos429 - 1);
        if (esperaMs > config.maxEsperaMs) {
          return { agotado: true, texto: null, motivo: 'rate_limit_espera_excesiva', msHastaCupoDiario: null };
        }
        await dormir(esperaMs);
        continue;
      }
      if (e instanceof ErrorGroq) {
        return { agotado: false, texto: null, error: true, motivo: `error_groq_${e.status}`, detalle: e.message };
      }
      throw e; // bug de programación, no un fallo de Groq: no se esconde
    }
  }

  return { agotado: false, texto: null, error: true, motivo: 'demasiadas_vueltas_de_espera' };
}

/**
 * @param {{role: string, content: string}[]} mensajes
 * @param {number} tokensEstimados - Estimación del peor caso (entrada + max_completion_tokens).
 * @param {ReturnType<import('./configuracionGroq.js').crearConfiguracionGroq>} config
 * @param {ReturnType<import('./registroUso.js').crearRegistroUso>} registroUso
 * @param {{ fetch?: typeof fetch, dormir?: (ms: number) => Promise<void> }} [opciones]
 */
export function encolarLlamadaGroq(mensajes, tokensEstimados, config, registroUso, opciones = {}) {
  const deps = { fetch: opciones.fetch ?? globalThis.fetch, dormir: opciones.dormir ?? dormirReal };
  const previa = _colasPorRegistro.get(registroUso) ?? Promise.resolve();
  const actual = previa.then(() => _procesar(mensajes, tokensEstimados, config, registroUso, deps));
  _colasPorRegistro.set(registroUso, actual.catch(() => {}));
  return actual;
}
