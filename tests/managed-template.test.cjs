const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {compile}=require('@vue/compiler-dom');
test('plantilla de cuentas válida, sin registro público ni aceptación de invitaciones',()=>{
 const html=fs.readFileSync('plataforma.html','utf8');const body=html.split('<body>')[1].split('<script')[0];
 compile(body,{onError:e=>{throw e;}});
 assert.ok(!html.includes('@click="register"'));assert.ok(!html.includes('@click="acceptInvite"'));
 assert.ok(html.includes('must_change_password'));assert.ok(html.includes('Usuarios y permisos'));
});
