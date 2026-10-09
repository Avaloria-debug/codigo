import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistroUso, VENTANA_DIA_MS, VENTANA_MINUTO_MS } from './registroUso.js';
import { crearRelojFalso } from './utilsPrueba.js';

const LIM = { rpm: 30, tpm: 8000 };
const MIN = 60_000;

describe('registroUso — RPM (ventana móvil de 60s)', () => {
  test('29 llamadas en el último minuto: la 30 todavía entra; con 30, hay que esperar', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    for (let i = 0; i < 29; i++) { reg.registrar({ tokens: 10 }); r.avanzar(1000); }
    assert.equal(reg.msHastaCupoMinuto(10, LIM), 0);
    reg.registrar({ tokens: 10 });
    // la más vieja se hizo hace 29s → sale de la ventana en 31s
    assert.equal(reg.msHastaCupoMinuto(10, LIM), MIN - 29_000);
  });
  test('las llamadas de más de 60s ya no cuentan', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    for (let i = 0; i < 30; i++) reg.registrar({ tokens: 10 });
    r.avanzar(MIN);
    assert.equal(reg.msHastaCupoMinuto(10, LIM), 0);
  });
});

describe('registroUso — TPM', () => {
  test('7.900 tokens usados: una llamada de 200 espera; una de 100 entra', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 7900 });
    r.avanzar(10_000);
    assert.equal(reg.msHastaCupoMinuto(100, LIM), 0);
    assert.equal(reg.msHastaCupoMinuto(200, LIM), MIN - 10_000);
  });
  test('espera lo mínimo necesario: libera sólo las llamadas que hagan falta, no todas', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 4000 }); r.avanzar(10_000); // t=0
    reg.registrar({ tokens: 3500 }); r.avanzar(10_000); // t=10s ; ahora=20s ; total 7500
    // entrada de 1000: hay que liberar 500+ → alcanza con que salga la primera (t=0), a los 60s
    assert.equal(reg.msHastaCupoMinuto(1000, LIM), MIN - 20_000);
  });
  test('una llamada que sola supera el TPM no espera para siempre (decide el servidor)', () => {
    const reg = crearRegistroUso({ reloj: crearRelojFalso().reloj });
    assert.equal(reg.msHastaCupoMinuto(9000, LIM), 0);
  });
});

describe('registroUso — RPD (ventana móvil de 24h, no día calendario)', () => {
  test('23:50 y 00:10 cuentan contra la MISMA ventana (el caso que rompía el reset por día calendario)', () => {
    const r = crearRelojFalso(Date.UTC(2026, 0, 1, 23, 50));
    const reg = crearRegistroUso({ reloj: r.reloj });
    for (let i = 0; i < 10; i++) reg.registrar({ tokens: 1 });
    r.avanzar(20 * 60_000); // 00:10 del día siguiente
    for (let i = 0; i < 5; i++) reg.registrar({ tokens: 1 });
    assert.equal(reg.agotadoDiario(15), true, 'con calendario UTC esto daría 5 < 15 y NO estaría agotado');
    assert.equal(reg.agotadoDiario(16), false);
  });
  test('cada llamada libera su cupo exactamente 24h después de hacerse', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 1 }); r.avanzar(1000);
    reg.registrar({ tokens: 1 }); r.avanzar(1000);
    reg.registrar({ tokens: 1 });
    assert.equal(reg.agotadoDiario(3), true);
    assert.equal(reg.msHastaCupoDiario(3), VENTANA_DIA_MS - 2000); // la primera se hizo hace 2s
    r.avanzar(VENTANA_DIA_MS - 2000);
    assert.equal(reg.agotadoDiario(3), false);
    assert.equal(reg.msHastaCupoDiario(3), 0);
  });
  test('una llamada de hace 23h sigue contando (no hay purga anticipada); a las 24h exactas se libera', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 1 });
    r.avanzar(23 * 3_600_000);
    assert.equal(reg.agotadoDiario(1), true);
    assert.equal(reg.msHastaCupoDiario(1), 3_600_000);
    r.avanzar(3_600_000);
    assert.equal(reg.agotadoDiario(1), false);
  });
  test('999 llamadas hoy: la 1000 entra; con 1000 ya se agotó', () => {
    const reg = crearRegistroUso({ reloj: crearRelojFalso().reloj });
    for (let i = 0; i < 999; i++) reg.registrar({ tokens: 1 });
    assert.equal(reg.agotadoDiario(1000), false);
    reg.registrar({ tokens: 1 });
    assert.equal(reg.agotadoDiario(1000), true);
  });
  test('NO depende del día de juego: sólo del reloj inyectado', () => {
    // No hay ningún parámetro de estadoMundo en el registro — prueba de contrato.
    assert.equal(crearRegistroUso.length <= 1, true);
  });
});

describe('registroUso — purga, resumen y serialización', () => {
  test('lo de más de 24h se purga solo', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 5 });
    r.avanzar(VENTANA_DIA_MS + 1);
    assert.equal(reg.resumen().llamadasUltimas24h, 0);
  });
  test('resumen: llamadas/tokens del último minuto y llamadas de 24h', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 100 }); r.avanzar(VENTANA_MINUTO_MS + 1);
    reg.registrar({ tokens: 50 });
    assert.deepEqual(reg.resumen(), { llamadasUltimoMinuto: 1, tokensUltimoMinuto: 50, llamadasUltimas24h: 2 });
  });
  test('serializar → JSON → crearRegistroUso({estadoInicial}) reconstruye las mismas ventanas', () => {
    const r = crearRelojFalso();
    const reg = crearRegistroUso({ reloj: r.reloj });
    reg.registrar({ tokens: 300 }); r.avanzar(5000); reg.registrar({ tokens: 200 });
    const copia = crearRegistroUso({ reloj: r.reloj, estadoInicial: JSON.parse(JSON.stringify(reg.serializar())) });
    assert.deepEqual(copia.resumen(), reg.resumen());
    assert.equal(copia.msHastaCupoMinuto(7600, LIM), reg.msHastaCupoMinuto(7600, LIM));
  });
  test('estadoInicial con basura se ignora sin romper', () => {
    const reg = crearRegistroUso({ reloj: crearRelojFalso().reloj, estadoInicial: { llamadas: [null, { t: 'x' }, { t: 1, tokens: 2 }] } });
    assert.equal(reg.resumen().llamadasUltimas24h <= 1, true);
  });
});
