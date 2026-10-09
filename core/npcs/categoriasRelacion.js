/**
 * Fase 4 — Categorías de relacion.valor (doc técnico, sección 3) y
 * regla de moderación en los extremos (sección 4.1, última nota).
 *
 * Nota sobre el "efecto práctico" de la sección 3 (Hostil no revela
 * nada, Desconfiado sólo revela por debajo de cierto umbral): eso es
 * descriptivo, no una regla aparte. `conocimientosRevelables.js`
 * implementa literalmente el algoritmo de la sección 5
 * (`relacion.valor >= umbralRelacion`), sin invocar categoría alguna
 * — mismo criterio que el pseudocódigo original. Ambos coinciden
 * mientras `umbralRelacion` sea siempre >= 0 (así es en todo el
 * dataset ficticio de Fase 0). Si algún día el lore real define un
 * `umbralRelacion` negativo, la garantía "Hostil nunca revela nada"
 * de la sección 3 dejaría de cumplirse automáticamente por el
 * algoritmo de la sección 5 — se deja anotado acá, no se agrega un
 * gate adicional por categoría que el doc técnico no pide.
 */

export const CATEGORIAS_RELACION = [
  { categoria: 'Hostil', min: -100, max: -60 },
  { categoria: 'Desconfiado', min: -59, max: -20 },
  { categoria: 'Neutral', min: -19, max: 19 },
  { categoria: 'Cordial', min: 20, max: 59 },
  { categoria: 'Aliado', min: 60, max: 100 },
];

/**
 * @param {number} valor - Se asume ya clampeado a [-100, 100]
 *   (`clampRelacion`); si llegara fuera de rango por algún camino no
 *   contemplado, satura a la categoría del extremo más cercano en vez
 *   de devolver undefined.
 */
export function categoriaDeRelacion(valor) {
  if (valor < -100) return 'Hostil';
  if (valor > 100) return 'Aliado';
  return CATEGORIAS_RELACION.find((c) => valor >= c.min && valor <= c.max).categoria;
}

export function clampRelacion(valor) {
  return Math.min(100, Math.max(-100, valor));
}

/**
 * Regla de moderación en los extremos (doc técnico, sección 4.1,
 * última nota): aplica SÓLO a relacion.valor. El doc lo dice
 * explícito — "no a los ejes de corto plazo" — así que
 * nivelTemor/nivelDisposicion nunca pasan por acá.
 *
 * @param {number} deltaNominal - Delta antes de moderar.
 * @param {number} valorActual - relacion.valor ANTES de este delta.
 */
export function moderarDelta(deltaNominal, valorActual) {
  const categoria = categoriaDeRelacion(valorActual);
  if (deltaNominal > 0 && categoria === 'Aliado') return deltaNominal / 2;
  if (deltaNominal < 0 && categoria === 'Hostil') return deltaNominal / 2;
  return deltaNominal;
}
