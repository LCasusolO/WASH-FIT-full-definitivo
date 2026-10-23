const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime}=require('./support/managed-runtime.cjs');
test('flujo completo: alta, confirmación, cambio obligatorio, directorio y recuperación sin registro',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const owner=(await r.signIn({email:'owner@example.invalid',password:'Fixture-password-123'})).data.session.access_token;
 assert.equal((await r.call({action:'list'})).status,401);
 const req={action:'create',username:'admin-peru',name:'Administrador Perú',email:'admin@example.invalid',scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()};
 const created=await r.call(req,owner);assert.equal(created.status,200);assert.ok(created.body.temporary_password.length>=24);
 const replay=await r.call(req,owner);assert.equal(replay.body.temporary_password,undefined,'la contraseña no se guarda para releerla');
 const temp=created.body.temporary_password,adminUsername=created.body.username;
 const before=await r.call({action:'login',login:adminUsername,password:temp});assert.equal(before.body.code,'EMAIL_CONFIRMATION_REQUIRED',JSON.stringify(before));
 const id=[...r.people.values()].find(u=>u.email===req.email).id;await r.confirm(id);
 const login=await r.call({action:'login',login:adminUsername,password:temp});assert.equal(login.status,200);const initial=login.body.session.access_token;
 assert.equal((await r.call({action:'list'},initial)).status,403,'no administra con contraseña temporal');
 const same=await r.call({action:'complete_password',new_password:temp},initial);assert.equal(same.status,400);
 const changed=await r.call({action:'complete_password',new_password:'Personal-password-456!'},initial);assert.equal(changed.status,200);const active=changed.body.session.access_token;
 const directory=await r.call({action:'list'},active);assert.equal(directory.status,200);assert.ok(directory.body.users.some(u=>u.username===adminUsername));
 assert.equal((await r.call({action:'list'},initial)).status,403,'la sesión temporal anterior queda invalidada');
 assert.equal((await r.call({...req,request_id:crypto.randomUUID(),username:'otro-admin',email:'other@example.invalid'},active)).status,403,'el administrador no nombra otros administradores');
 const count=r.people.size;const recovered=await r.call({action:'recover',login:'no-existe'});assert.equal(recovered.status,200);assert.equal(r.people.size,count);
 assert.equal((await r.call({action:'login',login:adminUsername,password:temp})).status,401,'la contraseña temporal ya no sirve');
 const team=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query('insert into wash_teams(country_id,name) values($1,$2) returning id',[r.country.id,'Equipo'])).rows[0].id;});
 const member=await r.call({action:'create',username:'evaluador-peru',name:'Evaluador',email:'evaluador@example.invalid',scope:'team',country_id:r.country.id,team_id:team,role:'evaluator',request_id:crypto.randomUUID()},active);assert.equal(member.status,200);
 const memberId=[...r.people.values()].find(p=>p.email==='evaluador@example.invalid').id;await r.confirm(memberId);
 const memberLogin=await r.call({action:'login',login:member.body.username,password:member.body.temporary_password});const memberChanged=await r.call({action:'complete_password',new_password:'Evaluador-password-789!'},memberLogin.body.session.access_token);assert.equal(memberChanged.status,200);
 const memberToken=memberChanged.body.session.access_token;assert.equal((await r.call({action:'list'},memberToken)).status,403);
 assert.equal((await r.call({action:'suspend',user_id:memberId},active)).status,403,'la suspensión global está reservada al propietario');
 assert.equal((await r.call({action:'suspend',user_id:memberId},owner)).status,200);assert.equal((await r.call({action:'login',login:member.body.username,password:'Evaluador-password-789!'})).status,401);
 assert.equal((await r.call({action:'reactivate',user_id:memberId},owner)).status,200);assert.equal((await r.call({action:'audit'},memberToken)).status,403,'reactivar no rehabilita sesiones anteriores');
 const reset=await r.call({action:'reset_password',user_id:id},owner);assert.equal(reset.status,200);assert.ok(reset.body.temporary_password);assert.equal((await r.call({action:'list'},active)).status,403,'restablecer invalida la sesión activa previa');
});

test('eliminación exclusiva del propietario: revoca acceso incluso al último administrador y permite restaurar sin permisos',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const owner=(await r.signIn({email:'owner@example.invalid',password:'Fixture-password-123'})).data.session.access_token;
 const created=await r.call({action:'create',username:'admin-delete',name:'Administrador',email:'delete@example.invalid',scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()},owner);
 assert.equal(created.status,200);const id=[...r.people.values()].find(p=>p.email==='delete@example.invalid').id;
 await r.confirm(id);const initial=await r.call({action:'login',login:created.body.username,password:created.body.temporary_password});
 const changed=await r.call({action:'complete_password',new_password:'Personal-delete-password-123!'},initial.body.session.access_token);const active=changed.body.session.access_token;
 assert.equal((await r.call({action:'delete',user_id:r.owner.id},active)).status,403,'un administrador no elimina cuentas');
 assert.equal((await r.call({action:'delete',user_id:r.owner.id},owner)).body.code,'CANNOT_DELETE_SELF');
 const deleted=await r.call({action:'delete',user_id:id},owner);assert.equal(deleted.status,200,'el propietario puede eliminar al último administrador');
 assert.equal((await r.call({action:'delete',user_id:id},owner)).status,200,'reintento idempotente');
 assert.equal((await r.call({action:'list'},active)).status,403,'JWT anterior bloqueado inmediatamente');
 assert.equal((await r.queryAs(active,'select * from wash_countries')).rows.length,0,'RLS bloquea acceso directo');
 assert.equal((await r.call({action:'login',login:created.body.username,password:'Personal-delete-password-123!'})).status,401);
 const beforeRecovery=r.people.size;assert.equal((await r.call({action:'recover',login:created.body.username})).status,200);assert.equal(r.people.size,beforeRecovery);
 for(const action of ['reactivate','set_role','reset_password','rename'])assert.equal((await r.call({action,user_id:id,username:'renamed',name:'X',scope:'country',country_id:r.country.id,role:'admin'},owner)).body.code,'ACCOUNT_DELETED');
 const again=await r.call({action:'create',username:'recreate',name:'X',email:'delete@example.invalid',scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()},owner);assert.equal(again.body.code,'ACCOUNT_DELETED');
 const directory=await r.call({action:'list'},owner);assert.equal(directory.body.users.find(p=>p.user_id===id).status,'deleted');assert.equal(directory.body.users.find(p=>p.user_id===id).countries.length,0);
 assert.equal((await r.call({action:'restore',user_id:id},owner)).status,200);
 assert.equal((await r.call({action:'list'},active)).status,403,'restauración no rehabilita JWT anterior');
 const restored=(await r.call({action:'list'},owner)).body.users.find(p=>p.user_id===id);assert.equal(restored.status,'active');assert.equal(restored.must_change_password,true);assert.deepEqual(restored.countries,[]);
 const audit=await r.call({action:'audit'},owner);assert.equal(audit.body.events.filter(e=>e.operation==='delete').length,1);assert.ok(audit.body.events.some(e=>e.operation==='restore'));
});
test('validación de metadatos al finalizar la transacción: rechaza inserción sin autorización y revierte el perfil',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const id=crypto.randomUUID();
 await assert.rejects(r.insert('public@example.invalid','Not-used-123!',{}),/REGISTRATION_CLOSED/);
 await r.queued(async()=>{await r.db.exec('reset role');await assert.rejects(r.db.transaction(async tx=>{await tx.query('insert into auth.users(id,email) values($1,$2)',[id,'public-transaction@example.invalid']);assert.equal((await tx.query('select * from wash_accounts where user_id=$1',[id])).rows.length,1);}),/REGISTRATION_CLOSED/);assert.equal((await r.db.query('select * from auth.users where id=$1',[id])).rows.length,0);assert.equal((await r.db.query('select * from wash_accounts where user_id=$1',[id])).rows.length,0);});
});

test('usuario generado en servidor según rol, sufijos únicos y lector rechazado',async t=>{
 const r=await createRuntime();t.after(()=>r.close());const owner=(await r.signIn({email:'owner@example.invalid',password:'Fixture-password-123'})).data.session.access_token;
 const req={action:'create',username:'ignorar-este-usuario',name:'Administrador',email:'admin-one@example.invalid',scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()};
 const first=await r.call(req,owner);assert.equal(first.status,200);assert.equal(first.body.username,'admin-peru-qa');
 const second=await r.call({...req,email:'admin-two@example.invalid',request_id:crypto.randomUUID()},owner);assert.equal(second.body.username,'admin-peru-qa-2');
 assert.equal((await r.call(req,owner)).status,200,'reintento conserva usuario reservado');
 const reader=await r.call({...req,role:'reader',email:'reader@example.invalid',request_id:crypto.randomUUID()},owner);assert.equal(reader.status,400);
 const id=[...r.people.values()].find(p=>p.email===req.email).id;assert.equal((await r.call({action:'set_role',user_id:id,scope:'country',country_id:r.country.id,role:'reader'},owner)).body.code,'INVALID_ROLE');
 const team=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query('insert into wash_teams(country_id,name) values($1,$2) returning id',[r.country.id,'Equipo'])).rows[0].id;});
 for(const [role,prefix] of [['coordinator','coordinador'],['evaluator','evaluador']]){
  const c=await r.call({...req,role,scope:'team',team_id:team,name:'María Núñez',email:role+'@example.invalid',request_id:crypto.randomUUID()},owner);assert.equal(c.status,200);assert.equal(c.body.username,prefix+'-maria-nunez');
 }
 await r.queued(async()=>{await r.db.exec('reset role');await assert.rejects(r.db.query("insert into wash_team_members(team_id,user_id,name,role) values($1,$2,'No permitido','reader')",[team,id]),/wash_team_members_role_check/);});
});
