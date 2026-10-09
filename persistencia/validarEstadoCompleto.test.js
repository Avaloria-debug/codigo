import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarEstadoCompleto } from './validarEstadoCompleto.js';
import { armarPartida, cargarObjetos, avanzarMundo } from './utilsPrueba.js';
import { VERSION_ESQUEMA } from './constantes.js';

const objetos = cargarObjetos();
const validar = (e) => validarEstadoCompleto(e, { objetos });
const base = () => armarPartida().capturar();

describe('validarEstadoCompleto — camino feliz', () => {
  test('una partida recién armada valida', () => {
    assert.deepEqual(validar(base()), { valido: true, motivo: null, errores: [] });
  });

  test('una partida a mitad de camino (tras avanzar el mundo) valida', () => {
    const p = armarPartida();
    avanzarMundo(p, 10);
    assert.equal(validar(p.capturar()).valido, true);
  });

  test('sin catálogo de objetos lanza (error de programación, no dato malo)', () => {
    assert.throws(() => validarEstadoCompleto(base()), /objetos/);
  });
});

describe('validarEstadoCompleto — versión (se chequea primero)', () => {
  test('versión mayor a la soportada → version_futura, aunque el resto tenga otra forma', () => {
    const r = validar({ versionEsquema: VERSION_ESQUEMA + 1, formaNueva: true });
    assert.equal(r.motivo, 'version_futura');
    assert.equal(r.valido, false);
    assert.match(r.errores[0], /más nueva/);
  });

  test('versión anterior a la soportada → estructura (todavía no hay migración)', () => {
    const e = base();
    e.versionEsquema = 0;
    assert.equal(validar(e).motivo, 'estructura');
  });

  test('versión no numérica → estructura', () => {
    const e = base();
    e.versionEsquema = 'uno';
    assert.equal(validar(e).motivo, 'estructura');
  });
});

describe('validarEstadoCompleto — estructura', () => {
  test('no es un objeto', () => {
    for (const malo of [null, undefined, 5, 'x', []]) assert.equal(validar(malo).motivo, 'estructura');
  });

  test('campo desconocido y campo faltante', () => {
    const e = base();
    e.apiKey = 'gsk_x';
    delete e.sucesos;
    const r = validar(e);
    assert.equal(r.motivo, 'estructura');
    assert.ok(r.errores.some((x) => x.includes("Campo desconocido 'apiKey'")));
    assert.ok(r.errores.some((x) => x.includes("Falta el campo 'sucesos'")));
  });

  test('codigoPartida inválido y ultimaModificacion no numérica', () => {
    const e = base();
    e.codigoPartida = 'abc';
    e.ultimaModificacion = 'ayer';
    const r = validar(e);
    assert.ok(r.errores.some((x) => x.includes('codigoPartida')));
    assert.ok(r.errores.some((x) => x.includes('ultimaModificacion')));
  });

  test('entidad mal formada: el error dice en qué colección e índice', () => {
    const e = base();
    delete e.npcs[1].nombre;
    const r = validar(e);
    assert.equal(r.motivo, 'estructura');
    assert.ok(r.errores.some((x) => x.startsWith('npcs[1]:')));
  });

  test('ids duplicados en una colección', () => {
    const e = base();
    e.npcs.push(JSON.parse(JSON.stringify(e.npcs[0])));
    assert.ok(validar(e).errores.some((x) => x.includes("id duplicado")));
  });

  test('evento con duracion y condicionExpiracion en null (regla de Fase 0)', () => {
    const e = base();
    e.eventos[0].duracion = null;
    e.eventos[0].condicionExpiracion = null;
    assert.equal(validar(e).motivo, 'estructura');
  });

  test('estado interno: falta la entrada de un NPC, id ajeno, eje fuera de rango, no entero', () => {
    const e = base();
    delete e.estadoInternoNPCs.ejes.npc_herrero_001;
    e.estadoInternoNPCs.ejes.npc_fantasma = { nivelTemor: 0, nivelDisposicion: 0 };
    e.estadoInternoNPCs.ejes.npc_guardia_001.nivelTemor = 3;
    e.estadoInternoNPCs.ejes.npc_viajero_001.nivelDisposicion = 0.5;
    const r = validar(e);
    assert.equal(r.motivo, 'estructura');
    assert.ok(r.errores.some((x) => x.includes("falta la entrada del NPC 'npc_herrero_001'")));
    assert.ok(r.errores.some((x) => x.includes("'npc_fantasma' no es un NPC")));
    assert.ok(r.errores.some((x) => x.includes('nivelTemor')));
    assert.ok(r.errores.some((x) => x.includes('nivelDisposicion')));
  });

  test('estado interno de sucesos: falta entrada, ultimoTickProcesado no numérico', () => {
    const e = base();
    e.estadoInternoSucesos.sucesos.suceso_escasez_001.ultimoTickProcesado = 'x';
    assert.ok(validar(e).errores.some((x) => x.includes('ultimoTickProcesado')));
    delete e.estadoInternoSucesos.sucesos.suceso_escasez_001;
    assert.ok(validar(e).errores.some((x) => x.includes("falta la entrada del suceso")));
  });

  test('Map crudo (o cualquier no-objeto) en el estado interno se rechaza', () => {
    const e = base();
    e.estadoInternoNPCs = { ejes: [] };
    assert.equal(validar(e).motivo, 'estructura');
  });
});

describe('validarEstadoCompleto — referencias y coherencia', () => {
  test('un NPC en npcsPresentes de una escena que no coincide con su ubicacionActual', () => {
    const e = base();
    e.npcs.find((n) => n.id === 'npc_herrero_001').ubicacionActual = 'escena_plaza';
    const r = validar(e);
    assert.equal(r.motivo, 'referencias');
  });

  test('evento que apunta a una escena inexistente', () => {
    const e = base();
    e.eventos[0].escenaId = 'escena_que_no_existe';
    assert.equal(validar(e).motivo, 'referencias');
  });

  test('inventario del jugador con un objeto que no está en el catálogo', () => {
    const e = base();
    e.jugador.inventario.push({ objetoId: 'objeto_fantasma', cantidad: 1 });
    assert.equal(validar(e).motivo, 'referencias');
  });

  test('escena.eventosActivos no coincide con los eventos realmente activos', () => {
    const e = base();
    e.escenas.find((x) => x.id === 'escena_herreria').eventosActivos = [];
    const r = validar(e);
    assert.equal(r.motivo, 'referencias');
    assert.ok(r.errores.some((x) => x.includes('eventosActivos')));
  });

  test('BUG DE CARGA detectado: estadoEmocional incoherente con los ejes', () => {
    const e = base();
    e.npcs.find((n) => n.id === 'npc_guardia_001').estadoEmocional = 'alarmado'; // pero sus ejes están en (0,0)
    const r = validar(e);
    assert.equal(r.motivo, 'referencias');
    assert.ok(r.errores.some((x) => x.includes('proyección de sus ejes')));
  });

  test('ultimoTickProcesado posterior a ticksTranscurridos', () => {
    const e = base();
    e.estadoInternoSucesos.sucesos.suceso_escasez_001.ultimoTickProcesado = e.estadoMundo.ticksTranscurridos + 1;
    assert.ok(validar(e).errores.some((x) => x.includes('posterior a ticksTranscurridos')));
  });

  test('las referencias sólo se evalúan si la estructura está bien (no hay errores en cascada)', () => {
    const e = base();
    delete e.npcs[0].nombre;
    e.eventos[0].escenaId = 'nope';
    const r = validar(e);
    assert.equal(r.motivo, 'estructura');
    assert.ok(!r.errores.some((x) => x.includes('nope')));
  });
});

describe('validarEstadoCompleto — objetos (cubierto en Fase 7, ver addendum sección 7)', () => {
  test('objeto fantasma en una escena también se rechaza', () => {
    const e = base();
    e.escenas[0].objetosPresentes.push('objeto_fantasma');
    const r = validar(e);
    assert.equal(r.motivo, 'referencias');
    assert.ok(r.errores.some((x) => x.includes('objetosPresentes')));
  });
});
