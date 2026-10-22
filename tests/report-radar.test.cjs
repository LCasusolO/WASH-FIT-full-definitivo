const test=require('node:test'),assert=require('node:assert/strict'),Radar=require('../js/report-radar.js'),Pdf=require('../js/pdf-report.js'),Core=require('../js/core.js');
test('report steps 3, 4 and 5 start with module and radar is the final block',()=>{
 const ind={code:'A',title:'Test',module:'Agua',moduleId:'water',score:1,history:[]};Core.recordReview(ind,[],'2026-10-14T12:00:00Z');const doc=Pdf.definition({generalInfo:Core.defaults(),indicators:[ind]},['A'],[{id:'water',name:'Agua'}]);for(const n of [3,4,5]){const start=doc.content.findIndex(x=>x.style==='heading'&&x.text.startsWith('Paso '+n+':'));const next=doc.content.findIndex((x,i)=>i>start&&x.style==='heading');for(const t of doc.content.slice(start+1,next).filter(x=>x.table)){assert.equal(t.table.body[0][0].text,'Módulo');assert.equal(t.table.body[1][0],'Agua');assert.equal(t.table.widths.length,t.table.body[0].length);}}assert.ok(doc.content.at(-1).stack.some(x=>x.svg));
});
test('radar escapes labels and distinguishes unanswered from answered percentages',()=>{
 const svg=Radar.svg([{moduleId:'a',score:1},{moduleId:'a',score:2},{moduleId:'b',score:null}],[{id:'a',name:'Agua <test>'},{id:'b',name:'Higiene'}]);assert.ok(svg.includes('75%'));assert.ok(svg.includes('Sin evaluar'));assert.ok(svg.includes('&lt;test&gt;'));assert.ok(!svg.includes('<test>'));
});
