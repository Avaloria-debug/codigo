/**
 * Fase 6 — Cliente HTTP de Groq (doc técnico, sección 4). Una sola
 * llamada, sin cola ni reintentos: eso vive en encolarLlamadaGroq.js.
 *
 * `fetch` es inyectable (default: globalThis.fetch) para poder testear
 * sin red — mismo patrón que `generadorAleatorio` en Fase 5.
 *
 * Usa `max_completion_tokens` (el `max_tokens` del doc original está
 * deprecado en la API de Groq).
 */

import { ErrorGroq, ErrorRateLimit } from './errores.js';
import { parsearDuracionGroq } from './duracionGroq.js';

function leerHeader(headers, nombre) {
  return headers?.get?.(nombre) ?? null;
}

/**
 * Espera sugerida por el servidor: `retry-after` (segundos) si existe;
 * si no, el mayor entre los headers x-ratelimit-reset-* (cuenta
 * regresiva). null si no hay nada usable.
 */
export function esperaSugeridaPor429(headers) {
  const retryAfter = parsearDuracionGroq(leerHeader(headers, 'retry-after'));
  if (retryAfter != null) return retryAfter;
  const candidatos = ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']
    .map((h) => parsearDuracionGroq(leerHeader(headers, h)))
    .filter((v) => v != null);
  return candidatos.length > 0 ? Math.max(...candidatos) : null;
}

async function leerCuerpo(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

/**
 * @param {{role: string, content: string}[]} mensajes
 * @param {ReturnType<import('./configuracionGroq.js').crearConfiguracionGroq>} config
 * @param {{ fetch?: typeof fetch }} [opciones]
 * @returns {Promise<{ texto: string|null, finishReason: string|null, usage: object|null }>}
 * @throws {ErrorRateLimit} en 429.
 * @throws {ErrorGroq} en cualquier otro fallo (status no OK, red, JSON inválido).
 */
export async function llamarGroq(mensajes, config, { fetch: fetchFn = globalThis.fetch } = {}) {
  const body = {
    model: config.modelo,
    messages: mensajes,
    max_completion_tokens: config.maxCompletionTokens,
    temperature: config.temperatura,
  };
  if (config.reasoningEffort != null) {
    body.reasoning_effort = config.reasoningEffort;
    body.include_reasoning = config.includeReasoning;
  }

  let resp;
  try {
    resp = await fetchFn(config.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ErrorGroq(0, '', `Error de red al llamar a Groq: ${e?.message ?? e}`);
  }

  if (resp.status === 429) {
    throw new ErrorRateLimit(esperaSugeridaPor429(resp.headers), await leerCuerpo(resp));
  }
  if (!resp.ok) {
    throw new ErrorGroq(resp.status, await leerCuerpo(resp));
  }

  let json;
  try {
    json = await resp.json();
  } catch {
    throw new ErrorGroq(resp.status, '', 'Groq devolvió una respuesta que no es JSON válido.');
  }

  const choice = json?.choices?.[0];
  return {
    texto: choice?.message?.content ?? null,
    finishReason: choice?.finish_reason ?? null,
    usage: json?.usage ?? null,
  };
}
