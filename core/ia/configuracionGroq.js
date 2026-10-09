/**
 * Fase 6 — Configuración del cliente Groq. Nada hardcodeado en el
 * resto del código: modelo, tope de salida, razonamiento y límites
 * salen todos de acá (documento maestro: "modelo configurable").
 *
 * `reasoningEffort` / `includeReasoning`: `openai/gpt-oss-120b` es un
 * modelo de razonamiento y sus tokens de razonamiento cuentan contra
 * `max_completion_tokens` — con un tope bajo y esfuerzo por defecto
 * (medium) puede gastar todo pensando y devolver contenido vacío. Por
 * eso el default es "low" + no incluir el razonamiento en la respuesta.
 * Si el jugador configura un modelo NO razonador, poner
 * `reasoningEffort: null` — ambos campos se omiten del request (un
 * valor no soportado se rechaza con 400).
 *
 * `limites`: free tier de gpt-oss-120b (documento maestro, sección 1).
 * Son datos, no lógica: otro plan u otro modelo = otro objeto.
 */

export const configuracionGroqPorDefecto = Object.freeze({
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  modelo: 'openai/gpt-oss-120b',
  apiKey: null, // la carga el jugador; el motor no trae ninguna
  maxCompletionTokens: 400,
  temperatura: 0.8,
  reasoningEffort: 'low',
  includeReasoning: false,
  limites: Object.freeze({ rpm: 30, rpd: 1000, tpm: 8000 }),
  maxReintentos429: 3,
  backoffBaseMs: 1000,
  maxEsperaMs: 60_000, // un 429 que pide esperar más que esto se trata como agotado (cae a mock)
});

/**
 * @param {Partial<typeof configuracionGroqPorDefecto>} [overrides]
 */
export function crearConfiguracionGroq(overrides = {}) {
  return {
    ...configuracionGroqPorDefecto,
    ...overrides,
    limites: { ...configuracionGroqPorDefecto.limites, ...(overrides.limites ?? {}) },
  };
}
