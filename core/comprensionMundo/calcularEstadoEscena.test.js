import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearEscena } from '../modelos/escena.js';
import { crearEvento } from '../modelos/evento.js';
import { crearEstadoDelMundo } from '../modelos/estadoDelMundo.js';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { validarEstructura } from '../validacion/validarEstructura.js';
import { calcularEstadoEscena, actualizarEstadoCalculado, esNocturno, ESTADOS_DE_ESCENA } from './calcularEstadoEscena.js';
import { registroCategoriasEventoPorDefecto } from './registroCategoriasEvento.js';

// ---------------------------------------------------------------------
// Helpers locales. Los datos de esta fase se arman ad-hoc, inline, igual
// que hizo Fase 1 para sus propios casos (tormenta_local, emboscada, etc.
// en motorEventos.test.js) — el dataset compartido de data/fixtures ya
// tiene un test de Fase 0 (cargarFixtures.test.js) que fija sus cantidades
// exactas (3 NPCs, 3 escenas, 2 eventos, 1 suceso), así que no se toca acá.
// Ni el NPC "hostil" ni el evento_amenaza_001 del caso desglosado de la
// sección 5 existen en ese dataset — se construyen en este archivo.
// ---------------------------------------------------------------------

function escenaDePrueba(datos = {}) {
  return crearEscena({ id: 'escena_test', nombre: 'Escena de prueba', descripcionBase: 'Sin descripción.', ...datos });
}

// condicionExpiracion:'no_aplica' es un valor ficticio sólo para que el
// Evento sea estructuralmente válido (Fase 0: duracion y condicionExpiracion
// no pueden ser ambos null). calcularEstadoEscena no lee ninguno de los dos.
function eventoDePrueba(id, tipo, escenaId = 'escena_test') {
  return crearEvento({ id, tipo, escenaId, condicionExpiracion: 'no_aplica' });
}

function estadoMundoDePrueba(horaActual) {
  return crearEstadoDelMundo({ horaActual });
}

function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

const DE_DIA = 12;
const DE_NOCHE = 23;

describe('calcularEstadoEscena — los 6 estados de la lista cerrada (doc técnico, sección 9)', () => {
  test('tranquilo: sin eventos, sin NPCs presentes', () => {
    const { estado, reportes } = calcularEstadoEscena(escenaDePrueba({ npcsPresentes: [] }), [], estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'tranquilo');
    assert.deepEqual(reportes, []);
  });

  test('social: sin eventos, con NPCs presentes', () => {
    const { estado } = calcularEstadoEscena(escenaDePrueba({ npcsPresentes: ['npc_x'] }), [], estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'social');
  });

  test('tenso: evento disputa_publica solo', () => {
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'disputa_publica')];
    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'tenso');
  });

  test('peligroso: evento incendio solo', () => {
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'incendio')];
    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'peligroso');
  });

  test('sigilo: evento vigilancia_activa solo', () => {
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'vigilancia_activa')];
    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'sigilo');
  });

  test('combate: evento emboscada_activa solo', () => {
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'emboscada_activa')];
    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));
    assert.equal(estado, 'combate');
  });
});

describe('calcularEstadoEscena — tipo de evento no registrado (sección 6)', () => {
  test('cae al fallback "social" si hay NPCs, y queda reportado sin romper', () => {
    const escena = escenaDePrueba({ npcsPresentes: ['npc_x'] });
    const eventos = [eventoDePrueba('e1', 'tipo_inventado_sin_registrar')];
    const { estado, reportes } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));

    assert.equal(estado, 'social');
    assert.equal(reportes.length, 1);
    assert.match(reportes[0], /tipo_inventado_sin_registrar/);
  });

  test('cae al fallback "tranquilo" si no hay NPCs, y queda reportado sin romper', () => {
    const escena = escenaDePrueba({ npcsPresentes: [] });
    const eventos = [eventoDePrueba('e1', 'otro_tipo_sin_registrar')];
    const { estado, reportes } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));

    assert.equal(estado, 'tranquilo');
    assert.equal(reportes.length, 1);
  });

  test('un tipo no registrado entre varios registrados no descarta a los demás', () => {
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'incendio'), eventoDePrueba('e2', 'tipo_fantasma')];
    const { estado, reportes } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));

    assert.equal(estado, 'peligroso'); // el incendio sigue contando
    assert.equal(reportes.length, 1);
  });
});

describe('calcularEstadoEscena — múltiples eventos de la misma categoría se suman (sección 6)', () => {
  test('dos eventos "peligroso" suman por encima de un competidor que le ganaría a cualquiera de los dos por separado', () => {
    // incendio (60) + amenaza_npc_hostil de día (70, sin nocturno) = 130 si se suman.
    // Un competidor calibrado en 100 (tenso) sólo pierde si efectivamente se suman
    // las intensidades en vez de tomar el máximo de la categoría (que sería 70).
    const registro = {
      ...registroCategoriasEventoPorDefecto,
      tenso_calibrado_100: { categoriaEstado: 'tenso', intensidad: 100 },
    };
    const escena = escenaDePrueba();
    const eventos = [
      eventoDePrueba('e1', 'incendio'),
      eventoDePrueba('e2', 'amenaza_npc_hostil'),
      eventoDePrueba('e3', 'tenso_calibrado_100'),
    ];

    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA), registro);
    assert.equal(estado, 'peligroso'); // 130 > 100 — si sólo tomara el máximo (70), perdería
  });
});

describe('calcularEstadoEscena — empate exacto entre categorías (sección 6)', () => {
  test('sigilo (prioridad 4) le gana a tenso (prioridad 3) en empate exacto de puntaje', () => {
    // vigilancia_activa de día = 50 (sigilo, sin nocturno). Se calibra un
    // tipo "tenso" a mano con intensidad 50 para forzar el empate exacto.
    const registro = {
      ...registroCategoriasEventoPorDefecto,
      tenso_calibrado_50: { categoriaEstado: 'tenso', intensidad: 50 },
    };
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'vigilancia_activa'), eventoDePrueba('e2', 'tenso_calibrado_50')];

    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA), registro);
    assert.equal(estado, 'sigilo');

    const prioridadSigilo = ESTADOS_DE_ESCENA.find((e) => e.estado === 'sigilo').prioridadDesempate;
    const prioridadTenso = ESTADOS_DE_ESCENA.find((e) => e.estado === 'tenso').prioridadDesempate;
    assert.ok(prioridadSigilo > prioridadTenso); // confirma que el resultado sigue la tabla, no es casualidad
  });
});

describe('calcularEstadoEscena — modificador nocturno (sección 6, trampa &&/|| de la sección 4)', () => {
  test('esNocturno cubre el rango correcto cruzando medianoche (20 a 6)', () => {
    assert.equal(esNocturno(23), true);
    assert.equal(esNocturno(0), true);
    assert.equal(esNocturno(6), true);
    assert.equal(esNocturno(20), true);
    assert.equal(esNocturno(7), false);
    assert.equal(esNocturno(19), false);
    assert.equal(esNocturno(12), false);
  });

  test('de día (12hs) la intensidad de amenaza_npc_hostil NO se multiplica (queda en 70, no 84)', () => {
    // Competidor calibrado a 75: entre 70 (sin multiplicar) y 84 (multiplicado).
    // Si el modificador se aplicara igual de día, ganaría peligroso; no debe pasar.
    const registro = { ...registroCategoriasEventoPorDefecto, tenso_calibrado_75: { categoriaEstado: 'tenso', intensidad: 75 } };
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'amenaza_npc_hostil'), eventoDePrueba('e2', 'tenso_calibrado_75')];

    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA), registro);
    assert.equal(estado, 'tenso'); // 70 < 75: si esto da "peligroso", el modificador se aplicó de día por error
  });

  test('de noche (23hs) la intensidad de amenaza_npc_hostil SÍ se multiplica por 1.2 (70 -> 84 exactos)', () => {
    // Mismo competidor a 75, pero calibrado justo debajo de 84 y encima de 70 (usamos 83
    // para que el test sea sensible a un multiplicador incorrecto, ej. 1.1 -> 77).
    const registro = { ...registroCategoriasEventoPorDefecto, tenso_calibrado_83: { categoriaEstado: 'tenso', intensidad: 83 } };
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'amenaza_npc_hostil'), eventoDePrueba('e2', 'tenso_calibrado_83')];

    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_NOCHE), registro);
    assert.equal(estado, 'peligroso'); // 84 > 83: sólo gana si el cálculo fue exactamente 70*1.2
  });
});

describe('calcularEstadoEscena — caso desglosado, NPC hostil sin salida clara de noche (sección 5)', () => {
  test('reproduce el escenario documentado y da "peligroso"', () => {
    const escena = crearEscena({
      id: 'escena_test',
      nombre: 'Escena hostil de prueba',
      descripcionBase: 'Sin salida clara.',
      salidas: [], // no interviene en el cálculo (sección 1) — se deja igual, fiel al escenario
      npcsPresentes: ['npc_hostil_001'],
    });
    const eventos = [eventoDePrueba('evento_amenaza_001', 'amenaza_npc_hostil')];
    const estadoMundo = estadoMundoDePrueba(23);

    const { estado, reportes } = calcularEstadoEscena(escena, eventos, estadoMundo);
    assert.equal(estado, 'peligroso');
    assert.deepEqual(reportes, []);
  });
});

describe('calcularEstadoEscena — determinismo y pureza (sección 9)', () => {
  test('el mismo cálculo repetido siempre da el mismo resultado', () => {
    const registro = { ...registroCategoriasEventoPorDefecto, tenso_calibrado_50: { categoriaEstado: 'tenso', intensidad: 50 } };
    const escena = escenaDePrueba();
    const eventos = [eventoDePrueba('e1', 'vigilancia_activa'), eventoDePrueba('e2', 'tenso_calibrado_50')];
    const estadoMundo = estadoMundoDePrueba(DE_DIA);

    const resultados = Array.from({ length: 5 }, () => calcularEstadoEscena(escena, eventos, estadoMundo, registro).estado);
    assert.ok(resultados.every((r) => r === 'sigilo'));
  });

  test('no muta la escena ni el array de eventos recibidos', () => {
    const escena = escenaDePrueba({ npcsPresentes: ['npc_x'] });
    const eventos = [eventoDePrueba('e1', 'incendio')];
    const copiaEscena = JSON.parse(JSON.stringify(escena));
    const copiaEventos = JSON.parse(JSON.stringify(eventos));

    calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));

    assert.deepEqual(escena, copiaEscena);
    assert.deepEqual(eventos, copiaEventos);
    assert.equal(escena.estadoCalculado, null); // calcularEstadoEscena NO asigna — eso es actualizarEstadoCalculado
  });
});

describe('calcularEstadoEscena — nunca fuera de la lista cerrada de 6 estados', () => {
  test('el estado devuelto siempre pertenece a ESTADOS_DE_ESCENA, incluso con todos los tipos sin registrar', () => {
    const nombresValidos = ESTADOS_DE_ESCENA.map((e) => e.estado);
    const escena = escenaDePrueba({ npcsPresentes: [] });
    const eventos = [eventoDePrueba('e1', 'a'), eventoDePrueba('e2', 'b'), eventoDePrueba('e3', 'c')];

    const { estado } = calcularEstadoEscena(escena, eventos, estadoMundoDePrueba(DE_DIA));
    assert.ok(nombresValidos.includes(estado));
  });
});

describe('calcularEstadoEscena — integración real con motorEventos (Fase 1), dataset compartido', () => {
  function cargarDatasetDesdeDisco() {
    return {
      escenas: cargarFixture('escenas'),
      eventos: cargarFixture('eventos'),
      estadoMundo: cargarFixture('estadoDelMundo'), // horaActual:14, ticksTranscurridos:72
    };
  }

  test('escena_herreria: listarEventosActivos + calcularEstadoEscena da "peligroso" (incendio real del fixture)', () => {
    const { escenas, eventos, estadoMundo } = cargarDatasetDesdeDisco();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    const escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');

    // Tal como aclara la sección 3 del doc: SIEMPRE listarEventosActivos(),
    // nunca escena.eventosActivos (array de IDs) pasado directo acá.
    const eventosActivos = motor.listarEventosActivos('escena_herreria');
    const { estado } = calcularEstadoEscena(escenaHerreria, eventosActivos, estadoMundo);

    assert.equal(estado, 'peligroso');
  });

  test('escena_plaza: da "tenso" (disputa_publica real del fixture)', () => {
    const { escenas, eventos, estadoMundo } = cargarDatasetDesdeDisco();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    const escenaPlaza = escenas.find((e) => e.id === 'escena_plaza');

    const eventosActivos = motor.listarEventosActivos('escena_plaza');
    const { estado } = calcularEstadoEscena(escenaPlaza, eventosActivos, estadoMundo);

    assert.equal(estado, 'tenso');
  });

  test('escena_celda: sin eventos ni NPCs -> "tranquilo"', () => {
    const { escenas, eventos, estadoMundo } = cargarDatasetDesdeDisco();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    const escenaCelda = escenas.find((e) => e.id === 'escena_celda');

    const eventosActivos = motor.listarEventosActivos('escena_celda');
    const { estado } = calcularEstadoEscena(escenaCelda, eventosActivos, estadoMundo);

    assert.equal(estado, 'tranquilo');
  });

  test('desactivar el incendio deja escena_herreria sin eventos activos -> cae a fallback ("social", tiene NPC)', () => {
    const { escenas, eventos, estadoMundo } = cargarDatasetDesdeDisco();
    const motor = crearMotorDeEventos({ eventos, escenas, estadoMundoInicial: estadoMundo });
    motor.desactivarEvento('evento_incendio_001', 'test');
    const escenaHerreria = escenas.find((e) => e.id === 'escena_herreria');

    const eventosActivos = motor.listarEventosActivos('escena_herreria');
    const { estado } = calcularEstadoEscena(escenaHerreria, eventosActivos, estadoMundo);

    assert.equal(estado, 'social'); // npc_herrero_001 sigue presente
  });
});

describe('actualizarEstadoCalculado — contrato con Escena.estadoCalculado de Fase 0', () => {
  test('asigna el string a escena.estadoCalculado (no el objeto {estado,reportes}) y la escena sigue pasando validarEstructura', () => {
    const escena = escenaDePrueba({ npcsPresentes: ['npc_x'] });
    const estadoMundo = estadoMundoDePrueba(DE_DIA);

    const resultado = actualizarEstadoCalculado(escena, [], estadoMundo);

    assert.equal(typeof escena.estadoCalculado, 'string');
    assert.equal(escena.estadoCalculado, 'social');
    assert.equal(resultado.estado, 'social');
    assert.deepEqual(resultado.reportes, []);

    const { valido, errores } = validarEstructura('Escena', escena);
    assert.equal(valido, true, errores.join(' | '));
  });

  test('asignar el objeto completo en vez de resultado.estado rompe validarEstructura (por qué existe el helper)', () => {
    const escena = escenaDePrueba();
    const estadoMundo = estadoMundoDePrueba(DE_DIA);
    const resultado = calcularEstadoEscena(escena, [], estadoMundo);

    escena.estadoCalculado = resultado; // el error que el helper evita: asignar el objeto entero

    const { valido, errores } = validarEstructura('Escena', escena);
    assert.equal(valido, false);
    assert.ok(errores.some((e) => e.includes('estadoCalculado')));
  });

  test('con reportes no vacíos, actualizarEstadoCalculado igual asigna un string válido a la escena', () => {
    const escena = escenaDePrueba({ npcsPresentes: [] });
    const estadoMundo = estadoMundoDePrueba(DE_DIA);
    const eventos = [eventoDePrueba('e1', 'tipo_sin_registrar')];

    const resultado = actualizarEstadoCalculado(escena, eventos, estadoMundo);

    assert.equal(escena.estadoCalculado, 'tranquilo');
    assert.equal(resultado.reportes.length, 1);
    assert.equal(validarEstructura('Escena', escena).valido, true);
  });
});
