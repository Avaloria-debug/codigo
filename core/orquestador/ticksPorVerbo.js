/**
 * Fase 8 — Cuánto tiempo de juego (ticks, 1 tick = 1 hora) consume cada verbo.
 * Registro de datos inyectable: la próxima excepción es una fila nueva, no un
 * cambio de lógica. `_default` es el costo de cualquier verbo no listado.
 *
 * SUPUESTO MENOR (marcado): sólo Descansar cuesta más que el default.
 * Explorar/Observar/etc. quedan en 1 — es dato de balance, no arquitectura.
 */
export const registroTicksPorVerboPorDefecto = Object.freeze({
  _default: 1,
  Descansar: 8,
});

export function ticksParaVerbo(nombreVerbo, registro = registroTicksPorVerboPorDefecto) {
  const ticks = registro[nombreVerbo] ?? registro._default;
  if (!Number.isInteger(ticks) || ticks <= 0) {
    throw new Error(`ticksParaVerbo: costo inválido para '${nombreVerbo}': ${ticks} (debe ser entero positivo).`);
  }
  return ticks;
}
