import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { crearMotorDeSucesos } from './motorSucesos.js';

function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

// Como en motorEventos.test.js: copias frescas por test, estadoMundoInicial
// siempre presente porque suceso_escasez_001 del dataset de Fase 0 ya viene
// activo con progreso:40 y necesita saber desde cuándo "cuenta" el próximo tick.
function estadoBase() {
  const escenas = cargarFixture('escenas');
  const sucesos = cargarFixture('sucesos');
  const jugador = cargarFixture('jugador');
  const estadoMundo = cargarFixture('estadoDelMundo'); // ticksTranscurridos:72
  return { escenas, sucesos, jugador, estadoMundo };
}

function motorEventosVacio(escenas) {
  return crearMotorDeEventos({ escenas });
}

describe('Motor de Sucesos — creación', () => {
  test('crearSuceso válido queda activo y sella ultimoTickProcesado (indirectamente, vía idempotencia)', () => {
    const { escenas, sucesos, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos, escenas, estadoMundoInicial: estadoMundo });

    const { suceso, errores } = motor.crearSuceso(
      {
        id: 'suceso_migracion_test_001', tipo: 'migracion_fauna', alcance: 'global', escenaId: null,
        progreso: 0, velocidadProgreso: 2, condicionResolucion: 'nunca_se_cumple', eventoGeneradoAlResolver: null,
      },
      estadoMundo
    );

    assert.deepEqual(errores, []);
    assert.equal(suceso.activo, true);

    // Si ultimoTickProcesado no se hubiera sellado a "ahora", procesarTicks
    // aplicaría de golpe todos los ticks desde 0 en la primera llamada.
    const motorEventos = motorEventosVacio(escenas);
    estadoMundo.ticksTranscurridos += 1;
    const { sucesosModificados } = motor.procesarTicks(estadoMundo, motorEventos);
    const propio = sucesosModificados.find((s) => s.id === 'suceso_migracion_test_001');
    assert.equal(propio.progreso, 2); // 1 tick nuevo * velocidadProgreso 2, no más
  });

  test('crearSuceso rechaza alcance="global" con escenaId no-null (reusa validarEstructura de Fase 0)', () => {
    const { sucesos, escenas } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos, escenas });

    const { suceso, errores } = motor.crearSuceso({
      id: 'suceso_invalido_001', tipo: 'x', alcance: 'global', escenaId: 'escena_plaza',
      progreso: 0, velocidadProgreso: 1, condicionResolucion: 'x', eventoGeneradoAlResolver: null,
    });

    assert.equal(suceso, null);
    assert.ok(errores.length > 0);
  });
});

describe('Motor de Sucesos — idempotencia (doc técnico, 4.2)', () => {
  test('procesarTicks dos veces seguidas con el mismo ticksTranscurridos no duplica progreso', () => {
    const { escenas, sucesos, estadoMundo } = estadoBase(); // suceso_escasez_001: progreso 40, velocidad 5
    const motor = crearMotorDeSucesos({ sucesos, escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = motorEventosVacio(escenas);

    estadoMundo.ticksTranscurridos += 2;
    motor.procesarTicks(estadoMundo, motorEventos);
    const escasezTrasPrimeraLlamada = sucesos.find((s) => s.id === 'suceso_escasez_001').progreso;
    assert.equal(escasezTrasPrimeraLlamada, 50); // 40 + 5*2

    const { sucesosModificados } = motor.procesarTicks(estadoMundo, motorEventos); // mismo ticksTranscurridos, sin avanzar
    assert.equal(sucesosModificados.length, 0);
    assert.equal(sucesos.find((s) => s.id === 'suceso_escasez_001').progreso, 50); // no cambió
  });

  test('salto grande de ticks de una sola vez aplica el cálculo completo, no ciclo por ciclo', () => {
    const { escenas, sucesos, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos, escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = motorEventosVacio(escenas);

    estadoMundo.ticksTranscurridos += 9; // salto de 9 ticks de golpe (ej. el jugador durmió)
    motor.procesarTicks(estadoMundo, motorEventos);
    // 40 + 5*9 = 85 — si se hubiera "perdido" algún tick por procesar de a
    // uno mal, este número no cerraría.
    assert.equal(sucesos.find((s) => s.id === 'suceso_escasez_001').progreso, 85);
  });
});

describe('Motor de Sucesos — Escasez de alimentos (tabla 4.4, categoría Económico)', () => {
  test('llega a 100%, se desactiva y genera el Evento indicado en su propia escena', () => {
    const { escenas, sucesos, estadoMundo } = estadoBase(); // progreso 40, velocidad 5 -> faltan 12 ticks para 100
    const motor = crearMotorDeSucesos({ sucesos, escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });

    estadoMundo.ticksTranscurridos += 12;
    const { sucesosModificados, eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    const escasez = sucesosModificados.find((s) => s.id === 'suceso_escasez_001');
    assert.equal(escasez.activo, false);
    assert.ok(escasez.progreso >= 100);

    assert.equal(eventosGenerados.length, 1);
    assert.equal(eventosGenerados[0].tipo, 'disputa_publica');
    assert.equal(eventosGenerados[0].escenaId, 'escena_plaza');
    assert.equal(eventosGenerados[0].metadata.sucesoOrigenId, 'suceso_escasez_001');
    assert.ok(motorEventos.listarEventosActivos('escena_plaza').some((e) => e.id === eventosGenerados[0].id));
  });
});

describe('Motor de Sucesos — Tensión creciente (tabla 4.4, categoría Social/conflicto)', () => {
  function crearTensionTest(motor, estadoMundo, id = 'suceso_tension_test_001') {
    const { suceso } = motor.crearSuceso(
      {
        id, tipo: 'tension_creciente', alcance: 'escena', escenaId: 'escena_plaza',
        progreso: 0, velocidadProgreso: 10, condicionResolucion: 'mediador_interviene',
        eventoGeneradoAlResolver: 'estallido_conflicto',
      },
      estadoMundo,
      { eventoGeneradoSiResuelveAnticipado: 'tregua_fragil' }
    );
    return suceso;
  }

  test('camino 1: llega a 100% sin mediador -> genera "estallido_conflicto"', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });
    crearTensionTest(motor, estadoMundo);

    estadoMundo.ticksTranscurridos += 10; // 10 * 10 = 100 exacto
    const { sucesosModificados, eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    const tension = sucesosModificados.find((s) => s.id === 'suceso_tension_test_001');
    assert.equal(tension.activo, false);
    assert.equal(eventosGenerados.length, 1);
    assert.equal(eventosGenerados[0].tipo, 'estallido_conflicto');
  });

  test('camino 2: se corta antes por mediador_interviene -> genera "tregua_fragil", no "estallido_conflicto"', () => {
    const { escenas, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, jugador, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });
    crearTensionTest(motor, estadoMundo, 'suceso_tension_test_002');

    estadoMundo.ticksTranscurridos += 3; // progreso 30, lejos de 100
    jugador.flags.mediadorInterviene = true;
    const { sucesosModificados, eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    const tension = sucesosModificados.find((s) => s.id === 'suceso_tension_test_002');
    assert.equal(tension.activo, false);
    assert.ok(tension.progreso < 100);
    assert.equal(eventosGenerados.length, 1);
    assert.equal(eventosGenerados[0].tipo, 'tregua_fragil');
  });
});

describe('Motor de Sucesos — Migración de fauna (tabla 4.4, categoría Ambiental, alcance global)', () => {
  test('resolución "silenciosa": llega a 100%, se desactiva, no genera ningún Evento', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });

    motor.crearSuceso(
      {
        id: 'suceso_migracion_test_002', tipo: 'migracion_fauna', alcance: 'global', escenaId: null,
        progreso: 96, velocidadProgreso: 2, condicionResolucion: 'no_aplica', eventoGeneradoAlResolver: null,
      },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 2; // 96 + 2*2 = 100
    const { sucesosModificados, eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    assert.equal(sucesosModificados[0].activo, false);
    assert.deepEqual(eventosGenerados, []);
  });

  test('un Suceso global genera un Evento en TODAS las escenas conocidas, incluida una donde el jugador no está', () => {
    const { escenas, jugador, estadoMundo } = estadoBase();
    jugador.ubicacionActual = 'escena_herreria'; // el jugador está acá, no en plaza ni celda
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, jugador, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });

    motor.crearSuceso(
      {
        id: 'suceso_plaga_test_001', tipo: 'plaga', alcance: 'global', escenaId: null,
        progreso: 90, velocidadProgreso: 10, condicionResolucion: 'no_aplica', eventoGeneradoAlResolver: 'brote_de_plaga',
      },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 1; // 90 + 10 = 100
    const { eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    const escenasConEvento = eventosGenerados.map((e) => e.escenaId).sort();
    assert.deepEqual(escenasConEvento, ['escena_celda', 'escena_herreria', 'escena_plaza'].sort());
    assert.ok(escenasConEvento.includes('escena_plaza')); // el jugador nunca estuvo ahí en este test
  });
});

describe('Motor de Sucesos — dos Sucesos generando el mismo tipo de Evento en la misma escena', () => {
  test('generan dos instancias de Evento distintas, no una fusionada', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });

    for (const id of ['suceso_disputa_a_001', 'suceso_disputa_b_001']) {
      motor.crearSuceso(
        {
          id, tipo: 'tension_menor', alcance: 'escena', escenaId: 'escena_plaza',
          progreso: 99, velocidadProgreso: 5, condicionResolucion: 'no_aplica', eventoGeneradoAlResolver: 'disputa_publica',
        },
        estadoMundo
      );
    }

    estadoMundo.ticksTranscurridos += 1;
    const { eventosGenerados } = motor.procesarTicks(estadoMundo, motorEventos);

    assert.equal(eventosGenerados.length, 2);
    assert.notEqual(eventosGenerados[0].id, eventosGenerados[1].id);
    assert.ok(eventosGenerados.every((e) => e.tipo === 'disputa_publica' && e.escenaId === 'escena_plaza'));
  });
});

describe('Motor de Sucesos — resolverSuceso (resolución forzada) y evaluadores extensibles', () => {
  test('resolverSuceso fuerza una resolución anticipada antes de llegar a 100%', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });

    motor.crearSuceso(
      {
        id: 'suceso_forzado_001', tipo: 'tension_creciente', alcance: 'escena', escenaId: 'escena_plaza',
        progreso: 10, velocidadProgreso: 5, condicionResolucion: 'mediador_interviene', eventoGeneradoAlResolver: 'estallido_conflicto',
      },
      estadoMundo,
      { eventoGeneradoSiResuelveAnticipado: 'tregua_fragil' }
    );

    const eventosGenerados = motor.resolverSuceso('suceso_forzado_001', motorEventos, estadoMundo);
    assert.equal(eventosGenerados[0].tipo, 'tregua_fragil');

    // Ya resuelto: una segunda llamada no hace nada (no es un id inexistente, pero ya no está activo).
    assert.deepEqual(motor.resolverSuceso('suceso_forzado_001', motorEventos, estadoMundo), []);
  });

  test('resolverSuceso sobre un id inexistente lanza error', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas });
    assert.throws(() => motor.resolverSuceso('no_existe', crearMotorDeEventos({ escenas }), estadoMundo));
  });

  test('registrarEvaluadorResolucion agrega un evaluador nuevo sin tocar el motor', () => {
    const { escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos: [], escenas, estadoMundoInicial: estadoMundo });
    const motorEventos = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });
    motor.registrarEvaluadorResolucion('evaluador_de_prueba', () => true);

    motor.crearSuceso(
      {
        id: 'suceso_custom_001', tipo: 'custom', alcance: 'escena', escenaId: 'escena_plaza',
        progreso: 10, velocidadProgreso: 1, condicionResolucion: 'evaluador_de_prueba', eventoGeneradoAlResolver: null,
      },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 1;
    const { sucesosModificados } = motor.procesarTicks(estadoMundo, motorEventos);
    assert.equal(sucesosModificados.find((s) => s.id === 'suceso_custom_001').activo, false);
  });
});

describe('Motor de Sucesos — listarTodos / exportarEstadoInterno / estadoInternoInicial (extensión aditiva de Fase 7)', () => {
  function motorConSuceso() {
    const { escenas, sucesos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos, escenas, jugador, estadoMundoInicial: estadoMundo });
    return { motor, escenas, sucesos, jugador, estadoMundo };
  }

  test('listarTodos devuelve activos e inactivos, incluidos los creados después de construir', () => {
    const { motor, estadoMundo } = motorConSuceso();
    motor.crearSuceso(
      {
        id: 'suceso_extra', tipo: 'migracion_fauna', alcance: 'global', escenaId: null,
        progreso: 0, velocidadProgreso: 2, condicionResolucion: 'x', eventoGeneradoAlResolver: null, activo: false,
      },
      estadoMundo
    );
    assert.deepEqual(motor.listarTodos().map((s) => s.id), ['suceso_escasez_001', 'suceso_extra']);
  });

  test('exportarEstadoInterno es JSON plano indexado por id (no un Map) y sobrevive JSON.stringify', () => {
    const { motor, estadoMundo } = motorConSuceso();
    const exportado = motor.exportarEstadoInterno();

    assert.ok(!(exportado.sucesos instanceof Map));
    assert.deepEqual(Object.keys(exportado.sucesos), ['suceso_escasez_001']);
    assert.equal(exportado.sucesos.suceso_escasez_001.ultimoTickProcesado, estadoMundo.ticksTranscurridos);
    assert.deepEqual(JSON.parse(JSON.stringify(exportado)), exportado);
  });

  test('exportarEstadoInterno devuelve copias: mutar el resultado no toca el motor', () => {
    const { motor } = motorConSuceso();
    const exportado = motor.exportarEstadoInterno();
    exportado.sucesos.suceso_escasez_001.ultimoTickProcesado = 999999;
    assert.notEqual(motor.exportarEstadoInterno().sucesos.suceso_escasez_001.ultimoTickProcesado, 999999);
  });

  test('exporta los campos internos configurados vía registrarResolucionAnticipada', () => {
    const { motor } = motorConSuceso();
    motor.registrarResolucionAnticipada('suceso_escasez_001', {
      eventoGeneradoSiResuelveAnticipado: 'tregua_fragil', duracionEventoGenerado: 7, condicionExpiracionEventoGenerado: null,
    });
    const interno = motor.exportarEstadoInterno().sucesos.suceso_escasez_001;
    assert.equal(interno.eventoGeneradoSiResuelveAnticipado, 'tregua_fragil');
    assert.equal(interno.duracionEventoGenerado, 7);
  });

  test('IDEMPOTENCIA tras restaurar: procesar el mismo tick ya procesado antes de guardar no vuelve a progresar', () => {
    const { motor, escenas, sucesos, jugador, estadoMundo } = motorConSuceso();
    const eventos = crearMotorDeEventos({ escenas });
    const tick = { ...estadoMundo, ticksTranscurridos: estadoMundo.ticksTranscurridos + 4 };
    motor.procesarTicks(tick, eventos);
    const progresoGuardado = sucesos[0].progreso; // 40 + 5*4
    assert.equal(progresoGuardado, 60);

    const sucesosCopia = JSON.parse(JSON.stringify(motor.listarTodos()));
    const internoCopia = JSON.parse(JSON.stringify(motor.exportarEstadoInterno()));

    // Restaura pasando estadoMundoInicial en el tick AVANZADO (lo que haría un orquestador ingenuo):
    // sin estadoInternoInicial, el sellado lo llevaría a ultimoTickProcesado = tick, y este caso pasaría por casualidad.
    // Lo que se prueba acá es lo contrario: con estado interno restaurado, gana lo guardado, no el sellado.
    const restaurado = crearMotorDeSucesos({
      sucesos: sucesosCopia, escenas: cargarFixture('escenas'), jugador,
      estadoMundoInicial: { ...estadoMundo, ticksTranscurridos: 0 },
      estadoInternoInicial: internoCopia,
    });
    restaurado.procesarTicks(tick, crearMotorDeEventos({ escenas: cargarFixture('escenas') }));
    assert.equal(sucesosCopia[0].progreso, progresoGuardado, 'el tick ya procesado no progresa otra vez');

    const tickSiguiente = { ...estadoMundo, ticksTranscurridos: tick.ticksTranscurridos + 2 };
    restaurado.procesarTicks(tickSiguiente, crearMotorDeEventos({ escenas: cargarFixture('escenas') }));
    assert.equal(sucesosCopia[0].progreso, progresoGuardado + 10, 'un tick nuevo sí progresa, exactamente por los ticks nuevos');
  });

  test('sin estadoInternoInicial: comportamiento anterior intacto (sellado por estadoMundoInicial)', () => {
    const { motor, estadoMundo } = motorConSuceso();
    assert.equal(motor.exportarEstadoInterno().sucesos.suceso_escasez_001.ultimoTickProcesado, estadoMundo.ticksTranscurridos);
  });

  test('un suceso sin entrada en estadoInternoInicial conserva el sellado de estadoMundoInicial', () => {
    const { escenas, sucesos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeSucesos({ sucesos, escenas, jugador, estadoMundoInicial: estadoMundo, estadoInternoInicial: { sucesos: {} } });
    assert.equal(motor.exportarEstadoInterno().sucesos.suceso_escasez_001.ultimoTickProcesado, estadoMundo.ticksTranscurridos);
  });

  test('falla fuerte: id desconocido, ultimoTickProcesado no numérico, forma equivocada', () => {
    const { escenas, sucesos, jugador, estadoMundo } = estadoBase();
    const base = { sucesos, escenas, jugador, estadoMundoInicial: estadoMundo };
    assert.throws(
      () => crearMotorDeSucesos({ ...base, estadoInternoInicial: { sucesos: { suceso_fantasma: { ultimoTickProcesado: 1 } } } }),
      /suceso_fantasma/
    );
    assert.throws(
      () => crearMotorDeSucesos({ ...base, estadoInternoInicial: { sucesos: { suceso_escasez_001: { ultimoTickProcesado: 'ayer' } } } }),
      /ultimoTickProcesado/
    );
    assert.throws(() => crearMotorDeSucesos({ ...base, estadoInternoInicial: { sucesos: [] } }), /indexado por id/);
  });
});
