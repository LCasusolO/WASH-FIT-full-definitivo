const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function portal(){
 const data={countries:[{id:'a',name:'A'},{id:'b',name:'B'}],owners:[{user_id:'owner'}],facilities:[{id:'fa',country_id:'a'},{id:'fb',country_id:'b'}],teams:[{id:'ta',country_id:'a'}],snapshots:[]};
 let state,mounted,commands=[];
 const P={ready:Promise.resolve({enabled:true}),session:async()=>({user:{id:'owner'}}),pendingExport:async()=>null,rows:async(t,f)=>structuredClone((data[t]||[]).filter(r=>!f||r.facility_id===f.facility_id)),command:async(op,d)=>{commands.push({op,data:d});if(op==='country'){const c={...d,id:'new'};data.countries.push(c);return c;}return{};},client:{auth:{onAuthStateChange:()=>({data:{subscription:{}}}),resetPasswordForEmail:async()=>{commands.push({op:'recover'});return{};}},channel:()=>({on(){return this},subscribe(){return this}})}};
 const context=vm.createContext({console,URLSearchParams,location:{search:'',hash:'',origin:'https://example.invalid',pathname:'/plataforma.html'},history:{replaceState(){}},sessionStorage:{getItem(){return null}},indexedDB:{},WashStorage:{createStore:()=>({read:async()=>null,write:async()=>{}})},WashPlatform:P,WashPlatformModel:{clone:structuredClone},INDICATORS_DATA:[{id:'A_1'}],WashCore:{},crypto,setInterval(){},setTimeout,clearTimeout});
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
test('cambiar de país limpia establecimiento, equipo, invitación y versiones anteriores',async()=>{
 const app=portal();await app.start();app.state.teamId.value='ta';await app.tick();app.state.inviteLink.value='enlace anterior';app.state.snapshots.value=[{id:'old'}];app.state.comparison.value=[{}];app.state.countryId.value='b';await app.tick();await app.tick();
 assert.equal(app.state.facilityId.value,'');assert.equal(app.state.teamId.value,'');assert.equal(app.state.inviteLink.value,'');assert.equal(app.state.snapshots.value.length,0);assert.equal(app.state.comparison.value.length,0);
});
test('invitación sin equipo y recuperación sin correo explican el requisito sin llamar al servidor',async()=>{
 const app=portal();await app.start();assert.equal(app.state.inviteReady.value,false);await app.state.createInvite();assert.match(app.state.error.value,/Seleccione un equipo/);assert.equal(app.commands.length,0);
 await app.state.recover();assert.match(app.state.error.value,/correo válido/);assert.equal(app.commands.length,0);
 app.state.invite.value.scope='country';assert.equal(app.state.inviteReady.value,true);
});
test('el cambio de establecimiento carga sus versiones inmediatamente y descarta la comparación previa',async()=>{
 const app=portal();await app.start();app.data.snapshots=[{id:'snap',facility_id:'fb'}];app.state.countryId.value='b';await app.tick();app.state.facilityId.value='fb';await app.tick();await new Promise(r=>setImmediate(r));
 assert.equal(app.state.snapshots.value[0].id,'snap');assert.equal(app.state.compareBefore.value,'');
});

test('un coordinador no recibe controles de edición o validación de otro equipo',async()=>{
 const app=portal();await app.start();app.data.team_members=[{team_id:'ta',user_id:'owner',role:'coordinator'}];await app.state.refresh();
 assert.equal(app.state.canEditMonitor({data:{team_id:'ta'}}),true);assert.equal(app.state.canValidateMonitor({data:{team_id:'ta'}}),true);
 assert.equal(app.state.canEditMonitor({data:{team_id:'otro'}}),false);assert.equal(app.state.canValidateMonitor({data:{team_id:'otro'}}),false);
});
