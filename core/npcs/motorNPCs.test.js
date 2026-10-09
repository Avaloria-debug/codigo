import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearNPC } from '../modelos/npc.js';
import { crearEscena } from '../modelos/escena.js';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { actualizarEstadoCalculado } from '../comprensionMundo/calcularEstadoEscena.js';
import { crearMotorDeNPCs } from './motorNPCs.js';

function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

function accion(overrides = {}) {
  return {
    verboId: null,
    opcionElegidaId: null,
    npcObjetivoId: null,
    textoLibre: null,
    resultado: 'exito',
    tick: 1,
    ...overrides,
  };
}

/** NPC mínimo aislado, sin dataset compartido — para tests que no necesitan el fixture de Fase 0. */
function npcAislado(overrides = {}) {
  return crearNPC({
    id: 'npc_a',
    nombre: 'NPC A',
    arquetipo: 'comerciante',
    personalidadBase: 'Test.',
    relacion: { valor: 0, historialRelevante: [] },
    ...overrides,
  });
}

function escenaAislada(overrides = {}) {
  return crearEscena({
    id: 'escena_x',
    nombre: 'Escena X',
    descripcionBase: 'Test.',
    ...overrides,
  });
}

describe('crearMotorDeNPCs — construcción', () => {
  test('motorEventos es obligatorio: sin él, tira error al construir', () => {
    assert.throws(() => crearMotorDeNPCs({ npcs: [], escenas: [] }), /motorEventos es obligatorio/);
  });
});

describe('procesarAccionResuelta — secuencia completa (doc técnico Fase 4, sección 6)', () => {
  test('reproduce los 6 pasos exactos con npc_herrero_001 y el conocimiento umbralRelacion:40', () => {
    const npcs = cargarFixture('npcs');
    const herrero = npcs.find((n) => n.id === 'npc_herrero_001');
    assert.equal(herrero.relacion.valor, 0);
    assert.equal(
      herrero.conocimientos.find((c) => c.id === 'conocimiento_ruta_secreta').umbralRelacion,
      40
    );

    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs, escenas: [], motorEventos });

    // Paso 1: Hablar, éxito → +5 → 5 (Neutral), alegre, no revela (5<40)
    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: herrero.id, resultado: 'exito', tick: 1 }));
    assert.equal(herrero.relacion.valor, 5);
    assert.equal(herrero.estadoEmocional, 'alegre');
    assert.equal(motor.conocimientosRevelablesDe(herrero.id).length, 0);

    // Paso 2: Negociar (ofrecer valor), éxito → +15 → 20 (Cordial), alegre, no revela (20<40)
    motor.procesarAccionResuelta(
      accion({
        verboId: 'Negociar',
        opcionElegidaId: 'Ofrecer algo de valor a cambio',
        npcObjetivoId: herrero.id,
        resultado: 'exito',
        tick: 2,
      })
    );
    assert.equal(herrero.relacion.valor, 20);
    assert.equal(herrero.estadoEmocional, 'alegre');
    assert.equal(motor.conocimientosRevelablesDe(herrero.id).length, 0);

    // Paso 3: Hablar, éxito → +5 → 25 (Cordial), alegre, no revela (25<40)
    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: herrero.id, resultado: 'exito', tick: 3 }));
    assert.equal(herrero.relacion.valor, 25);
    assert.equal(motor.conocimientosRevelablesDe(herrero.id).length, 0);

    // Paso 4: Negociar (ofrecer valor), éxito → +15 → 40 (Cordial), alegre, SÍ revela (40>=40)
    motor.procesarAccionResuelta(
      accion({
        verboId: 'Negociar',
        opcionElegidaId: 'Ofrecer algo de valor a cambio',
        npcObjetivoId: herrero.id,
        resultado: 'exito',
        tick: 4,
      })
    );
    assert.equal(herrero.relacion.valor, 40);
    assert.equal(herrero.estadoEmocional, 'alegre');
    assert.equal(motor.conocimientosRevelablesDe(herrero.id).length, 1);
    assert.equal(motor.conocimientosRevelablesDe(herrero.id)[0].id, 'conocimiento_ruta_secreta');

    // Paso 5: Presionar, fallo → -15 → 25 (Cordial), hostil (disposicion fijada a -2)
    motor.procesarAccionResuelta(accion({ verboId: 'Presionar', npcObjetivoId: herrero.id, resultado: 'fallo', tick: 5 }));
    assert.equal(herrero.relacion.valor, 25);
    assert.equal(herrero.estadoEmocional, 'hostil');
    // Nota: conocimientosRevelables es puro/recalculado (doc técnico, sección
    // 9: "no está soportado por ningún campo... se puede recalcular en cada
    // consulta sin recordar qué ya se dijo"). Acá 25<40, así que una consulta
    // fresca en este punto da "no revelable ahora" — no implica que el
    // secreto se "reoculte" narrativamente, esa lógica queda fuera de
    // alcance a propósito. No es lo mismo que el "No" de la tabla del doc
    // (que habla de que no hay un evento de revelación NUEVO en este paso).
    assert.equal(motor.conocimientosRevelablesDe(herrero.id).length, 0);

    // Paso 6: Atacar → -40 → -15 (Neutral, borde bajo), hostil
    motor.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: herrero.id, resultado: 'exito', tick: 6 }));
    assert.equal(herrero.relacion.valor, -15);
    assert.equal(herrero.estadoEmocional, 'hostil');

    // 6 pasos, 6 deltas no-cero → 6 entradas en historialRelevante.
    assert.equal(herrero.relacion.historialRelevante.length, 6);
    assert.deepEqual(herrero.relacion.historialRelevante[0], { eventoId: 'accion:Hablar con...', delta: 5, momento: 'tick:1' });
    assert.deepEqual(herrero.relacion.historialRelevante[5], { eventoId: 'accion:Atacar', delta: -40, momento: 'tick:6' });
  });
});

describe('Clamp en los extremos (doc técnico, sección 7)', () => {
  test('relación en el piso (-95), Atacar (-40 nominal, moderado a -20 por estar en Hostil) → clamp a -100, no a -135', () => {
    const npc = npcAislado({ relacion: { valor: -95, historialRelevante: [] } });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: npc.id }));
    assert.equal(npc.relacion.valor, -100);
  });

  test('relación en el techo (95), Negociar/ofrecer-valor éxito (+15 nominal, moderado a +7.5 por estar en Aliado) → clamp a 100, no a 102.5', () => {
    const npc = npcAislado({ relacion: { valor: 95, historialRelevante: [] } });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(
      accion({ verboId: 'Negociar', opcionElegidaId: 'Ofrecer algo de valor a cambio', npcObjetivoId: npc.id, resultado: 'exito' })
    );
    assert.equal(npc.relacion.valor, 100);
  });

  test('zona de moderación sin llegar al clamp: 70 (Aliado) + 15 nominal moderado a 7.5 → 77.5', () => {
    const npc = npcAislado({ relacion: { valor: 70, historialRelevante: [] } });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    const { deltaRelacionAplicado } = motor.procesarAccionResuelta(
      accion({ verboId: 'Negociar', opcionElegidaId: 'Ofrecer algo de valor a cambio', npcObjetivoId: npc.id, resultado: 'exito' })
    );
    assert.equal(deltaRelacionAplicado, 7.5);
    assert.equal(npc.relacion.valor, 77.5);
  });
});

describe('procesarEventosDeMundo — doc técnico, sección 4.2', () => {
  test('NPC en escena peligroso por un incendio que él mismo no causó (dataset real de Fase 0/1/2): temor sube, relación no se toca', () => {
    const npcs = cargarFixture('npcs');
    const escenas = cargarFixture('escenas');
    const eventos = cargarFixture('eventos');
    const estadoMundo = cargarFixture('estadoDelMundo');
    const herrero = npcs.find((n) => n.id === 'npc_herrero_001');
    const escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');

    // evento_incendio_001 no tiene metadata.npcId — confirma que la
    // ausencia se trata como amenaza externa (no excluye a nadie).
    const incendio = eventos.find((e) => e.id === 'evento_incendio_001');
    assert.equal(incendio.metadata.npcId, undefined);

    const motorEventos = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    actualizarEstadoCalculado(escenaHerreria, motorEventos.listarEventosActivos('escena_herreria'), estadoMundo);
    assert.equal(escenaHerreria.estadoCalculado, 'peligroso');

    const motor = crearMotorDeNPCs({ npcs, escenas, motorEventos });
    const valorRelacionAntes = herrero.relacion.valor;

    motor.procesarEventosDeMundo();

    assert.equal(herrero.estadoEmocional, 'temeroso');
    assert.deepEqual(motor.obtenerEjesInternos('npc_herrero_001'), { nivelTemor: 1, nivelDisposicion: 0 });
    assert.equal(herrero.relacion.valor, valorRelacionAntes); // sin tocar
    assert.equal(herrero.relacion.historialRelevante.length, 0); // esta vía nunca escribe historial
  });

  test('escena en combate fija nivelTemor a 2 directo', () => {
    const npc = npcAislado({ ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npc.id], estadoCalculado: 'combate' });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [escena], motorEventos });

    motor.procesarEventosDeMundo();
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 2);
    assert.equal(npc.estadoEmocional, 'alarmado');
  });

  test('NPC sin ubicacionActual (null) no se procesa, no rompe', () => {
    const npc = npcAislado({ ubicacionActual: null });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    assert.doesNotThrow(() => motor.procesarEventosDeMundo());
    assert.equal(npc.estadoEmocional, 'neutral');
  });

  test('decaimiento NO es idempotente: cada llamada baja un nivel, no vuelve a 0 de golpe', () => {
    const npc = npcAislado({ ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npc.id], estadoCalculado: 'combate' });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [escena], motorEventos });

    motor.procesarEventosDeMundo(); // combate → nivelTemor = 2
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 2);

    escena.estadoCalculado = 'tranquilo';
    motor.procesarEventosDeMundo();
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 1); // no volvió a 0 de golpe
    motor.procesarEventosDeMundo();
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 0);
    motor.procesarEventosDeMundo();
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 0); // clamp en 0, no negativo
  });
});

describe('procesarEventosDeMundo — exclusión de "NPC fuente de la amenaza" (fase_4_ADENDUM.md, sección 3)', () => {
  test('el NPC marcado como fuente (metadata.npcId) vía un evento peligroso NO escala su propio temor; otro NPC presente SÍ', () => {
    const npcFuente = npcAislado({ id: 'npc_hostil', ubicacionActual: 'escena_x' });
    const npcTestigo = npcAislado({ id: 'npc_testigo', ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npcFuente.id, npcTestigo.id] });

    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    motorEventos.crearEvento({
      id: 'evento_amenaza_001',
      tipo: 'amenaza_npc_hostil', // registro Fase 2: categoriaEstado 'peligroso'
      escenaId: 'escena_x',
      duracion: null,
      condicionExpiracion: 'npc_deja_de_estar_hostil',
      metadata: { npcId: 'npc_hostil' },
    });
    actualizarEstadoCalculado(escena, motorEventos.listarEventosActivos('escena_x'), { horaActual: 12 });
    assert.equal(escena.estadoCalculado, 'peligroso');

    const motor = crearMotorDeNPCs({ npcs: [npcFuente, npcTestigo], escenas: [escena], motorEventos });
    motor.procesarEventosDeMundo();

    assert.equal(motor.obtenerEjesInternos('npc_hostil').nivelTemor, 0); // excluido, es la fuente
    assert.equal(motor.obtenerEjesInternos('npc_testigo').nivelTemor, 1); // no excluido, escala normal
  });

  test('ausencia de metadata.npcId en el evento se trata como amenaza externa (default): el único NPC presente SÍ escala', () => {
    const npc = npcAislado({ ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npc.id] });

    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    motorEventos.crearEvento({
      id: 'evento_sin_npcid',
      tipo: 'incendio', // categoriaEstado 'peligroso', sin metadata.npcId
      escenaId: 'escena_x',
      duracion: 5,
      condicionExpiracion: null,
    });
    actualizarEstadoCalculado(escena, motorEventos.listarEventosActivos('escena_x'), { horaActual: 12 });

    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [escena], motorEventos });
    motor.procesarEventosDeMundo();

    assert.equal(motor.obtenerEjesInternos(npc.id).nivelTemor, 1); // no hay npcId que lo excluya
  });
});

describe('Regla de prioridad de "Calmar la situación" (doc técnico, sección 4.1)', () => {
  test('con nivelTemor > 0: baja el temor, NO toca la disposición', () => {
    const npc = npcAislado({ ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npc.id], estadoCalculado: 'combate' });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [escena], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: npc.id, resultado: 'exito', tick: 1 }));
    motor.procesarEventosDeMundo(); // combate → nivelTemor 2
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 2, nivelDisposicion: 1 });

    const { deltaRelacionAplicado } = motor.procesarAccionResuelta(
      accion({ verboId: 'Calmar la situación', npcObjetivoId: npc.id, resultado: 'exito', tick: 2 })
    );

    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 1, nivelDisposicion: 1 });
    assert.equal(deltaRelacionAplicado, 10);
  });

  test('con nivelTemor > 0 Y nivelDisposicion <= -1 A LA VEZ: gana la prioridad del temor, la disposición espera', () => {
    const npc = npcAislado({ ubicacionActual: 'escena_x' });
    const escena = escenaAislada({ npcsPresentes: [npc.id], estadoCalculado: 'combate' });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [escena] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [escena], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: npc.id, resultado: 'fallo', tick: 1 })); // disposicion -1
    motor.procesarEventosDeMundo(); // combate → temor 2
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 2, nivelDisposicion: -1 });

    motor.procesarAccionResuelta(accion({ verboId: 'Calmar la situación', npcObjetivoId: npc.id, resultado: 'exito', tick: 2 }));

    // Gana temor (prioridad 1 del doc técnico, 4.1): baja a 1, la
    // disposición queda exactamente igual que antes (-1, no mejora
    // todavía) — si el orden estuviera invertido, disposicion pasaría
    // a 0 en este mismo paso, que es justo lo que este test descarta.
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 1, nivelDisposicion: -1 });
  });

  test('con nivelTemor == 0 y nivelDisposicion <= -1: mejora la disposición', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: npc.id, resultado: 'fallo', tick: 1 }));
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 0, nivelDisposicion: -1 });

    motor.procesarAccionResuelta(accion({ verboId: 'Calmar la situación', npcObjetivoId: npc.id, resultado: 'exito', tick: 2 }));
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 0, nivelDisposicion: 0 });
  });

  test('con ambos ejes ya en 0: sin efecto en los ejes, pero el delta de relación (+10) sí se aplica', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    const { deltaRelacionAplicado } = motor.procesarAccionResuelta(
      accion({ verboId: 'Calmar la situación', npcObjetivoId: npc.id, resultado: 'exito' })
    );
    assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 0, nivelDisposicion: 0 });
    assert.equal(deltaRelacionAplicado, 10);
  });

  test('fallo: delta 0, ningún eje se toca, sin entrada en historialRelevante', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Calmar la situación', npcObjetivoId: npc.id, resultado: 'fallo' }));
    assert.equal(npc.relacion.valor, 0);
    assert.equal(npc.relacion.historialRelevante.length, 0);
  });
});

describe('resultado "neutral" — supuesto explícito (fase_4_ADENDUM.md, sección 2)', () => {
  test('Hablar/Negociar/Presionar: neutral no produce ningún efecto', () => {
    for (const verboId of ['Hablar con...', 'Negociar', 'Presionar']) {
      const npc = npcAislado();
      const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
      const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

      const { deltaRelacionAplicado } = motor.procesarAccionResuelta(accion({ verboId, npcObjetivoId: npc.id, resultado: 'neutral' }));
      assert.equal(deltaRelacionAplicado, 0, `verbo ${verboId}`);
      assert.equal(npc.relacion.historialRelevante.length, 0, `verbo ${verboId}`);
      assert.deepEqual(motor.obtenerEjesInternos(npc.id), { nivelTemor: 0, nivelDisposicion: 0 }, `verbo ${verboId}`);
    }
  });

  test('Atacar: "cualquiera" incluye neutral — sigue aplicando -40 / disposicion -2', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: npc.id, resultado: 'neutral' }));
    assert.equal(npc.relacion.valor, -40);
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelDisposicion, -2);
  });
});

describe('Negociar — diferenciación por tono (registroTransicionesPorVerbo.js, supuesto 2)', () => {
  test('tono "ofrecer valor", éxito → +15', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(
      accion({ verboId: 'Negociar', opcionElegidaId: 'Ofrecer algo de valor a cambio', npcObjetivoId: npc.id, resultado: 'exito' })
    );
    assert.equal(npc.relacion.valor, 15);
  });

  test('otro tono ("apelar a la relación" / "buscar un punto medio"), éxito → +10 (supuesto documentado, no +15)', () => {
    for (const opcionElegidaId of ['Apelar a la relación existente', 'Buscar un punto medio razonable']) {
      const npc = npcAislado();
      const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
      const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

      motor.procesarAccionResuelta(accion({ verboId: 'Negociar', opcionElegidaId, npcObjetivoId: npc.id, resultado: 'exito' }));
      assert.equal(npc.relacion.valor, 10, `tono ${opcionElegidaId}`);
    }
  });
});

describe('Casos límite de procesarAccionResuelta', () => {
  test('npcObjetivoId null: no-op silencioso, no reporta nada', () => {
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [], escenas: [], motorEventos });

    const resultado = motor.procesarAccionResuelta(accion({ verboId: 'Explorar', npcObjetivoId: null }));
    assert.deepEqual(resultado, { npc: null, deltaRelacionAplicado: 0, reportes: [] });
  });

  test('verboId sin transición registrada: reporta, no rompe, no modifica al NPC', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    const { reportes, deltaRelacionAplicado } = motor.procesarAccionResuelta(
      accion({ verboId: 'VerboInventado', npcObjetivoId: npc.id })
    );
    assert.equal(deltaRelacionAplicado, 0);
    assert.equal(reportes.length, 1);
    assert.equal(npc.relacion.valor, 0);
  });

  test('npcObjetivoId que no existe en el dataset: tira error (no es un caso válido silencioso)', () => {
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [], escenas: [], motorEventos });

    assert.throws(() => motor.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: 'npc_que_no_existe' })));
  });

  test('Atacar fija disposicion en -2 directo, sin importar el valor previo (no es un delta relativo)', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: npc.id, resultado: 'exito' }));
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelDisposicion, 1);

    motor.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: npc.id }));
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelDisposicion, -2);
  });

  test('Presionar-fallo fija disposicion en -2 directo, igual que Atacar', () => {
    const npc = npcAislado();
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    motor.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: npc.id, resultado: 'exito' }));
    motor.procesarAccionResuelta(accion({ verboId: 'Presionar', npcObjetivoId: npc.id, resultado: 'fallo' }));
    assert.equal(motor.obtenerEjesInternos(npc.id).nivelDisposicion, -2);
  });
});

describe('conocimientosRevelablesDe — método de conveniencia del motor', () => {
  test('delega correctamente en la función pura, resolviendo el NPC por id', () => {
    const npc = npcAislado({
      conocimientos: [{ id: 'c1', contenido: 'x', nivelAcceso: 'publico', umbralRelacion: null, eventoDisparadorId: null }],
    });
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    const motor = crearMotorDeNPCs({ npcs: [npc], escenas: [], motorEventos });

    assert.equal(motor.conocimientosRevelablesDe(npc.id).length, 1);
  });
});

describe('crearMotorDeNPCs — exportarEstadoInterno / estadoInternoInicial (extensión aditiva de Fase 7)', () => {
  function motorBase(extra = {}) {
    const npcs = cargarFixture('npcs');
    const escenas = cargarFixture('escenas');
    const motorEventos = crearMotorDeEventos({ escenas });
    const motor = crearMotorDeNPCs({ npcs, escenas, motorEventos, ...extra });
    return { npcs, escenas, motorEventos, motor };
  }

  test('exportarEstadoInterno: JSON plano indexado por id, todos los NPCs, y sobrevive JSON.stringify (no es un Map)', () => {
    const { motor } = motorBase();
    const exportado = motor.exportarEstadoInterno();
    assert.ok(!(exportado.ejes instanceof Map));
    assert.deepEqual(Object.keys(exportado.ejes).sort(), ['npc_guardia_001', 'npc_herrero_001', 'npc_viajero_001']);
    assert.deepEqual(exportado.ejes.npc_herrero_001, { nivelTemor: 0, nivelDisposicion: 0 });
    assert.deepEqual(JSON.parse(JSON.stringify(exportado)), exportado);
  });

  test('exportarEstadoInterno devuelve copias: mutar el resultado no toca los ejes reales', () => {
    const { motor } = motorBase();
    const exportado = motor.exportarEstadoInterno();
    exportado.ejes.npc_herrero_001.nivelTemor = 2;
    assert.equal(motor.obtenerEjesInternos('npc_herrero_001').nivelTemor, 0);
  });

  test('BUG DE CARGA que motiva la extensión: sin restaurar ejes, un NPC alarmado vuelve con ejes (0,0); con restaurarlos, coherente', () => {
    const { npcs, escenas, motor } = motorBase();
    // Deja al guardia en temor 2 (escena en combate, él no es la fuente).
    const plaza = escenas.find((e) => e.id === 'escena_plaza');
    plaza.estadoCalculado = 'combate';
    motor.procesarEventosDeMundo();
    const guardia = npcs.find((n) => n.id === 'npc_guardia_001');
    assert.equal(guardia.estadoEmocional, 'alarmado');

    const npcsCopia = JSON.parse(JSON.stringify(npcs));
    const internoCopia = JSON.parse(JSON.stringify(motor.exportarEstadoInterno()));

    const sinRestaurar = crearMotorDeNPCs({ npcs: JSON.parse(JSON.stringify(npcsCopia)), escenas: cargarFixture('escenas'), motorEventos: crearMotorDeEventos({}) });
    assert.deepEqual(sinRestaurar.obtenerEjesInternos('npc_guardia_001'), { nivelTemor: 0, nivelDisposicion: 0 }, 'incoherente con estadoEmocional=alarmado');

    const restaurado = crearMotorDeNPCs({
      npcs: npcsCopia, escenas: cargarFixture('escenas'), motorEventos: crearMotorDeEventos({}), estadoInternoInicial: internoCopia,
    });
    assert.deepEqual(restaurado.obtenerEjesInternos('npc_guardia_001'), { nivelTemor: 2, nivelDisposicion: 0 });
  });

  test('un NPC sin entrada en estadoInternoInicial queda en (0,0)', () => {
    const { motor } = motorBase({ estadoInternoInicial: { ejes: { npc_guardia_001: { nivelTemor: 1, nivelDisposicion: -1 } } } });
    assert.deepEqual(motor.obtenerEjesInternos('npc_guardia_001'), { nivelTemor: 1, nivelDisposicion: -1 });
    assert.deepEqual(motor.obtenerEjesInternos('npc_herrero_001'), { nivelTemor: 0, nivelDisposicion: 0 });
  });

  test('falla fuerte: id desconocido, ejes fuera de rango, no enteros, forma equivocada', () => {
    assert.throws(() => motorBase({ estadoInternoInicial: { ejes: { npc_fantasma: { nivelTemor: 0, nivelDisposicion: 0 } } } }), /npc_fantasma/);
    assert.throws(() => motorBase({ estadoInternoInicial: { ejes: { npc_herrero_001: { nivelTemor: 3, nivelDisposicion: 0 } } } }), /nivelTemor/);
    assert.throws(() => motorBase({ estadoInternoInicial: { ejes: { npc_herrero_001: { nivelTemor: 0, nivelDisposicion: 2 } } } }), /nivelDisposicion/);
    assert.throws(() => motorBase({ estadoInternoInicial: { ejes: { npc_herrero_001: { nivelTemor: 0.5, nivelDisposicion: 0 } } } }), /nivelTemor/);
    assert.throws(() => motorBase({ estadoInternoInicial: { ejes: [] } }), /indexado por id/);
  });

  test('sin estadoInternoInicial: comportamiento anterior intacto', () => {
    const { motor } = motorBase();
    assert.deepEqual(motor.obtenerEjesInternos('npc_guardia_001'), { nivelTemor: 0, nivelDisposicion: 0 });
  });
});
