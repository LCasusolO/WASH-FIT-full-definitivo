const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {compile}=require('@vue/compiler-dom'),M=require('../js/platform-model.js');
test('pasos integrados conservan evaluación y establecimiento en su contexto',()=>{
 const u=new URL(M.evaluationPanelUrl({id:'evaluacion-1',facility_id:'establecimiento-1'},'monitoring'),'https://example.invalid');
 assert.equal(u.searchParams.get('embedded'),'1');assert.equal(u.searchParams.get('evaluation'),'evaluacion-1');assert.equal(u.searchParams.get('facility'),'establecimiento-1');assert.equal(u.searchParams.get('view'),'monitoring');
 assert.equal(M.evaluationPanelUrl(null,'plan'),'');assert.equal(M.evaluationPanelUrl({id:'e',facility_id:'f'},'users'),'');
});
test('navegación de evaluación conserva validación y abre pasos 4 y 5 sin salir a la plataforma',()=>{
 let app,redirects=0;const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:options=>({mount(){app=options.setup()}})},window:{innerWidth:1200,scrollTo(){},WashCloud:{position(){},workspace(){redirects++;},workspaceUrl:view=>M.evaluationPanelUrl({id:'e',facility_id:'f'},view)}},navigator:{onLine:true},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});
 for(const f of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
 app.cloudMode.value=true;app.activeView.value='general';app.switchView('step4');assert.equal(app.activeView.value,'step4');assert.equal(app.cloudPanels.value.step4,true);app.switchView('step5');assert.equal(app.activeView.value,'step5');assert.equal(app.cloudPanels.value.step4,true);assert.equal(app.cloudPanels.value.step5,true);assert.equal(redirects,0);
 app.activeView.value='assessment';app.switchView('step4');assert.equal(app.activeView.value,'assessment','no se omite la validación del dominio');
});
test('plantillas válidas, retorno en el pie y accesos duplicados retirados',()=>{
 const index=fs.readFileSync('index.html','utf8'),portal=fs.readFileSync('plataforma.html','utf8');
 for(const h of [index,portal])compile(h.split(/<body[^>]*>/)[1].split('<script')[0],{onError:e=>{throw e;}});
 assert.ok(!index.includes('Espacio de trabajo y acceso'));assert.ok(!index.includes('Establecimiento y evaluaciones'));assert.ok(!index.includes('Plan de mejora vigente'));
 const footer=index.split('<!-- Acciones del pie del menú -->')[1].split('</aside>')[0];assert.ok(footer.indexOf('Retornar a la plataforma')>footer.indexOf('Importar'));assert.ok(index.includes("cloudPanelUrl('plan')"));assert.ok(index.includes("cloudPanelUrl('monitoring')"));
 const js=fs.readFileSync('js/platform-portal.js','utf8');assert.ok(!js.includes("{id:'plan',name:"));assert.ok(!js.includes("{id:'monitoring',name:"));
});
