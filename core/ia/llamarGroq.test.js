import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { llamarGroq, esperaSugeridaPor429 } from './llamarGroq.js';
import { crearConfiguracionGroq } from './configuracionGroq.js';
import { ErrorGroq, ErrorRateLimit } from './errores.js';
import { crearFetchFalso, cuerpoGroq } from './utilsPrueba.js';

const MENSAJES = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }];
const cfg = (o = {}) => crearConfiguracionGroq({ apiKey: 'gsk_test', ...o });

describe('llamarGroq — request', () => {
  test('endpoint, método, headers y body con los parámetros acordados (decisión A)', async () => {
    const f = crearFetchFalso([{ body: cuerpoGroq('Hola.') }]);
    await llamarGroq(MENSAJES, cfg(), { fetch: f });
    const [{ url, init, cuerpo }] = f.llamadas;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer gsk_test');
    assert.equal(cuerpo.model, 'openai/gpt-oss-120b');
    assert.equal(cuerpo.max_completion_tokens, 400);
    assert.equal(cuerpo.reasoning_effort, 'low');
    assert.equal(cuerpo.include_reasoning, false);
    assert.equal(cuerpo.temperature, 0.8);
    assert.deepEqual(cuerpo.messages, MENSAJES);
  });
  test('NO manda `max_tokens` (deprecado)', async () => {
    const f = crearFetchFalso([{ body: cuerpoGroq('x') }]);
    await llamarGroq(MENSAJES, cfg(), { fetch: f });
    assert.equal('max_tokens' in f.llamadas[0].cuerpo, false);
  });
  test('modelo configurable, no hardcodeado', async () => {
    const f = crearFetchFalso([{ body: cuerpoGroq('x') }]);
    await llamarGroq(MENSAJES, cfg({ modelo: 'llama-3.3-70b-versatile' }), { fetch: f });
    assert.equal(f.llamadas[0].cuerpo.model, 'llama-3.3-70b-versatile');
  });
  test('reasoningEffort null (modelo no razonador): se omiten reasoning_effort e include_reasoning', async () => {
    const f = crearFetchFalso([{ body: cuerpoGroq('x') }]);
    await llamarGroq(MENSAJES, cfg({ reasoningEffort: null }), { fetch: f });
    assert.equal('reasoning_effort' in f.llamadas[0].cuerpo, false);
    assert.equal('include_reasoning' in f.llamadas[0].cuerpo, false);
  });
});

describe('llamarGroq — respuesta', () => {
  test('devuelve texto, finishReason y usage', async () => {
    const f = crearFetchFalso([{ body: cuerpoGroq('Andate.', { finishReason: 'stop' }) }]);
    const r = await llamarGroq(MENSAJES, cfg(), { fetch: f });
    assert.equal(r.texto, 'Andate.');
    assert.equal(r.finishReason, 'stop');
    assert.equal(r.usage.total_tokens, 340);
  });
  test('content null (ej. razonamiento se comió el tope) → texto null, no rompe', async () => {
    const f = crearFetchFalso([{ body: { choices: [{ message: { content: null }, finish_reason: 'length' }] } }]);
    const r = await llamarGroq(MENSAJES, cfg(), { fetch: f });
    assert.equal(r.texto, null);
    assert.equal(r.finishReason, 'length');
  });
  test('sin choices → texto null', async () => {
    const r = await llamarGroq(MENSAJES, cfg(), { fetch: crearFetchFalso([{ body: {} }]) });
    assert.equal(r.texto, null);
  });
});

describe('llamarGroq — errores', () => {
  test('429 con retry-after en segundos → ErrorRateLimit con ms', async () => {
    const f = crearFetchFalso([{ status: 429, headers: { 'retry-after': '12' }, texto: 'rate' }]);
    await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: f }), (e) => e instanceof ErrorRateLimit && e.retryAfterMs === 12_000);
  });
  test('429 sin retry-after pero con x-ratelimit-reset-*: toma el mayor', async () => {
    const f = crearFetchFalso([{ status: 429, headers: { 'x-ratelimit-reset-requests': '2m59.56s', 'x-ratelimit-reset-tokens': '7.66s' } }]);
    await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: f }), (e) => e instanceof ErrorRateLimit && e.retryAfterMs === 179_560);
  });
  test('429 sin ningún header usable → retryAfterMs null', async () => {
    await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: crearFetchFalso([{ status: 429 }]) }), (e) => e instanceof ErrorRateLimit && e.retryAfterMs === null);
  });
  for (const status of [400, 401, 500, 503]) {
    test(`status ${status} → ErrorGroq con ese status`, async () => {
      await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: crearFetchFalso([{ status, texto: 'mal' }]) }), (e) => e instanceof ErrorGroq && e.status === status && e.cuerpo === 'mal');
    });
  }
  test('fallo de red (fetch lanza) → ErrorGroq status 0', async () => {
    await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: crearFetchFalso([new TypeError('Failed to fetch')]) }), (e) => e instanceof ErrorGroq && e.status === 0);
  });
  test('200 con cuerpo que no es JSON → ErrorGroq', async () => {
    await assert.rejects(llamarGroq(MENSAJES, cfg(), { fetch: crearFetchFalso([{ texto: '<html>' }]) }), ErrorGroq);
  });
});

test('esperaSugeridaPor429: headers ausentes o sin .get → null', () => {
  assert.equal(esperaSugeridaPor429(undefined), null);
  assert.equal(esperaSugeridaPor429({}), null);
});
