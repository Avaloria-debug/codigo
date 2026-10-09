/**
 * Fase 5 — Sustitución de placeholders y orquestación
 * plantilla→texto. Ver doc técnico Fase 5, sección 3.1 (placeholders
 * soportados) y sección 4 (caso desglosado).
 */

import { registroPlantillasPorDefecto, plantillaIdPara } from './plantillas.js';
import { seleccionarVariante } from './seleccionarVariante.js';

/**
 * Sustitución simple de texto (doc técnico, 3.1): `{jugador}`,
 * `{npc}`, `{lugar}`, `{objeto}`, o cualquier otra clave presente en
 * `contexto`. Un placeholder sin valor en el contexto se reporta y se
 * deja vacío — no rompe el texto, mismo criterio "reportar, no fallar
 * en silencio" del resto del proyecto.
 *
 * @param {string} texto
 * @param {Record<string, string>} [contexto]
 * @returns {string}
 */
export function sustituirPlaceholders(texto, contexto = {}) {
  return texto.replace(/\{(\w+)\}/g, (coincidencia, clave) => {
    if (contexto[clave] == null) {
      console.warn(`sustituirPlaceholders: placeholder '{${clave}}' sin valor en el contexto — se deja vacío.`);
      return '';
    }
    return contexto[clave];
  });
}

/**
 * Helper de conveniencia: de un `AccionResuelta` (sección 0.1, Fase
 * 4) a texto narrado final. No es parte del pseudocódigo original —
 * junta `plantillaIdPara` + `seleccionarVariante` +
 * `sustituirPlaceholders`, que el doc técnico usa en secuencia en el
 * caso desglosado de la sección 4 pero sin nombrarlas como una sola
 * función. `resolverAccion` sigue devolviendo el `AccionResuelta`
 * puro (contrato ya fijado por Fase 4) — esto es un paso aparte, no
 * agrega nada a esa firma.
 *
 * `memoria`/`K`/`generadorAleatorio` sin especificar viajan como
 * `undefined` hasta `seleccionarVariante`, que aplica sus propios
 * defaults (memoria de módulo persistente entre llamadas, K=2,
 * Math.random) — así una secuencia de llamadas sin memoria explícita
 * sigue evitando repeticiones entre sí, en vez de "olvidar" en cada
 * llamada por un default `{}` fresco acá.
 *
 * @param {{verboId: string, resultado: "exito"|"fallo"|"neutral"}} accionResuelta
 * @param {Record<string, string>} [contexto] - Valores para los placeholders de la variante elegida.
 * @param {{registroPlantillas?: Record<string, string[]>, memoria?: Record<string, number[]>, K?: number, generadorAleatorio?: () => number}} [opciones]
 * @returns {string}
 */
export function narrarAccionResuelta(accionResuelta, contexto = {}, opciones = {}) {
  const { registroPlantillas = registroPlantillasPorDefecto, memoria, K, generadorAleatorio } = opciones;
  const plantillaId = plantillaIdPara(accionResuelta.verboId, accionResuelta.resultado);
  const variante = seleccionarVariante(plantillaId, registroPlantillas, memoria, K, generadorAleatorio);
  return sustituirPlaceholders(variante, contexto);
}
