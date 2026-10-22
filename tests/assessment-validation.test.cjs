const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');
function load() {
 let app;
 const context = vm.createContext({Vue: {ref:value=>({value}), computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:options=>({mount(){app=options.setup()}})},window:{innerWidth:1200,scrollTo(){}},navigator:{onLine:true},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});
 for(const file of ['js/core.js','js/data/indicators.js','js/app.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return app;
}
test('unanswered indicators accept a free explanation without a required prefix',()=>{
 for(const notes of ['', '   ', 'No aplica', 'INDICADOR NO APLICA', 'INDICADOR NO APLICA ...', 'INDICADOR NO APLICA 123', 'INDICADOR NO APLICA XQ', 'INDICADOR NO APLICA XQ ....', 'INDICADOR NO APLICA XQ 123']) assert.equal(Core.assessmentComplete({score:null,notes}),false,notes);
 for(const notes of ['No aplica porque no existe', 'Sin información disponible', 'No se pudo acceder al área', 'No hay hospitalización', 'no aplica (no hay data)', 'No se aplica: no existe este servicio', 'INDICADOR NO APLICA no se utiliza incinerador.', ' indicador no aplica: no existe este servicio ', 'INDICADOR NO APLICA XQ no se utiliza incinerador.', ' indicador no aplica xq: el servicio no existe ', 'INDICADOR   NO APLICA XQ no hay pacientes hospitalizados']) assert.equal(Core.assessmentComplete({score:null,notes}),true,notes);
 for(const score of [0,1,2]) assert.equal(Core.assessmentComplete({score,notes:''}),true);
});
test('domain tabs, next domain and leaving for later steps all reject incomplete current domain',()=>{
 const app=load();app.activeView.value='assessment';
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'water');assert.ok(app.assessmentPending.value.length>0);
 app.selectAssessmentModule('sanitation');assert.equal(app.activeModuleTab.value,'water');
 for(const view of ['step3','step4','step5','dashboard']) {app.switchView(view);assert.equal(app.activeView.value,'assessment');}
 app.switchView('general');assert.equal(app.activeView.value,'general');
});
test('mixed answers and justified non-applicable indicators allow advancing, without requiring hidden indicators',()=>{
 const app=load();app.activeView.value='assessment';
 const visible=app.getFilteredIndicatorsByModule.value;
 visible.forEach((ind,index)=>{ind.score=index%2?0:null;ind.notes=index%2?'':'INDICADOR NO APLICA XQ no se presta este servicio';});
 assert.equal(app.assessmentPending.value.length,0);
 const hidden=app.indicators.value.find(ind=>ind.code==='A_1b');assert.equal(hidden.score,null);
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');assert.equal(app.assessmentAttempted.value,false);
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
});
test('removing an answer invalidates the domain again and the last domain guards the next step',()=>{
 const app=load();app.activeView.value='assessment';
 app.getFilteredIndicatorsByModule.value.forEach(ind=>ind.score=2);
 const first=app.getFilteredIndicatorsByModule.value[0];app.setIndicatorScore(first,2);
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'water');
 first.notes='INDICADOR NO APLICA XQ no existe el servicio';app.selectAssessmentModule('management');assert.equal(app.activeModuleTab.value,'management');
 app.switchView('step3');assert.equal(app.activeView.value,'assessment');
 app.getFilteredIndicatorsByModule.value.forEach(ind=>ind.score=1);
 app.switchView('step3');assert.equal(app.activeView.value,'step3');
});

test('an incomplete current domain can return to a completed domain, but cannot jump to another incomplete domain',()=>{
 const app=load();app.activeView.value='assessment';
 app.getFilteredIndicatorsByModule.value.forEach(ind=>{ind.notes='INDICADOR NO APLICA no existe este servicio';});
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
 assert.ok(app.assessmentPending.value.length>0);
 app.selectAssessmentModule('water');assert.equal(app.activeModuleTab.value,'water');
 app.selectAssessmentModule('sanitation');assert.equal(app.activeModuleTab.value,'sanitation');
 app.selectAssessmentModule('waste');assert.equal(app.activeModuleTab.value,'sanitation');
 // An earlier answer that was removed makes that destination incomplete again.
 app.indicators.value.find(ind=>ind.code==='A_1a').notes='';
 app.selectAssessmentModule('water');assert.equal(app.activeModuleTab.value,'sanitation');
});


test('justified exclusions change applicable totals and coverage, not the weighted compliance or JMP rules',()=>{
 const app=load();
 const visible=app.getFilteredIndicatorsByModule.value;
 const initial=app.totalVisibleIndicators.value, waterTotal=app.getModuleTotalCount('water');
 const [green, yellow, na, missing, unclassified]=visible;
 green.score=2;yellow.score=1;
 na.assessmentStatus='not_applicable';na.notes='No hay hospitalización';
 missing.assessmentStatus='no_information';missing.notes='Sin información disponible';
 unclassified.notes='Pendiente de comprobar';
 assert.equal(app.totalVisibleIndicators.value,initial-1);
 assert.equal(app.getModuleTotalCount('water'),waterTotal-1);
 assert.equal(app.answeredCount.value,2);
 assert.equal(app.overallCompliance.value,75);
 assert.equal(app.getModulePercentage('water'),75);
 assert.equal(app.progressPercentage.value,Math.round(2/(initial-1)*100));
 assert.equal(Core.assessmentResult(na).label,'No se aplica');
 assert.equal(Core.assessmentResult(missing).label,'Sin información');
 assert.equal(Core.assessmentResult(unclassified).label,'Sin puntaje, con justificación');
 na.notes='...';assert.equal(app.totalVisibleIndicators.value,initial);assert.equal(Core.assessmentComplete(na),false);
 na.notes='No hay hospitalización';app.setIndicatorScore(na,0);
 assert.equal(na.assessmentStatus,'');assert.equal(app.totalVisibleIndicators.value,initial);
 assert.equal(app.overallCompliance.value,50);
 const elsewhere=app.indicators.value.find(ind=>ind.moduleId==='hygiene');elsewhere.score=2;
 assert.equal(app.overallCompliance.value,63); // 5 points / 8, rather than averaging domain percentages.
 const a1=app.indicators.value.find(ind=>ind.code==='A_1a'),a3=app.indicators.value.find(ind=>ind.code==='A_3');
 a1.score=2;a3.score=null;a3.assessmentStatus='not_applicable';a3.notes='Justificación de campo';
 assert.equal(Core.calculateJmp(app.generalInfo.value,app.indicators.value).water.status,'Limitado');
});

test('status and explanation survive imports, exports and history; ambiguous old notes stay unclassified',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const context={};vm.runInNewContext(fs.readFileSync('js/data/indicators.js','utf8')+';this.catalog=INDICATORS_DATA',context);
 const catalog=JSON.parse(JSON.stringify(context.catalog));
 const input={generalInfo:Core.defaults(),indicators:[{code:'A_1a',score:null,assessmentStatus:'not_applicable',notes:'No se presta este servicio',history:[{recordedAt:'2026-10-21T12:00:00Z',score:null,assessmentStatus:'no_information',notes:'Sin información disponible'}]},{code:'A_3',score:null,notes:'INDICADOR NO APLICA XQ no existe el servicio'}]};
 const data=Core.normalizeDataset(input,catalog), again=Core.normalizeDataset(JSON.parse(JSON.stringify(data)),catalog);
 const na=again.indicators.find(ind=>ind.code==='A_1a'),old=again.indicators.find(ind=>ind.code==='A_3');
 assert.equal(na.assessmentStatus,'not_applicable');assert.equal(na.notes,input.indicators[0].notes);
 assert.equal(na.history[0].assessmentStatus,'no_information');
 assert.equal(old.assessmentStatus,'');assert.equal(Core.assessmentComplete(old),true);assert.equal(Core.isNotApplicable(old),false);
 const invalid=Core.clone(input);invalid.indicators[0].assessmentStatus='automatic';assert.throws(()=>Core.normalizeDataset(invalid,catalog));
 const conflicting=Core.clone(input);conflicting.indicators[0].score=2;assert.equal(Core.normalizeDataset(conflicting,catalog).indicators.find(ind=>ind.code==='A_1a').assessmentStatus,'');
});

test('all justified non-applicable indicators allow navigation without inventing an evaluated percentage',()=>{
 const app=load();app.activeView.value='assessment';
 app.getFilteredIndicatorsByModule.value.forEach(ind=>{ind.assessmentStatus='not_applicable';ind.notes='No existe este servicio';});
 assert.equal(app.getModuleTotalCount('water'),0);assert.equal(app.getModuleAnsweredCount('water'),0);
 assert.equal(app.facilityValuation.value.label,'Sin indicadores evaluados');
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
 app.clearCurrentModule();assert.equal(app.getFilteredIndicatorsByModule.value.every(ind=>ind.assessmentStatus===''),true);
});


test('the assessment form uses only scores or free findings and has no extra classification selector',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.ok(!html.includes('v-model="ind.assessmentStatus"'));
 assert.ok(!html.includes('Motivo sin puntaje:'));
 assert.ok(!html.includes('Marque «No se aplica»'));
 const app=load();app.activeView.value='assessment';
 app.getFilteredIndicatorsByModule.value.forEach((ind,index)=>{ind.score=null;ind.notes=index%2?'Sin información disponible':'No se presta este servicio';});
 assert.equal(app.assessmentPending.value.length,0);
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
 app.indicators.value.filter(ind=>ind.moduleId==='sanitation').forEach(ind=>{ind.score=2;});const current=app.getFilteredIndicatorsByModule.value;
 current[0].score=null;current[0].notes='...';app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
 current[0].notes='No se pudo verificar durante la visita';app.navigateNextModule();assert.equal(app.activeModuleTab.value,'waste');
});


test('Next always validates the current domain even when its destination is already complete',()=>{
 const app=load();app.activeView.value='assessment';
 app.indicators.value.filter(ind=>ind.moduleId==='sanitation').forEach(ind=>ind.score=2);
 assert.ok(app.assessmentPending.value.length>0);
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'water');assert.equal(app.assessmentAttempted.value,true);
 // The tabs retain the explicit exception for revisiting an already completed domain.
 app.selectAssessmentModule('sanitation');assert.equal(app.activeModuleTab.value,'sanitation');
 // From a completed domain one can still jump to any unfinished domain.
 app.selectAssessmentModule('water');assert.equal(app.activeModuleTab.value,'water');
 app.getFilteredIndicatorsByModule.value.forEach(ind=>{ind.score=2;});
 const unanswered=app.getFilteredIndicatorsByModule.value[0];unanswered.score=null;unanswered.notes='';
 app.navigateNextModule();assert.equal(app.activeModuleTab.value,'water');
 unanswered.notes='...';app.navigateNextModule();assert.equal(app.activeModuleTab.value,'water');
 unanswered.notes='No se pudo verificar durante la visita';app.navigateNextModule();assert.equal(app.activeModuleTab.value,'sanitation');
});
