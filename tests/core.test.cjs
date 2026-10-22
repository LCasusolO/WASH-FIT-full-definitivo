const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Core = require('../js/core.js');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('js/data/indicators.js','utf8')+';globalThis.catalog=INDICATORS_DATA;',context);
const catalog = Core.clone(context.catalog);
function fixture(scores={}) { return { generalInfo:Core.defaults(), indicators:catalog.map(item=>({...item,score:scores[item.code]??null})) }; }
const jmp = data => Core.calculateJmp(data.generalInfo,data.indicators);
test('JMP counts empty responses as red while the general valuation uses answered indicators',()=>{
  const statuses=jmp(fixture());
  assert.ok(Object.values(statuses).every(value=>value.status==='Sin Servicio'));
  assert.equal(Core.valuation(0,89,0).label,'Sin evaluar');
  assert.equal(Core.valuation(1,89,100).label,'Mejora Avanzada');
  assert.equal(Core.valuation(89,89,100).label,'Mejora Avanzada');
});
test('water uses the selected facility level and the approved score matrix',()=>{
  assert.equal(jmp(fixture({A_1a:1,A_3:2})).water.status,'Básico');
  const data=fixture({A_1b:2,A_3:2});data.generalInfo.level='Tercer Nivel (Alta Especialización / Hospital Especializado)';
  assert.equal(jmp(data).water.status,'Básico');
  const partial=fixture({A_1a:2,A_3:1});
  assert.equal(jmp(partial).water.status,'Básico');
  partial.generalInfo.jmpWater.available='no';assert.equal(jmp(partial).water.status,'Básico');
  partial.generalInfo.jmpWater.source='unimproved';assert.equal(jmp(partial).water.status,'Básico');
});
test('legacy water observations do not replace the indicator scores',()=>{
  const data=fixture();data.generalInfo.jmpWater={source:'improved',location:'near',available:'yes'};
  assert.equal(jmp(data).water.status,'Sin Servicio');
  data.generalInfo.jmpWater.location='far';assert.equal(jmp(data).water.status,'Sin Servicio');
});
test('hygiene requires care points and toilet stations; public areas cannot replace toilets',()=>{
  assert.equal(jmp(fixture({H_1:2,H_2:2,S_3:0})).hygiene.status,'Limitado');
  assert.equal(jmp(fixture({H_1:2,S_3:2})).hygiene.status,'Básico');
  assert.equal(jmp(fixture({H_1:2})).hygiene.status,'Limitado');
});
test('waste uses segregation and the selected treatment score without additional confirmations',()=>{
  assert.equal(jmp(fixture({RES_2:2,RES_12:2})).waste.status,'Básico');
  assert.notEqual(jmp(fixture({RES_1:2,RES_14:2})).waste.status,'Básico');
  const data=fixture({RES_2:2,RES_10:2,RES_11:2,RES_13:2});data.generalInfo.wasteTreatmentRoute='onsite';
  assert.equal(jmp(data).waste.status,'Básico');
  data.generalInfo.wasteSafeTreatment='yes';assert.equal(jmp(data).waste.status,'Básico');
  data.generalInfo.wasteSafeTreatment='no';assert.equal(jmp(data).waste.status,'Básico');
});
test('cleaning and sanitation classify empty required responses as red',()=>{
  assert.equal(jmp(fixture({L_1:2})).cleaning.status,'Limitado');
  assert.equal(jmp(fixture({L_1:2,L_5:2})).cleaning.status,'Básico');
  assert.equal(jmp(fixture({S_1:2})).sanitation.status,'Sin Servicio');
});
test('legacy files merge into canonical catalog and fill missing fields',()=>{
  const data=fixture({A_1a:2});delete data.generalInfo.ageGroups;data.indicators=data.indicators.slice(0,2);data.indicators[0].title='Texto alterado';
  const restored=Core.normalizeDataset(data,catalog);
  assert.equal(restored.indicators.length,100);assert.equal(restored.indicators[0].score,2);
  assert.equal(restored.indicators[0].title,catalog[0].title);assert.equal(restored.generalInfo.ageGroups.under5,null);
  assert.equal(restored.schemaVersion,2);
});
test('reject invalid score, risk, schema, dates, coordinates, unknown codes and duplicates without changing input',()=>{
  for(const alter of [d=>d.indicators[0].score=99,d=>d.indicators[0].severity=11,d=>d.schemaVersion=999,d=>d.generalInfo.evaluationDate='2026-02-30',d=>d.generalInfo.latitude=91,d=>d.indicators[0].code='unknown',d=>d.indicators[1].code=d.indicators[0].code,d=>d.generalInfo.populationServed=-1]){
    const data=fixture();alter(data);const before=JSON.stringify(data);assert.throws(()=>Core.normalizeDataset(data,catalog));assert.equal(JSON.stringify(data),before);
  }
});
test('unsafe images and excessive images are rejected',()=>{
  const data=fixture();data.generalInfo.photos=[{name:'x',url:'https://example.com/x'}];assert.throws(()=>Core.normalizeDataset(data,catalog));
  data.generalInfo.photos=Array.from({length:21},()=>({name:'x',url:'data:image/jpeg;base64,YQ=='}));assert.throws(()=>Core.normalizeDataset(data,catalog));
});
test('responsible uses stable team ID, survives renaming and history preserves the former name',()=>{
  const ind={...catalog[0],responsibleId:'person',action:'Reparar',history:[]};const team=[{id:'person',name:'Ana'}];
  Core.recordReview(ind,team,'2026-10-12T15:00:00Z');team[0].name='Ana Pérez';
  assert.equal(Core.responsibleName(ind,team),'Ana Pérez');assert.equal(ind.history[0].responsible,'Ana');
  ind.action='Otra acción';assert.equal(ind.history[0].action,'Reparar');
});
test('past deadlines are delayed unless completed',()=>{
  assert.equal(Core.trackingStatus({trackingStatus:'En Progreso',targetDate:'2026-10-01'},'2026-10-12'),'Retrasado');
  assert.equal(Core.trackingStatus({trackingStatus:'Completado',targetDate:'2026-10-01'},'2026-10-12'),'Completado');
});
test('population, money and local dates validate boundaries including zero',()=>{
  assert.equal(Core.parseNonNegative('0',true),0);assert.equal(Core.parseNonNegative('1,200',true),1200);
  assert.equal(Core.parseNonNegative('-5'),undefined);assert.equal(Core.parseNonNegative('12junk'),undefined);assert.equal(Core.parseNonNegative('1.5',true),undefined);
  assert.equal(Core.localDate(new Date(2026,9,12,23,59)),'2026-10-12');
  const data=fixture();data.generalInfo.latitude=0;data.generalInfo.longitude=0;assert.equal(Core.normalizeDataset(data,catalog).generalInfo.latitude,0);
  data.generalInfo.populationServed=10;data.generalInfo.ageGroups.under5=11;assert.ok(Core.populationWarning(data.generalInfo));
});
test('score behavior and level choices remain unchanged apart from clearing the new no-score status',()=>{
  const baseline=require('./fixtures/preserved-behavior.json');
  const current=fs.readFileSync('js/app.js','utf8').replace(/\r\n/g,'\n');
  for(const {start,end,source:old} of baseline.fragments){
    const extract=source=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))).replace(/find\(i => i.code === 'S_8b'\)/g,"find(i => i.code === 'S_8')").replace(/      ind\.assessmentStatus = '';\n/g,'');
    assert.equal(extract(current),extract(old));
  }
  assert.equal(Core.defaults().level,'Primer Nivel');
  const currentHtml=fs.readFileSync('index.html','utf8');
  assert.ok(currentHtml.includes('sumará la gravedad'));assert.ok(!currentHtml.includes('multiplicará la gravedad'));
});
test('assessment results have exactly the requested labels for the shared score',()=>{
  assert.equal(Core.assessmentResult(2).label,'Cumple');
  assert.equal(Core.assessmentResult(1).label,'Cumple Parcialmente');
  assert.equal(Core.assessmentResult(0).label,'No Cumple');
  assert.equal(Core.assessmentResult(null).label,'Sin evaluar');
});
test('template compiles without orphan conditionals, keeps header actions and separates six report steps',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const app=html.slice(html.indexOf('<div id="app"'),html.indexOf('<!-- Scripts de datos'));
  require('@vue/compiler-dom').compile(app,{onError:error=>{throw error;}});
  const sidebar=html.slice(html.indexOf('<aside'),html.indexOf('</aside>'));
  const header=html.slice(html.indexOf('<header class="evaluation-header'),html.indexOf('</header>',html.indexOf('<header class="evaluation-header')));
  for(const action of ['saveLabel','newEvaluation','restoreBackup']) {
    assert.ok(header.includes(action));
    assert.ok(!sidebar.includes(action));
  }
  assert.ok(!html.includes('Disponible sin conexión'));
  assert.ok(!html.includes('Observaciones para la clasificación JMP'));
  assert.ok(!html.includes('No iniciados: {{ trackingSummary'));
  assert.ok(html.includes('Vista previa del reporte'));
  const steps=[...html.matchAll(/data-report-step="(\d)"/g)].map(match=>match[1]);
  assert.deepEqual(steps,['1','2','3','4','5','6']);
  const riskBlock=html.slice(html.indexOf('<div class="assessment-result">'),html.indexOf('</div>',html.indexOf('<div class="assessment-result">')));
  assert.equal((riskBlock.match(/<span/g)||[]).length,1);
  assert.ok(riskBlock.includes('getAssessmentResult(ind).label'));
});
