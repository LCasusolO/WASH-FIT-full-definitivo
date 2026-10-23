const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {compile}=require('@vue/compiler-dom');
test('plantilla de cuentas válida, sin registro público ni aceptación de invitaciones',()=>{
 const html=fs.readFileSync('plataforma.html','utf8');const body=html.split('<body>')[1].split('<script')[0];
 compile(body,{onError:e=>{throw e;}});
 assert.ok(!html.includes('@click="register"'));assert.ok(!html.includes('@click="acceptInvite"'));
 assert.ok(html.includes('must_change_password'));assert.ok(html.includes('Usuarios y permisos'));
});

test('alta pide nombre, correo, rol y equipo antes del usuario automático, sin lector',()=>{
 const html=fs.readFileSync('plataforma.html','utf8'),form=html.split('id="account-create-form"')[1].split('</form>')[0];
 const fields=['accountForm.name','accountForm.email','accountForm.role','accountForm.team_id','Usuario generado automáticamente'];
 for(let i=1;i<fields.length;i++)assert.ok(form.indexOf(fields[i])>form.indexOf(fields[i-1]));
 assert.ok(!html.includes('value="reader"'));assert.ok(!form.includes('v-model.trim="accountForm.username"'));
 const M=require('../js/platform-model.js');assert.equal(M.accountUsername({role:'admin',countryName:'Perú'}),'admin-peru');assert.equal(M.accountUsername({role:'coordinator',name:'María Núñez'}),'coordinador-maria-nunez');assert.equal(M.accountUsername({role:'evaluator',name:'Luis Casusol'}),'evaluador-luis-casusol');
});
