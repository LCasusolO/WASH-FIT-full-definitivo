const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('../js/platform-model');
const Storage=require('../js/storage');
const {indexedDB}=require('fake-indexeddb');
test('el monitoreo y el plan no modifican la medición compartida',()=>{
  const data={generalInfo:{facilityName:'A'},indicators:[{id:'A_1',score:0,action:'Acción',monitoringComments:'Mejoró',history:[{score:2}]}]};
  const records=Model.split(data);assert.equal(records[1].data.score,0);assert.equal(records[1].data.action,undefined);assert.equal(records[1].data.history,undefined);
});
test('merge conserva cambios en registros distintos y detecta conflictos del mismo registro',()=>{
  const row=(key,score)=>({kind:'indicator',record_key:key,data:{score}});
  const base=[row('A_1',0),row('A_2',0)],local=[row('A_1',1),row('A_2',0)],remote=[row('A_1',0),row('A_2',2)];
  const merged=Model.merge(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.records[0].data.score,1);assert.equal(merged.records[1].data.score,2);
  remote[0]=row('A_1',2);const conflict=Model.merge(base,local,remote);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.records[0].data.score,1);assert.equal(conflict.conflicts[0].remote.data.score,2);
  assert.equal(Model.merge(base,local,local).conflicts.length,0,'confirmación de operación propia');
});
test('borradores locales aislados por usuario y evaluación sin destruir el legado',async()=>{
  const legacy=Storage.createStore(indexedDB),a=Storage.createStore(indexedDB,'alice:evaluation-1'),b=Storage.createStore(indexedDB,'bob:evaluation-1'),other=Storage.createStore(indexedDB,'alice:evaluation-2');
  await legacy.save({savedAt:'legacy'});await a.save({savedAt:'alice'});await b.save({savedAt:'bob'});
  assert.equal((await legacy.read()).savedAt,'legacy');assert.equal((await a.read()).savedAt,'alice');assert.equal((await b.read()).savedAt,'bob');assert.equal(await other.read(),null);
});
test('un conflicto sigue bloqueando el guardado tras nuevos refrescos y al reabrir',()=>{
  const row=score=>({kind:'indicator',record_key:'A_1a',data:{score}});
  const first=Model.merge([row(0)],[row(1)],[row(2)]);
  assert.equal(first.conflicts.length,1);
  const refresh=Model.merge([row(2)],first.records,[row(2)]);
  assert.equal(refresh.conflicts.length,0);
  assert.equal(Model.retainConflicts(first.conflicts,refresh,[row(2)]).length,1,'no auto resolver usando el último guardado');
  assert.equal(Model.retainConflicts(first.conflicts,Model.merge([row(2)],[row(1)],[row(1)]),[row(1)]).length,0,'confirmación de una operación idéntica');
});


test('estado de sincronización muestra conexión y fecha real sin confundir un guardado local',()=>{
 const time='2026-10-23T20:00:00.000Z',offline=Model.syncDisplay(false,'synced',time);assert.equal(offline.label,'Sin conexión');assert.equal(offline.timestamp,time);assert.match(offline.detail,/dispositivo/);assert.ok(offline.time.includes('2026'));
 assert.equal(Model.syncDisplay(true,'pending',time).label,'En línea · Cambios pendientes');assert.equal(Model.syncDisplay(true,'error',time).label,'En línea · Sin sincronizar');assert.equal(Model.syncDisplay(true,'syncing',time).tone,'syncing');assert.equal(Model.syncDisplay(true,'synced',time).tone,'synced');assert.equal(Model.syncDisplay(false,'offline','').time,'Aún no realizada');assert.equal(Model.syncDisplay(true,'synced','invalid').timestamp,'');
});
