/**
 * Fase 6 — Integración real de la cadena completa, sin datos
 * inventados: fixtures de Fase 0 + Fases 1-5 reales + Fase 6 con
 * fetch simulado. Es el criterio de "cada fase se cierra probada":
 *   generarOpcionesNivel2 → resolverAccion → procesarAccionResuelta
 *   → armarContextoDialogo → obtenerDialogoNPC
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { actualizarEstadoCalculado } from '../comprensionMundo/calcularEstadoEscena.js';
import { crearMotorDeNPCs } from '../npcs/motorNPCs.js';
import { generarOpcionesNivel2, registroPatrones, construirObjetosPorId } from '../opciones/index.js';
import { resolverAccion } from '../narrador/index.js';
import { armarContextoDialogo, obtenerDialogoNPC, obtenerDialogoNPCConOrigen, crearRegistroUso, crearConfiguracionGroq } from './index.js';
import { crearRelojFalso, crearFetchFalso, cuerpoGroq } from './utilsPrueba.js';

const leer = (n) => JSON.parse(readFileSync(new URL(`../../data/fixtures/${n}.json`, import.meta.url)));

function mundo() {
  const d = {
    npcs: leer('npcs'), escenas: leer('escenas'), eventos: leer('eventos'),
    jugador: leer('jugador'), estadoMundo: leer('estadoDelMundo'), objetos: leer('objetos'),
  };
  const motorEventos = crearMotorDeEventos({ eventos: d.eventos, escenas: d.escenas, jugador: d.jugador, npcs: d.npcs, estadoMundoInicial: d.estadoMundo });
  const motorNPCs = crearMotorDeNPCs({ npcs: d.npcs, escenas: d.escenas, motorEventos });
  const plaza = d.escenas.find((e) => e.id === 'escena_plaza');
  actualizarEstadoCalculado(plaza, motorEventos.listarEventosActivos(plaza.id), d.estadoMundo);
  const npc = (id) => d.npcs.find((n) => n.id === id);
  const objetosPorId = construirObjetosPorId(d.objetos);
  const r = crearRelojFalso();
  const registro = crearRegistroUso({ reloj: r.reloj });
  const config = crearConfiguracionGroq({ apiKey: 'gsk_test' });
  return { ...d, motorEventos, motorNPCs, plaza, npc, objetosPorId, r, registro, config };
}

describe('integración Fase 6 — cadena completa con el motor real', () => {
  test('caso E: el NPC responde con el estado de DESPUÉS de la acción (presionado y fallido → "hostil", no "neutral")', async () => {
    const m = mundo();
    const guardia = m.npc('npc_guardia_001');
    assert.equal(guardia.estadoEmocional, 'neutral'); // de partida

    const verbo = { nombre: 'Presionar', tipoResolucion: 'concrecion' };
    const opciones = generarOpcionesNivel2(verbo, m.plaza, m.jugador, registroPatrones, m.objetosPorId);
    const opcion = opciones[0]; // "Amenazar veladamente"
    assert.equal(opcion.comportamientoAlElegir, 'abreTextoLibreConContexto');

    const accion = resolverAccion(verbo, opcion, m.plaza, m.jugador, guardia, m.estadoMundo, m.objetosPorId, () => 0.99);
    assert.equal(accion.resultado, 'fallo');
    assert.equal(accion.npcObjetivoId, 'npc_guardia_001');

    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    assert.equal(npc.estadoEmocional, 'hostil');

    const contexto = armarContextoDialogo({
      accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs,
      jugador: m.jugador, textoLibreJugador: 'Más te vale colaborar.', opcionNivel2: opcion,
    });

    const fetch = crearFetchFalso([{ body: cuerpoGroq('No me amenaces a mí.') }]);
    const r = await obtenerDialogoNPCConOrigen(contexto, m.config, m.registro, { fetch, dormir: m.r.dormir });
    assert.equal(r.origen, 'groq');
    assert.equal(r.texto, 'No me amenaces a mí.');

    const prompt = fetch.llamadas[0].cuerpo.messages;
    assert.match(prompt[0].content, /FALLO/, 'el resultado decidido por Fase 5 viaja al system prompt');
    assert.match(prompt[0].content, /Guardia Genérico/);
    assert.match(prompt[1].content, /estado de ánimo ahora mismo: hostil/);
    assert.match(prompt[1].content, /Plaza Central, situación tenso/, 'estado de escena calculado por Fase 2');
    assert.match(prompt[1].content, /enfoque en este intercambio fue: Amenazar veladamente/);
    assert.match(prompt[1].content, /Más te vale colaborar\./);
  });

  test('el conocimiento condicionado por evento (Fase 1 + Fase 4) llega al prompt cuando el evento ocurrió', async () => {
    const m = mundo();
    const guardia = m.npc('npc_guardia_001');
    const accion = resolverAccion({ nombre: 'Hablar con...', tipoResolucion: 'textoLibre' }, null, m.plaza, m.jugador, guardia, m.estadoMundo, m.objetosPorId, () => 0.1);
    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    const contexto = armarContextoDialogo({ accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs, jugador: m.jugador, textoLibreJugador: '¿Qué pasó acá?' });
    assert.equal(contexto.conocimientosRevelables.length, 1); // evento_disputa_publica_001 está activo
    const fetch = crearFetchFalso([{ body: cuerpoGroq('Ya sé quién fue.') }]);
    await obtenerDialogoNPC(contexto, m.config, m.registro, { fetch, dormir: m.r.dormir });
    assert.match(fetch.llamadas[0].cuerpo.messages[1].content, /Sabe quién originó la deuda/);
  });

  test('un secreto que exige relación NO llega al prompt si la relación no alcanza (Fase 4 filtra, la IA no decide)', async () => {
    const m = mundo();
    const herrero = m.npc('npc_herrero_001'); // ruta secreta: umbral 40, relación 0
    const accion = resolverAccion({ nombre: 'Hablar con...', tipoResolucion: 'textoLibre' }, null, m.plaza, m.jugador, herrero, m.estadoMundo, m.objetosPorId, () => 0.1);
    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    const contexto = armarContextoDialogo({ accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs, jugador: m.jugador, textoLibreJugador: '¿Hay otro camino?' });
    assert.deepEqual(contexto.conocimientosRevelables, []);
    const fetch = crearFetchFalso([{ body: cuerpoGroq('No sé de qué hablás.') }]);
    await obtenerDialogoNPC(contexto, m.config, m.registro, { fetch, dormir: m.r.dormir });
    const usr = fetch.llamadas[0].cuerpo.messages[1].content;
    assert.match(usr, /nada en particular/);
    assert.doesNotMatch(usr, /paso oculto/);
  });

  test('éxito al hablar → "alegre"; mismo pipeline por mock forzado da un [MOCK] coherente', async () => {
    const m = mundo();
    const viajero = m.npc('npc_viajero_001');
    const accion = resolverAccion({ nombre: 'Hablar con...', tipoResolucion: 'textoLibre' }, null, m.plaza, m.jugador, viajero, m.estadoMundo, m.objetosPorId, () => 0.1);
    assert.equal(accion.resultado, 'exito');
    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    const contexto = armarContextoDialogo({ accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs, jugador: m.jugador, textoLibreJugador: 'Contame algo' });
    const texto = await obtenerDialogoNPC(contexto, m.config, m.registro, { forzarMock: true });
    assert.equal(texto, "[MOCK] Viajero Genérico (alegre, resultado: exito): ¡Qué bueno verte! — respecto a 'Contame algo'");
  });

  test('Groq caído en medio de la cadena: el jugador igual recibe respuesta (mock), y el estado del NPC no se toca', async () => {
    const m = mundo();
    const viajero = m.npc('npc_viajero_001');
    const accion = resolverAccion({ nombre: 'Hablar con...', tipoResolucion: 'textoLibre' }, null, m.plaza, m.jugador, viajero, m.estadoMundo, m.objetosPorId, () => 0.99);
    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    const antes = JSON.stringify(npc);
    const contexto = armarContextoDialogo({ accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs, jugador: m.jugador, textoLibreJugador: 'Hola' });
    const fetch = crearFetchFalso([{ status: 503 }]);
    const r = await obtenerDialogoNPCConOrigen(contexto, m.config, m.registro, { fetch, dormir: m.r.dormir });
    assert.equal(r.origen, 'mock');
    assert.equal(r.motivo, 'error_groq_503');
    assert.equal(JSON.stringify(npc), antes, 'Fase 6 no escribe nada sobre el NPC: la IA sólo frasea');
  });

  test('sin Fase 6 mutando nada: el registro de uso es lo único que cambia tras una llamada', async () => {
    const m = mundo();
    const viajero = m.npc('npc_viajero_001');
    const accion = resolverAccion({ nombre: 'Hablar con...', tipoResolucion: 'textoLibre' }, null, m.plaza, m.jugador, viajero, m.estadoMundo, m.objetosPorId, () => 0.1);
    const { npc } = m.motorNPCs.procesarAccionResuelta(accion);
    const contexto = armarContextoDialogo({ accionResuelta: accion, npc, escena: m.plaza, estadoMundo: m.estadoMundo, motorNPCs: m.motorNPCs, jugador: m.jugador, textoLibreJugador: 'Hola' });
    const fotoMundo = JSON.stringify({ npcs: m.npcs, escenas: m.escenas, jugador: m.jugador, estadoMundo: m.estadoMundo });
    await obtenerDialogoNPC(contexto, m.config, m.registro, { fetch: crearFetchFalso([{ body: cuerpoGroq('Hola.') }]), dormir: m.r.dormir });
    assert.equal(JSON.stringify({ npcs: m.npcs, escenas: m.escenas, jugador: m.jugador, estadoMundo: m.estadoMundo }), fotoMundo);
    assert.equal(m.registro.resumen().llamadasUltimas24h, 1);
  });
});
