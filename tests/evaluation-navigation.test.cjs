const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {compile}=require('@vue/compiler-dom'),M=require('../js/platform-model.js');
test('navegación de evaluación conserva validación y abre pasos 4 y 5 sin salir a la plataforma',()=>{
 let app,redirects=0;const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:options=>({mount(){app=options.setup()}})},window:{innerWidth:1200,scrollTo(){},WashCloud:{position(){},workspace(){redirects++;}}},navigator:{onLine:true},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});
 for(const f of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
 app.cloudMode.value=true;app.activeView.value='general';app.switchView('step4');assert.equal(app.activeView.value,'step4');app.switchView('step5');assert.equal(app.activeView.value,'step5');assert.equal(redirects,0);
 app.activeView.value='assessment';app.switchView('step4');assert.equal(app.activeView.value,'assessment','no se omite la validación del dominio');
});
test('plantillas válidas, retorno en el pie y accesos duplicados retirados',()=>{
 const index=fs.readFileSync('index.html','utf8'),portal=fs.readFileSync('plataforma.html','utf8');
 for(const h of [index,portal])compile(h.split(/<body[^>]*>/)[1].split('<script')[0],{onError:e=>{throw e;}});
 assert.ok(!index.includes('Espacio de trabajo y acceso'));assert.ok(!index.includes('Establecimiento y evaluaciones'));assert.ok(!index.includes('Plan de mejora vigente'));
 const footer=index.split('<!-- Acciones del pie del menú -->')[1].split('</aside>')[0];assert.ok(footer.indexOf('Retornar a la plataforma')>footer.indexOf('Importar'));assert.ok(!index.includes('<iframe'));assert.ok(!index.includes('cloud-consult'));assert.ok(!index.includes(':disabled="cloudReadonly">'));assert.ok(index.includes('Nueva Revisión')||index.includes('Nueva revisión'));
 const js=fs.readFileSync('js/platform-portal.js','utf8');assert.ok(!js.includes("{id:'plan',name:"));assert.ok(!js.includes("{id:'monitoring',name:"));
});

test('las seis rutas de instrucciones funcionan también en modo solo lectura',()=>{
 let app;const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:o=>({mount(){app=o.setup()}})},window:{innerWidth:1200,scrollTo(){},WashCloud:{position(){}}},navigator:{onLine:true},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});
 for(const f of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
 app.cloudMode.value=true;app.cloudReadonly.value=true;app.cloudPlanReadonly.value=true;
 for(const target of ['general','assessment','step3','step4','step5','dashboard']){app.activeView.value='instructions';app.switchView(target);assert.equal(app.activeView.value,target);assert.equal(app.cloudActiveReadonly.value,true);}
 app.activeView.value='assessment';app.selectAssessmentModule('sanitation');assert.equal(app.activeModuleTab.value,'sanitation');app.cloudPlanReadonly.value=false;app.switchView('step4');assert.equal(app.cloudActiveReadonly.value,false);app.switchView('assessment');assert.equal(app.cloudActiveReadonly.value,true);
});
