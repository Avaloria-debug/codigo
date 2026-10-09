/**
 * Fase 6 — Armado del prompt (doc técnico, sección 3). Función pura:
 * mismo contexto → mismos mensajes, sin red ni estado.
 *
 * Dos mensajes, sin historial (llamada aislada, decisión del documento
 * maestro). Todo el contenido sale del `contexto` armado por código
 * (ver armarContextoDialogo.js); la IA sólo pone el fraseo.
 */

export const MAX_CONOCIMIENTOS_EN_PROMPT = 3;
export const MAX_CARACTERES_TEXTO_JUGADOR = 300;

const RESULTADO_EN_PROMPT = {
  exito: 'ÉXITO (el intento del jugador funcionó)',
  fallo: 'FALLO (el intento del jugador no funcionó)',
  neutral: 'NEUTRAL (ni éxito ni fallo claro)',
};

/**
 * Texto libre del jugador, higienizado antes de meterlo entre comillas
 * en el prompt: sin saltos de línea, comillas dobles convertidas a
 * simples y largo acotado. Mitigación liviana contra romper el formato
 * del prompt — no es una defensa contra prompt injection (la IA igual
 * no decide hechos ni estado: el resultado ya viene resuelto por código).
 *
 * @param {string|null|undefined} texto
 */
export function limpiarTextoJugador(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CARACTERES_TEXTO_JUGADOR);
}

function valorODesconocido(valor) {
  return valor == null || valor === '' ? 'desconocido' : valor;
}

/**
 * @param {object} contexto - Ver armarContextoDialogo.js para la forma exacta.
 * @param {{ maxConocimientos?: number }} [opciones]
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function armarMensajes(contexto, { maxConocimientos = MAX_CONOCIMIENTOS_EN_PROMPT } = {}) {
  const {
    npc,
    estadoEmocionalProyectado,
    categoriaRelacion,
    escena,
    estadoMundo,
    accionResuelta,
    textoLibreJugador,
    tonoElegido = null,
    conocimientosRevelables = [],
  } = contexto;

  const resultado = RESULTADO_EN_PROMPT[accionResuelta?.resultado] ?? RESULTADO_EN_PROMPT.neutral;

  const system = [
    `Sos ${npc.nombre}, un personaje de un juego de rol de texto. Tu personalidad: ${npc.personalidadBase}`,
    'Reglas estrictas, no negociables:',
    '- Respondés ÚNICAMENTE con lo que decís en voz alta, en primera persona, sin acotaciones de narrador ni asteriscos de acción.',
    `- El resultado de esta interacción ya fue decidido por el juego: ${resultado}. Tu respuesta tiene que ser consistente con ese resultado — no lo contradigas ni lo suavices ni lo mejores.`,
    '- Nunca inventás hechos del mundo, nunca revelás información que no esté en tu lista de "lo que sabés" a continuación, nunca decidís qué pasa después.',
    '- Mantenete en 1-3 oraciones. No repitas lo que dijo el jugador.',
    '- Respondé en español rioplatense, tono coloquial.',
  ].join('\n');

  const conocimientos = conocimientosRevelables.slice(0, maxConocimientos).map((c) => c.contenido);
  const sabes = conocimientos.length > 0 ? conocimientos.join('; ') : 'nada en particular';
  const cierreSabes = /[.!?…]$/.test(sabes) ? '' : '.'; // los `contenido` de Fase 0 suelen traer su propio punto final

  const lineasUser = [
    `Tu estado de ánimo ahora mismo: ${valorODesconocido(estadoEmocionalProyectado)}.`,
    `Tu relación con el jugador: ${valorODesconocido(categoriaRelacion)}.`,
    `Dónde están: ${valorODesconocido(escena?.nombre)}, situación ${valorODesconocido(escena?.estadoCalculado)}, hora ${valorODesconocido(estadoMundo?.horaActual)}, clima ${valorODesconocido(estadoMundo?.climaActual)}.`,
    `Lo que sabés y podés mencionar si viene al caso (no estás obligado a decirlo todo): ${sabes}${cierreSabes}`,
  ];
  if (tonoElegido != null) lineasUser.push(`Tu enfoque en este intercambio fue: ${tonoElegido}.`);
  lineasUser.push(`El jugador te dice: "${limpiarTextoJugador(textoLibreJugador)}"`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lineasUser.join('\n') },
  ];
}
