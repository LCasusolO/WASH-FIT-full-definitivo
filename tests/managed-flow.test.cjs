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

test('eliminar libera correo y usuario y la nueva cuenta tiene identidad y contraseña independientes',async t=>{
 const r=await createRuntime();t.after(()=>r.close());
 const owner=(await r.signIn({email:'owner@example.invalid',password:'Fixture-password-123'})).data.session.access_token;
 const req={action:'create',name:'Administrador',email:'delete@example.invalid',scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()};
 const created=await r.call(req,owner);assert.equal(created.status,200);const id=[...r.people.values()].find(p=>p.email===req.email).id;
 await r.confirm(id);const initial=await r.call({action:'login',login:created.body.username,password:created.body.temporary_password});
 const changed=await r.call({action:'complete_password',new_password:'Personal-delete-password-123!'},initial.body.session.access_token);const active=changed.body.session.access_token;
 assert.equal((await r.call({action:'delete',user_id:r.owner.id},active)).status,403);
 assert.equal((await r.call({action:'delete',user_id:r.owner.id},owner)).body.code,'CANNOT_DELETE_SELF');
 assert.equal((await r.call({action:'delete',user_id:id},owner)).status,200);assert.equal((await r.call({action:'delete',user_id:id},owner)).status,200,'reintento idempotente');
 assert.equal((await r.call({action:'list'},active)).status,403);assert.equal((await r.queryAs(active,'select * from wash_countries')).rows.length,0);
 assert.equal((await r.call({action:'login',login:req.email,password:'Personal-delete-password-123!'})).status,401);
 assert.equal((await r.call({action:'restore',user_id:id},owner)).body.code,'ACCOUNT_RETIRED');
 const again=await r.call({...req,request_id:crypto.randomUUID()},owner);assert.equal(again.status,200);assert.equal(again.body.username,created.body.username);assert.notEqual(again.body.temporary_password,created.body.temporary_password);
 const fresh=[...r.people.values()].find(p=>p.email===req.email);assert.notEqual(fresh.id,id);assert.equal((await r.user(fresh.id)).email_confirmed_at,null);
 const directory=(await r.call({action:'list'},owner)).body.users,old=directory.find(p=>p.user_id===id);assert.equal(old.identity_released,true);assert.equal(old.email,req.email);assert.equal(old.status,'deleted');assert.deepEqual(old.countries,[]);
 assert.equal((await r.call({action:'list'},active)).status,403,'la cuenta nueva no revalida el JWT anterior');
 assert.equal((await r.call({action:'login',login:req.email,password:'Personal-delete-password-123!'})).status,401,'contraseña antigua no funciona para la identidad nueva');
 assert.equal((await r.call({action:'delete',user_id:id},owner)).status,200,'repetir borrado antiguo no afecta la cuenta nueva');assert.equal((await r.user(fresh.id)).email,req.email);
 const audit=(await r.call({action:'audit'},owner)).body.events;assert.equal(audit.filter(e=>e.operation==='delete').length,1);assert.equal(audit.filter(e=>e.operation==='delete_complete').length,1);
});

async function deleteFixture(t){
 const r=await createRuntime();t.after(()=>r.close());const owner=(await r.signIn({email:'owner@example.invalid',password:'Fixture-password-123'})).data.session.access_token;
 const admin=await r.insert('national@example.invalid','Fixture-national-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[admin.id]);});
 await r.service('set_role',r.owner.id,{user_id:admin.id,scope:'country',country_id:r.country.id,role:'admin'});
 const token=(await r.signIn({email:admin.email,password:'Fixture-national-123'})).data.session.access_token;
 const team=await r.queued(async()=>{await r.db.exec('reset role');return(await r.db.query("insert into wash_teams(country_id,name) values($1,'Equipo de prueba') returning id",[r.country.id])).rows[0].id;});
 const req={action:'create',name:'Integrante',email:'member-delete@example.invalid',scope:'team',country_id:r.country.id,team_id:team,role:'coordinator',request_id:crypto.randomUUID()};
 const created=await r.call(req,token);assert.equal(created.status,200);const id=[...r.people.values()].find(p=>p.email===req.email).id;
 return {r,owner,admin,token,team,req,created,id};
}
test('administrador elimina integrantes propios, pero no administradores, propietarios ni cuentas compartidas fuera de su país',async t=>{
 const {r,owner,admin,token,team,id}=await deleteFixture(t);
 assert.equal((await r.call({action:'delete',user_id:admin.id},token)).body.code,'CANNOT_DELETE_SELF');assert.equal((await r.call({action:'delete',user_id:r.owner.id},token)).status,403);
 const other=await r.insert('other-admin@example.invalid','Fixture-other-123',undefined,true);await r.service('set_role',r.owner.id,{user_id:other.id,scope:'country',country_id:r.country.id,role:'admin'});
 assert.equal((await r.call({action:'delete',user_id:other.id},token)).status,403);
 const foreign=await r.queued(async()=>{await r.db.exec('reset role');const c=(await r.db.query("insert into wash_countries(code,name) values('BOL','Otro país') returning id")).rows[0].id;return(await r.db.query("insert into wash_teams(country_id,name) values($1,'Otro equipo') returning id",[c])).rows[0].id;});
 await r.service('set_role',r.owner.id,{user_id:id,scope:'team',team_id:foreign,role:'evaluator'});
 assert.equal((await r.call({action:'list'},token)).body.users.find(u=>u.user_id===id).can_delete,false);assert.equal((await r.call({action:'delete',user_id:id},token)).status,403);
 await r.service('set_role',r.owner.id,{user_id:id,scope:'team',team_id:foreign,role:'remove'});
 assert.equal((await r.call({action:'delete',user_id:id},token)).status,200,'puede retirar incluso al último coordinador propio');
 assert.equal((await r.call({action:'list'},token)).body.users.find(u=>u.user_id===id).identity_released,true);
});
test('interrupción de Auth deja acceso bloqueado y permite reintento del administrador sin perder el alcance original',async t=>{
 const {r,token,id,req}=await deleteFixture(t);r.failNextAuthUpdate();
 assert.equal((await r.call({action:'delete',user_id:id},token)).status,503);
 const pending=(await r.call({action:'list'},token)).body.users.find(u=>u.user_id===id);assert.equal(pending.status,'deleted');assert.equal(pending.can_delete,true);assert.equal(pending.identity_released,false);
 assert.equal((await r.call({...req,request_id:crypto.randomUUID()},token)).body.code,'ACCOUNT_DELETED','no duplica mientras Auth retiene el correo');
 assert.equal((await r.call({action:'delete',user_id:id},token)).status,200);assert.equal((await r.call({...req,request_id:crypto.randomUUID()},token)).status,200);
});
test('reintento tras liberar el correo solo finaliza la identidad antigua y no toca una cuenta nueva con el mismo correo',async t=>{
 const {r,token,id,req}=await deleteFixture(t);r.failNextService('delete_complete');
 assert.equal((await r.call({action:'delete',user_id:id},token)).status,503);
 const fresh=await r.call({...req,request_id:crypto.randomUUID()},token);assert.equal(fresh.status,200);const freshId=[...r.people.values()].find(p=>p.email===req.email).id;assert.notEqual(freshId,id);
 assert.equal((await r.call({action:'delete',user_id:id},token)).status,200);assert.equal((await r.user(freshId)).email,req.email);assert.equal(r.people.get(freshId).banned,undefined);assert.equal(r.passwords.get(freshId),fresh.body.temporary_password);
});

test('cuentas eliminadas con el mecanismo anterior también liberan el correo al finalizar su eliminación',async t=>{
 const {r,owner,id,req}=await deleteFixture(t);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("select wash_private.account_service_before_reusable_delete('delete',$1,$2)",[r.owner.id,JSON.stringify({user_id:id})]);});
 assert.equal((await r.call({action:'delete',user_id:id},owner)).status,200);
 const fresh=await r.call({action:'create',name:'Administrador nuevo',email:req.email,scope:'country',country_id:r.country.id,role:'admin',request_id:crypto.randomUUID()},owner);assert.equal(fresh.status,200);assert.notEqual([...r.people.values()].find(p=>p.email===req.email).id,id);
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
 const creator=await r.insert('creator@example.invalid','Fixture-admin-123',undefined,true);
 await r.queued(async()=>{await r.db.exec('reset role');await r.db.query("update wash_accounts set status='active',must_change_password=false where user_id=$1",[creator.id]);});
 await r.service('set_role',r.owner.id,{user_id:creator.id,scope:'country',country_id:r.country.id,role:'admin'});
 const creatorToken=(await r.signIn({email:creator.email,password:'Fixture-admin-123'})).data.session.access_token;
 for(const [role,prefix] of [['coordinator','coordinador'],['evaluator','evaluador']]){
  const c=await r.call({...req,role,scope:'team',team_id:team,name:'María Núñez',email:role+'@example.invalid',request_id:crypto.randomUUID()},creatorToken);assert.equal(c.status,200);assert.equal(c.body.username,prefix+'-maria-nunez');
 }
 await r.queued(async()=>{await r.db.exec('reset role');await assert.rejects(r.db.query("insert into wash_team_members(team_id,user_id,name,role) values($1,$2,'No permitido','reader')",[team,id]),/wash_team_members_role_check/);});
});
