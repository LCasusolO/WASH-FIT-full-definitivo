const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function portal(clipboard){
 const data={countries:[{id:'a',name:'A'},{id:'b',name:'B'}],owners:[{user_id:'owner'}],facilities:[{id:'fa',country_id:'a'},{id:'fb',country_id:'b'}],teams:[{id:'ta',country_id:'a'}],snapshots:[],team_members:[{team_id:'ta',user_id:'existing-coordinator',role:'coordinator'}]};
 const events={},savedForms=new Map();let state,mounted,components,periodic,commands=[],focusEvents=[],navigation=[];
 const P={offlineEvaluations:async()=>data.offline||[],checks:async(id)=>id?data.progress:(data.progress?{ea:data.progress}:{}),ready:Promise.resolve({enabled:true}),session:async()=>({user:{id:'owner'}}),pendingExport:async()=>null,accountStatus:async()=>{data.statusCalls=(data.statusCalls||0)+1;if(data.statusGate)await data.statusGate;if(data.failLoad)throw Error(typeof data.failLoad==='string'?data.failLoad:'Servidor no disponible');return{ready:true,status:'active',session_valid:true,has_access:true,can_manage:false};},accountAction:async(action,request)=>{commands.push({op:action,data:request});if(action==='set_role'){data.team_members=(data.team_members||[]).filter(m=>m.user_id!==request.user_id||m.team_id!==request.team_id);if(request.role!=='remove')data.team_members.push({user_id:request.user_id,team_id:request.team_id,role:request.role});}return {session:{access_token:'fixture-token',refresh_token:'fixture-refresh'},message:'Contraseña actualizada.'};},rows:async(t,f)=>structuredClone((data[t]||[]).filter(r=>!f||r.facility_id===f.facility_id)),command:async(op,d,operation)=>{commands.push({op,data:d,operation});if(op==='evaluation'){const e={...d,id:'created-evaluation',status:'draft',created_at:'2026-10-23'};(data.evaluations ||= []).push(e);return e;}if(op==='country'){const c={...d,id:'new'};data.countries.push(c);return c;}return{};},exportFiles:async(e,f)=>commands.push({op:'export',evaluation:e,facility:f}),client:{auth:{setSession:async session=>{commands.push({op:'set_session',data:session});return{error:null}},onAuthStateChange:()=>({data:{subscription:{}}}),resetPasswordForEmail:async()=>{commands.push({op:'recover'});return{};}},channel:()=>({on(){return this},subscribe(){return this}})}};
 const context=vm.createContext({console,confirm:()=>true,navigator:{clipboard,onLine:true},URLSearchParams,location:{search:'',hash:'',origin:'https://example.invalid',pathname:'/plataforma.html',assign:url=>navigation.push(url)},history:{replaceState(){}},sessionStorage:{getItem(){return null},removeItem(){}},indexedDB:{},WashStorage:{createStore:()=>({read:async key=>savedForms.get(key)||null,write:async(key,value)=>{savedForms.set(key,value);}})},WashPlatform:P,WashPlatformModel:{isNetworkError:require('../js/platform-model.js').isNetworkError,clone:structuredClone,accountUsername:require('../js/platform-model.js').accountUsername,syncDisplay:require('../js/platform-model.js').syncDisplay},INDICATORS_DATA:[{id:'A_1'}],WashCore:{},crypto,addEventListener(name,fn){events[name]=fn;},setInterval(fn){periodic=fn;},setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('vendor/vue.global.js','utf8'),context);
 context.document={getElementById(id){return{focus(){focusEvents.push('focus:'+id)},scrollIntoView(){focusEvents.push('scroll:'+id)}}}};
 context.Vue={...context.Vue,createApp:c=>{components=c.components;state=c.setup();return{mount(){}}},onMounted:fn=>mounted=fn};
 vm.runInContext(fs.readFileSync('js/platform-portal.js','utf8'),context);
 return{background:()=>periodic(),events,navigator:context.navigator,get state(){return state},start:()=>mounted(),tick:()=>context.Vue.nextTick(),commands,data,focusEvents,navigation,get components(){return components}};
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

test('inicio directo usa el equipo y establecimiento de la fila y omite el nombre manual',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.assignments=[{team_id:'ta',facility_id:'fa'}];await app.start();
 await app.state.startEvaluation('fa');const command=app.commands.find(c=>c.op==='evaluation');assert.equal(command.data.kind,'initial');assert.equal(command.data.team_id,'ta');assert.equal(command.data.facility_id,'fa');assert.equal(Object.hasOwn(command.data,'name'),false);assert.equal(app.navigation[0],'/index.html?evaluation=created-evaluation');
 await app.state.startEvaluation('fa');assert.equal(app.commands.filter(c=>c.op==='evaluation').length,1);assert.equal(app.navigation.length,2);
});

test('inicio consulta estado reciente y continúa una evaluación existente sin crear otra',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.start();app.data.evaluations=[{id:'fresh',facility_id:'fa',status:'review',created_at:'2026-10-23'}];
 await app.state.startEvaluation('fa');assert.equal(app.commands.length,0);assert.equal(app.navigation[0],'/index.html?evaluation=fresh');
});

test('varios equipos requieren elección asignada y la reevaluación referencia la última validada',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.teams.push({id:'ta2',country_id:'a'});app.data.team_members.push({team_id:'ta2',user_id:'another-coordinator',role:'coordinator'});app.data.assignments=[{team_id:'ta',facility_id:'fa'},{team_id:'ta2',facility_id:'fa'}];app.data.evaluations=[{id:'old',facility_id:'fa',status:'validated',created_at:'2026-10-21'},{id:'latest',facility_id:'fa',status:'validated',created_at:'2026-10-22'}];await app.start();
 await app.state.startEvaluation('fa');assert.equal(app.commands.length,0);assert.equal(app.navigation.length,0);assert.match(app.state.error.value,/Seleccione/);
 app.state.evaluationChoices.value.fa='foreign';await app.state.startEvaluation('fa');assert.equal(app.commands.length,0);
 app.state.evaluationChoices.value.fa='ta2';await app.state.startEvaluation('fa');const c=app.commands[0];assert.equal(c.data.kind,'reassessment');assert.equal(c.data.previous_id,'latest');assert.equal(c.data.team_id,'ta2');assert.ok(c.operation);
});

test('evaluador y administrador de otro país no pueden iniciar evaluaciones',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.assignments=[{team_id:'ta',facility_id:'fa'}];await app.start();await app.state.startEvaluation('fb');assert.equal(app.commands.length,0);assert.equal(app.navigation.length,0);
 app.data.country_members=[];app.data.team_members=[{team_id:'ta',user_id:'owner',role:'evaluator'}];await app.state.refresh();await app.state.startEvaluation('fa');assert.equal(app.commands.length,0);
 app.data.team_members[0].role='coordinator';await app.state.refresh();await app.state.startEvaluation('fa');assert.equal(app.commands[0].data.team_id,'ta');
});

test('organización usa nombres por rol y enumera establecimientos por país',async()=>{
 const app=portal();await app.start();assert.equal(app.state.organizationName.value,'País y establecimientos');assert.equal(app.state.facilitiesInCountry('a').length,1);assert.equal(app.state.tabs.find(t=>t.id==='organization').name,'País y establecimientos');
 app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.state.refresh();assert.equal(app.state.organizationName.value,'Establecimientos y equipos');assert.equal(app.state.organizationFacilities.value.length,1);
 const {compile}=require('@vue/compiler-dom');const component=app.components.EvaluationAccess;new Function('Vue',compile(component.template).code);assert.ok(component.template.includes("evaluation.status!=='validated'"));
 const html=fs.readFileSync('plataforma.html','utf8'),evaluations=html.split("view==='evaluations'")[1].split("view==='history'")[0];assert.ok(!evaluations.includes('Asignar equipo evaluador'));assert.ok(!evaluations.includes('<evaluation-access'));assert.ok(!html.includes('Crear evaluación inicial'));
});

test('administrador cambia su participación por equipo sin cruzar países ni admitir roles retirados',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.start();const team={id:'ta',country_id:'a',name:'Equipo A'},control={value:'coordinator'};
 await app.state.setMyParticipation(team,{target:control});assert.equal(app.state.myParticipation('ta'),'coordinator');assert.equal(control.value,'coordinator');assert.match(app.state.message.value,/Conserva su rol/);
 control.value='evaluator';await app.state.setMyParticipation(team,{target:control});assert.equal(app.state.myParticipation('ta'),'evaluator');
 control.value='';await app.state.setMyParticipation(team,{target:control});assert.equal(app.commands.at(-1).data.role,'remove');assert.equal(app.state.myParticipation('ta'),'');
 const before=app.commands.length;await app.state.setMyParticipation({id:'foreign',country_id:'b'},{target:{value:'coordinator'}});assert.equal(app.commands.length,before);assert.match(app.state.error.value,/permiso/);
 control.value='reader';await app.state.setMyParticipation(team,{target:control});assert.equal(app.commands.length,before);assert.equal(control.value,'');
 app.data.country_members=[];await app.state.refresh();await app.state.setMyParticipation(team,{target:{value:'coordinator'}});assert.equal(app.commands.length,before);
});
test('Administrar integrantes abre Usuarios desde su inicio y preselecciona el equipo',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.start();app.state.view.value='organization';
 await app.state.manageTeamMembers({id:'ta',country_id:'a'});assert.equal(app.state.view.value,'users');assert.equal(app.state.accountForm.value.team_id,'ta');assert.ok(app.focusEvents.includes('scroll:users-section'));assert.ok(app.focusEvents.includes('focus:users-section'));
});

test('cambiar contraseña desde Mi cuenta valida confirmación, renueva sesión y limpia el formulario',async()=>{
 const app=portal();await app.start();let closed=false,modalOpened=0,modalClosed=0;app.state.passwordDialog.value={showModal(){modalOpened++},close(){modalClosed++}};
 await app.state.openPasswordChange({currentTarget:{closest:()=>({removeAttribute(){closed=true}})}});assert.equal(closed,true);assert.equal(app.state.passwordChangeOpen.value,true);assert.equal(modalOpened,1);assert.ok(!app.focusEvents.includes('scroll:password-change-panel'));
 app.state.newPassword.value='Nueva-prueba-456!';app.state.confirmPassword.value='Distinta-prueba-123!';await app.state.changePassword();assert.match(app.state.passwordError.value,/no coinciden/);assert.equal(app.commands.length,0);
 app.state.confirmPassword.value=app.state.newPassword.value;await app.state.changePassword();const call=app.commands.find(c=>c.op==='complete_password');assert.equal(call.data.new_password,'Nueva-prueba-456!');assert.ok(app.commands.some(c=>c.op==='set_session'));assert.equal(app.state.passwordChangeOpen.value,false);assert.equal(app.state.newPassword.value,'');assert.equal(app.state.confirmPassword.value,'');
 await app.state.openPasswordChange();app.state.newPassword.value='No-enviar-123!';app.state.cancelPasswordChange();assert.equal(app.state.newPassword.value,'');assert.equal(app.state.passwordChangeOpen.value,false);assert.equal(app.commands.filter(c=>c.op==='complete_password').length,1);assert.equal(modalClosed,2);
});


test('transferencia ofrece otros equipos activos del país con coordinador y rechaza el equipo actual',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.teams.push({id:'new',country_id:'a'},{id:'foreign',country_id:'b'},{id:'inactive',country_id:'a',active:false},{id:'empty',country_id:'a'});app.data.team_members=['new','foreign','inactive'].map(id=>({team_id:id,user_id:id,role:'coordinator'}));await app.start();const e={id:'e',facility_id:'fa',team_id:'ta',version:1};
 assert.deepEqual(Array.from(app.state.transferOptions(e),t=>t.id),['new']);app.state.transferTeams.value.e='ta';await app.state.transferEvaluation(e);assert.equal(app.commands.length,0);
 app.state.transferTeams.value.e='new';await app.state.transferEvaluation(e);assert.equal(app.commands[0].op,'transfer_evaluation');assert.equal(app.commands[0].data.team_id,'new');assert.equal(app.state.transferTeams.value.e,'');assert.match(app.state.message.value,/transferido/);
 assert.equal(app.state.teamDirectory.value.length,4);assert.equal(app.state.teamDirectory.value.find(r=>r.team.id==='empty').member,null);
 app.data.country_members=[];app.data.team_members.push({team_id:'new',user_id:'owner',role:'evaluator'});await app.state.refresh();assert.ok(app.state.teamDirectory.value.every(r=>r.team.id==='new'));
});


test('evaluador solo consulta su directorio; coordinador y administrador conservan gestión',async()=>{
 const app=portal();app.data.owners=[];app.data.team_members=[{team_id:'ta',user_id:'owner',name:'Evaluador QA',role:'evaluator'},{team_id:'ta',user_id:'other',name:'Coordinador QA',role:'coordinator'}];await app.start();assert.equal(app.state.evaluatorOnly.value,true);assert.equal(app.state.teamDirectory.value.length,2);
 app.data.team_members[0].role='coordinator';await app.state.refresh();assert.equal(app.state.evaluatorOnly.value,false);
 app.data.team_members[0].role='evaluator';app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.state.refresh();assert.equal(app.state.evaluatorOnly.value,false);
});


test('confirmación cambia a reenvío tras éxito y vuelve al estado inicial para otro correo',async()=>{
 const app=portal();await app.start();app.state.email.value='qa@example.invalid';await app.tick();app.state.confirmationNeeded.value=true;await app.state.sendConfirmation();assert.equal(app.state.confirmationSent.value,true);assert.equal(app.commands.filter(c=>c.op==='send_confirmation').length,1);
 app.state.busy.value=true;await app.state.sendConfirmation();assert.equal(app.commands.filter(c=>c.op==='send_confirmation').length,1);app.state.busy.value=false;
 app.state.email.value='other@example.invalid';await app.tick();assert.equal(app.state.confirmationSent.value,false);assert.equal(app.state.confirmationNeeded.value,false);
 app.state.showNewPassword.value=true;app.state.showConfirmPassword.value=true;app.state.cancelPasswordChange();assert.equal(app.state.showNewPassword.value,false);assert.equal(app.state.showConfirmPassword.value,false);
 const html=fs.readFileSync('plataforma.html','utf8');assert.ok(!html.includes('>Actualizar</button>'));assert.ok(html.includes('Reenviar confirmación de correo'));
});

 test('comprobación de pendientes muestra enlaces y evita completar hasta recibir un resultado completo',async()=>{
 const app=portal();await app.start();const component=app.components.CompletionSummary,{compile}=require('@vue/compiler-dom');new Function('Vue',compile(component.template).code);assert.equal(component.methods.stepPercent({done:7,total:9,complete:false}),78);assert.equal(component.methods.stepPercent({done:999,total:1000,complete:false}),99);assert.equal(component.methods.stepPercent({done:0,total:0,complete:true}),100);assert.ok(component.template.includes('Ver campos pendientes'));
 const url=component.methods.link.call({evaluation:{id:'ea'}},{view:'step4',module:'water',indicator:'A_1a',field:'cost'});assert.equal(new URL(url,'https://qa.invalid').searchParams.get('field'),'cost');assert.match(component.methods.link.call({evaluation:{id:'ea',facility_id:'fa'}},{field:'team'}),/plataforma.html\?view=organization&facility=fa/);
 app.data.progress={complete:false,issues:[{label:'Ciudad'}]};await app.state.checkAndComplete({id:'ea',version:1});assert.equal(app.commands.length,0);assert.match(app.state.message.value,/Campos pendientes: 1/);assert.equal(app.state.completionExpanded.value,'ea');
 app.data.progress={complete:true,issues:[]};await app.state.checkAndComplete({id:'ea',version:1});assert.equal(app.commands[0].op,'complete_evaluation');assert.match(app.state.message.value,/histórica/);
 });


test('portal sin conexión ofrece solo evaluaciones locales y vuelve al portal verificado al reconectar',async()=>{
 const app=portal();app.navigator.onLine=false;app.data.offline=[{id:'local-evaluation',name:'Evaluación inicial',facilityName:'Centro local'}];await app.start();assert.equal(app.state.offlineMode.value,true);assert.equal(app.state.offlineList.value[0].id,'local-evaluation');assert.equal(app.state.profile.value,null);
 app.navigator.onLine=true;await app.events.online();assert.equal(app.state.offlineMode.value,false);assert.equal(app.state.profile.value.ready,true);
});


test('portal conserva la fecha de sincronización al perder conexión y muestra fallo sin inventar una hora',async()=>{
 const app=portal();await app.start();const synced=app.state.lastSyncedAt.value;assert.ok(synced);assert.equal(app.state.syncView.value.tone,'synced');app.navigator.onLine=false;await app.events.offline();assert.equal(app.state.syncView.value.label,'Sin conexión');assert.equal(app.state.lastSyncedAt.value,synced);app.data.failLoad=true;app.navigator.onLine=true;await app.events.online();assert.equal(app.state.syncView.value.tone,'pending');assert.equal(app.state.lastSyncedAt.value,synced);
});

test('error de red prefijado no muestra TypeError y desaparece después de actualizar automáticamente',async()=>{
 const app=portal();await app.start();const before=app.state.lastSyncedAt.value;app.data.failLoad='TypeError: Failed to fetch';await app.state.refresh();assert.match(app.state.error.value,/No se pudo conectar/);assert.doesNotMatch(app.state.error.value,/TypeError/);assert.equal(app.state.syncView.value.tone,'pending');assert.equal(app.state.lastSyncedAt.value,before);
 app.data.failLoad=false;await app.background();assert.equal(app.state.error.value,'');assert.equal(app.state.syncView.value.tone,'synced');
 await app.state.recover();assert.match(app.state.error.value,/Escriba su usuario/);await app.background();assert.match(app.state.error.value,/Escriba su usuario/,'no borra errores de validación ajenos a la red');
});

test('actualizaciones simultáneas comparten una consulta y no duplican solicitudes',async()=>{
 const app=portal();await app.start();const before=app.data.statusCalls;let release;app.data.statusGate=new Promise(resolve=>release=resolve);const a=app.background(),b=app.background();await new Promise(r=>setImmediate(r));assert.equal(app.data.statusCalls,before+1);release();await Promise.all([a,b]);assert.equal(app.state.syncView.value.tone,'synced');
});

test('una consulta pendiente de otra cuenta no repone datos ni errores después del cambio de sesión',async()=>{
 const app=portal();await app.start();let release;app.data.statusGate=new Promise(resolve=>release=resolve);const pending=app.background();app.state.user.value={id:'new-user'};app.state.profile.value=null;app.state.countries.value=[];app.data.failLoad='TypeError: Failed to fetch';release();await pending;assert.equal(app.state.profile.value,null);assert.equal(app.state.countries.value.length,0);assert.equal(app.state.error.value,'');
});

test('las cuatro vistas usan establecimientos y solo administración corrige versiones validadas',async()=>{
 const app=portal();app.data.evaluations=[{id:'ea',facility_id:'fa',name:'Evaluación inicial',status:'draft',created_at:'2026-10-23'},{id:'old',facility_id:'fa',name:'Reevaluación 01',status:'validated',created_at:'2026-10-22'}];await app.start();
 assert.equal(app.state.visibleEvaluationFacilities.value.length,2);assert.equal(app.state.currentAt('fa').id,'ea');assert.equal(app.state.previousAt('fa').length,1);assert.equal(app.state.evaluationStatusLabel('draft'),'En curso');assert.equal(app.state.evaluationStatusLabel('editing'),'En curso');assert.equal(app.state.evaluationStatusLabel('review'),'En curso');assert.equal(app.state.evaluationStatusLabel('validated'),'Validada');
 assert.equal(app.state.evaluationLinkLabel(app.data.evaluations[0]),'Continuar evaluación');assert.equal(app.state.evaluationLinkLabel(app.data.evaluations[1]),'Ver evaluación validada');assert.equal(app.state.canCorrect(app.data.evaluations[1]),true);
 app.data.owners=[];app.data.team_members=[{user_id:'owner',team_id:'ta',role:'coordinator'}];await app.state.refresh();assert.equal(app.state.canCorrect(app.data.evaluations[1]),false);await app.state.evaluationStatus(app.data.evaluations[1],'editing');assert.equal(app.commands.length,0);assert.match(app.state.error.value,/permiso/);
 app.data.team_members[0].role='evaluator';await app.state.refresh();assert.equal(app.state.canCorrect(app.data.evaluations[1]),false);assert.equal(app.state.visibleEvaluationFacilities.value.length,2);
 app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];await app.state.refresh();assert.equal(app.state.canCorrect(app.data.evaluations[1]),true);
 const html=fs.readFileSync('plataforma.html','utf8'),section=html.slice(html.indexOf('<section v-if="view===\'evaluations\'"'),html.indexOf('</section>',html.indexOf('<section v-if="view===\'evaluations\'"'))+10);require('@vue/compiler-dom').compile(section,{onError:e=>{throw e;}});assert.ok(!section.includes('nationalAdmin'));assert.ok(!section.includes('Reevaluación integral'));assert.ok(section.includes('Corregir versión anterior'));
});

test('no ofrece iniciar con un equipo inactivo o sin coordinador',async()=>{
 const app=portal();app.data.owners=[];app.data.country_members=[{country_id:'a',user_id:'owner',role:'admin'}];app.data.assignments=[{team_id:'ta',facility_id:'fa'}];app.data.team_members=[];await app.start();assert.equal(app.state.creationTeamsFor('fa').length,0);await app.state.startEvaluation('fa');assert.equal(app.commands.length,0);
 app.data.team_members=[{team_id:'ta',user_id:'coord',role:'coordinator'}];app.data.teams[0].active=false;await app.state.refresh();assert.equal(app.state.creationTeamsFor('fa').length,0);
});
