const test=require('node:test'),assert=require('node:assert/strict');
const {assetFilename}=require('../scripts/version-assets.cjs');
test('las versiones no colisionan aunque una caché ignore la consulta de la URL',()=>{
 const first=assetFilename('js/platform-portal.js','aaaaaaaaaaaa');
 const second=assetFilename('js/platform-portal.js','bbbbbbbbbbbb');
 const cache=new Map([[new URL(first,'https://example.invalid/').pathname,'anterior']]);
 assert.equal(cache.get(new URL(second,'https://example.invalid/').pathname),undefined);
 assert.equal(first,'js/platform-portal.aaaaaaaaaaaa.js');
 assert.equal(assetFilename('vendor/vue.global.js','aaaaaaaaaaaa'),'vendor/vue.global.aaaaaaaaaaaa.js');
 assert.equal(assetFilename('css/platform.css','aaaaaaaaaaaa'),'css/platform.aaaaaaaaaaaa.css');
 assert.equal(assetFilename('img/paho-logo-blanco.png','aaaaaaaaaaaa'),'img/paho-logo-blanco.aaaaaaaaaaaa.png');
});
