const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Exercise the app's module rules without a browser or external CDN dependencies.
function loadApp() {
  let app;
  const context = vm.createContext({
    Vue: {
      ref: value => ({ value }),
      computed: getter => ({ get value() { return getter(); } }),
      onMounted() {},
      nextTick() {},
      watch() {},
      createApp: options => ({ mount() { app = options.setup(); } })
    },
    window: { innerWidth: 1200 },
    navigator: { onLine: true },
    WashStorage: { createStore: () => ({ save: async data => data.savedAt }) },
    setTimeout() {},
    clearTimeout() {},
    Date,
    Intl,
    FileReader: class {
      readAsText(file) { return this.onload({ target: { result: file.text } }); }
    }
  });
  for (const file of ['js/core.js', 'js/data/indicators.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return app;
}

test('facility level controls primary and hospital indicators in assessment and reports without losing answers', () => {
  const app = loadApp();
  const hospitalCodes = ['A_16', 'RES_16', 'RES_17', 'L_13', 'L_15', 'L_16', 'M_11'];
  const visible = code => app.shouldShowIndicator(app.indicators.value.find(i => i.code === code));
  const primary = app.indicators.value.find(i => i.code === 'A_1a');
  primary.score = 2; primary.notes = 'Respuesta guardada en atención primaria';
  for (const [index, level] of app.levelOptions.entries()) {
    app.generalInfo.value.level = level;
    assert.equal(visible('A_1a'), index === 0);
    assert.equal(visible('A_1b'), index !== 0);
    for (const code of hospitalCodes) assert.equal(visible(code), index !== 0, code);
    assert.equal(app.reportIndicators.value.some(i => i.code === 'A_16'), index !== 0);
    assert.equal(app.modulesList.reduce((sum, mod) => sum + app.getModuleTotalCount(mod.id), 0), app.totalVisibleIndicators.value);
  }
  app.generalInfo.value.level = app.levelOptions[0];
  assert.equal(primary.score, 2);
  assert.equal(primary.notes, 'Respuesta guardada en atención primaria');
  assert.equal(app.getModuleAnsweredCount('water'), 1);
});

test('all indicators belong to a stable module, and module totals match the global total', () => {
  const app = loadApp();
  const ids = new Set(app.modulesList.map(mod => mod.id));
  assert.equal(app.indicators.value.length, 100);
  assert.ok(app.indicators.value.every(ind => ids.has(ind.moduleId)));
  assert.equal(app.modulesList.reduce((sum, mod) => sum + app.getModuleTotalCount(mod.id), 0), app.totalVisibleIndicators.value);
  app.activeModuleTab.value = 'waste';
  assert.equal(app.getFilteredIndicatorsByModule.value.length, 18);
  app.generalInfo.value.level = app.levelOptions[1];
  assert.equal(app.getFilteredIndicatorsByModule.value.length, 20);
});

test('renaming module and indicator labels preserves filtering, progress, scores, radar and reset', () => {
  const app = loadApp();
  app.activeModuleTab.value = 'waste';
  app.modulesList.find(mod => mod.id === 'waste').name = 'Residuos Hospitalarios';
  app.indicators.value.filter(ind => ind.moduleId === 'waste').forEach(ind => { ind.module = 'Nueva etiqueta'; });
  const waste = app.getFilteredIndicatorsByModule.value;
  waste[0].score = 2;
  waste[1].score = 1;
  app.indicators.value.find(ind => ind.moduleId === 'water').score = 2;
  assert.equal(waste.length, 18);
  assert.equal(app.getModuleAnsweredCount('waste'), 2);
  assert.equal(app.getModuleScoreAchieved('waste'), 3);
  assert.equal(app.getModulePercentage('waste'), 75);
  assert.equal(app.getActiveModuleProgressPercentage.value, 11);
  assert.equal(app.radarChartData.value.points[2].pct, 75);
  app.clearCurrentModule();
  assert.equal(app.getModuleAnsweredCount('waste'), 0);
  assert.equal(app.getModuleAnsweredCount('water'), 1);
});

test('legacy JSON with either waste label migrates to the stable ID without losing answers', async () => {
  for (const label of ['Gestión de Residuos', 'Residuos Hospitalarios']) {
    const app = loadApp();
    const data = JSON.parse(JSON.stringify({ generalInfo: app.generalInfo.value, indicators: app.indicators.value }));
    data.indicators.forEach(ind => {
      delete ind.moduleId;
      if (ind.code.startsWith('RES_')) ind.module = label;
    });
    data.indicators.find(ind => ind.code === 'RES_2').score = 2;
    await app.importData({ target: { files: [{ text: JSON.stringify(data) }] } });
    app.activeModuleTab.value = 'waste';
    assert.equal(app.getFilteredIndicatorsByModule.value.length, 18);
    assert.equal(app.getModuleAnsweredCount('waste'), 1);
    assert.ok(app.indicators.value.filter(ind => ind.code.startsWith('RES_')).every(ind => ind.moduleId === 'waste'));
  }
});

test('assessment tabs and summary pass stable IDs to module calculations', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const method of ['getModuleTotalCount', 'getModuleAnsweredCount', 'getModuleScoreAchieved', 'getModulePercentage']) {
    assert.ok(html.includes(`${method}(mod.id)`));
    assert.ok(!html.includes(`${method}(mod.name)`));
  }
});
test('risk label changes with the same indicator response selected in assessment', () => {
  const app=loadApp();
  const ind=app.indicators.value.find(item=>item.code==='H_1');
  app.setIndicatorScore(ind,0);assert.equal(app.getAssessmentResult(ind).label,'No Cumple');
  app.setIndicatorScore(ind,1);assert.equal(app.getAssessmentResult(ind).label,'Cumple Parcialmente');
  app.setIndicatorScore(ind,2);assert.equal(app.getAssessmentResult(ind).label,'Cumple');
});
test('legacy linked responsible becomes independent text without losing the name', async () => {
  const app=loadApp();
  const data=JSON.parse(JSON.stringify({generalInfo:app.generalInfo.value,indicators:app.indicators.value}));
  data.generalInfo.team=[{id:'member-1',name:'Responsable anterior',email:'',isEditing:false}];
  data.indicators[0].responsibleId='member-1';
  await app.importData({target:{files:[{text:JSON.stringify(data)}]}});
  const ind=app.indicators.value[0];
  assert.equal(ind.responsible,'• Responsable anterior');assert.equal(ind.responsibleId,'');
  app.generalInfo.value.team[0].name='Nombre nuevo';
  assert.equal(app.getResponsibleName(ind),'• Responsable anterior');
  ind.responsible='Ana; Luis';assert.equal(app.getResponsibleName(ind),'Ana; Luis');
});
