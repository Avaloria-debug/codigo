import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registroPlantillasPorDefecto, plantillaIdPara } from './plantillas.js';

describe('registroPlantillasPorDefecto — integridad de datos', () => {
  test('toda plantilla registrada tiene al menos 3 variantes (doc técnico 3.1: "3 o más")', () => {
    for (const [id, variantes] of Object.entries(registroPlantillasPorDefecto)) {
      assert.ok(variantes.length >= 3, `'${id}' tiene sólo ${variantes.length} variante(s)`);
    }
  });

  test('ninguna variante queda vacía o repetida dentro de la misma plantilla', () => {
    for (const [id, variantes] of Object.entries(registroPlantillasPorDefecto)) {
      for (const v of variantes) assert.ok(v.trim().length > 0, `'${id}' tiene una variante vacía`);
      assert.equal(new Set(variantes).size, variantes.length, `'${id}' tiene variantes duplicadas`);
    }
  });
});

describe('plantillaIdPara — convención de nomenclatura', () => {
  test('resultado exito/fallo -> "resultado_<slug>_<resultado>"', () => {
    assert.equal(plantillaIdPara('Huir', 'exito'), 'resultado_huir_exito');
    assert.equal(plantillaIdPara('Huir', 'fallo'), 'resultado_huir_fallo');
    assert.equal(plantillaIdPara('Atacar', 'exito'), 'resultado_atacar_exito');
    assert.equal(plantillaIdPara('Negociar', 'fallo'), 'resultado_negociar_fallo');
  });

  test('resultado neutral -> "verbo_<slug>", sin distinguir éxito/fallo', () => {
    assert.equal(plantillaIdPara('Explorar', 'neutral'), 'verbo_explorar');
    assert.equal(plantillaIdPara('Rendirse', 'neutral'), 'verbo_rendirse');
  });

  test('normaliza tildes: "Calmar la situación" -> "situacion" sin acento', () => {
    assert.equal(plantillaIdPara('Calmar la situación', 'exito'), 'resultado_calmar_la_situacion_exito');
  });

  test('saca puntuación final: "Hablar con..." -> "hablar_con"', () => {
    assert.equal(plantillaIdPara('Hablar con...', 'exito'), 'resultado_hablar_con_exito');
    assert.equal(plantillaIdPara('Hablar con...', 'fallo'), 'resultado_hablar_con_fallo');
  });

  test('verbos multi-palabra colapsan espacios en "_"', () => {
    assert.equal(plantillaIdPara('Avanzar con cautela', 'neutral'), 'verbo_avanzar_con_cautela');
  });

  test('todo id derivado para los verbos con cobertura declarada existe realmente en el registro', () => {
    const casos = [
      ['Huir', 'exito'], ['Huir', 'fallo'],
      ['Atacar', 'exito'], ['Atacar', 'fallo'],
      ['Usar', 'exito'], ['Usar', 'fallo'],
      ['Negociar', 'exito'], ['Negociar', 'fallo'],
      ['Hablar con...', 'exito'], ['Hablar con...', 'fallo'],
      ['Explorar', 'neutral'], ['Descansar', 'neutral'], ['Observar', 'neutral'],
      ['Examinar', 'neutral'], ['Avanzar con cautela', 'neutral'], ['Rendirse', 'neutral'],
    ];
    for (const [nombre, resultado] of casos) {
      const id = plantillaIdPara(nombre, resultado);
      assert.ok(registroPlantillasPorDefecto[id], `id derivado '${id}' (de '${nombre}'/'${resultado}') no está en el registro`);
    }
  });

  test('un verbo sin cobertura explícita (fuera del alcance de este cascarón) deriva un id que no está registrado — comportamiento esperado, lo resuelve el fallback de seleccionarVariante', () => {
    const id = plantillaIdPara('Presionar', 'exito');
    assert.equal(registroPlantillasPorDefecto[id], undefined);
  });
});
