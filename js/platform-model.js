(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WashPlatformModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function accountUsername({role,name,countryName}){
    const label=role==='admin'?countryName:name;
    const slug=String(label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return (({admin:'admin-',coordinator:'coordinador-',evaluator:'evaluador-'})[role]+(slug||'usuario')).slice(0,50);
  }
  const planFields=['action','resources','responsible','responsibleId','targetDate','cost','trackingStatus'];
  const monitoringFields=['revisionNotes','indicatorChange','correctiveMeasures','nextReviewDate','monitoringComments','history'];
  const generalGroups={location:['latitude','longitude'],population:['populationServed','ageGroups'],team:['team'],photos:['photos'],summary:['summary']};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  function split(dataset) {
    const groups={identification:{}};
    for(const [key,value] of Object.entries(dataset.generalInfo)){const group=Object.entries(generalGroups).find(([,keys])=>keys.includes(key))?.[0]||'identification';(groups[group]||={})[key]=clone(value);}
    return [...Object.entries(groups).filter(([,data])=>Object.keys(data).length).map(([record_key,data])=>({kind:'general',record_key,data})),...dataset.indicators.map(ind=>({kind:'indicator',record_key:ind.id,data:Object.fromEntries(Object.entries(ind).filter(([key])=>!planFields.includes(key)&&!monitoringFields.includes(key)))}))];
  }
  function dataset(records,catalog,defaults,plan=[]) {
    const generalRows=records.filter(r=>r.kind==='general');
    const generalInfo=Object.assign(clone(defaults),...generalRows.filter(r=>r.record_key==='general').map(r=>clone(r.data)),...generalRows.filter(r=>r.record_key!=='general').map(r=>clone(r.data)));
    const answers=new Map(records.filter(r=>r.kind==='indicator').map(r=>[r.record_key,r.data]));
    const actions=new Map([...plan].filter(r=>r.kind==='action').sort((a,b)=>String(a.updated_at||'').localeCompare(String(b.updated_at||''))).map(r=>[r.data.indicator_id,r.data]));
    const monitors=[...records,...plan].filter(r=>r.kind==='monitor'&&r.data.editor_indicator_id).sort((a,b)=>String(a.updated_at||'').localeCompare(String(b.updated_at||'')));
    return {schemaVersion:2,savedAt:new Date().toISOString(),generalInfo,indicators:catalog.map(ind=>{
      const answer=answers.get(ind.id)||{};const action=actions.get(ind.id)||{};
      const reviews=monitors.filter(r=>r.data.editor_indicator_id===ind.id).map(r=>Object.fromEntries(monitoringFields.filter(k=>Object.hasOwn(r.data.editor_fields||{},k)).map(k=>[k,clone(r.data.editor_fields[k])])));
      const history=[...new Map(reviews.flatMap(r=>r.history||[]).map(h=>[stable([h.recordedAt,h.indicatorChange,h.responsible,h.correctiveMeasures||'',h.monitoringComments||'',h.nextReviewDate||'',h.reviewChanges||null]),clone(h)])).values()].sort((a,b)=>String(a.recordedAt).localeCompare(String(b.recordedAt)));
      const monitoring=Object.assign({},...reviews);if(history.length)monitoring.history=history;
      return {...clone(ind),assessmentStatus:'',...answer,...Object.fromEntries(planFields.filter(key=>Object.hasOwn(action,key)).map(key=>[key,action[key]])),...monitoring};
    })};
  }
  function editorRecords(data,stored=[],context={}){
    const result=split(data),ordered=[...stored].sort((a,b)=>String(a.updated_at||'').localeCompare(String(b.updated_at||'')));
    for(const ind of data.indicators){
      const action=ordered.filter(r=>r.kind==='action'&&r.data.indicator_id===ind.id).at(-1);
      const fields=Object.fromEntries(planFields.filter(k=>Object.hasOwn(ind,k)).map(k=>[k,clone(ind[k])]));
      if(action||planFields.some(k=>k==='trackingStatus'?fields[k]&&fields[k]!=='No Iniciado':k==='cost'?fields[k]!=null&&fields[k]!=='':k==='responsibleId'?false:!!fields[k]))result.push({kind:'action',record_key:action?.record_key||'editor:'+ind.id,data:{...clone(action?.data||{}),indicator_id:ind.id,...fields}});
      if(!context.teamId){for(const row of ordered.filter(r=>r.kind==='monitor'&&r.data.editor_indicator_id===ind.id))result.push({kind:row.kind,record_key:row.record_key,data:clone(row.data)});continue;}
      const monitors=ordered.filter(r=>r.kind==='monitor'&&r.data.editor_indicator_id===ind.id&&r.data.team_id===context.teamId);
      const draft=monitors.filter(r=>r.status!=='validated').at(-1),locked=monitors.filter(r=>r.status==='validated').at(-1);
      const monitorFields=Object.fromEntries(monitoringFields.filter(k=>Object.hasOwn(ind,k)).map(k=>[k,clone(ind[k])]));
      if(context.teamId&&(draft||ind.history?.length||monitoringFields.some(k=>k!=='history'&&k!=='indicatorChange'&&!!monitorFields[k]))){
        const last=ind.history?.at(-1)||{};
        result.push({kind:'monitor',record_key:draft?.record_key||'editor:'+context.teamId+':'+ind.id+':'+(locked?.id||'initial'),data:{...clone(draft?.data||{}),team_id:context.teamId,editor_indicator_id:ind.id,editor_fields:monitorFields,date:String(last.recordedAt||draft?.data.date||'').slice(0,10),title:'Revisión de '+ind.id,participants:last.responsible||ind.responsible||'',responsible:last.responsible||ind.responsible||'',findings:last.monitoringComments||monitorFields.monitoringComments||'',correctiveMeasures:last.correctiveMeasures||monitorFields.correctiveMeasures||'',nextReviewDate:last.nextReviewDate||monitorFields.nextReviewDate||'',items:[{indicator_id:ind.id,change:last.indicatorChange||'sin_cambios',notes:last.revisionNotes||''}]}});
      }
    }
    return result;
  }
  function changed(base,next) {const map=new Map(base.map(r=>[r.kind+':'+r.record_key,r]));return next.filter(r=>stable(map.get(r.kind+':'+r.record_key)?.data)!==stable(r.data));}
  function merge(base,local,remote) {
    const b=new Map(base.map(r=>[r.kind+':'+r.record_key,r]));const l=new Map(local.map(r=>[r.kind+':'+r.record_key,r]));const result=[],conflicts=[];
    for(const r of remote){const key=r.kind+':'+r.record_key;const before=b.get(key);const mine=l.get(key);
      if(!mine||stable(mine.data)===stable(before?.data)||stable(mine.data)===stable(r.data))result.push(r);
      else if(stable(r.data)===stable(before?.data))result.push({...r,data:mine.data});
      else {result.push({...r,data:mine.data});conflicts.push({key,base:before,local:mine,remote:r});}
    }
    for(const [key,mine] of l)if(!remote.some(r=>r.kind+':'+r.record_key===key))result.push(mine);
    return {records:result,conflicts};
  }
  function retainConflicts(previous,merged,remote){
    const result=new Map(merged.conflicts.map(c=>[c.key,c]));
    for(const existing of previous){
      const mine=merged.records.find(r=>r.kind+':'+r.record_key===existing.key);
      const latest=remote.find(r=>r.kind+':'+r.record_key===existing.key);
      if(mine&&latest&&stable(mine.data)!==stable(latest.data))result.set(existing.key,{...existing,local:mine,remote:latest});
    }
    return [...result.values()];
  }
  return {editorRecords,accountUsername,planFields,monitoringFields,split,dataset,changed,merge,retainConflicts,stable,clone};
});
