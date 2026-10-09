import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstadoDelMundo } from '../modelos/index.js';
import { sustituirPlaceholders, narrarAccionResuelta } from './narrar.js';
import { resolverAccion } from './resolverAccion.js';

describe('sustituirPlaceholders (doc técnico 3.1)', () => {
  test('sustituye un placeholder simple', () => {
    assert.equal(sustituirPlaceholders('Hola {jugador}', { jugador: 'Vos' }), 'Hola Vos');
  });

  test('sustituye varios placeholders distintos en el mismo texto', () => {
    const texto = '{jugador} le habla a {npc} sobre {objeto}';
    const resultado = sustituirPlaceholders(texto, { jugador: 'Ana', npc: 'el herrero', objeto: 'la espada' });
    assert.equal(resultado, 'Ana le habla a el herrero sobre la espada');
  });

  test('placeholder sin valor en el contexto: reporta y lo deja vacío, no rompe', () => {
    const original = console.warn;
    let avisado = false;
    console.warn = () => {
      avisado = true;
    };
    try {
      const resultado = sustituirPlaceholders('Usás {objeto} con cuidado', {});
      assert.equal(resultado, 'Usás  con cuidado');
      assert.equal(avisado, true);
    } finally {
      console.warn = original;
    }
  });

  test('texto sin ningún placeholder queda intacto', () => {
    assert.equal(sustituirPlaceholders('El golpe conecta con fuerza.', {}), 'El golpe conecta con fuerza.');
  });
});

describe('narrarAccionResuelta — caso desglosado completo (doc técnico, sección 4)', () => {
  test('Huir riesgosa + generadorAleatorio=0.5 -> fallo -> plantilla resultado_huir_fallo', () => {
    const verbo = { nombre: 'Huir', tipoResolucion: 'concrecion' };
    const opcionNivel2 = { etiqueta: 'Forzar una salida improvisada', comportamientoAlElegir: 'seResuelveSola', riesgosa: true };
    const estadoMundo = crearEstadoDelMundo({ ticksTranscurridos: 72 });

    const accionResuelta = resolverAccion(verbo, opcionNivel2, null, null, null, estadoMundo, new Map(), () => 0.5);
    assert.equal(accionResuelta.resultado, 'fallo');
    assert.equal(accionResuelta.tick, 72);

    // Memoria vacía para esta plantilla -> primera selección, cualquiera
    // de las 3 variantes es válida; lo que importa es que sea UNA de
    // las 3 documentadas y que {lugar} quede sustituido.
    const variantesEsperadas = [
      'Tropezás al intentar huir hacia la salida improvisada y perdés un instante valioso.',
      'El escape hacia la salida improvisada no sale como esperabas — algo te frena.',
      'Casi lo lográs, pero hacia la salida improvisada termina siendo un callejón sin salida.',
    ];
    const texto = narrarAccionResuelta(accionResuelta, { lugar: 'hacia la salida improvisada' }, { memoria: {} });
    assert.ok(variantesEsperadas.includes(texto), `texto inesperado: '${texto}'`);
  });

  test('verbo "inmediata" (Explorar) narra siempre con verbo_explorar, sin depender de resultado exito/fallo', () => {
    const verbo = { nombre: 'Explorar', tipoResolucion: 'inmediata' };
    const estadoMundo = crearEstadoDelMundo({ ticksTranscurridos: 1 });
    const accionResuelta = resolverAccion(verbo, null, null, null, null, estadoMundo, new Map());
    assert.equal(accionResuelta.resultado, 'neutral');

    const texto = narrarAccionResuelta(accionResuelta, {}, { memoria: {} });
    assert.ok(['Recorrés el lugar con calma, sin prisa.', 'Le das una vuelta al entorno, atento a los detalles.', 'Caminás explorando lo que hay alrededor.'].includes(texto));
  });

  test('sin memoria explícita, sigue usando la memoria persistente de módulo (no repite entre llamadas consecutivas)', () => {
    const verbo = { nombre: 'Atacar', tipoResolucion: 'concrecion' };
    const opcion = { etiqueta: 'Atacar con Daga', objetoObjetivo: 'objeto_daga', comportamientoAlElegir: 'seResuelveSola' };
    const estadoMundo = crearEstadoDelMundo({ ticksTranscurridos: 1 });
    const exito = resolverAccion(verbo, opcion, null, null, null, estadoMundo, new Map(), () => 0.1);

    const primera = narrarAccionResuelta(exito, { jugador: 'Vos', npc: 'el rival' });
    const segunda = narrarAccionResuelta(exito, { jugador: 'Vos', npc: 'el rival' });
    assert.notEqual(primera, segunda);
  });
});
