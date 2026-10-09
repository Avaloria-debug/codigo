import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encolarLlamadaGroq } from './encolarLlamadaGroq.js';
import { crearRegistroUso } from './registroUso.js';
import { crearConfiguracionGroq } from './configuracionGroq.js';
import { crearRelojFalso, crearFetchFalso, cuerpoGroq } from './utilsPrueba.js';

const MENSAJES = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }];
const cfg = (o = {}) => crearConfiguracionGroq({ apiKey: 'gsk_test', ...o });

function entorno(guion, cfgOverrides = {}) {
  const r = crearRelojFalso();
  const registro = crearRegistroUso({ reloj: r.reloj });
  const fetch = crearFetchFalso(guion);
  const encolar = (tokens = 600) => encolarLlamadaGroq(MENSAJES, tokens, cfg(cfgOverrides), registro, { fetch, dormir: r.dormir });
  return { r, registro, fetch, encolar };
}
const ok = (texto = 'Hola.', extra) => ({ body: cuerpoGroq(texto, extra) });

describe('encolarLlamadaGroq — camino feliz', () => {
  test('devuelve el texto y registra la llamada con los tokens REALES del servidor', async () => {
    const e = entorno([ok('Andate.', { usage: { total_tokens: 512 } })]);
    const res = await e.encolar(700);
    assert.deepEqual(res, { agotado: false, texto: 'Andate.', recortado: false, tokensUsados: 512 });
    assert.equal(e.registro.resumen().tokensUltimoMinuto, 512);
  });
  test('sin `usage` en la respuesta: registra el estimado', async () => {
    const e = entorno([{ body: { choices: [{ message: { content: 'Hola.' }, finish_reason: 'stop' }] } }]);
    await e.encolar(650);
    assert.equal(e.registro.resumen().tokensUltimoMinuto, 650);
  });
  test('finish_reason "length": recorta a la última oración y lo marca', async () => {
    const e = entorno([ok('No. Ni lo sueñes. Y ademá', { finishReason: 'length' })]);
    const res = await e.encolar();
    assert.equal(res.texto, 'No. Ni lo sueñes.');
    assert.equal(res.recortado, true);
  });
});

describe('encolarLlamadaGroq — los tres límites, cargados cerca del tope', () => {
  test('RPM: con 29 llamadas en el último minuto la 30 pasa sin esperar', async () => {
    const e = entorno([ok()]);
    for (let i = 0; i < 29; i++) e.registro.registrar({ tokens: 10 });
    await e.encolar(100);
    assert.deepEqual(e.r.dormidos, []);
    assert.equal(e.fetch.llamadas.length, 1);
  });
  test('RPM: con 30 llamadas, la 31 espera a que salga la más vieja antes de llamar', async () => {
    const e = entorno([ok()]);
    for (let i = 0; i < 30; i++) e.registro.registrar({ tokens: 10 });
    await e.encolar(100);
    assert.deepEqual(e.r.dormidos, [60_000]);
    assert.equal(e.fetch.llamadas.length, 1);
  });
  test('TPM: con 7.900 tokens usados, una llamada estimada en 600 espera; la respuesta llega recién después', async () => {
    const e = entorno([ok()]);
    e.registro.registrar({ tokens: 7900 });
    const res = await e.encolar(600);
    assert.equal(e.r.dormidos.length, 1);
    assert.equal(res.texto, 'Hola.');
  });
  test('TPM: con margen suficiente no espera', async () => {
    const e = entorno([ok()]);
    e.registro.registrar({ tokens: 7000 });
    await e.encolar(600);
    assert.deepEqual(e.r.dormidos, []);
  });
  test('RPD: con 999 llamadas en 24h la 1000 pasa', async () => {
    const e = entorno([ok()]);
    for (let i = 0; i < 999; i++) e.registro.registrar({ tokens: 1 });
    const res = await e.encolar(100);
    assert.equal(res.agotado, false);
  });
  test('RPD: con 1000 llamadas → agotado SIN esperar y SIN tocar la red', async () => {
    const e = entorno([ok()]);
    for (let i = 0; i < 1000; i++) e.registro.registrar({ tokens: 1 });
    const res = await e.encolar(100);
    assert.equal(res.agotado, true);
    assert.equal(res.motivo, 'rpd_agotado');
    assert.ok(res.msHastaCupoDiario > 0);
    assert.equal(e.fetch.llamadas.length, 0);
    assert.deepEqual(e.r.dormidos, []);
  });
  test('RPD: el cupo vuelve 24h después de la llamada más vieja (ventana móvil)', async () => {
    const e = entorno([ok()], { limites: { rpd: 2 } });
    e.registro.registrar({ tokens: 1 });
    e.r.avanzar(3_600_000);
    e.registro.registrar({ tokens: 1 });
    assert.equal((await e.encolar(100)).agotado, true);
    e.r.avanzar(86_400_000 - 3_600_000); // se cumplen 24h de la primera
    assert.equal((await e.encolar(100)).agotado, false);
  });
});

describe('encolarLlamadaGroq — 429 y backoff', () => {
  test('429 con retry-after corto: espera ese tiempo y reintenta con éxito', async () => {
    const e = entorno([{ status: 429, headers: { 'retry-after': '3' } }, ok('Dale.')]);
    const res = await e.encolar();
    assert.equal(res.texto, 'Dale.');
    assert.deepEqual(e.r.dormidos, [3000]);
    assert.equal(e.fetch.llamadas.length, 2);
  });
  test('429 sin header: backoff exponencial 1s, 2s, 4s', async () => {
    const e = entorno([{ status: 429 }, { status: 429 }, { status: 429 }, ok('Al fin.')]);
    const res = await e.encolar();
    assert.equal(res.texto, 'Al fin.');
    assert.deepEqual(e.r.dormidos, [1000, 2000, 4000]);
  });
  test('429 persistente: tras 3 reintentos se rinde → error (cae a mock)', async () => {
    const e = entorno([{ status: 429 }]);
    const res = await e.encolar();
    assert.equal(res.error, true);
    assert.equal(res.motivo, 'rate_limit_persistente');
    assert.equal(e.fetch.llamadas.length, 4); // 1 intento + 3 reintentos
  });
  test('429 que pide esperar más que maxEsperaMs (ej. límite diario real) → agotado, sin dormir', async () => {
    const e = entorno([{ status: 429, headers: { 'x-ratelimit-reset-requests': '14m24s' } }]);
    const res = await e.encolar();
    assert.equal(res.agotado, true);
    assert.equal(res.motivo, 'rate_limit_espera_excesiva');
    assert.deepEqual(e.r.dormidos, []);
  });
  test('un 429 no se registra como uso consumido', async () => {
    const e = entorno([{ status: 429, headers: { 'retry-after': '1' } }, ok()]);
    await e.encolar();
    assert.equal(e.registro.resumen().llamadasUltimoMinuto, 1);
  });
});

describe('encolarLlamadaGroq — degradación (todo lo que no da texto usable)', () => {
  for (const status of [400, 401, 500]) {
    test(`status ${status} → error controlado, sin lanzar`, async () => {
      const res = await entorno([{ status, texto: 'x' }]).encolar();
      assert.equal(res.error, true);
      assert.equal(res.motivo, `error_groq_${status}`);
    });
  }
  test('fallo de red → error controlado', async () => {
    const res = await entorno([new TypeError('Failed to fetch')]).encolar();
    assert.equal(res.error, true);
    assert.equal(res.motivo, 'error_groq_0');
  });
  test('200 con content vacío → error "respuesta_vacia" (y igual consume cupo)', async () => {
    const e = entorno([ok('   ')]);
    const res = await e.encolar();
    assert.equal(res.motivo, 'respuesta_vacia');
    assert.equal(e.registro.resumen().llamadasUltimoMinuto, 1);
  });
  test('un error que NO es de Groq (bug de programación) no se esconde, y no rompe la cola siguiente', async () => {
    const e = entorno([ok('Sigue.')]);
    const configRota = { ...cfg(), limites: null }; // TypeError propio, no un fallo de Groq
    const rota = encolarLlamadaGroq(MENSAJES, 100, configRota, e.registro, { fetch: e.fetch, dormir: e.r.dormir });
    const sana = e.encolar(100);
    await assert.rejects(rota, TypeError);
    assert.equal((await sana).texto, 'Sigue.');
  });
  test('reloj que no avanza (dormir no adelanta nada): no entra en loop infinito', async () => {
    const r = crearRelojFalso();
    const registro = crearRegistroUso({ reloj: r.reloj });
    for (let i = 0; i < 30; i++) registro.registrar({ tokens: 1 });
    const res = await encolarLlamadaGroq(MENSAJES, 10, cfg(), registro, { fetch: crearFetchFalso([ok()]), dormir: async () => {} });
    assert.equal(res.motivo, 'demasiadas_vueltas_de_espera');
  });
});

describe('encolarLlamadaGroq — serialización', () => {
  test('dos llamadas simultáneas sobre el mismo registro no pasan juntas el chequeo de cupo (rpm=1)', async () => {
    const e = entorno([ok('Uno.'), ok('Dos.')], { limites: { rpm: 1 } });
    const [a, b] = await Promise.all([e.encolar(100), e.encolar(100)]);
    assert.equal(a.texto, 'Uno.');
    assert.equal(b.texto, 'Dos.');
    assert.deepEqual(e.r.dormidos, [60_000], 'la segunda esperó el minuto completo');
    assert.equal(e.registro.resumen().llamadasUltimoMinuto, 1, 'la primera ya salió de la ventana de 60s');
  });
  test('una llamada que degrada no rompe la cola para la siguiente', async () => {
    const e = entorno([{ status: 500 }, ok('Sigue.')]);
    const [a, b] = await Promise.all([e.encolar(), e.encolar()]);
    assert.equal(a.error, true);
    assert.equal(b.texto, 'Sigue.');
  });
});
