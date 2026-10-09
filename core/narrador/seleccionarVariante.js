/**
 * Fase 5 — Selección de variante con memoria anti-repetición. Ver doc
 * técnico Fase 5, sección 3.3.
 *
 * `memoria` default es un objeto de módulo (mismo criterio que el
 * pseudocódigo original) para que el uso "normal" en una sola partida
 * no tenga que pasar el parámetro a mano. Los tests SIEMPRE pasan su
 * propia `memoria = {}` fresca para no interferir entre sí — mismo
 * motivo por el que `_ejesPorNpcId` en Fase 4 vive dentro del closure
 * del motor y no a nivel de módulo.
 *
 * `generadorAleatorio` es una extensión respecto al pseudocódigo
 * original (que no lo pedía) — se agrega por consistencia con
 * `resolverAccion` y para que el criterio de "hecho" de la sección 8
 * ("verificado con al menos 10 selecciones consecutivas") se pueda
 * probar de forma determinista en vez de depender de Math.random()
 * real. Parámetro nuevo al final, con default — no rompe ninguna
 * firma existente.
 */

const memoriaVariantesPorDefecto = {};

/**
 * @param {string} plantillaId
 * @param {Record<string, string[]>} registroPlantillas
 * @param {Record<string, number[]>} [memoria]
 * @param {number} [K] - Cuántos índices recientes recordar (default 2, doc técnico 3.3).
 * @param {() => number} [generadorAleatorio]
 * @returns {string}
 */
export function seleccionarVariante(
  plantillaId,
  registroPlantillas,
  memoria = memoriaVariantesPorDefecto,
  K = 2,
  generadorAleatorio = Math.random
) {
  const variantes = registroPlantillas[plantillaId];

  if (!variantes || variantes.length === 0) {
    console.warn(`seleccionarVariante: plantilla no registrada: '${plantillaId}'.`);
    return 'Algo sucede.';
  }

  const usadosRecientes = memoria[plantillaId] ?? [];
  let candidatos = variantes.map((_, i) => i).filter((i) => !usadosRecientes.includes(i));

  if (candidatos.length === 0) {
    // Todas las variantes disponibles ya se usaron en las últimas K
    // veces — se resetea en vez de bloquear la selección (doc técnico
    // 3.3). Con 1 sola variante esto pasa siempre a partir de la
    // segunda llamada: se repite la misma, sin romper (caso límite,
    // sección 5).
    candidatos = variantes.map((_, i) => i);
  }

  const elegido = candidatos[Math.floor(generadorAleatorio() * candidatos.length)];
  memoria[plantillaId] = [...usadosRecientes, elegido].slice(-K);

  return variantes[elegido];
}
