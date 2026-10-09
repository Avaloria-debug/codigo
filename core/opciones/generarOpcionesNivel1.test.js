import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearEscena, crearJugador, crearNPC, crearObjeto, crearEstadoDelMundo } from '../modelos/index.js';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { calcularEstadoEscena } from '../comprensionMundo/calcularEstadoEscena.js';
import { registroCategoriasEventoPorDefecto } from '../comprensionMundo/registroCategoriasEvento.js';
import { generarOpcionesNivel1 } from './generarOpcionesNivel1.js';
import { registroVerbosPorEstado } from './registroVerbosPorEstado.js';
import { construirObjetosPorId, construirNpcsPorId } from './resolutores.js';

// ---------------------------------------------------------------------
// Datos ad-hoc, inline — mismo criterio que Fase 1/2: el dataset
// compartido de data/fixtures tiene sus cantidades fijadas por
// cargarFixtures.test.js (Fase 0), no se toca acá.
// ---------------------------------------------------------------------

function escenaDePrueba(datos = {}) {
  return crearEscena({ id: 'escena_test', nombre: 'Escena de prueba', descripcionBase: 'Sin descripción.', ...datos });
}
function jugadorDePrueba(datos = {}) {
  return crearJugador({ id: 'jugador_test', nombre: 'Jugador de prueba', ubicacionActual: 'escena_test', ...datos });
}
function npcDePrueba(datos = {}) {
  return crearNPC({ id: 'npc_test', nombre: 'NPC de prueba', arquetipo: 'generico', personalidadBase: 'Neutral.', activo: true, ...datos });
}
function objetoDePrueba(datos = {}) {
  return crearObjeto({ id: 'objeto_test', nombre: 'Objeto de prueba', tipo: 'herramienta', ...datos });
}
function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

describe('generarOpcionesNivel1 — contextuales puros (sección 3.1)', () => {
  test('Hablar con NPC: una opción por cada NPC activo presente', () => {
    const npc1 = npcDePrueba({ id: 'npc_1', nombre: 'Guardia' });
    const npc2 = npcDePrueba({ id: 'npc_2', nombre: 'Viajero' });
    const escena = escenaDePrueba({ npcsPresentes: ['npc_1', 'npc_2'] });
    const opciones = generarOpcionesNivel1(
      escena, 'tranquilo', jugadorDePrueba(), registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([npc1, npc2])
    );
    const hablar = opciones.filter((o) => o.tipoResolucion === 'textoLibre');
    assert.equal(hablar.length, 2);
    assert.ok(hablar.some((o) => o.etiqueta === 'Hablar con Guardia' && o.npcObjetivo === 'npc_1'));
    assert.ok(hablar.some((o) => o.etiqueta === 'Hablar con Viajero' && o.npcObjetivo === 'npc_2'));
  });

  test('NPC inactivo (activo:false) no genera opción de Hablar', () => {
    const npc = npcDePrueba({ id: 'npc_muerto', activo: false });
    const escena = escenaDePrueba({ npcsPresentes: ['npc_muerto'] });
    const opciones = generarOpcionesNivel1(
      escena, 'tranquilo', jugadorDePrueba(), registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([npc])
    );
    assert.equal(opciones.some((o) => o.tipoResolucion === 'textoLibre'), false);
  });

  test('Hablar con NPC aparece igual en estado "combate" — no depende del estado (tabla 6)', () => {
    const npc = npcDePrueba({ id: 'npc_hostil', nombre: 'Hostil' });
    const escena = escenaDePrueba({ npcsPresentes: ['npc_hostil'] });
    const opciones = generarOpcionesNivel1(
      escena, 'combate', jugadorDePrueba(), registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([npc])
    );
    assert.ok(opciones.some((o) => o.etiqueta === 'Hablar con Hostil'));
  });

  test('Examinar objeto: una opción por objeto presente, con nombre resuelto', () => {
    const objeto = objetoDePrueba({ id: 'objeto_1', nombre: 'Espada rota' });
    const escena = escenaDePrueba({ objetosPresentes: ['objeto_1'] });
    const opciones = generarOpcionesNivel1(
      escena, 'tranquilo', jugadorDePrueba(), registroVerbosPorEstado,
      construirObjetosPorId([objeto]), construirNpcsPorId([])
    );
    const examinar = opciones.find((o) => o.objetoObjetivo === 'objeto_1');
    assert.equal(examinar.etiqueta, 'Examinar Espada rota');
    assert.equal(examinar.tipoResolucion, 'inmediata');
  });

  test('Examinar objeto: si no está en objetosPorId, usa el ID crudo como fallback (no rompe)', () => {
    const escena = escenaDePrueba({ objetosPresentes: ['objeto_fantasma'] });
    const opciones = generarOpcionesNivel1(
      escena, 'tranquilo', jugadorDePrueba(), registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([])
    );
    assert.equal(opciones.find((o) => o.objetoObjetivo === 'objeto_fantasma').etiqueta, 'Examinar objeto_fantasma');
  });
});

describe('generarOpcionesNivel1 — "Usar" (sección 3.1 + fase_3_ADENDUM.md sección 2)', () => {
  test('0 objetos usables: el verbo "Usar" no aparece', () => {
    const jugador = jugadorDePrueba({ inventario: [] });
    const opciones = generarOpcionesNivel1(
      escenaDePrueba(), 'tranquilo', jugador, registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([])
    );
    assert.equal(opciones.some((o) => o.etiqueta === 'Usar'), false);
  });

  test('objeto con utilizableComo vacío en el inventario no cuenta como usable', () => {
    const espadaRota = objetoDePrueba({ id: 'objeto_espada_rota', utilizableComo: [] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_espada_rota', cantidad: 1 }] });
    const opciones = generarOpcionesNivel1(
      escenaDePrueba(), 'tranquilo', jugador, registroVerbosPorEstado,
      construirObjetosPorId([espadaRota]), construirNpcsPorId([])
    );
    assert.equal(opciones.some((o) => o.objetoObjetivo === 'objeto_espada_rota'), false);
  });

  test('exactamente 1 objeto usable: tipoResolucion "inmediata", objetoObjetivo ya fijado', () => {
    const antorcha = objetoDePrueba({ id: 'objeto_antorcha', nombre: 'Antorcha', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_antorcha', cantidad: 1 }] });
    const opciones = generarOpcionesNivel1(
      escenaDePrueba(), 'tranquilo', jugador, registroVerbosPorEstado,
      construirObjetosPorId([antorcha]), construirNpcsPorId([])
    );
    const usar = opciones.find((o) => o.etiqueta === 'Usar Antorcha');
    assert.equal(usar.tipoResolucion, 'inmediata');
    assert.equal(usar.objetoObjetivo, 'objeto_antorcha');
  });

  test('más de 1 objeto usable: tipoResolucion "concrecion", etiqueta genérica "Usar"', () => {
    const antorcha = objetoDePrueba({ id: 'objeto_antorcha', utilizableComo: ['atacar'] });
    const daga = objetoDePrueba({ id: 'objeto_daga', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({
      inventario: [{ objetoId: 'objeto_antorcha', cantidad: 1 }, { objetoId: 'objeto_daga', cantidad: 1 }],
    });
    const opciones = generarOpcionesNivel1(
      escenaDePrueba(), 'tranquilo', jugador, registroVerbosPorEstado,
      construirObjetosPorId([antorcha, daga]), construirNpcsPorId([])
    );
    const usar = opciones.find((o) => o.etiqueta === 'Usar');
    assert.equal(usar.tipoResolucion, 'concrecion');
  });

  test('lista un objeto sin filtrar por el estado actual, aunque su categoría esté gateada (decisión "amplio")', () => {
    const daga = objetoDePrueba({ id: 'objeto_daga', nombre: 'Daga', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_daga', cantidad: 1 }] });
    const opciones = generarOpcionesNivel1(
      escenaDePrueba(), 'tranquilo', jugador, registroVerbosPorEstado,
      construirObjetosPorId([daga]), construirNpcsPorId([])
    );
    assert.ok(opciones.some((o) => o.etiqueta === 'Usar Daga'));
    assert.equal(opciones.some((o) => o.etiqueta === 'Atacar'), false); // tranquilo no ofrece Atacar
  });
});

describe('generarOpcionesNivel1 — verbos ligados a estado, los 6 (sección 3.2)', () => {
  const casos = [
    ['tranquilo', [['Explorar', 'inmediata'], ['Descansar', 'inmediata']]],
    ['social', [['Observar', 'inmediata']]],
    ['tenso', [['Negociar', 'concrecion'], ['Presionar', 'concrecion'], ['Retirarse', 'concrecion']]],
    ['peligroso', [['Huir', 'concrecion'], ['Atacar', 'concrecion'], ['Emboscar', 'concrecion'], ['Calmar la situación', 'concrecion']]],
    ['sigilo', [['Ocultarse', 'concrecion'], ['Avanzar con cautela', 'inmediata'], ['Distraer', 'concrecion'], ['Abortar', 'concrecion']]],
    ['combate', [['Atacar', 'concrecion'], ['Defender', 'concrecion'], ['Huir', 'concrecion'], ['Rendirse', 'inmediata']]],
  ];

  for (const [estado, esperados] of casos) {
    test(`${estado}: genera exactamente los verbos de la tabla 3.2`, () => {
      const opciones = generarOpcionesNivel1(
        escenaDePrueba(), estado, jugadorDePrueba(), registroVerbosPorEstado,
        construirObjetosPorId([]), construirNpcsPorId([])
      );
      esperados.forEach(([nombre, tipo]) => {
        const opcion = opciones.find((o) => o.etiqueta === nombre);
        assert.ok(opcion, `falta '${nombre}' en estado '${estado}'`);
        assert.equal(opcion.tipoResolucion, tipo);
      });
      const nombresEsperados = esperados.map(([nombre]) => nombre);
      const ligadosGenerados = opciones.filter((o) => nombresEsperados.includes(o.etiqueta));
      assert.equal(ligadosGenerados.length, esperados.length, `${estado} generó verbos de más o de menos`);
    });
  }
});

describe('generarOpcionesNivel1 — casos límite (sección 6)', () => {
  test('escena totalmente vacía de NPCs y objetos: sólo quedan los verbos ligados a estado', () => {
    const escena = escenaDePrueba({ npcsPresentes: [], objetosPresentes: [] });
    const opciones = generarOpcionesNivel1(
      escena, 'tranquilo', jugadorDePrueba({ inventario: [] }), registroVerbosPorEstado,
      construirObjetosPorId([]), construirNpcsPorId([])
    );
    assert.deepEqual(opciones.map((o) => o.etiqueta).sort(), ['Descansar', 'Explorar']);
  });
});

describe('generarOpcionesNivel1 — integración con el dataset real de Fase 0/1/2', () => {
  const npcs = cargarFixture('npcs');
  const escenas = cargarFixture('escenas');
  const jugadorFixture = cargarFixture('jugador');
  const objetos = cargarFixture('objetos');
  const npcsPorId = construirNpcsPorId(npcs);
  const objetosPorId = construirObjetosPorId(objetos);

  test('escena_celda (vacía): tranquilo → Explorar/Descansar + "Usar Antorcha" (jugador_001 la lleva encima, y Usar no depende de la escena)', () => {
    const celda = escenas.find((e) => e.id === 'escena_celda');
    const opciones = generarOpcionesNivel1(celda, 'tranquilo', jugadorFixture, registroVerbosPorEstado, objetosPorId, npcsPorId);
    assert.deepEqual(opciones.map((o) => o.etiqueta).sort(), ['Descansar', 'Explorar', 'Usar Antorcha']);
  });

  test('escena_plaza (2 NPCs): genera 2 opciones de "Hablar con"', () => {
    const plaza = escenas.find((e) => e.id === 'escena_plaza');
    const opciones = generarOpcionesNivel1(plaza, 'tenso', jugadorFixture, registroVerbosPorEstado, objetosPorId, npcsPorId);
    assert.equal(opciones.filter((o) => o.tipoResolucion === 'textoLibre').length, 2);
  });

  test('jugador_001 (antorcha usable): "Usar Antorcha" aparece como inmediata', () => {
    const celda = escenas.find((e) => e.id === 'escena_celda');
    const opciones = generarOpcionesNivel1(celda, 'tranquilo', jugadorFixture, registroVerbosPorEstado, objetosPorId, npcsPorId);
    const usar = opciones.find((o) => o.etiqueta === 'Usar Antorcha');
    assert.ok(usar);
    assert.equal(usar.tipoResolucion, 'inmediata');
  });
});

describe('generarOpcionesNivel1 — caso desglosado de la sección 5 (continuado desde Fase 2)', () => {
  test('NPC hostil, sin salida clara, de noche → peligroso (vía Fase 1+2 reales) → Nivel 1 correcto', () => {
    const npcHostil = npcDePrueba({ id: 'npc_hostil_001', nombre: 'Hostil', ubicacionActual: 'escena_amenaza' });
    const escena = crearEscena({
      id: 'escena_amenaza',
      nombre: 'Callejón',
      descripcionBase: 'Un callejón sin salida.',
      npcsPresentes: ['npc_hostil_001'],
      salidas: [],
    });
    const estadoMundo = crearEstadoDelMundo({ horaActual: 23 });
    const motor = crearMotorDeEventos({ escenas: [escena] });
    motor.crearEvento(
      { id: 'evento_amenaza_001', tipo: 'amenaza_npc_hostil', escenaId: 'escena_amenaza', duracion: null, condicionExpiracion: 'no_aplica' },
      estadoMundo
    );
    const eventosActivos = motor.listarEventosActivos('escena_amenaza');
    const { estado } = calcularEstadoEscena(escena, eventosActivos, estadoMundo, registroCategoriasEventoPorDefecto);
    assert.equal(estado, 'peligroso'); // puente con Fase 2 confirmado antes de seguir

    const daga = objetoDePrueba({ id: 'objeto_daga', nombre: 'Daga', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_daga', cantidad: 1 }] });
    const opciones = generarOpcionesNivel1(
      escena, estado, jugador, registroVerbosPorEstado,
      construirObjetosPorId([daga]), construirNpcsPorId([npcHostil])
    );

    assert.ok(opciones.some((o) => o.etiqueta === 'Hablar con Hostil'));
    ['Huir', 'Atacar', 'Emboscar', 'Calmar la situación'].forEach((nombre) => {
      assert.ok(opciones.some((o) => o.etiqueta === nombre), `falta '${nombre}'`);
    });
  });
});
