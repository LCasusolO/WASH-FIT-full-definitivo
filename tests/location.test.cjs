const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(geolocation){let app;const context=vm.createContext({Vue:{ref:value=>({value}),computed:getter=>({get value(){return getter()}}),onMounted(){},nextTick(){},watch(){},createApp:options=>({mount(){app=options.setup()}})},window:{innerWidth:1200,isSecureContext:true},navigator:{onLine:true,geolocation},WashStorage:{createStore:()=>({})},setTimeout(){},clearTimeout(){},Date,Intl});for(const file of ['js/core.js','js/data/indicators.js','js/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);return app;}
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
