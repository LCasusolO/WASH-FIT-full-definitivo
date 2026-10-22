(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WashPlatformModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
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
    const actions=new Map(plan.filter(r=>r.kind==='action').map(r=>[r.data.indicator_id,r.data]));
    return {schemaVersion:2,savedAt:new Date().toISOString(),generalInfo,indicators:catalog.map(ind=>{
      const answer=answers.get(ind.id)||{};const action=actions.get(ind.id)||{};
      return {...clone(ind),assessmentStatus:'',...answer,...Object.fromEntries(planFields.filter(key=>Object.hasOwn(action,key)).map(key=>[key,action[key]]))};
    })};
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
  return {planFields,monitoringFields,split,dataset,changed,merge,retainConflicts,stable,clone};
});
