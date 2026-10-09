/**
 * Fase 2 — Sistema de Comprensión del Mundo (estados de escena).
 * Ver doc técnico Fase 2, secciones 2 y 4.
 *
 * Aclaración de firma heredada del propio documento (sección 3), remarcada
 * acá porque es la forma más común de romper esto en la integración:
 * `eventosActivos` SIEMPRE es el array de objetos `Evento` completos que
 * devuelve `motorEventos.listarEventosActivos(escena.id)` (Fase 1) — nunca
 * `escena.eventosActivos` (array de IDs crudo, Fase 0). Esta función no
 * hace esa resolución por su cuenta a propósito: no depende de un motor de
 * eventos concreto, sólo de la forma del array que recibe.
 *
 * Decisión de diseño tomada en el chat (no está en la versión original del
 * documento técnico — ver NOTAS_FASE_2.md para el detalle completo):
 * `calcularEstadoEscena` devuelve `{ estado, reportes }` en vez de sólo el
 * string `estado` que muestra el pseudocódigo de la sección 4. Motivo:
 * mismo patrón que `validarEstructura`/`validarReferencias` de Fase 0
 * (`{ valido, errores }`), elegido por la misma razón que ahí — la sección
 * 7 de este documento pide explícitamente que el panel de Fase 8 pueda
 * mostrar los reportes de "tipo de evento no categorizado" de forma
 * visible, no sólo en consola, y un string plano no tiene dónde llevarse
 * ese dato. Dos formas distintas de reportar inconsistencias en el mismo
 * motor (una con objeto, otra con callback) sería peor para mantenimiento
 * que una sola forma consistente.
 *
 * CONTRATO CON FASE 0 — LEER ANTES DE INTEGRAR: `Escena.estadoCalculado`
 * (Fase 0, sección 3.4) es `string | null`, NO un objeto. `validarEstructura`
 * rechaza cualquier otra cosa ahí. Como esta función ahora devuelve un
 * objeto, quien orqueste el resultado tiene que asignar el campo `.estado`,
 * no el objeto completo:
 *
 *   escena.estadoCalculado = calcularEstadoEscena(escena, eventosActivos, estadoMundo).estado; // OK
 *   escena.estadoCalculado = calcularEstadoEscena(escena, eventosActivos, estadoMundo);         // MAL — rompe validarEstructura
 *
 * `actualizarEstadoCalculado` (más abajo) hace esa asignación por vos y
 * devuelve igual el resultado completo — es la forma recomendada de
 * integrar esto en vez de llamar a `calcularEstadoEscena` directo y
 * asignar a mano.
 */

import { registroCategoriasEventoPorDefecto } from './registroCategoriasEvento.js';

/**
 * Lista cerrada de estados de escena (doc técnico, sección 2), con su
 * prioridad de desempate. Mayor número gana en caso de empate exacto de
 * puntaje entre dos o más categorías.
 */
export const ESTADOS_DE_ESCENA = [
  { estado: 'combate', prioridadDesempate: 6 },
  { estado: 'peligroso', prioridadDesempate: 5 },
  { estado: 'sigilo', prioridadDesempate: 4 },
  { estado: 'tenso', prioridadDesempate: 3 },
  { estado: 'social', prioridadDesempate: 2 },
  { estado: 'tranquilo', prioridadDesempate: 1 },
];

/**
 * Rango nocturno: 20hs a 6hs, cruzando medianoche. Trampa de implementación
 * explícita en el doc técnico (sección 4): con `&&` esto nunca es
 * verdadero. Tiene que ser `||`.
 * @param {number} horaActual - 0 a 23.
 */
export function esNocturno(horaActual) {
  return horaActual >= 20 || horaActual <= 6;
}

function _fallback(escena) {
  return (escena.npcsPresentes?.length ?? 0) > 0 ? 'social' : 'tranquilo';
}

/**
 * @typedef {Object} ResultadoCalculoEstado
 * @property {string} estado - Uno de ESTADOS_DE_ESCENA. Nunca null/undefined/fuera de la lista.
 * @property {string[]} reportes - Inconsistencias detectadas durante el cálculo (ej. tipos de
 *   evento sin categorizar en el registro). Vacío si no hubo ninguna. Nunca detiene el cálculo.
 */

/**
 * Calcula el estado de una escena a partir de sus eventos activos.
 * Función pura: no muta `escena` ni `eventosActivos`. Determinística.
 *
 * @param {import('../modelos/escena.js').Escena} escena
 * @param {import('../modelos/evento.js').Evento[]} eventosActivos - Ver aclaración de firma arriba.
 * @param {import('../modelos/estadoDelMundo.js').EstadoDelMundo} estadoMundo
 * @param {Object<string, {categoriaEstado: string, intensidad: number, modificadorNocturno?: number}>} [registro]
 * @returns {ResultadoCalculoEstado}
 */
export function calcularEstadoEscena(
  escena,
  eventosActivos,
  estadoMundo,
  registro = registroCategoriasEventoPorDefecto
) {
  const reportes = [];

  if (!eventosActivos || eventosActivos.length === 0) {
    return { estado: _fallback(escena), reportes };
  }

  const puntajesPorCategoria = Object.fromEntries(ESTADOS_DE_ESCENA.map((e) => [e.estado, 0]));

  for (const evento of eventosActivos) {
    const entrada = registro[evento.tipo];

    if (!entrada) {
      reportes.push(`Tipo de evento sin categorización en el registro: '${evento.tipo}' (evento '${evento.id}').`);
      continue; // no rompe el cálculo — mismo criterio que Fase 1: reportar, no fallar en silencio.
    }

    let intensidadEfectiva = entrada.intensidad;
    if (entrada.modificadorNocturno !== undefined && esNocturno(estadoMundo.horaActual)) {
      intensidadEfectiva *= entrada.modificadorNocturno;
    }

    puntajesPorCategoria[entrada.categoriaEstado] += intensidadEfectiva;
  }

  const puntajeMaximo = Math.max(...Object.values(puntajesPorCategoria));

  // Todos los eventos activos eran de tipos no registrados (o el array,
  // por alguna razón, no sumó nada): mismo fallback que "sin eventos".
  if (puntajeMaximo === 0) {
    return { estado: _fallback(escena), reportes };
  }

  const categoriasGanadoras = Object.entries(puntajesPorCategoria)
    .filter(([, puntaje]) => puntaje === puntajeMaximo)
    .map(([categoria]) => categoria);

  const estado =
    categoriasGanadoras.length === 1
      ? categoriasGanadoras[0]
      : ESTADOS_DE_ESCENA.filter((e) => categoriasGanadoras.includes(e.estado)).sort(
          (a, b) => b.prioridadDesempate - a.prioridadDesempate
        )[0].estado;

  return { estado, reportes };
}

/**
 * Calcula el estado y lo asigna a `escena.estadoCalculado` correctamente
 * (el string, no el objeto — ver "CONTRATO CON FASE 0" arriba). Forma
 * recomendada de integrar este cálculo contra una Escena real; devuelve
 * el resultado completo por si quien llama también necesita `reportes`.
 *
 * @param {import('../modelos/escena.js').Escena} escena - Se muta: se le asigna `estadoCalculado`.
 * @param {import('../modelos/evento.js').Evento[]} eventosActivos
 * @param {import('../modelos/estadoDelMundo.js').EstadoDelMundo} estadoMundo
 * @param {Object} [registro]
 * @returns {ResultadoCalculoEstado}
 */
export function actualizarEstadoCalculado(
  escena,
  eventosActivos,
  estadoMundo,
  registro = registroCategoriasEventoPorDefecto
) {
  const resultado = calcularEstadoEscena(escena, eventosActivos, estadoMundo, registro);
  escena.estadoCalculado = resultado.estado;
  return resultado;
}
