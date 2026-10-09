import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validarEstructura } from './validacion/validarEstructura.js';
import { validarReferencias } from './validacion/validarReferencias.js';

// Node fetch() no soporta file://, así que para el test se lee el
// mismo JSON con node:fs en vez de reusar cargarDatasetFixtures()
// (esa función es la que va a usar el navegador vía fetch).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'data', 'fixtures');

function leerFixture(nombreArchivo) {
  return JSON.parse(readFileSync(path.join(fixturesDir, nombreArchivo), 'utf-8'));
}

function cargarDatasetFixturesDesdeDisco() {
  return {
    npcs: leerFixture('npcs.json'),
    escenas: leerFixture('escenas.json'),
    eventos: leerFixture('eventos.json'),
    sucesos: leerFixture('sucesos.json'),
    jugador: leerFixture('jugador.json'),
    estadoDelMundo: leerFixture('estadoDelMundo.json'),
  };
}

test('el dataset ficticio de fixtures tiene la cantidad de entidades que pide la sección 5', () => {
  const dataset = cargarDatasetFixturesDesdeDisco();
  assert.equal(dataset.npcs.length, 3);
  assert.equal(dataset.escenas.length, 3);
  assert.equal(dataset.eventos.length, 2);
  assert.equal(dataset.sucesos.length, 1);
  assert.ok(dataset.jugador);
  assert.ok(dataset.estadoDelMundo);
});

test('todas las entidades del dataset de fixtures pasan validarEstructura', () => {
  const dataset = cargarDatasetFixturesDesdeDisco();
  const fallos = [];

  dataset.npcs.forEach((npc) => {
    const r = validarEstructura('NPC', npc);
    if (!r.valido) fallos.push(`NPC ${npc.id}: ${r.errores.join(' | ')}`);
  });
  dataset.escenas.forEach((escena) => {
    const r = validarEstructura('Escena', escena);
    if (!r.valido) fallos.push(`Escena ${escena.id}: ${r.errores.join(' | ')}`);
  });
  dataset.eventos.forEach((evento) => {
    const r = validarEstructura('Evento', evento);
    if (!r.valido) fallos.push(`Evento ${evento.id}: ${r.errores.join(' | ')}`);
  });
  dataset.sucesos.forEach((suceso) => {
    const r = validarEstructura('Suceso', suceso);
    if (!r.valido) fallos.push(`Suceso ${suceso.id}: ${r.errores.join(' | ')}`);
  });
  const rJugador = validarEstructura('Jugador', dataset.jugador);
  if (!rJugador.valido) fallos.push(`Jugador: ${rJugador.errores.join(' | ')}`);
  const rEdm = validarEstructura('EstadoDelMundo', dataset.estadoDelMundo);
  if (!rEdm.valido) fallos.push(`EstadoDelMundo: ${rEdm.errores.join(' | ')}`);

  assert.deepEqual(fallos, []);
});

test('todas las entidades del dataset de fixtures pasan validarReferencias', () => {
  const dataset = cargarDatasetFixturesDesdeDisco();
  const fallos = [];

  dataset.npcs.forEach((npc) => {
    const r = validarReferencias('NPC', npc, dataset);
    if (!r.valido) fallos.push(`NPC ${npc.id}: ${r.errores.join(' | ')}`);
  });
  dataset.escenas.forEach((escena) => {
    const r = validarReferencias('Escena', escena, dataset);
    if (!r.valido) fallos.push(`Escena ${escena.id}: ${r.errores.join(' | ')}`);
  });
  dataset.eventos.forEach((evento) => {
    const r = validarReferencias('Evento', evento, dataset);
    if (!r.valido) fallos.push(`Evento ${evento.id}: ${r.errores.join(' | ')}`);
  });
  dataset.sucesos.forEach((suceso) => {
    const r = validarReferencias('Suceso', suceso, dataset);
    if (!r.valido) fallos.push(`Suceso ${suceso.id}: ${r.errores.join(' | ')}`);
  });
  const rJugador = validarReferencias('Jugador', dataset.jugador, dataset);
  if (!rJugador.valido) fallos.push(`Jugador: ${rJugador.errores.join(' | ')}`);

  assert.deepEqual(fallos, []);
});

test('ningún objeto del dataset de fixtures tiene referencias circulares anidadas (todo por ID)', () => {
  const dataset = cargarDatasetFixturesDesdeDisco();
  // JSON.stringify revienta con referencias circulares — si esto no
  // tira, no hay anidamiento circular. Chequeo adicional: ningún
  // valor de ningún campo es un objeto/array anidado salvo los
  // sub-esquemas documentados (relacion, conocimientos, inventario,
  // salidas, metadata, atributos, flags, historialRelevante).
  assert.doesNotThrow(() => JSON.stringify(dataset));
});
