import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearMotorDeEventos } from './motorEventos.js';

function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

// Copias frescas en cada test: escenas, eventos y jugador se mutan
// (eventosActivos, activo, metadata, flags) y no deben pisarse entre tests.
// estadoMundoInicial se pasa siempre: los dos eventos ficticios del dataset
// de Fase 0 (incendio, disputa_publica) ya vienen activo:true sin haber
// pasado por crearEvento en esta sesión, así que el motor necesita saber
// desde cuándo "contar" su duración (ver nota en motorEventos.js).
function estadoBase() {
  const escenas = cargarFixture('escenas');
  const eventos = cargarFixture('eventos');
  const jugador = cargarFixture('jugador');
  const estadoMundo = cargarFixture('estadoDelMundo'); // horaActual:14, diaActual:3, ticksTranscurridos:72
  return { escenas, eventos, jugador, estadoMundo };
}

describe('Motor de Eventos — creación y sincronización con Escena', () => {
  test('crearEvento válido queda activo, sella tickDeActivacion y sincroniza escena.eventosActivos', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    const { evento, errores } = motor.crearEvento(
      { id: 'evento_tormenta_test_001', tipo: 'tormenta_local', escenaId: 'escena_herreria', duracion: 10, condicionExpiracion: null },
      estadoMundo
    );

    assert.deepEqual(errores, []);
    assert.equal(evento.activo, true);
    assert.equal(evento.metadata.tickDeActivacion, estadoMundo.ticksTranscurridos);

    const escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');
    assert.ok(escenaHerreria.eventosActivos.includes('evento_tormenta_test_001'));
  });

  test('crearEvento rechaza duracion y condicionExpiracion ambos null (reusa validarEstructura de Fase 0)', () => {
    const { eventos, escenas } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas });

    const { evento, errores } = motor.crearEvento({
      id: 'evento_invalido_001', tipo: 'x', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: null,
    });

    assert.equal(evento, null);
    assert.ok(errores.length > 0);
  });

  test('crearEvento para una escena que el motor no tiene cargada no explota (lo referencial es de Fase 0, no de este motor)', () => {
    const { eventos } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas: [] });

    const { evento, errores } = motor.crearEvento({
      id: 'evento_x', tipo: 'x', escenaId: 'escena_inexistente', duracion: 1, condicionExpiracion: null,
    });

    assert.deepEqual(errores, []);
    assert.equal(evento.activo, true);
  });

  test('desactivarEvento saca el id de escena.eventosActivos; activarEvento lo repone y resetea tickDeActivacion', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.desactivarEvento('evento_incendio_001', 'motivo_de_test');
    let escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');
    assert.ok(!escenaHerreria.eventosActivos.includes('evento_incendio_001'));

    estadoMundo.ticksTranscurridos += 3;
    const reactivado = motor.activarEvento('evento_incendio_001', estadoMundo);
    assert.equal(reactivado.activo, true);
    assert.equal(reactivado.metadata.tickDeActivacion, estadoMundo.ticksTranscurridos);

    escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');
    assert.ok(escenaHerreria.eventosActivos.includes('evento_incendio_001'));
  });

  test('activarEvento/desactivarEvento sobre un id inexistente lanza error', () => {
    const { eventos, escenas } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas });
    assert.throws(() => motor.activarEvento('no_existe', {}));
    assert.throws(() => motor.desactivarEvento('no_existe', 'x'));
  });

  test('sin estadoMundoInicial, un evento precargado sin tickDeActivacion cuenta desde 0 (fallback documentado, no bug)', () => {
    const { eventos, escenas, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas }); // sin estadoMundoInicial a propósito

    // El incendio (duracion:5) ya cuenta desde 0, así que con
    // ticksTranscurridos:72 del fixture ya está más que vencido.
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.ok(desactivados.some((e) => e.id === 'evento_incendio_001'));
  });
});

describe('Motor de Eventos — listarEventosActivos', () => {
  test('filtra por escena y activo=true; eventos contradictorios en la misma escena conviven sin problema (no decide cuál gana, eso es Fase 2)', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.crearEvento(
      { id: 'evento_mercado_test_001', tipo: 'mercado_abierto', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: 'transcurre_un_dia_completo' },
      estadoMundo
    );
    motor.crearEvento(
      { id: 'evento_emboscada_test_001', tipo: 'emboscada', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: 'jugador_huye_o_vence' },
      estadoMundo
    );

    const activosEnPlaza = motor.listarEventosActivos('escena_plaza').map((e) => e.id);
    assert.ok(activosEnPlaza.includes('evento_disputa_publica_001')); // ya venía del fixture
    assert.ok(activosEnPlaza.includes('evento_mercado_test_001')); // social/pacífico
    assert.ok(activosEnPlaza.includes('evento_emboscada_test_001')); // peligro, simultáneo y contradictorio
    assert.equal(motor.listarEventosActivos('escena_celda').length, 0);
  });
});

describe('Motor de Eventos — revisarExpiraciones, universo de casos (tabla 3.3)', () => {
  test('Peligro/incendio: expira por duración exacta, no antes', () => {
    const { escenas, eventos, estadoMundo } = estadoBase(); // incendio ya activo, sellado en tick 72, duracion 5
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    estadoMundo.ticksTranscurridos = 76; // falta 1 tick
    assert.deepEqual(motor.revisarExpiraciones(estadoMundo), []);
    assert.ok(motor.listarEventosActivos('escena_herreria').some((e) => e.id === 'evento_incendio_001'));

    estadoMundo.ticksTranscurridos = 77; // exactos 5 ticks desde la activación
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados.length, 1);
    assert.equal(desactivados[0].id, 'evento_incendio_001');
    assert.equal(desactivados[0].metadata.motivoDesactivacion, 'duracion_cumplida');
  });

  test('Social/disputa pública: nunca expira por tiempo, sólo cuando se cumple mediador_interviene', () => {
    const { escenas, eventos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, jugador, estadoMundoInicial: estadoMundo });

    // Se saca el incendio de encima para poder aislar el comportamiento de la disputa.
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    estadoMundo.ticksTranscurridos += 1000; // pasa muchísimo tiempo
    assert.deepEqual(motor.revisarExpiraciones(estadoMundo), []);

    jugador.flags.mediadorInterviene = true;
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados[0]?.id, 'evento_disputa_publica_001');
  });

  test('Peligro/emboscada: sin duración, expira sólo por condición', () => {
    const { escenas, eventos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, jugador, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    motor.crearEvento(
      { id: 'evento_emboscada_test_001', tipo: 'emboscada', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: 'jugador_huye_o_vence' },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 500;
    assert.equal(motor.revisarExpiraciones(estadoMundo).length, 0);

    jugador.flags.vencioEmboscada = true;
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados[0].id, 'evento_emboscada_test_001');
  });

  test('Ambiental/tormenta local: expira sólo por duración, la condición no aplica (es null)', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    motor.crearEvento(
      { id: 'evento_tormenta_test_001', tipo: 'tormenta_local', escenaId: 'escena_herreria', duracion: 10, condicionExpiracion: null },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 9;
    assert.equal(motor.revisarExpiraciones(estadoMundo).length, 0);

    estadoMundo.ticksTranscurridos += 1;
    assert.equal(motor.revisarExpiraciones(estadoMundo)[0].id, 'evento_tormenta_test_001');
  });

  test('Mixto/bloqueo de camino: se resuelve por lo que ocurra primero — condición antes que la duración', () => {
    const { escenas, eventos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, jugador, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    motor.crearEvento(
      { id: 'evento_bloqueo_test_001', tipo: 'bloqueo_camino', escenaId: 'escena_plaza', duracion: 20, condicionExpiracion: 'derrumbe_despejado' },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 8; // lejos de los 20 ticks
    jugador.flags.derrumbeDespejado = true;
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados.length, 1);
    assert.equal(desactivados[0].id, 'evento_bloqueo_test_001');
    assert.equal(desactivados[0].metadata.motivoDesactivacion, 'condicion_cumplida');
  });

  test('Mixto/bloqueo de camino: se resuelve por lo que ocurra primero — duración antes que la condición', () => {
    const { escenas, eventos, jugador, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, jugador, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    motor.crearEvento(
      { id: 'evento_bloqueo_test_002', tipo: 'bloqueo_camino', escenaId: 'escena_plaza', duracion: 20, condicionExpiracion: 'derrumbe_despejado' },
      estadoMundo
    );

    estadoMundo.ticksTranscurridos += 20; // se cumplen los 20 ticks; el jugador nunca despejó nada
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados.length, 1);
    assert.equal(desactivados[0].id, 'evento_bloqueo_test_002');
    assert.equal(desactivados[0].metadata.motivoDesactivacion, 'duracion_cumplida');
  });

  test('Salvaguarda: un evento con duracion y condicionExpiracion ambos null que "llegó por otra vía" se reporta y se desactiva de oficio', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    // Simula el caso "bug de otra parte del sistema" (doc técnico, 3.2 punto 4):
    // esto nunca pasa vía motor.crearEvento (validarEstructura ya lo rechaza),
    // así que se inyecta directo en el estado inicial del motor.
    eventos.push({
      id: 'evento_inconsistente_001', tipo: 'bug', escenaId: 'escena_plaza',
      duracion: null, condicionExpiracion: null, activo: true, metadata: {},
    });
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    const desactivados = motor.revisarExpiraciones(estadoMundo);
    const inconsistente = desactivados.find((e) => e.id === 'evento_inconsistente_001');
    assert.ok(inconsistente);
    assert.equal(inconsistente.activo, false);
    assert.equal(inconsistente.metadata.inconsistenciaDetectada, 'duracion_y_condicionExpiracion_ambos_null');
  });
});

describe('Motor de Eventos — evaluadores de condición extensibles', () => {
  test('registrarEvaluadorExpiracion agrega un evaluador nuevo sin tocar el motor', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');
    motor.registrarEvaluadorExpiracion('evaluador_de_prueba', () => true);

    motor.crearEvento(
      { id: 'evento_custom_001', tipo: 'custom', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: 'evaluador_de_prueba' },
      estadoMundo
    );

    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.equal(desactivados.length, 1);
    assert.equal(desactivados[0].id, 'evento_custom_001');
  });

  test('npc_deja_de_estar_hostil resuelve el NPC desde evento.metadata.npcId', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const npcs = cargarFixture('npcs');
    const herrero = npcs.find((n) => n.id === 'npc_herrero_001');
    herrero.relacion.valor = -50; // hostil

    const motor = crearMotorDeEventos({ eventos, escenas, npcs, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'no_relevante_para_este_test');

    motor.crearEvento(
      {
        id: 'evento_hostilidad_001', tipo: 'hostilidad', escenaId: 'escena_herreria',
        duracion: null, condicionExpiracion: 'npc_deja_de_estar_hostil', metadata: { npcId: 'npc_herrero_001' },
      },
      estadoMundo
    );

    assert.equal(motor.revisarExpiraciones(estadoMundo).length, 0); // sigue hostil

    herrero.relacion.valor = -10; // ya no hostil (> -20)
    const desactivados = motor.revisarExpiraciones(estadoMundo);
    assert.ok(desactivados.some((e) => e.id === 'evento_hostilidad_001'));
  });
});

describe('Motor de Eventos — existioAlgunaVez (extensión aditiva para Fase 4)', () => {
  test('evento cargado ya activo (backfill de estadoMundoInicial) devuelve true', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    assert.equal(motor.existioAlgunaVez('evento_incendio_001'), true);
  });

  test('evento creado con activo:true vía crearEvento devuelve true de inmediato', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.crearEvento(
      { id: 'evento_test_activo', tipo: 'x', escenaId: 'escena_plaza', duracion: 5, condicionExpiracion: null },
      estadoMundo
    );

    assert.equal(motor.existioAlgunaVez('evento_test_activo'), true);
  });

  test('evento latente (activo:false, nunca activado) devuelve false — semántica B, no A', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.crearEvento(
      { id: 'evento_latente_001', tipo: 'x', escenaId: 'escena_plaza', duracion: 5, condicionExpiracion: null, activo: false },
      estadoMundo
    );

    // Existe en el registro del motor (semántica A diría true) pero
    // nunca estuvo activo (semántica B, la elegida, dice false): un
    // evento que nunca se disparó no es "algo que pasó en la partida".
    assert.equal(motor.existioAlgunaVez('evento_latente_001'), false);
  });

  test('evento que estuvo activo y ya se desactivó sigue devolviendo true (no se "olvida" al resolverse)', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    assert.equal(motor.existioAlgunaVez('evento_incendio_001'), true);
    motor.desactivarEvento('evento_incendio_001', 'apagado');
    assert.equal(motor.existioAlgunaVez('evento_incendio_001'), true);
  });

  test('evento latente que luego se activa pasa de false a true', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.crearEvento(
      { id: 'evento_latente_002', tipo: 'x', escenaId: 'escena_plaza', duracion: 5, condicionExpiracion: null, activo: false },
      estadoMundo
    );
    assert.equal(motor.existioAlgunaVez('evento_latente_002'), false);

    motor.activarEvento('evento_latente_002', estadoMundo);
    assert.equal(motor.existioAlgunaVez('evento_latente_002'), true);
  });

  test('id inexistente devuelve false sin reventar', () => {
    const { escenas, eventos, estadoMundo } = estadoBase();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    assert.equal(motor.existioAlgunaVez('evento_que_no_existe'), false);
  });
});

describe('Motor de Eventos — listarTodos (extensión aditiva de Fase 7)', () => {
  test('devuelve activos e inactivos, en orden de creación, y un array nuevo en cada llamada', () => {
    const escenas = cargarFixture('escenas');
    const eventos = cargarFixture('eventos');
    const estadoMundo = cargarFixture('estadoDelMundo');
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });

    motor.desactivarEvento(eventos[0].id, 'test');
    const todos = motor.listarTodos();

    assert.deepEqual(todos.map((e) => e.id), eventos.map((e) => e.id));
    assert.equal(todos.find((e) => e.id === eventos[0].id).activo, false);
    assert.equal(todos.find((e) => e.id === eventos[1].id).activo, true);
    assert.notEqual(motor.listarTodos(), todos, 'cada llamada devuelve un array distinto');
  });

  test('incluye eventos creados después de construir el motor, también los que nacieron inactivos', () => {
    const escenas = cargarFixture('escenas');
    const estadoMundo = cargarFixture('estadoDelMundo');
    const motor = crearMotorDeEventos({ escenas, estadoMundoInicial: estadoMundo });
    motor.crearEvento(
      { id: 'evento_nuevo', tipo: 'incendio', escenaId: 'escena_plaza', duracion: 5, condicionExpiracion: null },
      estadoMundo
    );
    motor.crearEvento(
      { id: 'evento_latente', tipo: 'incendio', escenaId: 'escena_plaza', duracion: 5, condicionExpiracion: null, activo: false },
      estadoMundo
    );
    assert.deepEqual(motor.listarTodos().map((e) => e.id), ['evento_nuevo', 'evento_latente']);
  });

  test('mutar el array devuelto no altera el motor', () => {
    const motor = crearMotorDeEventos({ eventos: cargarFixture('eventos'), escenas: cargarFixture('escenas'), estadoMundoInicial: cargarFixture('estadoDelMundo') });
    const antes = motor.listarTodos().length;
    motor.listarTodos().pop();
    assert.equal(motor.listarTodos().length, antes);
  });

  test('round-trip: un motor reconstruido con listarTodos() conserva existioAlgunaVez de un evento ya desactivado', () => {
    const escenas = cargarFixture('escenas');
    const estadoMundo = cargarFixture('estadoDelMundo');
    const original = crearMotorDeEventos({ eventos: cargarFixture('eventos'), escenas, estadoMundoInicial: estadoMundo });
    original.desactivarEvento('evento_incendio_001', 'apagado');

    const copia = JSON.parse(JSON.stringify(original.listarTodos()));
    const restaurado = crearMotorDeEventos({ eventos: copia, escenas: cargarFixture('escenas'), estadoMundoInicial: estadoMundo });

    assert.equal(restaurado.existioAlgunaVez('evento_incendio_001'), true);
    assert.equal(restaurado.listarEventosActivos('escena_herreria').length, 0);
  });
});
