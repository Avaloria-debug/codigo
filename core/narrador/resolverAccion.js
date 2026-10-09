/**
 * Fase 5 — Motor de resolución de acciones. Ver doc técnico Fase 5,
 * secciones 2.1-2.4, y fase_5_ADENDUM.md, sección 2 (correcciones de
 * contrato respecto al documento original).
 *
 * Cierra el contrato pendiente de Fase 4 (doc técnico Fase 4, sección
 * 0.1): produce el `AccionResuelta` que consume
 * `motorNPCs.procesarAccionResuelta`. La forma devuelta acá coincide
 * exactamente con lo que ese motor ya espera — no se envuelve en
 * `{ accionResuelta, reportes }` (a diferencia de
 * `validarEstructura`/`calcularEstadoEscena`) porque ese consumidor
 * ya existe, ya está probado, y espera el objeto plano. Cualquier
 * inconsistencia interna (verbo sin probabilidad registrada) se
 * reporta por `console.warn`, mismo criterio que usó Fase 3 en el
 * `default` de `generarOpcionesNivel2` para su propio caso
 * teóricamente inalcanzable.
 *
 * CONTRATO DE `verbo` — corrección respecto al documento original
 * (que usaba `verbo.id`, campo que no existe en ningún lado del
 * código real; ver fase_5_ADENDUM.md sección 1):
 *   { nombre: string, tipoResolucion: "concrecion"|"inmediata"|"textoLibre", objetoObjetivo?: string }
 * `nombre` es el nombre canónico del verbo tal como lo usan
 * registroVerbosPorEstado.js / registroPatrones.js / Fase 4
 * (registroTransicionesPorVerbo.js) — p.ej. "Atacar", "Huir", "Usar",
 * "Hablar con..." — NUNCA la etiqueta interpolada con nombre de NPC u
 * objeto que devuelve generarOpcionesNivel1 (esa función no expone
 * ningún campo de identidad estable; quien orqueste tiene que
 * reconstruir `verbo` con el nombre canónico, igual que ya hacen los
 * propios tests de Fase 3 para llamar a generarOpcionesNivel2).
 * `objetoObjetivo` sólo aplica al verbo "Usar" cuando Fase 3 lo
 * resolvió en Nivel 1 (`tipoResolucion: "inmediata"`, exactamente 1
 * objeto usable) — ahí no hay Nivel 2 del que sacarlo.
 *
 * CONTRATO DE `opcionNivel2`: lo que devuelve `generarOpcionesNivel2`
 * tal cual (Fase 3) — `{ etiqueta, riesgosa?, objetoObjetivo?,
 * escenaDestinoId?, comportamientoAlElegir }` — o `null` si el verbo
 * no tiene Nivel 2 (inmediata, textoLibre, o "Usar" con 1 solo
 * objeto).
 */

import { categoriaDeRelacion } from '../npcs/categoriasRelacion.js';
import {
  probabilidadBase,
  modificadorPorRelacion,
  modificadorPorConfiabilidad,
  clampProbabilidad,
  PROBABILIDAD_BASE_USAR,
} from './probabilidades.js';

/**
 * @param {{nombre: string, tipoResolucion: string, objetoObjetivo?: string}} verbo
 * @param {object|null} opcionNivel2
 * @param {object} escena - Reservado, no usado en el cascarón (mismo criterio que `jugador` en Fase 4, conocimientosRevelables).
 * @param {object} jugador - Reservado, no usado en el cascarón.
 * @param {object|null} npcObjetivo - NPC completo (no ID) contra quien fue la acción, o null.
 * @param {object} estadoMundo
 * @param {Map<string, object>} objetosPorId
 * @param {() => number} [generadorAleatorio] - Inyectable para tests deterministas (ver doc técnico, nota de testeo 2.4).
 * @returns {{verboId: string, opcionElegidaId: string|null, npcObjetivoId: string|null, textoLibre: null, resultado: "exito"|"fallo"|"neutral", tick: number}}
 */
export function resolverAccion(
  verbo,
  opcionNivel2,
  escena,
  jugador,
  npcObjetivo,
  estadoMundo,
  objetosPorId,
  generadorAleatorio = Math.random
) {
  const tick = estadoMundo.ticksTranscurridos;

  // "Usar" se chequea ANTES del atajo genérico de "inmediata" — decisión
  // B del addendum de esta fase (confirmada explícitamente, no es lectura
  // libre del documento original). Con exactamente 1 objeto usable, Fase
  // 3 ya deja tipoResolucion:"inmediata" y el objeto fijado en
  // verbo.objetoObjetivo (no hay Nivel 2 en ese camino); con más de 1
  // objeto, viaja en opcionNivel2.objetoObjetivo. En ambos casos el
  // modificador de confiabilidad (2.3bis) tiene que aplicarse igual — si
  // este chequeo fuera código muerto debajo del atajo de "inmediata", un
  // objeto frágil usado en soledad nunca podría fallar.
  if (verbo.nombre === 'Usar') {
    const objetoId = opcionNivel2?.objetoObjetivo ?? verbo.objetoObjetivo;
    const objeto = objetosPorId.get(objetoId);
    if (!objeto) {
      console.warn(`resolverAccion: 'Usar' sin objeto resoluble (objetoId='${objetoId}').`);
    }

    let probabilidad = PROBABILIDAD_BASE_USAR + modificadorPorConfiabilidad(objeto?.confiabilidad);
    // Sin modificador de relación, sin importar si hay NPC presente
    // (doc técnico, 2.3bis) — "Usar" no tiene concepto de NPC objetivo.
    probabilidad = clampProbabilidad(probabilidad);

    const exito = generadorAleatorio() * 100 < probabilidad;

    return {
      verboId: verbo.nombre,
      opcionElegidaId: opcionNivel2?.etiqueta ?? null,
      npcObjetivoId: null,
      textoLibre: null,
      resultado: exito ? 'exito' : 'fallo',
      tick,
    };
  }

  if (verbo.tipoResolucion === 'inmediata') {
    return {
      verboId: verbo.nombre,
      opcionElegidaId: null,
      npcObjetivoId: null,
      textoLibre: null,
      resultado: 'neutral',
      tick,
    };
  }

  let probabilidad = probabilidadBase(verbo, opcionNivel2);

  if (npcObjetivo != null) {
    let modificador = modificadorPorRelacion(categoriaDeRelacion(npcObjetivo.relacion.valor));
    if (verbo.nombre === 'Atacar') {
      // Excepción explícita (doc técnico, 2.3): atacar a alguien hostil
      // es más "fácil" de justificar como éxito narrativo que atacar a
      // un aliado. Sólo Atacar invierte signo — Defender no.
      modificador = modificador * -1;
    }
    probabilidad += modificador;
  }

  probabilidad = clampProbabilidad(probabilidad);
  const exito = generadorAleatorio() * 100 < probabilidad;

  return {
    verboId: verbo.nombre,
    opcionElegidaId: opcionNivel2?.etiqueta ?? null,
    npcObjetivoId: npcObjetivo?.id ?? null,
    textoLibre: null,
    resultado: exito ? 'exito' : 'fallo',
    tick,
  };
}
