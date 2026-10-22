const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

function load() {
  let app;
  const context = vm.createContext({
    Vue: { ref: value => ({ value }), computed: getter => ({ get value() { return getter(); } }), onMounted() {}, nextTick() {}, watch() {}, createApp: options => ({ mount() { app = options.setup(); } }) },
    window: { innerWidth: 1200 }, navigator: { onLine: true },
    WashStorage: { createStore: () => ({}) }, setTimeout() {}, clearTimeout() {}, Date, Intl
  });
  for (const file of ['js/core.js', 'js/data/indicators.js', 'js/app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return app;
}

test('sanitation shows exactly the applicable sewer or onsite questions', () => {
  const app = load();
  app.activeModuleTab.value = 'sanitation';
  const branchCodes = () => Array.from(app.getFilteredIndicatorsByModule.value.filter(i => /^S_(8|9|10)/.test(i.code)), i => i.code).sort();
  assert.deepEqual(branchCodes(), []);
  app.setSanitationSystem('alcantarillado');
  assert.deepEqual(branchCodes(), ['S_10a', 'S_9a']);
  app.setSanitationSystem('insitu');
  assert.deepEqual(branchCodes(), ['S_10b', 'S_8b', 'S_9b']);
  for (const i of app.getFilteredIndicatorsByModule.value.filter(i => /^S_(8|9|10)/.test(i.code))) i.score = 2;
  app.setSanitationSystem('alcantarillado');
  assert.ok(app.indicators.value.filter(i => ['S_8b', 'S_9b', 'S_10b'].includes(i.code)).every(i => i.score === null));
  assert.deepEqual(branchCodes(), ['S_10a', 'S_9a']);
});

test('old containment answers migrate to the correct code, retaining findings and history', () => {
  const app = load();
  const catalog = Array.from(app.indicators.value);
  const old = catalog.filter(i => i.code !== 'S_8b').map(i => ({ ...i }));
  Object.assign(old.find(i => i.code === 'S_8'), { score: 1, notes: 'Contenedor con pérdidas estacionales', history: [{ recordedAt: '2026-10-18T12:00:00Z', score: 0, notes: 'Fuga anterior' }] });
  const migrated = Core.normalizeDataset({ generalInfo: { sanitationSystem: 'insitu' }, indicators: old }, catalog);
  const containment = migrated.indicators.find(i => i.code === 'S_8b');
  assert.equal(containment.score, 1);
  assert.equal(containment.notes, 'Contenedor con pérdidas estacionales');
  assert.equal(containment.history[0].notes, 'Fuga anterior');
  assert.equal(migrated.indicators.find(i => i.code === 'S_8').score, null);
  const reopened = Core.normalizeDataset(migrated, catalog);
  assert.equal(reopened.indicators.find(i => i.code === 'S_8b').score, 1);
});
