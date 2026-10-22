const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');
function result(domain, scores, info = {}) {
  return Core.calculateJmp({ ...Core.defaults(), ...info }, Object.entries(scores).map(([code, score]) => ({ code, score })))[domain].status;
}
const pairExpected = (a, b) => a >= 1 && b >= 1 ? 'Básico' : a === 0 && b === 0 ? 'Sin Servicio' : 'Limitado';

test('water matches all 27 score combinations across the three facility levels', () => {
  for (const [level, code] of [['Primer Nivel', 'A_1a'], ['Segundo Nivel', 'A_1b'], ['Tercer Nivel', 'A_1b']]) {
    for (let source = 0; source <= 2; source++) for (let available = 0; available <= 2; available++) {
      const scores = { [code]: source, [code === 'A_1a' ? 'A_1b' : 'A_1a']: 2 - source, A_3: available };
      assert.equal(result('water', scores, { level }), source === 0 ? 'Sin Servicio' : available >= 1 ? 'Básico' : 'Limitado', JSON.stringify({ level, scores }));
    }
  }
});

test('sanitation matches all 729 combinations, excluding S_3', () => {
  const codes = ['S_1', 'S_2', 'S_4', 'S_5', 'S_6', 'S_7'];
  for (let combination = 0; combination < 729; combination++) {
    let value = combination;
    const scores = Object.fromEntries(codes.map(code => { const score = value % 3; value = Math.floor(value / 3); return [code, score]; }));
    const expected = scores.S_1 === 0 || scores.S_2 === 0 ? 'Sin Servicio' : Object.values(scores).every(score => score >= 1) ? 'Básico' : 'Limitado';
    assert.equal(result('sanitation', { ...scores, S_3: 0 }), expected, JSON.stringify(scores));
  }
});

test('waste, hand hygiene and cleaning match every pair of scores', () => {
  for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) {
    for (const [route, code] of [['onsite', 'RES_10'], ['external', 'RES_12']]) {
      assert.equal(result('waste', { RES_2: a, [code]: b }, { wasteTreatmentRoute: route }), pairExpected(a, b));
      assert.equal(result('waste', { RES_2: a, [code]: b }), pairExpected(a, b));
    }
    assert.equal(result('hygiene', { H_1: a, S_3: b, H_2: 2 }), pairExpected(a, b));
    const cleaning = a >= 1 && b === 2 ? 'Básico' : a === 0 && b === 0 ? 'Sin Servicio' : 'Limitado';
    assert.equal(result('cleaning', { L_1: a, L_5: b }), cleaning);
  }
});

test('empty and non-applicable responses count as zero in JMP without changing saved answers', () => {
  for (const domain of ['water', 'sanitation', 'waste', 'hygiene', 'cleaning']) assert.equal(result(domain, {}), 'Sin Servicio');
  for (const [domain, scores, expected] of [['water', { A_1a: 1 }, 'Limitado'], ['water', { A_3: 0 }, 'Sin Servicio'], ['sanitation', { S_1: 1, S_2: 1 }, 'Limitado'], ['waste', { RES_2: 0 }, 'Sin Servicio'], ['hygiene', { H_1: 0 }, 'Sin Servicio'], ['cleaning', { L_1: 0 }, 'Sin Servicio']]) assert.equal(result(domain, scores), expected);
  const indicators = [{code:'A_1a',score:2},{code:'A_3',score:null,notes:'INDICADOR NO APLICA el servicio no existe'}];
  const before = JSON.stringify(indicators);
  assert.equal(Core.calculateJmp(Core.defaults(), indicators).water.status, 'Limitado');
  assert.equal(JSON.stringify(indicators), before);
  assert.equal(result('water', { A_1a: 0 }), 'Sin Servicio');
  assert.equal(result('sanitation', { S_1: 0 }), 'Sin Servicio');
  assert.equal(result('sanitation', { S_2: 0 }), 'Sin Servicio');
});

test('waste respects an explicit route and uses both evaluated treatments when no route is selected', () => {
  const scores = { RES_2: 1, RES_10: 0, RES_12: 2, RES_11: 0, RES_13: 0 };
  assert.equal(result('waste', scores, { wasteTreatmentRoute: 'external' }), 'Básico');
  assert.equal(result('waste', scores, { wasteTreatmentRoute: 'onsite' }), 'Limitado');
  assert.equal(result('waste', scores), 'Limitado');
  assert.equal(result('waste', { RES_2: 2, RES_12: 2 }, { wasteTreatmentRoute: 'onsite' }), 'Limitado');
});

test('null scores follow the same matrix as zero across all required sanitation combinations', () => {
  const values = [null, 0, 1, 2], codes = ['S_1','S_2','S_4','S_5','S_6','S_7'];
  for (let combination = 0; combination < 4096; combination++) {
    let value = combination;
    const scores = Object.fromEntries(codes.map(code => { const s = values[value % 4]; value = Math.floor(value / 4); return [code,s]; }));
    const zeros = Object.fromEntries(Object.entries(scores).map(([code,s]) => [code,s ?? 0]));
    assert.equal(result('sanitation',scores),result('sanitation',zeros));
  }
  for (const a of values) for (const b of values) {
    for (const [domain, first, second, info] of [['water','A_1a','A_3',{}],['hygiene','H_1','S_3',{}],['cleaning','L_1','L_5',{}],['waste','RES_2','RES_10',{wasteTreatmentRoute:'onsite'}],['waste','RES_2','RES_12',{wasteTreatmentRoute:'external'}]]) {
      assert.equal(result(domain,{[first]:a,[second]:b},info),result(domain,{[first]:a ?? 0,[second]:b ?? 0},info));
    }
  }
});
