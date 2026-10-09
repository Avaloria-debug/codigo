/**
 * Fase 8 — Orquestador. Un turno = elección del jugador -> resolución (Fase 5,
 * relación de ANTES) -> actualización del NPC (Fase 4) -> texto (diálogo Fase 6
 * o narración Fase 5, con el estado de DESPUÉS) -> efectos de movimiento ->
 * avance del mundo -> persistencia best-effort.
 */
import { resolverAccion, narrarAccionResuelta } from '../narrador/index.js';
import { armarContextoDialogo, obtenerDialogoNPCConOrigen } from '../ia/index.js';
import { resolverNpcObjetivo } from './resolverNpcObjetivo.js';
import { avanzarMundo } from './avanzarMundo.js';
import { ticksParaVerbo } from './ticksPorVerbo.js';
import { construirVerbo, escenaActualDe } from './opcionesJugador.js';
import { capturarEstadoCompleto } from '../../persistencia/estadoCompleto.js';

/** SUPUESTO (ver addendum §6): un Huir/Retirarse/Abortar EXITOSO con salida real mueve al jugador. */
export const verbosQueMuevenPorDefecto = Object.freeze(['Huir', 'Retirarse', 'Abortar']);

export function construirContextoNarracion(estadoJuego, escena, verbo, opcionNivel2, npc) {
  const objetoId = opcionNivel2?.objetoObjetivo ?? verbo.objetoObjetivo;
  const destino = opcionNivel2?.escenaDestinoId
    ? estadoJuego.escenas.find((e) => e.id === opcionNivel2.escenaDestinoId)
    : null;
  return {
    jugador: estadoJuego.jugador.nombre,
    lugar: destino?.nombre ?? escena.nombre,
    npc: npc?.nombre,
    objeto: objetoId ? estadoJuego.objetosPorId.get(objetoId)?.nombre : undefined,
  };
}

export async function jugarTurno(estadoJuego, eleccion, opciones = {}) {
  const {
    registroTicksPorVerbo, generadorAleatorio = Math.random, verbosQueMueven = verbosQueMuevenPorDefecto,
    verbosConNpcObjetivo, opcionesNarracion = {},
  } = opciones;
  const reportes = [];

  const verbo = construirVerbo(eleccion.verbo);
  const opcionNivel2 = eleccion.opcionNivel2 ?? null;
  const textoLibre = eleccion.textoLibre ?? null;
  const escena = escenaActualDe(estadoJuego);

  const terminaEnTextoLibre = verbo.tipoResolucion === 'textoLibre' || opcionNivel2?.comportamientoAlElegir === 'abreTextoLibreConContexto';
  if (terminaEnTextoLibre && typeof textoLibre !== 'string') {
    throw new Error(`jugarTurno: '${verbo.nombre}' termina en texto libre; la UI tiene que pasar \`textoLibre\` (string, puede ser vacío).`);
  }

  const obj = resolverNpcObjetivo(verbo, escena, estadoJuego.npcsPorId, {
    motorEventos: estadoJuego.motorEventos, verbosConNpcObjetivo,
  });
  reportes.push(...obj.reportes);

  const accionResuelta = resolverAccion(verbo, opcionNivel2, escena, estadoJuego.jugador, obj.npc,
    estadoJuego.estadoMundo, estadoJuego.objetosPorId, generadorAleatorio);

  let npcActualizado = obj.npc;
  if (obj.npc) {
    const r = estadoJuego.motorNPCs.procesarAccionResuelta(accionResuelta);
    npcActualizado = r.npc ?? obj.npc;
    for (const mensaje of r.reportes ?? []) reportes.push({ origen: 'procesarAccionResuelta', mensaje });
  }

  let texto, tipo, origen = null, motivo = null, tokensUsados;
  if (terminaEnTextoLibre && npcActualizado) {
    const contexto = armarContextoDialogo({
      accionResuelta, npc: npcActualizado, escena, estadoMundo: estadoJuego.estadoMundo, motorNPCs: estadoJuego.motorNPCs,
      jugador: estadoJuego.jugador, textoLibreJugador: textoLibre, opcionNivel2,
    });
    const d = await obtenerDialogoNPCConOrigen(contexto, estadoJuego.configuracionGroq, estadoJuego.registroUso, estadoJuego.opcionesDialogo ?? {});
    ({ texto, origen, motivo, tokensUsados } = d);
    tipo = 'dialogo';
  } else {
    texto = narrarAccionResuelta(accionResuelta, construirContextoNarracion(estadoJuego, escena, verbo, opcionNivel2, npcActualizado), opcionesNarracion);
    tipo = 'narracion';
  }

  let movimiento = null;
  if (accionResuelta.resultado === 'exito' && opcionNivel2?.escenaDestinoId && verbosQueMueven.includes(verbo.nombre)) {
    movimiento = { desde: escena.id, hacia: opcionNivel2.escenaDestinoId };
    estadoJuego.jugador.ubicacionActual = opcionNivel2.escenaDestinoId;
  }

  const mundo = avanzarMundo(estadoJuego, ticksParaVerbo(verbo.nombre, registroTicksPorVerbo), estadoJuego.opcionesMundo);
  reportes.push(...mundo.reportes);

  let guardado = null;
  const { servicioPersistencia, adaptadorLocal } = estadoJuego;
  if (servicioPersistencia) {
    // Best-effort: no bloquea la respuesta; un fallo queda reportado, no lanza.
    guardado = Promise.resolve()
      .then(() => servicioPersistencia.guardar(capturarEstadoCompleto({
        codigoPartida: estadoJuego.codigoPartida, jugador: estadoJuego.jugador, npcs: estadoJuego.npcs, escenas: estadoJuego.escenas,
        estadoMundo: estadoJuego.estadoMundo, motorEventos: estadoJuego.motorEventos, motorSucesos: estadoJuego.motorSucesos,
        motorNPCs: estadoJuego.motorNPCs, reloj: estadoJuego.reloj,
      })))
      .then(async (r) => {
        if (tipo === 'dialogo' && adaptadorLocal?.guardarRegistroUso) await adaptadorLocal.guardarRegistroUso(estadoJuego.registroUso.serializar());
        return r;
      })
      .catch((e) => ({ guardado: false, motivo: 'excepcion', error: String(e?.message ?? e) }));
  }

  return {
    texto, tipo, origen, motivo, tokensUsados, accionResuelta,
    npcObjetivoId: obj.npc?.id ?? null, motivoObjetivo: obj.motivo,
    movimiento, mundo, reportes, guardado,
  };
}
