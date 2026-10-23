const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function portal(clipboard){
 const data={countries:[{id:'a',name:'A'},{id:'b',name:'B'}],owners:[{user_id:'owner'}],facilities:[{id:'fa',country_id:'a'},{id:'fb',country_id:'b'}],teams:[{id:'ta',country_id:'a'}],snapshots:[]};
 let state,mounted,commands=[];
 const P={ready:Promise.resolve({enabled:true}),session:async()=>({user:{id:'owner'}}),pendingExport:async()=>null,accountStatus:async()=>({ready:true,status:'active',session_valid:true,has_access:true,can_manage:false}),accountAction:async(action,data)=>{commands.push({op:action,data});return {session:{access_token:'fixture-token',refresh_token:'fixture-refresh'},message:'Contraseña actualizada.'};},rows:async(t,f)=>structuredClone((data[t]||[]).filter(r=>!f||r.facility_id===f.facility_id)),command:async(op,d)=>{commands.push({op,data:d});if(op==='country'){const c={...d,id:'new'};data.countries.push(c);return c;}return{};},exportFiles:async(e,f)=>commands.push({op:'export',evaluation:e,facility:f}),client:{auth:{setSession:async session=>{commands.push({op:'set_session',data:session});return{error:null}},onAuthStateChange:()=>({data:{subscription:{}}}),resetPasswordForEmail:async()=>{commands.push({op:'recover'});return{};}},channel:()=>({on(){return this},subscribe(){return this}})}};
 const context=vm.createContext({console,navigator:{clipboard},URLSearchParams,location:{search:'',hash:'',origin:'https://example.invalid',pathname:'/plataforma.html'},history:{replaceState(){}},sessionStorage:{getItem(){return null},removeItem(){}},indexedDB:{},WashStorage:{createStore:()=>({read:async()=>null,write:async()=>{}})},WashPlatform:P,WashPlatformModel:{clone:structuredClone,accountUsername:require('../js/platform-model.js').accountUsername},INDICATORS_DATA:[{id:'A_1'}],WashCore:{},crypto,setInterval(){},setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('vendor/vue.global.js','utf8'),context);
 context.document={getElementById(){return{focus(){}}}};
 context.Vue={...context.Vue,createApp:c=>{state=c.setup();return{mount(){}}},onMounted:fn=>mounted=fn};
 vm.runInContext(fs.readFileSync('js/platform-portal.js','utf8'),context);
 return{get state(){return state},start:()=>mounted(),tick:()=>context.Vue.nextTick(),commands,data};
}
test('portal selecciona el país recién creado y confirma la operación',async()=>{
 const app=portal();await app.start();assert.equal(app.state.countryId.value,'a');
 app.state.countryForm.value={code:'per',name:'Perú'};await app.state.createCountry();await app.tick();
 assert.equal(app.state.countryId.value,'new');assert.equal(app.commands[0].data.code,'PER');assert.match(app.state.message.value,/País creado/);
});
test('cambiar de país limpia establecimiento, equipo y versiones anteriores',async()=>{
 const app=portal();await app.start();app.state.teamId.value='ta';await app.tick();app.state.snapshots.value=[{id:'old'}];app.state.comparison.value=[{}];app.state.countryId.value='b';await app.tick();await app.tick();
 assert.equal(app.state.facilityId.value,'');assert.equal(app.state.teamId.value,'');assert.equal(app.state.snapshots.value.length,0);assert.equal(app.state.comparison.value.length,0);
});
test('recuperación sin usuario explica el requisito antes de llamar al servidor',async()=>{const app=portal();await app.start();await app.state.recover();assert.match(app.state.error.value,/usuario o correo/);assert.equal(app.commands.length,0);});

test('el cambio de establecimiento carga sus versiones inmediatamente y descarta la comparación previa',async()=>{
 const app=portal();await app.start();app.data.snapshots=[{id:'snap',facility_id:'fb'}];app.state.countryId.value='b';await app.tick();app.state.facilityId.value='fb';await app.tick();await new Promise(r=>setImmediate(r));
 assert.equal(app.state.snapshots.value[0].id,'snap');assert.equal(app.state.compareBefore.value,'');
});

test('un coordinador no recibe controles de edición o validación de otro equipo',async()=>{
 const app=portal();await app.start();app.data.team_members=[{team_id:'ta',user_id:'owner',role:'coordinator'}];await app.state.refresh();
 assert.equal(app.state.canEditMonitor({data:{team_id:'ta'}}),true);assert.equal(app.state.canValidateMonitor({data:{team_id:'ta'}}),true);
 assert.equal(app.state.canEditMonitor({data:{team_id:'otro'}}),false);assert.equal(app.state.canValidateMonitor({data:{team_id:'otro'}}),false);
});

test('copiar credenciales utiliza la contraseña temporal real y conserva la tarjeta si el navegador bloquea la copia',async()=>{
 let copied='';const app=portal({writeText:async text=>{copied=text;}});app.state.credentials.value={username:'admin-qa',temporary_password:'Temporal-QA-123!'};await app.state.copyCredentials();assert.match(copied,/Usuario: admin-qa/);assert.match(copied,/Contraseña temporal: Temporal-QA-123!/);assert.match(copied,/https:\/\/example.invalid\/plataforma.html/);assert.equal(app.state.copiedCredentials.value,true);
 app.state.credentials.value=null;await app.tick();assert.equal(app.state.copiedCredentials.value,false);
 const blocked=portal({writeText:async()=>{throw Error('NotAllowedError');}});blocked.state.credentials.value={username:'admin-qa',temporary_password:'Temporal-QA-123!'};await blocked.state.copyCredentials();assert.match(blocked.state.error.value,/No se pudieron copiar/);assert.equal(blocked.state.credentials.value.temporary_password,'Temporal-QA-123!');
});

test('tabla global conserva todos los establecimientos y exporta el de la fila, independientemente del contexto',async()=>{
 const app=portal();app.data.evaluations=[{id:'ea',facility_id:'fa',status:'editing',created_at:'2026-10-21'},{id:'eb',facility_id:'fb',status:'validated',created_at:'2026-10-22'}];await app.start();
 assert.equal(app.state.allEvaluations.value.length,2);assert.equal(app.state.activeEvaluations.value.length,1);assert.equal(app.state.tabCount('evaluations'),2);
 await app.state.exportReport(app.state.allEvaluations.value[0]);assert.equal(app.commands.at(-1).facility,'fb');assert.equal(app.commands.at(-1).evaluation,'eb');
 assert.equal(app.state.accountRoles.value.length,1);assert.equal(app.state.accountRoles.value[0].id,'admin');assert.equal(app.state.evaluationFacilities.value.length,0);
});
test('permisos de una fila se calculan por su país y no por el país seleccionado',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.start();
 assert.equal(app.state.canCoordinateEvaluation({id:'ea',facility_id:'fa'}),true);assert.equal(app.state.canCoordinateEvaluation({id:'eb',facility_id:'fb'}),false);
 assert.equal(app.state.evaluationFacilities.value.length,1);assert.equal(app.state.evaluationFacilities.value[0].id,'fa');
 app.state.accountForm.value={...app.state.accountForm.value,role:'evaluator',country_id:'a',team_id:'ta'};await app.tick();assert.equal(app.state.accountScopeReady.value,true);
});

test('administrador ve establecimientos sin evaluar y asigna el equipo a la fila elegida',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.facilities.push({id:'fa2',country_id:'a',name:'Segundo centro'});app.data.evaluations=[{id:'e',facility_id:'fa',status:'validated',created_at:'2026-10-22'}];await app.start();
 assert.equal(app.state.adminFacilities.value.length,2);assert.equal(app.state.facilityStatus('fa'),'Evaluada');assert.equal(app.state.facilityStatus('fa2'),'Falta evaluar');
 app.state.rowTeams.value.fa2='ta';await app.state.assignAt(app.data.facilities.find(f=>f.id==='fa2'));assert.equal(app.commands.at(-1).data.facility_id,'fa2');assert.equal(app.commands.at(-1).data.team_id,'ta');
 app.data.assignments=[{team_id:'ta',facility_id:'fa'}];await app.state.refresh();app.state.facilityId.value='fa2';await app.tick();await app.state.startEvaluation('fa');assert.equal(app.state.facilityId.value,'fa');assert.equal(app.state.previousId.value,'e');assert.equal(app.state.evaluationTeam.value,'ta');
 app.data.evaluations.push({id:'open',facility_id:'fa',status:'review',created_at:'2026-10-23'});await app.state.refresh();assert.equal(app.state.facilityStatus('fa'),'En revisión');
});

test('crear evaluación no requiere ni envía un nombre manual',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.assignments=[{team_id:'ta',facility_id:'fa'}];await app.start();await app.state.startEvaluation('fa');await app.state.createEvaluation();
 const command=app.commands.find(c=>c.op==='evaluation');assert.ok(command);assert.equal(command.data.kind,'initial');assert.equal(Object.hasOwn(command.data,'name'),false);assert.equal(app.state.error.value,'');
});

test('administrador se asigna coordinador solo en equipos del país que administra',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.start();
 await app.state.joinAsCoordinator({id:'ta',country_id:'a',name:'Equipo A'});
 const call=app.commands.find(c=>c.op==='set_role');assert.deepEqual(JSON.parse(JSON.stringify(call.data)),{user_id:'owner',scope:'team',team_id:'ta',role:'coordinator'});assert.match(app.state.message.value,/Conserva su rol/);
 const before=app.commands.length;await app.state.joinAsCoordinator({id:'foreign',country_id:'b'});assert.equal(app.commands.length,before);assert.match(app.state.error.value,/permiso/);
 app.data.country_members=[];await app.state.refresh();await app.state.joinAsCoordinator({id:'ta',country_id:'a'});assert.equal(app.commands.length,before);
});

test('cambiar contraseña desde Mi cuenta valida confirmación, renueva sesión y limpia el formulario',async()=>{
 const app=portal();await app.start();let closed=false;
 await app.state.openPasswordChange({currentTarget:{closest:()=>({removeAttribute(){closed=true}})}});assert.equal(closed,true);assert.equal(app.state.passwordChangeOpen.value,true);
 app.state.newPassword.value='Nueva-prueba-456!';app.state.confirmPassword.value='Distinta-prueba-123!';await app.state.changePassword();assert.match(app.state.error.value,/no coinciden/);assert.equal(app.commands.length,0);
 app.state.confirmPassword.value=app.state.newPassword.value;await app.state.changePassword();const call=app.commands.find(c=>c.op==='complete_password');assert.equal(call.data.new_password,'Nueva-prueba-456!');assert.ok(app.commands.some(c=>c.op==='set_session'));assert.equal(app.state.passwordChangeOpen.value,false);assert.equal(app.state.newPassword.value,'');assert.equal(app.state.confirmPassword.value,'');
 await app.state.openPasswordChange();app.state.newPassword.value='No-enviar-123!';app.state.cancelPasswordChange();assert.equal(app.state.newPassword.value,'');assert.equal(app.state.passwordChangeOpen.value,false);assert.equal(app.commands.filter(c=>c.op==='complete_password').length,1);
});
