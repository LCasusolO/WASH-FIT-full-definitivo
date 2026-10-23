const test=require('node:test'),assert=require('node:assert/strict'),Map=require('../server/report-map.cjs');
test('mapa incorpora mosaicos, marcador y atribución en el HTML sin peticiones durante impresión',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz8AAAAASUVORK5CYII=','base64');let calls=0;
 const request=async(url,opts)=>{calls++;assert.match(url,/^https:\/\/tile.openstreetmap.org\/14\/\d+\/\d+\.png$/);assert.ok(opts.headers['User-Agent'].includes('WASH-FIT'));return new Response(png);};
 const html=await Map.render(-12.07,-77.03,{request});assert.ok(calls>=4&&calls<=6);assert.ok(html.includes('href="data:image/png;base64,'));assert.ok(html.includes('-12.070000, -77.030000'));assert.ok(html.includes('OpenStreetMap contributors'));assert.ok(!html.includes('href="https:'));assert.ok(html.includes('fill="#d93025"'));
 await Map.render(-12.07,-77.03,{request:()=>{throw Error('No debe descargar otra vez');}});
 assert.equal(await Map.render(null,null,{request}),'');await assert.rejects(Map.render(100,0,{request}),/Coordenadas inválidas/);
});
