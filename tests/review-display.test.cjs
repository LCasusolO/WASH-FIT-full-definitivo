const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../js/core.js'),Pdf=require('../js/pdf-report.js');
test('review uses its historical change value and converts legacy measures into bullets',()=>{
 const i={code:'H_1',title:'Higiene',moduleId:'hygiene',score:0,indicatorChange:'mejorado',correctiveMeasures:'-UNAS\n-ÑLKSAD',responsible:'• Ana\n• Luis\n• ',history:[]};
 Core.recordReview(i,[],'2026-10-13T23:00:25Z');i.indicatorChange='empeorado';
 assert.equal(Core.changeLabel(i.history[0].indicatorChange),'Ha mejorado');
 assert.equal(Core.changeLabel('empeorado'),'Ha empeorado');assert.equal(Core.changeLabel('sin_cambios'),'No ha cambiado');assert.equal(Core.changeLabel(undefined),'Sin registrar');
 assert.equal(Core.reviewBullets(i.history[0].correctiveMeasures),'• UNAS\n• ÑLKSAD');
 assert.equal(Core.reviewBullets(i.history[0].responsible),'• Ana\n• Luis');
 const doc=Pdf.definition({savedAt:new Date().toISOString(),generalInfo:Core.defaults(),indicators:[i]},['H_1'],[{id:'hygiene',name:'Higiene de Manos'}]);
 assert.ok(JSON.stringify(doc).includes('Ha mejorado'));assert.ok(JSON.stringify(doc).includes('• UNAS'));
});
