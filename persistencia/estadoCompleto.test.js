import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { capturarEstadoCompleto, prepararParaGuardado } from './estadoCompleto.js';
import { CAMPOS_ESTADO_COMPLETO, VERSION_ESQUEMA, MAX_HISTORIAL_RELEVANTE } from './constantes.js';
import { armarPartida } from './utilsPrueba.js';

describe('capturarEstadoCompleto', () => {
  test('WHITELIST: las claves son EXACTAMENTE CAMPOS_ESTADO_COMPLETO (un campo nuevo tiene que declararse a propósito)', () => {
    const estado = armarPartida().capturar();
    assert.deepEqual(Object.keys(estado).sort(), [...CAMPOS_ESTADO_COMPLETO].sort());
  });

  test('la whitelist congelada es la esperada por esta versión de esquema (falla si alguien la toca sin querer)', () => {
    assert.deepEqual([...CAMPOS_ESTADO_COMPLETO].sort(), [
      'codigoPartida', 'escenas', 'estadoInternoNPCs', 'estadoInternoSucesos', 'estadoMundo',
      'eventos', 'jugador', 'npcs', 'sucesos', 'ultimaModificacion', 'versionEsquema',
    ]);
    assert.equal(Object.isFrozen(CAMPOS_ESTADO_COMPLETO), true);
    assert.ok(!CAMPOS_ESTADO_COMPLETO.includes('registroUso'));
    assert.ok(!CAMPOS_ESTADO_COMPLETO.includes('apiKey'));
  });

  test('estampa versionEsquema, codigoPartida y ultimaModificacion (una sola vez, con el reloj inyectado)', () => {
    const p = armarPartida();
    const estado = p.capturar(() => 42);
    assert.equal(estado.versionEsquema, VERSION_ESQUEMA);
    assert.equal(estado.codigoPartida, 'K7M2XP');
    assert.equal(estado.ultimaModificacion, 42);
  });

  test('es copia profunda: mutar el mundo vivo después no altera lo capturado', () => {
    const p = armarPartida();
    const estado = p.capturar();
    p.npcs[0].relacion.valor = 77;
    p.estadoMundo.horaActual = 3;
    p.escenas[0].nombre = 'CAMBIADA';
    assert.notEqual(estado.npcs[0].relacion.valor, 77);
    assert.notEqual(estado.estadoMundo.horaActual, 3);
    assert.notEqual(estado.escenas[0].nombre, 'CAMBIADA');
  });

  test('incluye eventos inactivos y los estados internos como JSON plano', () => {
    const p = armarPartida();
    p.motorEventos.desactivarEvento('evento_incendio_001', 'test');
    const estado = p.capturar();
    assert.equal(estado.eventos.length, 2);
    assert.equal(estado.eventos.find((e) => e.id === 'evento_incendio_001').activo, false);
    assert.ok(estado.estadoInternoNPCs.ejes.npc_herrero_001);
    assert.ok(estado.estadoInternoSucesos.sucesos.suceso_escasez_001);
  });

  test('lanza si un motor produce algo que no sobrevive a JSON (bug interno, no se traga)', () => {
    const p = armarPartida();
    p.jugador.atributos.salud = NaN;
    assert.throws(() => p.capturar(), /no es serializable/);
  });
});

describe('prepararParaGuardado', () => {
  test('CANARIO: una apiKey y un registroUso en el estado (top-level o anidados) no aparecen en el payload', () => {
    const CANARIO_KEY = 'gsk_CANARIO_NO_DEBE_VIAJAR_12345';
    const CANARIO_T = 987654321987;
    const estado = armarPartida().capturar();
    estado.apiKey = CANARIO_KEY;
    estado.registroUso = { llamadas: [{ t: CANARIO_T, tokens: 1 }] };
    const { payload, reportes } = prepararParaGuardado(estado);

    const texto = JSON.stringify(payload);
    assert.ok(!texto.includes(CANARIO_KEY));
    assert.ok(!texto.includes(String(CANARIO_T)));
    assert.equal(reportes.length, 2, 'cada campo fuera de la whitelist se reporta');
    assert.deepEqual(Object.keys(payload).sort(), [...CAMPOS_ESTADO_COMPLETO].sort());
  });

  test('el payload se CONSTRUYE por whitelist: un campo desconocido nunca llega, aunque tenga cualquier nombre', () => {
    const estado = armarPartida().capturar();
    estado.campoQueNadiePlaneo = { valor: 1 };
    const { payload } = prepararParaGuardado(estado);
    assert.ok(!('campoQueNadiePlaneo' in payload));
  });

  test('trunca historialRelevante a las últimas 20 SOLO en el payload; el estado de entrada queda intacto', () => {
    const p = armarPartida();
    const historial = Array.from({ length: 23 }, (_, i) => ({ eventoId: `e${i}`, delta: 1, momento: String(i) }));
    p.npcs[0].relacion.historialRelevante = historial;
    const estado = p.capturar();

    const { payload } = prepararParaGuardado(estado);
    const guardado = payload.npcs[0].relacion.historialRelevante;
    assert.equal(guardado.length, MAX_HISTORIAL_RELEVANTE);
    assert.equal(guardado[0].eventoId, 'e3');
    assert.equal(guardado.at(-1).eventoId, 'e22');
    assert.equal(estado.npcs[0].relacion.historialRelevante.length, 23, 'la entrada no se muta');
    assert.equal(p.npcs[0].relacion.historialRelevante.length, 23, 'el motor en ejecución tampoco');
  });

  test('con menos de 20 entradas no rompe ni rellena', () => {
    const p = armarPartida();
    p.npcs[0].relacion.historialRelevante = [{ eventoId: 'a', delta: 1, momento: '1' }];
    const { payload } = prepararParaGuardado(p.capturar());
    assert.equal(payload.npcs[0].relacion.historialRelevante.length, 1);
  });

  test('no serializable → payload null y errores; entrada que no es objeto → errores', () => {
    const estado = armarPartida().capturar();
    estado.jugador.atributos.x = Infinity;
    const r = prepararParaGuardado(estado);
    assert.equal(r.payload, null);
    assert.ok(r.errores.length > 0);
    assert.ok(prepararParaGuardado(null).errores.length > 0);
    assert.ok(prepararParaGuardado([]).errores.length > 0);
  });

  test('un undefined en una propiedad se descarta del payload (Firestore lo rechaza)', () => {
    const estado = armarPartida().capturar();
    estado.jugador.extra = undefined;
    const { payload, errores } = prepararParaGuardado(estado);
    assert.equal(errores.length, 0);
    assert.ok(!('extra' in payload.jugador));
  });
});
