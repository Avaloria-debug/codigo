/**
 * Fase 2 — Registro de categorización de tipos de Evento.
 * Ver doc técnico Fase 2, sección 3. Diccionario:
 *   tipo -> { categoriaEstado, intensidad, modificadorNocturno? }
 *
 * Mismo principio que evaluadoresExpiracion.js / evaluadoresResolucion.js
 * (Fase 1): esto es un registro de referencia para el cascarón, no una
 * lista cerrada. El lore real agrega o reemplaza entradas armando su
 * propio objeto (spread sobre este) y pasándolo como `registro` a
 * calcularEstadoEscena — no hace falta tocar el motor ni este archivo.
 *
 * Nota de nomenclatura (no es una inconsistencia real, se deja anotada
 * por transparencia): estos 6 tipos son los que documenta Fase 2
 * explícitamente en su tabla de la sección 3.
 *   - `amenaza_npc_hostil` y `vigilancia_activa` no existen en ningún
 *     fixture ni test de Fase 1 — se introducen recién acá, para poder
 *     ilustrar "peligroso" con modificador nocturno y "sigilo" (ningún
 *     tipo de la Fase 1 mapeaba a esas dos categorías).
 *   - `emboscada_activa` no coincide letra por letra con el nombre que
 *     usó Fase 1 en sus propios tests (ahí es `emboscada`, sin sufijo).
 *     No hay contrato de valores de `tipo` entre fases — es campo libre
 *     (Fase 0, sección 3.5) — así que esto no rompe nada; son dos fases
 *     que nombraron el mismo concepto de forma distinta en sus propios
 *     datos de prueba.
 */
export const registroCategoriasEventoPorDefecto = {
  disputa_publica: { categoriaEstado: 'tenso', intensidad: 40 },
  incendio: { categoriaEstado: 'peligroso', intensidad: 60 },
  emboscada_activa: { categoriaEstado: 'combate', intensidad: 90 },
  tormenta_local: { categoriaEstado: 'tranquilo', intensidad: 10 },
  amenaza_npc_hostil: { categoriaEstado: 'peligroso', intensidad: 70, modificadorNocturno: 1.2 },
  vigilancia_activa: { categoriaEstado: 'sigilo', intensidad: 50, modificadorNocturno: 1.1 },
};
