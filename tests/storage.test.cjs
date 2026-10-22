const test=require('node:test');
const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const {createStore}=require('../js/storage.js');
test('draft, photos and plans survive reopening; backup retains the latest snapshot',async()=>{
  const idb=new IDBFactory();const store=createStore(idb);
  const first={savedAt:'first',generalInfo:{photos:[{name:'foto',url:'data:image/jpeg;base64,YQ=='}]},indicators:[{code:'A_1a',score:1,action:'Reparar'}]};
  await store.save(first);
  const latest={...first,savedAt:'latest',indicators:[{code:'A_1a',score:1,action:'Reparar y revisar'}]};
  await store.save(latest,true);await store.save({savedAt:'new',generalInfo:{photos:[]},indicators:[]});
  const reopened=createStore(idb);assert.equal((await reopened.read()).savedAt,'new');
  const backup=await reopened.read('backup');assert.equal(backup.indicators[0].action,'Reparar y revisar');assert.equal(backup.generalInfo.photos[0].name,'foto');
});
test('storage fails explicitly instead of claiming success in unsupported browsers',async()=>{
  const store=createStore(undefined);await assert.rejects(store.read());await assert.rejects(store.save({savedAt:'x'}));
});
test('last confirmed archive persists separately without overwriting the local draft',async()=>{
  const idb=new IDBFactory(),store=createStore(idb);
  await store.save({savedAt:'draft',generalInfo:{facilityName:'Hospital'},indicators:[]});
  const archive={savedAt:'confirmed',files:[{id:'json-id',name:'PER-Hospital.json'}],fingerprint:'snapshot'};
  await store.write('lastArchive',archive);
  const reopened=createStore(idb);
  assert.deepEqual(await reopened.read('lastArchive'),archive);
  assert.equal((await reopened.read()).savedAt,'draft');
});
