import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarEstructura } from './validarEstructura.js';
import { crearNPC, crearRelacion } from '../modelos/npc.js';
import { crearJugador } from '../modelos/jugador.js';
import { crearEscena } from '../modelos/escena.js';
import { crearEvento } from '../modelos/evento.js';
import { crearSuceso } from '../modelos/suceso.js';
import { crearEstadoDelMundo } from '../modelos/estadoDelMundo.js';

// --- Casos válidos (uno por entidad, usando los factories) ---

test('NPC construido con crearNPC (datos mínimos) es válido', () => {
  const npc = crearNPC({ id: 'npc_x', nombre: 'X', arquetipo: 'y', personalidadBase: 'z' });
  const r = validarEstructura('NPC', npc);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Jugador construido con crearJugador es válido', () => {
  const jugador = crearJugador({ id: 'j1', nombre: 'X', ubicacionActual: 'escena_x' });
  const r = validarEstructura('Jugador', jugador);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Escena construida con crearEscena es válida', () => {
  const escena = crearEscena({ id: 'e1', nombre: 'X', descripcionBase: 'y' });
  const r = validarEstructura('Escena', escena);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Evento válido con solo duracion es válido', () => {
  const evento = crearEvento({ id: 'ev1', tipo: 't', escenaId: 's1', duracion: 5 });
  const r = validarEstructura('Evento', evento);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Evento válido con solo condicionExpiracion es válido', () => {
  const evento = crearEvento({ id: 'ev1', tipo: 't', escenaId: 's1', condicionExpiracion: 'algo_pasa' });
  const r = validarEstructura('Evento', evento);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Suceso válido con alcance escena es válido', () => {
  const suceso = crearSuceso({ id: 's1', tipo: 't', alcance: 'escena', escenaId: 'escena_x', velocidadProgreso: 5, condicionResolucion: 'x' });
  const r = validarEstructura('Suceso', suceso);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Suceso válido con alcance global es válido', () => {
  const suceso = crearSuceso({ id: 's1', tipo: 't', alcance: 'global', velocidadProgreso: 5, condicionResolucion: 'x' });
  const r = validarEstructura('Suceso', suceso);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('EstadoDelMundo construido con crearEstadoDelMundo es válido', () => {
  const edm = crearEstadoDelMundo();
  const r = validarEstructura('EstadoDelMundo', edm);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

// --- Campos obligatorios faltantes ---

test('NPC sin nombre falla', () => {
  const npc = crearNPC({ id: 'npc_x', arquetipo: 'y', personalidadBase: 'z' });
  const r = validarEstructura('NPC', npc);
  assert.equal(r.valido, false);
});

test('Jugador sin ubicacionActual falla (no es nullable)', () => {
  const jugador = crearJugador({ id: 'j1', nombre: 'X' });
  const r = validarEstructura('Jugador', jugador);
  assert.equal(r.valido, false);
});

// --- Casos límite documentados explícitamente como error ---

test('Evento con duracion y condicionExpiracion ambos null falla', () => {
  const evento = crearEvento({ id: 'ev1', tipo: 't', escenaId: 's1' });
  const r = validarEstructura('Evento', evento);
  assert.equal(r.valido, false);
  assert.ok(r.errores.some((e) => e.includes('no pueden ser ambos null')));
});

test('Conocimiento con nivelAcceso=requiereEvento y eventoDisparadorId=null falla', () => {
  const npc = crearNPC({
    id: 'npc_x',
    nombre: 'X',
    arquetipo: 'y',
    personalidadBase: 'z',
    conocimientos: [
      { id: 'c1', contenido: 'algo', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: null },
    ],
  });
  const r = validarEstructura('NPC', npc);
  assert.equal(r.valido, false);
  assert.ok(r.errores.some((e) => e.includes('requiereEvento')));
});

test('Suceso con alcance=global y escenaId no null falla', () => {
  const suceso = crearSuceso({
    id: 's1', tipo: 't', alcance: 'global', escenaId: 'escena_x', velocidadProgreso: 1, condicionResolucion: 'x',
  });
  const r = validarEstructura('Suceso', suceso);
  assert.equal(r.valido, false);
});

test('Suceso con alcance=escena y escenaId=null falla', () => {
  const suceso = crearSuceso({
    id: 's1', tipo: 't', alcance: 'escena', velocidadProgreso: 1, condicionResolucion: 'x',
  });
  const r = validarEstructura('Suceso', suceso);
  assert.equal(r.valido, false);
});

test('EstadoDelMundo con horaActual fuera de rango (0-23) falla', () => {
  const edm = crearEstadoDelMundo({ horaActual: 25 });
  const r = validarEstructura('EstadoDelMundo', edm);
  assert.equal(r.valido, false);
});

test('Suceso con progreso fuera de rango (0-100) falla', () => {
  const suceso = crearSuceso({
    id: 's1', tipo: 't', alcance: 'global', velocidadProgreso: 1, condicionResolucion: 'x', progreso: 150,
  });
  const r = validarEstructura('Suceso', suceso);
  assert.equal(r.valido, false);
});

test('NPC con nivelAcceso de conocimiento fuera del enum cerrado falla', () => {
  const npc = crearNPC({
    id: 'npc_x', nombre: 'X', arquetipo: 'y', personalidadBase: 'z',
    conocimientos: [{ id: 'c1', contenido: 'algo', nivelAcceso: 'secreto_absoluto', umbralRelacion: null, eventoDisparadorId: null }],
  });
  const r = validarEstructura('NPC', npc);
  assert.equal(r.valido, false);
});

// --- Validación estricta de campos extra ---

test('campo extra no documentado en el nivel superior falla', () => {
  const jugador = crearJugador({ id: 'j1', nombre: 'X', ubicacionActual: 's1' });
  jugador.campoInventado = true;
  const r = validarEstructura('Jugador', jugador);
  assert.equal(r.valido, false);
});

test('campo extra dentro de atributos (objeto abierto) NO falla', () => {
  const jugador = crearJugador({ id: 'j1', nombre: 'X', ubicacionActual: 's1', atributos: { cualquierCosa: 5 } });
  const r = validarEstructura('Jugador', jugador);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('tipo desconocido devuelve inválido en vez de reventar', () => {
  const r = validarEstructura('EntidadQueNoExiste', {});
  assert.equal(r.valido, false);
});
