const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../js/core.js');
const draft={trackingStatus:'En Progreso',indicatorChange:'mejorado',responsible:'• Ana',correctiveMeasures:'• Reparar',monitoringComments:'• Se verificó',nextReviewDate:'2026-12-01'};
test('saving a review draft appends a snapshot and leaves earlier reviews unchanged',()=>{
 const ind={score:0,action:'• Instalar',history:[]};
 Core.saveReviewDraft(ind,draft,[],'2026-10-14T10:00:00Z');
 const first=JSON.stringify(ind.history[0]);
 Core.saveReviewDraft(ind,{...draft,indicatorChange:'empeorado'},[],'2026-10-15T10:00:00Z');
 assert.equal(ind.history.length,2);assert.equal(JSON.stringify(ind.history[0]),first);
 assert.equal(ind.history[1].indicatorChange,'empeorado');assert.equal(ind.monitoringComments,undefined);assert.equal(ind.history[1].monitoringComments,draft.monitoringComments);
});
test('invalid or full-history review drafts leave the indicator unchanged',()=>{
 const ind={score:0,action:'Instalar',history:[]},before=JSON.stringify(ind);
 assert.throws(()=>Core.saveReviewDraft(ind,{...draft,nextReviewDate:'2026-02-30'},[]));assert.equal(JSON.stringify(ind),before);
 ind.history=Array.from({length:200},()=>({recordedAt:'2026-01-01T00:00:00Z'}));const full=JSON.stringify(ind);
 assert.throws(()=>Core.saveReviewDraft(ind,draft,[]),/200/);assert.equal(JSON.stringify(ind),full);
});
test('review state is captured from the plan and cannot be changed by the review form',()=>{
 const ind={score:0,trackingStatus:'En Progreso',targetDate:'2000-01-01',history:[]};
 Core.saveReviewDraft(ind,{...draft,trackingStatus:'Completado'},[],'2026-10-15T10:00:00Z');
 assert.equal(ind.trackingStatus,'En Progreso');assert.equal(ind.history[0].trackingStatus,'En Progreso');
 ind.trackingStatus='Completado';Core.saveReviewDraft(ind,{...draft,trackingStatus:'No Iniciado'},[],'2026-10-16T10:00:00Z');
 assert.equal(ind.history[1].trackingStatus,'Completado');assert.equal(ind.history[0].trackingStatus,'En Progreso');
});

test('new review loads plan responsible even when history has another responsible',()=>{
 const ind={responsible:'Plan owner',correctiveMeasures:'- Medida anterior',monitoringComments:'Nota anterior',history:[{responsible:'• Ana'}]};
 const before=JSON.stringify(ind),d=Core.createReviewDraft(ind,[]);
 assert.equal(d.responsible,'• Plan owner');assert.equal(d.previousCorrectiveMeasures,'- Medida anterior');assert.equal(d.previousMonitoringComments,'Nota anterior');assert.equal(d.newCorrectiveMeasures,'');assert.equal(d.newMonitoringComments,'');assert.equal(JSON.stringify(ind),before);
 const fresh=Core.createReviewDraft({responsible:'• Plan owner',history:[]},[]);assert.equal(fresh.responsible,'• Plan owner');
});
test('review additions append to prior text without rewriting it or earlier snapshots',()=>{
 const ind={score:0,responsible:'• Ana',correctiveMeasures:'- Medida anterior',monitoringComments:'Nota anterior',history:[]};Core.recordReview(ind,[],'2026-10-13T12:00:00Z');const first=JSON.stringify(ind.history[0]);
 const d=Core.createReviewDraft(ind,[]);d.responsible='• Luis';d.newCorrectiveMeasures='Medida nueva';d.newMonitoringComments='• Comentario nuevo';d.nextReviewDate='2026-11-01';
 Core.saveReviewDraft(ind,d,[],'2026-10-14T12:00:00Z');assert.equal(JSON.stringify(ind.history[0]),first);assert.equal(ind.correctiveMeasures,'- Medida anterior');assert.equal(ind.history.at(-1).correctiveMeasures,'- Medida anterior\n• Medida nueva');assert.equal(ind.monitoringComments,'Nota anterior');assert.equal(ind.history.at(-1).monitoringComments,'Nota anterior\n• Comentario nuevo');assert.equal(ind.responsible,'• Ana');assert.equal(ind.history[1].responsible,'• Luis');assert.equal(ind.history[1].reviewChanges.responsibleChanged,true);assert.equal(ind.history[1].reviewChanges.newCorrectiveMeasures,'• Medida nueva');
 const unchanged=Core.createReviewDraft(ind,[]);Core.saveReviewDraft(ind,unchanged,[],'2026-10-15T12:00:00Z');assert.equal(ind.correctiveMeasures,'- Medida anterior');assert.equal(ind.history.at(-1).correctiveMeasures,'- Medida anterior\n• Medida nueva');assert.equal(ind.monitoringComments,'Nota anterior');assert.equal(ind.history.at(-1).monitoringComments,'Nota anterior\n• Comentario nuevo');assert.equal(ind.history.length,3);
});
test('invalid additive review preserves all prior notes and history',()=>{
 const ind={score:0,correctiveMeasures:'• Previous',monitoringComments:'• Previous comment',history:[]};const before=JSON.stringify(ind);const d=Core.createReviewDraft(ind,[]);d.newCorrectiveMeasures='New';d.nextReviewDate='2026-02-30';assert.throws(()=>Core.saveReviewDraft(ind,d,[]));assert.equal(JSON.stringify(ind),before);
});

test('review changes survive JSON import and identify only the new information',()=>{
 const ind={code:'TEST',score:0,responsible:'• Ana',correctiveMeasures:'• Anterior',monitoringComments:'• Anterior comentario',history:[]};const d=Core.createReviewDraft(ind,[]);d.newCorrectiveMeasures='• Nueva';d.newMonitoringComments='• Nuevo comentario';d.responsible='• Luis';Core.saveReviewDraft(ind,d,[],'2026-10-14T12:00:00Z');
 const normalized=Core.normalizeDataset({generalInfo:Core.defaults(),indicators:[ind]},[{code:'TEST',title:'Test',moduleId:'water',module:'Agua'}]);const h=normalized.indicators[0].history[0];assert.deepEqual(h.reviewChanges,ind.history[0].reviewChanges);assert.equal(normalized.indicators[0].responsible,'• Ana');
 assert.ok(Core.reviewHistoryText(h,'responsible').startsWith('Modificados en esta revisión:'));assert.ok(Core.reviewHistoryText(h,'correctiveMeasures').startsWith('Nuevo en esta revisión:\n• Nueva'));assert.equal(h.reviewChanges.newMonitoringComments,'• Nuevo comentario');
 const legacy={responsible:'• Ana',correctiveMeasures:'• Antigua'};assert.equal(Core.reviewHistoryText(legacy,'correctiveMeasures'),'• Antigua');
});
test('unchanged plan responsible and no additions are not flagged as new',()=>{
 const ind={score:0,responsible:'• Ana',correctiveMeasures:'• Anterior',history:[]};Core.saveReviewDraft(ind,Core.createReviewDraft(ind,[]),[],'2026-10-14T12:00:00Z');const h=ind.history[0];assert.equal(h.reviewChanges.responsibleChanged,false);assert.equal(h.reviewChanges.newCorrectiveMeasures,'');assert.ok(Core.reviewHistoryText(h,'correctiveMeasures').startsWith('Sin información nueva'));
});

test('saving a new review changes only history, leaving all monitoring fields intact',()=>{
 const ind={score:0,responsible:'• Plan',indicatorChange:'sin_cambios',correctiveMeasures:'• Tabla original',monitoringComments:'• Nota original',nextReviewDate:'2026-10-30',history:[]};const original=Core.clone(ind);const d=Core.createReviewDraft(ind,[]);d.indicatorChange='mejorado';d.nextReviewDate='2026-12-01';d.newCorrectiveMeasures='Nueva';d.newMonitoringComments='Nuevo comentario';Core.saveReviewDraft(ind,d,[],'2026-10-14T12:00:00Z');assert.deepEqual({...ind,history:[]},original);assert.equal(ind.history[0].nextReviewDate,'2026-12-01');const reopened=Core.createReviewDraft(ind,[]);assert.equal(reopened.previousCorrectiveMeasures,'• Tabla original\n• Nueva');assert.equal(reopened.indicatorChange,'mejorado');
});
