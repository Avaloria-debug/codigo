import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { armarPartida, cargarObjetos } from '../../persistencia/utilsPrueba.js';
import { crearEstadoJuego, jugarTurno, listarNivel1 } from '../../core/orquestador/index.js';
import { crearAdaptadorNubeEnMemoria, crearAlmacenEnMemoria, crearAdaptadorLocal, crearServicioPersistencia, capturarEstadoCompleto } from '../../persistencia/index.js';
import * as C from './controles.js';

const juego = (extra) => crearEstadoJuego(armarPartida(), { objetos: cargarObjetos(), ...extra });
const hablar = (g) => listarNivel1(g).find((v) => v.etiqueta.startsWith('Hablar con'));

describe('controles = inyección de condiciones', () => {
  test('forzarEvento pasa por la validación real: un evento sin forma de expirar se RECHAZA (no se parcha)', () => {
    const g = juego();
    const mal = C.forzarEvento(g, { tipo: 'incendio', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: null });
    assert.equal(mal.ok, false); assert.ok(mal.errores.length > 0);
    assert.equal(C.forzarEvento(g, { tipo: 'incendio', escenaId: 'escena_plaza', duracion: 3 }).ok, true);
  });
  test('el evento forzado cambia el estado de escena recién en el próximo tick (no en el acto)', () => {
    const g = juego(); const antes = g.escenas.find((e) => e.id === 'escena_celda').estadoCalculado;
    C.forzarEvento(g, { tipo: 'emboscada_activa', escenaId: 'escena_celda', duracion: 5 });
    assert.equal(g.escenas.find((e) => e.id === 'escena_celda').estadoCalculado, antes);
    C.avanzarNTicks(g, 1);
    assert.equal(g.escenas.find((e) => e.id === 'escena_celda').estadoCalculado, 'combate');
  });
  test('avanzar por salto único == avanzar de a uno en reloj y expiración de eventos', () => {
    const a = juego(); const b = juego();
    for (const g of [a, b]) C.forzarEvento(g, { tipo: 'incendio', escenaId: 'escena_celda', duracion: 5, id: 'ev_x' });
    C.avanzarNTicks(a, 8, { salto: true }); C.avanzarNTicks(b, 8);
    assert.equal(a.estadoMundo.ticksTranscurridos, b.estadoMundo.ticksTranscurridos);
    assert.equal(a.motorEventos.listarEventosActivos('escena_celda').length, 0);
    assert.equal(b.motorEventos.listarEventosActivos('escena_celda').length, 0);
  });
  test('forzarEstadoEscena: valor marcado como forzado, estado inválido lanza, el tick lo recalcula', () => {
    const g = juego(); const r = C.forzarEstadoEscena(g, 'escena_celda', 'sigilo');
    assert.match(r.advertencia, /FORZADO/); assert.equal(g.estadosForzados.escena_celda, 'sigilo');
    assert.throws(() => C.forzarEstadoEscena(g, 'escena_celda', 'inventado'));
    C.avanzarNTicks(g, 1); assert.equal(g.escenas.find((e) => e.id === 'escena_celda').estadoCalculado, 'tranquilo');
  });
  test('editarNpc: relación y ejes se reflejan en el motor reconstruido y el estado emocional queda coherente con la proyección', async () => {
    const g = juego({ opcionesDialogo: { forzarMock: true } });
    const r = C.editarNpc(g, 'npc_guardia_001', { relacion: 55, nivelTemor: 2, nivelDisposicion: 1 });
    assert.equal(r.npc.estadoEmocional, 'alarmado');
    assert.deepEqual(g.motorNPCs.exportarEstadoInterno().ejes.npc_guardia_001, { nivelTemor: 2, nivelDisposicion: 1 });
    C.editarNpc(g, 'npc_guardia_001', { nivelTemor: 0 });
    assert.equal(g.npcs.find((n) => n.id === 'npc_guardia_001').estadoEmocional, 'alegre'); // la disposición no se perdió
    assert.equal(g.npcs.find((n) => n.id === 'npc_guardia_001').relacion.valor, 55);
  });
  test('simularErrorGroq (500/red/429/vacía) degrada a mock sin cortar el turno; quitar la simulación restaura', async () => {
    for (const tipo of ['500', 'red', '429', 'vacia']) {
      const g = juego(); C.simularErrorGroq(g, tipo);
      const r = await jugarTurno(g, { verbo: hablar(g), textoLibre: 'hola' });
      assert.equal(r.origen, 'mock', tipo); assert.ok(r.motivo, tipo);
    }
    const g = juego(); C.simularErrorGroq(g, '500'); C.simularErrorGroq(g, null);
    assert.equal(g.configuracionGroq.apiKey, null); assert.equal(g.opcionesDialogo.fetch, undefined);
  });
  test('simularRateLimit rpd: cae a mock por rpd_agotado sin tocar la red', async () => {
    let red = 0; const g = juego({ configuracionGroq: { ...juego().configuracionGroq, apiKey: 'k' }, opcionesDialogo: { fetch: async () => { red++; return {}; } } });
    C.simularRateLimit(g, 'rpd');
    const r = await jugarTurno(g, { verbo: hablar(g), textoLibre: 'hola' });
    assert.equal(r.motivo, 'rpd_agotado'); assert.equal(red, 0);
  });
  test('simularRateLimit rpm y tpm: el límite se hace respetar (espera falsa) antes de llamar, y luego responde', async () => {
    for (const tope of ['rpm', 'tpm']) {
      let esperas = 0; const ok = async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { content: 'Ni hablar.' }, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) });
      const g = juego({ configuracionGroq: { ...juego().configuracionGroq, apiKey: 'k' }, opcionesDialogo: { fetch: ok } });
      const ahora = Date.now(); C.simularRateLimit(g, tope, ahora);
      const dormir = g.opcionesDialogo.dormir; g.opcionesDialogo.dormir = async (ms) => { esperas++; assert.ok(ms > 0); await dormir(ms); };
      // el reloj real no avanza con dormir falso: se acota la prueba con un registro cuyo reloj avanza al "dormir"
      const t0 = ahora; let offset = 0; const { crearRegistroUso } = await import('../../core/ia/registroUso.js');
      g.registroUso = crearRegistroUso({ reloj: () => t0 + offset, estadoInicial: g.registroUso.serializar() });
      g.opcionesDialogo.dormir = async (ms) => { esperas++; offset += ms + 1; };
      const r = await jugarTurno(g, { verbo: hablar(g), textoLibre: 'hola' });
      assert.ok(esperas >= 1, `${tope}: debió esperar`); assert.equal(r.origen, 'groq', tope);
    }
  });
  test('verPayloadFirestore: sin fugas con apiKey cargada; detecta una fuga inyectada', () => {
    const g = juego({ configuracionGroq: { ...juego().configuracionGroq, apiKey: 'SECRETO_KEY_123' } });
    const ok = C.verPayloadFirestore(g); assert.ok(ok.json); assert.equal(ok.fugas, false);
    g.jugador.flags.filtrada = 'SECRETO_KEY_123';
    assert.equal(C.verPayloadFirestore(g).fugas, true);
  });
  test('corromperNube: version_futura/estructura/referencias producen el motivo correcto en la sincronización real', async () => {
    for (const [tipo, motivo] of [['version_futura', 'version_futura'], ['estructura', 'estructura'], ['referencias', 'referencias']]) {
      const g = juego(); const nube = crearAdaptadorNubeEnMemoria(); const objetos = cargarObjetos();
      const local = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() });
      const servicio = crearServicioPersistencia({ adaptadorLocal: local, adaptadorNube: nube, objetos });
      await servicio.guardar(capturarEstadoCompleto({ ...g, reloj: () => 5 }));
      await C.corromperNube(nube, g.codigoPartida, tipo);
      const r = await servicio.sincronizar();
      assert.equal(r.decision, 'nube_invalida', tipo); assert.equal(servicio.estado().conflicto?.motivo ?? r.reportes?.[0]?.motivo, motivo, tipo);
    }
  });
});
