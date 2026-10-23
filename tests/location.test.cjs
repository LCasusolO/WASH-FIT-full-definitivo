const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(geolocation,leaflet){let app;const watches=[];const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(fn){fn?.()},watch(source,fn){watches.push({source,fn,value:source?.value})},createApp:options=>({mount(){app=options.setup()}})},window:{innerWidth:1200,isSecureContext:true,L:leaflet,WashCloud:{position(){}}},L:leaflet,document:{getElementById(){return {}}},navigator:{onLine:true,geolocation},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});for(const file of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);app.flushPermissions=()=>{for(const w of watches)if(!Array.isArray(w.source)&&w.value!==w.source?.value){w.value=w.source?.value;w.fn();}};return app;}
test('location runs only on request, prevents duplicate requests and stores valid rounded coordinates',()=>{
 let success,options,calls=0;const app=load({getCurrentPosition(ok,error,settings){calls++;success=ok;options=settings}});
 assert.equal(calls,0);app.locateCurrentPosition();app.locateCurrentPosition();assert.equal(calls,1);assert.equal(app.locationBusy.value,true);
 assert.equal(options.enableHighAccuracy,true);assert.equal(options.timeout,15000);assert.equal(options.maximumAge,0);
 success({coords:{latitude:-12.1477534,longitude:-76.9722754,accuracy:18}});
 assert.equal(app.generalInfo.value.latitude,-12.147753);assert.equal(app.generalInfo.value.longitude,-76.972275);assert.equal(app.locationBusy.value,false);assert.match(app.locationStatus.value,/18 m/);
});
test('denied permission, unavailable position and timeout preserve existing coordinates and allow retry',()=>{
 for(const code of [1,2,3]){const app=load({getCurrentPosition(ok,error){error({code})}});app.generalInfo.value.latitude=0;app.generalInfo.value.longitude=0;app.locateCurrentPosition();assert.equal(app.locationBusy.value,false);assert.equal(app.locationFailed.value,true);assert.equal(app.generalInfo.value.latitude,0);assert.equal(app.generalInfo.value.longitude,0);assert.ok(app.locationStatus.value.length>0);}
 const app=load();app.locateCurrentPosition();assert.equal(app.locationFailed.value,true);
});
test('invalid coordinates and a changed evaluation cannot replace saved coordinates',()=>{
 let success;const app=load({getCurrentPosition(ok){success=ok}});app.locateCurrentPosition();success({coords:{latitude:200,longitude:0}});assert.equal(app.generalInfo.value.latitude,null);
 app.locateCurrentPosition();app.generalInfo.value={...app.generalInfo.value,latitude:4,longitude:5};success({coords:{latitude:0,longitude:0}});assert.equal(app.generalInfo.value.latitude,4);assert.equal(app.generalInfo.value.longitude,5);
 app.locateCurrentPosition();app.generalInfo.value.latitude=6;success({coords:{latitude:0,longitude:0}});assert.equal(app.generalInfo.value.latitude,6);
});

function mapFixture(){
 const handlers={},markers=[];
 const map={setView(){return this},getZoom(){return 14},invalidateSize(){},on(event,fn){handlers[event]=fn}};
 const L={map:()=>map,tileLayer:()=>({addTo(){}}),marker:(position,options)=>{
  const m={position:[...position],removed:false,draggable:options.draggable,events:{},addTo(){markers.push(this);return this},on(e,fn){this.events[e]=fn;return this},setLatLng(pos){this.position=Array.isArray(pos)?[...pos]:[pos.lat,pos.lng];return this},getLatLng(){return {lat:this.position[0],lng:this.position[1]}},remove(){this.removed=true}};
  m.dragging={enable(){m.draggable=true},disable(){m.draggable=false}};return m;
 }};
 return{L,handlers,markers};
}
test('administrador sin participación no crea ni mueve marcadores y conserva la consulta del mapa',()=>{
 const f=mapFixture(),app=load(null,f.L);app.cloudMode.value=true;app.cloudReadonly.value=true;
 app.switchView('general');f.handlers.click({latlng:{lat:1,lng:2}});assert.equal(f.markers.length,0);assert.equal(app.generalInfo.value.latitude,null);
 // Los datos remotos sí se reflejan, sin habilitar la edición.
 app.generalInfo.value.latitude=-12;app.generalInfo.value.longitude=-77;app.onCoordinatesInput();const marker=f.markers.at(-1);
 assert.equal(marker.draggable,false);f.handlers.click({latlng:{lat:1,lng:2}});assert.deepEqual(marker.position,[-12,-77]);
 marker.position=[5,6];marker.events.dragend();assert.deepEqual(marker.position,[-12,-77]);assert.equal(app.generalInfo.value.latitude,-12);
});
test('coordinador puede editar; revocar permisos desactiva el arrastre y bloquea eventos pendientes',()=>{
 const f=mapFixture(),app=load(null,f.L);app.cloudMode.value=true;app.cloudReadonly.value=false;app.switchView('general');
 f.handlers.click({latlng:{lat:1.1234567,lng:2}});const marker=f.markers.at(-1);assert.equal(marker.draggable,true);assert.equal(app.generalInfo.value.latitude,1.123457);
 marker.position=[3,4];marker.events.dragend();assert.equal(app.generalInfo.value.latitude,3);
 app.cloudReadonly.value=true;app.flushPermissions();assert.equal(marker.draggable,false);
 marker.position=[5,6];marker.events.dragend();assert.equal(app.generalInfo.value.latitude,3);assert.deepEqual(marker.position,[3,4]);
 app.cloudReadonly.value=false;app.flushPermissions();assert.equal(marker.draggable,true);
});
test('geolocalización no solicita ni aplica coordenadas sin permiso, incluso si se revoca durante la solicitud',()=>{
 let success,calls=0;const app=load({getCurrentPosition(ok){calls++;success=ok}});app.cloudMode.value=true;app.cloudReadonly.value=true;
 app.locateCurrentPosition();assert.equal(calls,0);
 app.cloudReadonly.value=false;app.locateCurrentPosition();assert.equal(calls,1);app.cloudReadonly.value=true;success({coords:{latitude:1,longitude:2}});
 assert.equal(app.generalInfo.value.latitude,null);assert.equal(app.locationBusy.value,false);assert.match(app.locationStatus.value,/Solo lectura/);
});

test('el estado de consulta dice Solo lectura y conserva los avisos de errores o conflictos',()=>{
 const app=load();app.cloudMode.value=true;app.cloudReadonly.value=true;app.cloudStatus.value='Solo lectura: medición validada, en revisión o sin permiso de edición.';app.saveState.value='saved';assert.equal(app.saveLabel.value,'Solo lectura');
 app.cloudConflicts.value=[{key:'general:location'}];app.cloudStatus.value='Revise los cambios locales.';assert.equal(app.saveLabel.value,'Revise los cambios locales.');
 app.cloudConflicts.value=[];app.saveState.value='error';app.cloudStatus.value='No se pudo verificar el acceso.';assert.equal(app.saveLabel.value,'No se pudo verificar el acceso.');
});
