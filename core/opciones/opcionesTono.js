/**
 * Fase 3 — Opciones fijas de tono (documento técnico, sección 4.4).
 * Siempre exactamente 3 por verbo, nunca dependen de la escena.
 * Elegir cualquiera abre texto libre con el tono ya fijado
 * (comportamientoAlElegir: "abreTextoLibreConContexto").
 *
 * @type {Record<string, string[]>}
 */
export const opcionesTono = {
  Negociar: [
    'Ofrecer algo de valor a cambio',
    'Apelar a la relación existente',
    'Buscar un punto medio razonable',
  ],
  Presionar: [
    'Amenazar veladamente',
    'Exigir directamente, sin rodeos',
    'Usar información que tenés como ventaja',
  ],
  'Calmar la situación': [
    'Hablar con calma y manos visibles',
    'Ofrecer una disculpa o gesto conciliador',
    'Apelar a la razón, señalando el riesgo mutuo',
  ],
  Distraer: [
    'Generar ruido o movimiento en otro lado',
    'Iniciar una conversación falsa/trivial',
    'Fingir rendición o desinterés',
  ],
};
