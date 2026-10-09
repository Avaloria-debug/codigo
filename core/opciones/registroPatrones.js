/**
 * Fase 3 — Patrón de generación de Nivel 2 por nombre de verbo
 * (documento técnico, sección 4.2). Sólo aplica a verbos con
 * tipoResolucion "concrecion" — los "inmediata" nunca llegan a
 * generarOpcionesNivel2 (sección 4.2, nota final).
 *
 * Punto de extensión para lore real: un verbo nuevo de tono
 * (Sobornar, Intimidar, Engañar) se agrega acá con patrón "tono" +
 * su entrada correspondiente en opcionesTono.js, sin tocar
 * generarOpcionesNivel2.
 *
 * @type {Record<string, "salidas"|"cobertura"|"objetos"|"tono">}
 */
export const registroPatrones = {
  Huir: 'salidas',
  Retirarse: 'salidas',
  Abortar: 'salidas',
  Emboscar: 'cobertura',
  Ocultarse: 'cobertura',
  Atacar: 'objetos',
  Defender: 'objetos',
  Negociar: 'tono',
  Presionar: 'tono',
  'Calmar la situación': 'tono',
  Distraer: 'tono',
};
