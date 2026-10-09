import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerDialogoNPC, obtenerDialogoNPCConOrigen } from './obtenerDialogoNPC.js';
import { crearRegistroUso } from './registroUso.js';
import { crearConfiguracionGroq } from './configuracionGroq.js';
import { crearRelojFalso, crearFetchFalso, cuerpoGroq } from './utilsPrueba.js';

function contexto(overrides = {}) {
  return {
    npc: { nombre: 'Genérico el Hostil', personalidadBase: 'Hosco.' },
    estadoEmocionalProyectado: 'hostil',
    categoriaRelacion: 'Hostil',
    escena: { nombre: 'Plaza', estadoCalculado: 'peligroso' },
    estadoMundo: { horaActual: 23, climaActual: 'lluvia' },
    accionResuelta: { resultado: 'fallo' },
    textoLibreJugador: 'Bajá el arma, no quiero pelear.',
    tonoElegido: null,
    conocimientosRevelables: [],
    ...overrides,
  };
}
function entorno(guion, cfgOverrides = {}) {
  const r = crearRelojFalso();
  const registro = crearRegistroUso({ reloj: r.reloj });
  const fetch = crearFetchFalso(guion);
  const config = crearConfiguracionGroq({ apiKey: 'gsk_test', ...cfgOverrides });
  return { r, registro, fetch, config, opciones: { fetch, dormir: r.dormir } };
}
const fetchProhibido = () => {
  const f = async () => {
    f.llamadas.push(1);
    throw new Error('NO debería haber red');
  };
  f.llamadas = [];
  return f;
};

describe('obtenerDialogoNPC — modo mock forzado', () => {
  test('forzarMock: nunca toca la red y devuelve un string con prefijo [MOCK]', async () => {
    const e = entorno([{ status: 500 }]);
    const f = fetchProhibido();
    const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, { forzarMock: true, fetch: f });
    assert.equal(typeof r.texto, 'string');
    assert.match(r.texto, /^\[MOCK\] Genérico el Hostil \(hostil, resultado: fallo\)/);
    assert.equal(r.motivo, 'forzado');
    assert.equal(f.llamadas.length, 0, 'ni siquiera se intentó llamar a fetch');
    assert.equal(e.registro.resumen().llamadasUltimas24h, 0);
  });
  test('caso del doc (sección 7): mock coherente con resultado "fallo" y estado "hostil"', async () => {
    const e = entorno([]);
    const texto = await obtenerDialogoNPC(contexto(), e.config, e.registro, { forzarMock: true });
    assert.equal(texto, '[MOCK] Genérico el Hostil (hostil, resultado: fallo): No tengo nada que decirte.');
  });
  test('sin apiKey: cae a mock sin intentar red', async () => {
    const e = entorno([], { apiKey: null });
    const f = fetchProhibido();
    const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, { fetch: f });
    assert.equal(r.origen, 'mock');
    assert.equal(r.motivo, 'sin_api_key');
    assert.equal(f.llamadas.length, 0);
  });
});

describe('obtenerDialogoNPC — Groq real (fetch simulado)', () => {
  test('devuelve el texto de la IA y lo marca origen "groq"', async () => {
    const e = entorno([{ body: cuerpoGroq('No confío en vos ni un segundo. Andate.') }]);
    const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, e.opciones);
    assert.equal(r.texto, 'No confío en vos ni un segundo. Andate.');
    assert.equal(r.origen, 'groq');
    assert.equal(r.motivo, null);
  });
  test('la interfaz es idéntica: siempre string, venga de Groq o del mock', async () => {
    const e = entorno([{ body: cuerpoGroq('Hola.') }]);
    const deGroq = await obtenerDialogoNPC(contexto(), e.config, e.registro, e.opciones);
    const deMock = await obtenerDialogoNPC(contexto(), e.config, e.registro, { forzarMock: true });
    assert.equal(typeof deGroq, 'string');
    assert.equal(typeof deMock, 'string');
  });
  test('el request lleva el prompt armado por código (system + user, sin historial)', async () => {
    const e = entorno([{ body: cuerpoGroq('Ok.') }]);
    await obtenerDialogoNPC(contexto(), e.config, e.registro, e.opciones);
    const { cuerpo } = e.fetch.llamadas[0];
    assert.deepEqual(cuerpo.messages.map((m) => m.role), ['system', 'user']);
    assert.match(cuerpo.messages[1].content, /estado de ánimo ahora mismo: hostil/);
  });
  test('la estimación previa usa entrada + max_completion_tokens (peor caso), la registrada es la real', async () => {
    const e = entorno([{ body: cuerpoGroq('Ok.', { usage: { total_tokens: 480 } }) }]);
    const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, e.opciones);
    assert.equal(r.tokensUsados, 480);
    assert.equal(e.registro.resumen().tokensUltimoMinuto, 480);
  });
});

describe('obtenerDialogoNPC — degradación a mock (la conversación no se corta)', () => {
  const casos = [
    ['error de Groq (500)', [{ status: 500 }], 'error_groq_500'],
    ['fallo de red', [new TypeError('Failed to fetch')], 'error_groq_0'],
    ['401 (API key inválida)', [{ status: 401 }], 'error_groq_401'],
    ['respuesta vacía (200 con content "")', [{ body: cuerpoGroq('') }], 'respuesta_vacia'],
    ['429 persistente', [{ status: 429 }], 'rate_limit_persistente'],
  ];
  for (const [nombre, guion, motivo] of casos) {
    test(`${nombre} → mock, motivo "${motivo}"`, async () => {
      const e = entorno(guion);
      const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, e.opciones);
      assert.equal(r.origen, 'mock');
      assert.equal(r.motivo, motivo);
      assert.match(r.texto, /^\[MOCK\]/);
    });
  }
  test('agotar las 1.000 llamadas del día: cae a mock SIN intentar ninguna llamada de red', async () => {
    const e = entorno([{ body: cuerpoGroq('x') }]);
    for (let i = 0; i < 1000; i++) e.registro.registrar({ tokens: 1 });
    const r = await obtenerDialogoNPCConOrigen(contexto(), e.config, e.registro, e.opciones);
    assert.equal(r.origen, 'mock');
    assert.equal(r.motivo, 'rpd_agotado');
    assert.equal(e.fetch.llamadas.length, 0);
  });
  test('un error inesperado dentro del pipeline (bug, no fallo de Groq) también cae a mock y avisa por console.warn', async () => {
    const e = entorno([{ body: cuerpoGroq('x') }]);
    const avisos = [];
    const original = console.warn;
    console.warn = (m) => avisos.push(m);
    try {
      const r = await obtenerDialogoNPCConOrigen(contexto(), { ...e.config, limites: null }, e.registro, e.opciones);
      assert.equal(r.origen, 'mock');
      assert.equal(r.motivo, 'error_inesperado');
    } finally {
      console.warn = original;
    }
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /error inesperado/);
  });
});
