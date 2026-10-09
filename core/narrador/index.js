/**
 * Fase 5 — Punto de entrada único al narrador por código.
 * Uso: import { resolverAccion, narrarAccionResuelta } from '../narrador/index.js';
 */

export { resolverAccion } from './resolverAccion.js';
export {
  registroProbabilidadBase,
  PROBABILIDAD_BASE_USAR,
  MODIFICADOR_POR_CATEGORIA_RELACION,
  MODIFICADOR_POR_CONFIABILIDAD,
  probabilidadBase,
  modificadorPorRelacion,
  modificadorPorConfiabilidad,
  clampProbabilidad,
} from './probabilidades.js';
export { registroPlantillasPorDefecto, plantillaIdPara } from './plantillas.js';
export { seleccionarVariante } from './seleccionarVariante.js';
export { sustituirPlaceholders, narrarAccionResuelta } from './narrar.js';
