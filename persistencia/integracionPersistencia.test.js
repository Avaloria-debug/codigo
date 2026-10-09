/**
 * Fase 7 — Integración de punta a punta: criterio de "hecho" del doc técnico.
 * Dispositivo A juega y guarda; dispositivo B (otro almacén local, misma
 * "nube") entra con el código y continúa exactamente donde quedó. Motores
 * reales de Fases 0-6 + adaptador de Firebase sobre un cliente falso.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioPersistencia } from './servicioPersistencia.js';
import { crearAdaptadorLocal } from './adaptadores/local.js';
import { crearAlmacenEnMemoria } from './adaptadores/almacenEnMemoria.js';
import { crearAdaptadorFirebase } from './adaptadores/firebase.js';
import { restaurarMotores } from './restaurarMotores.js';
import { capturarEstadoCompleto } from './estadoCompleto.js';
import { generarCodigoPartida } from './codigoPartida.js';
import { armarPartida, cargarObjetos, GUION, accion } from './utilsPrueba.js';
import { crearMotorDeNPCs } from '../core/npcs/motorNPCs.js';
import { obtenerDialogoNPCConOrigen, armarContextoDialogo, crearRegistroUso, crearConfiguracionGroq } from '../core/ia/index.js';
import { relojReal } from '../core/ia/tiempo.js';

const objetos = cargarObjetos();

function firestoreFalso() {
  const docs = new Map();
  const escrituras = [];
  return {
    escrituras,
    asegurarSesion: async () => {},
    leerDocumento: async (c, id) => (docs.has(`${c}/${id}`) ? structuredClone(docs.get(`${c}/${id}`)) : null),
    escribirDocumento: async (c, id, d) => { escrituras.push(JSON.stringify(d)); docs.set(`${c}/${id}`, structuredClone(d)); },
  };
}

function dispositivo(cliente) {
  const adaptadorLocal = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() });
  const servicio = crearServicioPersistencia({ adaptadorLocal, adaptadorNube: crearAdaptadorFirebase({ cliente }), objetos });
  return { adaptadorLocal, servicio };
}

function capturarDe(p, codigo, t) {
  return capturarEstadoCompleto({
    codigoPartida: codigo, jugador: p.jugador, npcs: p.npcs, escenas: p.escenas, estadoMundo: p.estadoMundo,
    motorEventos: p.motorEventos, motorSucesos: p.motorSucesos, motorNPCs: p.motorNPCs, reloj: () => t,
  });
}

describe('Fase 7 — criterio de "hecho" de punta a punta', () => {
  test('A guarda una partida larga, B entra con el código y continúa IDÉNTICO a no haber cortado', async () => {
    const cliente = firestoreFalso();
    const codigo = generarCodigoPartida();
    const A = dispositivo(cliente);

    // A juega el guion hasta la mitad y guarda.
    const partidaA = armarPartida({ codigoPartida: codigo });
    const mitad = 6;
    for (let i = 0; i < mitad; i += 1) GUION[i](partidaA);
    const guardado = await A.servicio.guardar(capturarDe(partidaA, codigo, 1000));
    assert.deepEqual({ guardado: guardado.guardado, nube: guardado.nube }, { guardado: true, nube: 'ok' });

    // B: dispositivo distinto, almacén local vacío, sólo sabe el código.
    const B = dispositivo(cliente);
    assert.equal(await B.adaptadorLocal.cargarLocal(), null);
    const carga = await B.servicio.cargarPorCodigo(codigo.toLowerCase());
    assert.equal(carga.decision, 'cargada_de_nube');
    const partidaB = restaurarMotores(carga.estado);
    for (let i = mitad; i < GUION.length; i += 1) GUION[i](partidaB);

    // Control: la misma partida sin cortar.
    const control = armarPartida({ codigoPartida: codigo });
    for (const paso of GUION) paso(control);

    assert.deepEqual(capturarDe(partidaB, codigo, 2000), capturarDe(control, codigo, 2000));
  });

  test('B recupera el NPC hostil con su relación y sus ejes, y el historial truncado a 20', async () => {
    const cliente = firestoreFalso();
    const codigo = 'K7M2XP';
    const A = dispositivo(cliente);
    const p = armarPartida({ codigoPartida: codigo });
    for (let i = 0; i < 30; i += 1) {
      p.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: 'npc_guardia_001', resultado: i % 2 ? 'exito' : 'fallo', tick: i }));
    }
    const enMemoria = p.npcs.find((n) => n.id === 'npc_guardia_001');
    assert.ok(enMemoria.relacion.historialRelevante.length > 20, 'el motor en ejecución no trunca');

    await A.servicio.guardar(capturarDe(p, codigo, 1));
    const B = dispositivo(cliente);
    const { estado } = await B.servicio.cargarPorCodigo(codigo);
    const enB = estado.npcs.find((n) => n.id === 'npc_guardia_001');
    assert.equal(enB.relacion.historialRelevante.length, 20);
    assert.equal(enB.relacion.valor, enMemoria.relacion.valor);
    assert.equal(enB.estadoEmocional, enMemoria.estadoEmocional);
    assert.ok(enMemoria.relacion.historialRelevante.length > 20, 'y el motor de A sigue sin truncar');
  });

  test('B puede retomar el diálogo con el NPC (Fase 6) sobre el estado restaurado, con el mock', async () => {
    const cliente = firestoreFalso();
    const A = dispositivo(cliente);
    const p = armarPartida({ codigoPartida: 'K7M2XP' });
    p.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Presionar', npcObjetivoId: 'npc_guardia_001', resultado: 'fallo', tick: 1 }));
    await A.servicio.guardar(capturarDe(p, 'K7M2XP', 1));

    const B = dispositivo(cliente);
    const { estado } = await B.servicio.cargarPorCodigo('K7M2XP');
    const r = restaurarMotores(estado);
    const accionResuelta = accion({ verboId: 'Hablar con...', npcObjetivoId: 'npc_guardia_001', resultado: 'fallo', tick: r.estadoMundo.ticksTranscurridos });
    const { npc } = r.motorNPCs.procesarAccionResuelta(accionResuelta);
    const contexto = armarContextoDialogo({
      accionResuelta, npc, escena: r.escenas.find((e) => e.id === npc.ubicacionActual), estadoMundo: r.estadoMundo,
      motorNPCs: r.motorNPCs, jugador: r.jugador, textoLibreJugador: 'Bajá el arma.', opcionNivel2: null,
    });
    const salida = await obtenerDialogoNPCConOrigen(contexto, crearConfiguracionGroq({ apiKey: null }), crearRegistroUso({ reloj: relojReal }), { forzarMock: true });
    assert.equal(salida.origen, 'mock');
    assert.match(salida.texto, /^\[MOCK\] /);
  });

  test('NINGÚN payload enviado a Firestore contiene la API key ni el registro de uso (inspección del payload exacto)', async () => {
    const cliente = firestoreFalso();
    const A = dispositivo(cliente);
    await A.adaptadorLocal.guardarApiKey('gsk_NO_VIAJA_NUNCA_999');
    await A.adaptadorLocal.guardarRegistroUso({ llamadas: [{ t: 424242424242, tokens: 77 }] });
    const p = armarPartida({ codigoPartida: 'K7M2XP' });
    await A.servicio.guardar(capturarDe(p, 'K7M2XP', 1));
    await A.servicio.guardar(capturarDe(p, 'K7M2XP', 2));

    assert.equal(cliente.escrituras.length, 2);
    for (const payload of cliente.escrituras) {
      assert.ok(!payload.includes('gsk_NO_VIAJA_NUNCA_999'));
      assert.ok(!payload.includes('424242424242'));
      assert.ok(!payload.includes('registroUso'));
      assert.ok(!payload.includes('apiKey'));
    }
  });

  test('guardar sin conexión, cerrar, volver a abrir con conexión: no se perdió nada y se sincroniza', async () => {
    const cliente = firestoreFalso();
    const originalEscribir = cliente.escribirDocumento;
    cliente.escribirDocumento = async () => { throw new Error('offline'); };
    const A = dispositivo(cliente);
    const p = armarPartida({ codigoPartida: 'K7M2XP' });
    for (let i = 0; i < 4; i += 1) GUION[i](p);
    const r = await A.servicio.guardar(capturarDe(p, 'K7M2XP', 10));
    assert.equal(r.nube, 'fallo');

    // "Se cierra la app": servicio nuevo sobre el MISMO almacén local, ya con conexión.
    cliente.escribirDocumento = originalEscribir;
    const servicio2 = crearServicioPersistencia({ adaptadorLocal: A.adaptadorLocal, adaptadorNube: crearAdaptadorFirebase({ cliente }), objetos });
    const inicio = await servicio2.iniciar();
    assert.equal(inicio.decision, 'nube_creada');
    assert.equal(inicio.estado.ultimaModificacion, 10);
    assert.equal(cliente.escrituras.length, 1);
  });
});
