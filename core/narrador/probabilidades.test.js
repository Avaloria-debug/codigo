import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  probabilidadBase,
  modificadorPorRelacion,
  modificadorPorConfiabilidad,
  clampProbabilidad,
  registroProbabilidadBase,
} from './probabilidades.js';

describe('probabilidadBase — dispatch por tipo de entrada (tabla 2.2)', () => {
  test('tipo "objetos": conObjeto si opcionNivel2.objetoObjetivo está presente', () => {
    const p = probabilidadBase({ nombre: 'Atacar' }, { objetoObjetivo: 'x' });
    assert.equal(p, registroProbabilidadBase.Atacar.conObjeto);
  });

  test('tipo "objetos": fija si no hay objetoObjetivo (opción fija, o opcionNivel2 null)', () => {
    assert.equal(probabilidadBase({ nombre: 'Atacar' }, { etiqueta: 'Atacar a mano limpia' }), registroProbabilidadBase.Atacar.fija);
    assert.equal(probabilidadBase({ nombre: 'Atacar' }, null), registroProbabilidadBase.Atacar.fija);
  });

  test('tipo "riesgo": riesgosa si opcionNivel2.riesgosa === true, limpia si no', () => {
    assert.equal(probabilidadBase({ nombre: 'Huir' }, { riesgosa: true }), registroProbabilidadBase.Huir.riesgosa);
    assert.equal(probabilidadBase({ nombre: 'Huir' }, { riesgosa: undefined }), registroProbabilidadBase.Huir.limpia);
    assert.equal(probabilidadBase({ nombre: 'Huir' }, null), registroProbabilidadBase.Huir.limpia);
  });

  test('tipo "fija": mismo valor sin importar opcionNivel2', () => {
    assert.equal(probabilidadBase({ nombre: 'Negociar' }, null), registroProbabilidadBase.Negociar.valor);
    assert.equal(probabilidadBase({ nombre: 'Negociar' }, { etiqueta: 'cualquiera' }), registroProbabilidadBase.Negociar.valor);
  });

  test('verbo sin entrada registrada: reporta y devuelve 50 (fallback neutro), no rompe', () => {
    const original = console.warn;
    let avisado = false;
    console.warn = () => {
      avisado = true;
    };
    try {
      const p = probabilidadBase({ nombre: 'VerboInventadoQueNoExiste' }, null);
      assert.equal(p, 50);
      assert.equal(avisado, true);
    } finally {
      console.warn = original;
    }
  });

  test('cobertura exhaustiva: los 11 verbos "concrecion" de registroVerbosPorEstado + "Hablar con..." están todos', () => {
    const esperados = [
      'Huir', 'Retirarse', 'Abortar', 'Atacar', 'Emboscar', 'Calmar la situación',
      'Ocultarse', 'Distraer', 'Negociar', 'Presionar', 'Defender', 'Hablar con...',
    ];
    for (const nombre of esperados) {
      assert.ok(registroProbabilidadBase[nombre], `falta entrada para '${nombre}'`);
    }
  });
});

describe('modificadorPorRelacion (tabla 2.3)', () => {
  test('devuelve el modificador exacto por categoría', () => {
    assert.equal(modificadorPorRelacion('Hostil'), -25);
    assert.equal(modificadorPorRelacion('Desconfiado'), -10);
    assert.equal(modificadorPorRelacion('Neutral'), 0);
    assert.equal(modificadorPorRelacion('Cordial'), 10);
    assert.equal(modificadorPorRelacion('Aliado'), 20);
  });
});

describe('modificadorPorConfiabilidad (tabla 2.3bis)', () => {
  test('devuelve el modificador exacto por confiabilidad', () => {
    assert.equal(modificadorPorConfiabilidad('fragil'), -20);
    assert.equal(modificadorPorConfiabilidad('estandar'), 0);
    assert.equal(modificadorPorConfiabilidad('resistente'), 15);
  });

  test('undefined (objeto sin el campo) se trata como "estandar" -> 0', () => {
    assert.equal(modificadorPorConfiabilidad(undefined), 0);
  });
});

describe('clampProbabilidad — límites 5-95 siempre', () => {
  test('valores dentro de rango no se tocan', () => {
    assert.equal(clampProbabilidad(50), 50);
    assert.equal(clampProbabilidad(5), 5);
    assert.equal(clampProbabilidad(95), 95);
  });

  test('valores fuera de rango se recortan a los extremos', () => {
    assert.equal(clampProbabilidad(150), 95);
    assert.equal(clampProbabilidad(-10), 5);
    assert.equal(clampProbabilidad(0), 5);
    assert.equal(clampProbabilidad(100), 95);
  });

  // Nota: con las tablas de balance actuales (2.2/2.3/2.3bis) ninguna
  // combinación real de resolverAccion llega a necesitar este recorte
  // (el peor caso, patrón "riesgo" riesgosa + NPC Hostil, da
  // exactamente 30-25=5; el mejor caso, varias combinaciones, da 90) —
  // mismo tipo de salvaguarda "no alcanzable con el dataset actual,
  // sí necesaria para lore real" que ya documentó Fase 3 para su
  // fallback de texto libre (fase_3_ADENDUM.md, sección 3). Por eso
  // este clamp se prueba acá de forma aislada en vez de perseguir una
  // combinación real en resolverAccion.test.js.
});
