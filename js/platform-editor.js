(function(root){
  'use strict';
  const P=root.WashPlatform,M=root.WashPlatformModel;
  let evaluation,facility,store,hooks,base=[],rows=[],conflicts=[],inFlight=false,pending=null,lastView='',channel,timer,active=false;
  let currentOperation=null,pendingLocal=null,readOnly=true,planReadOnly=true,editingTeam='';
  const context=()=>({teamId:editingTeam});
  const logical=data=>M.editorRecords(data,rows,context());
  function canonical(data){const result=WashCore.normalizeDataset(data,INDICATORS_DATA);for(const ind of result.indicators){ind.responsible=WashCore.responsibleName(ind,result.generalInfo.team);ind.responsibleId='';for(const key of ['associatedRisks','action','resources','responsible','correctiveMeasures','monitoringComments'])if(ind[key])ind[key]=WashCore.bulletEdit(ind[key]).value;}return result;}
  const evaluationId=new URLSearchParams(location.search).get('evaluation');
  const ready=P.ready;
  async function readRemote(){
    const [evaluations,recordRows,participants]=await Promise.all([P.rows('evaluations',{id:evaluationId}),P.rows('records',{evaluation_id:evaluationId}),P.rows('participants',{evaluation_id:evaluationId})]);
    if(!evaluations[0]){hooks?.readonly(true);throw Error('ACCESS_REVOKED');}
    evaluation=evaluations[0];
    const session=await P.requireSession();
    const canEdit=['draft','editing'].includes(evaluation.status)&&participants.some(p=>p.user_id===session.user.id&&p.active&&['coordinator','evaluator'].includes(p.role));
    readOnly=!canEdit;hooks?.readonly(readOnly);
    const [facilityRows,assignments,members]=await Promise.all([P.rows('records',{facility_id:evaluation.facility_id}),P.rows('assignments',{facility_id:evaluation.facility_id}),P.rows('team_members')]);
    editingTeam=[evaluation.team_id,...assignments.map(a=>a.team_id)].find(id=>assignments.some(a=>a.team_id===id)&&members.some(m=>m.team_id===id&&m.user_id===session.user.id&&['coordinator','evaluator'].includes(m.role)))||'';
    planReadOnly=!editingTeam;hooks?.planReadonly?.(planReadOnly);
    const selected=facilityRows.filter(r=>['action','monitor'].includes(r.kind)||r.evaluation_id===evaluationId);
    const hydrated=await P.hydratePhotos(selected.filter(r=>['general','indicator'].includes(r.kind)));
    const dataset=M.dataset([...hydrated,...selected.filter(r=>r.kind==='monitor')],INDICATORS_DATA,WashCore.defaults(),selected.filter(r=>r.kind==='action'));
    return {rows:selected,logical:M.editorRecords(canonical(dataset),selected,context())};
  }

  const recordKey=r=>r.kind+':'+r.record_key;
  const canWrite=r=>['general','indicator'].includes(r.kind)?!readOnly:!planReadOnly;
  const emptyAction=r=>r?.kind==='action'&&M.planFields.every(k=>k==='cost'?r.data[k]==null||r.data[k]==='':k==='trackingStatus'?!r.data[k]||r.data[k]==='No Iniciado':!String(r.data[k]||'').trim());
  async function mergeRemote(before,local,remote,previous=[]){
    // Los campos del plan se proyectan usando las filas de su propia caché.
    // Una vista de consulta nunca publica un borrador antiguo sobre la nube.
    const protectedChanges=M.changed(before,local).filter(r=>!canWrite(r));
    if(protectedChanges.length){
      const backup=await store.read('readonlyDrafts')||{};
      for(const record of protectedChanges)if(M.stable(backup[recordKey(record)]?.record)!==M.stable(record))backup[recordKey(record)]={record:M.clone(record),savedAt:new Date().toISOString()};
      await store.write('readonlyDrafts',backup);
    }
    const obsolete=new Set(previous.filter(c=>{const current=local.find(r=>recordKey(r)===c.key);return emptyAction(c.local)&&(!c.base||emptyAction(c.base))&&(!current||emptyAction(current));}).map(c=>c.key));
    const merged=M.merge(before,local.filter(r=>canWrite(r)&&!obsolete.has(recordKey(r))),remote,{lastWriteKinds:['general','indicator','action','monitor']});
    conflicts=M.retainConflicts(previous.filter(c=>canWrite(c.local)&&!obsolete.has(c.key)&&!['general','indicator','action','monitor'].includes(c.local.kind)),merged,remote);
    if(pending&&(!canWrite(pending)||obsolete.has(recordKey(pending)))){pending=null;pendingLocal=null;currentOperation=null;}
    return merged.records;
  }
  async function persist(){if(store)await store.write('sync',{base,rows,local:hooks.get(),conflicts,pending,pendingLocal,currentOperation,editingTeam,readOnly,planReadOnly,evaluation});}
  async function sendPending(){
    if(!pending)return;
    const request=pending,record=pendingLocal||{kind:request.kind,record_key:request.record_key,data:request.data};
    const saved=await P.command('save_record',request,currentOperation);
    rows=rows.filter(r=>r.id!==saved.id);rows.push(saved);
    base=base.filter(r=>recordKey(r)!==recordKey(record));base.push(record);
    pending=null;pendingLocal=null;currentOperation=null;await persist();
  }
  async function apply(records){if(M.stable(logical(hooks.get()))===M.stable(records))return;await hooks.apply(canonical(M.dataset(records,INDICATORS_DATA,WashCore.defaults(),records.filter(r=>r.kind==='action'))));}
  async function refresh(){
    if(inFlight||!active||!navigator.onLine)return;
    inFlight=true;
    try{
      let remote=await readRemote();
      if(pending&&canWrite(pending)){await sendPending();remote=await readRemote();}
      const local=logical(hooks.get());
      const merged=await mergeRemote(base,local,remote.logical,conflicts);
      rows=remote.rows;base=remote.logical;
      hooks.conflicts(conflicts);await apply(merged);await persist();
      if(!conflicts.length&&M.changed(base,logical(hooks.get())).length)hooks.status('pending','Cambios locales pendientes de sincronizar.');
    }catch(e){if(e.message==='ACCESS_REVOKED')location.replace('/plataforma.html');else hooks.status('pending','No se pudo actualizar. Se conserva el trabajo local.');}
    finally{inFlight=false;}
  }
  async function synchronize(){await refresh();if(navigator.onLine&&!inFlight&&!conflicts.length&&M.changed(base,logical(hooks.get())).length)await save();}
  async function connect(callbacks){
    await ready;if(!P.enabled)return false;
    if(!evaluationId){location.replace('/plataforma.html');return true;}
    const session=await P.session();if(!session){location.replace('/plataforma.html');return true;}
    hooks=callbacks;store=WashStorage.createStore(indexedDB,'user:'+session.user.id+':evaluation:'+evaluationId);
    const cached=await store.read('sync');
    try{
      const remote=await readRemote();rows=remote.rows;
      if(cached){pending=cached.pending;pendingLocal=cached.pendingLocal;currentOperation=cached.currentOperation;const local=M.editorRecords(cached.local,cached.rows||[],{teamId:cached.editingTeam||''});const merged=await mergeRemote(cached.base,local,remote.logical,cached.conflicts||[]);base=remote.logical;await apply(merged);}
      else {base=remote.logical;await apply(base);}
    }catch(e){
      if(e.message==='ACCESS_REVOKED'||navigator.onLine||!cached)throw e;
      evaluation=cached.evaluation;editingTeam=cached.editingTeam||'';planReadOnly=cached.planReadOnly??true;hooks.planReadonly?.(planReadOnly);base=cached.base;rows=cached.rows;conflicts=[];pending=cached.pending;pendingLocal=cached.pendingLocal;currentOperation=cached.currentOperation;readOnly=cached.readOnly!==false || !['draft','editing'].includes(evaluation?.status);hooks.readonly(readOnly);await hooks.apply(cached.local);hooks.status('pending','Sin conexión: cambios guardados solo en este dispositivo.');
    }
    active=true;root.WashCloud.active=true;hooks.conflicts(conflicts);
    if(evaluation){
      [facility]=await P.rows('facilities',{id:evaluation.facility_id});
      if(!readOnly&&!rows.some(r=>r.kind==='general')){
        const [country]=await P.rows('countries',{id:facility.country_id});
        const data=hooks.get();data.generalInfo.facilityName=facility.name;data.generalInfo.countryCode=country.code;await hooks.apply(data);base=base.filter(r=>r.kind!=='general');
      }
    }
    const [position]=await P.rows('user_state',{evaluation_id:evaluationId}).catch(()=>[]);if(position?.data)hooks.position(position.data);
    channel=P.client.channel('wash-evaluation-'+evaluationId).on('postgres_changes',{event:'*',schema:'public',table:'wash_records',filter:'facility_id=eq.'+evaluation.facility_id},()=>{clearTimeout(timer);timer=setTimeout(synchronize,300);}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'wash_evaluations',filter:'id=eq.'+evaluationId},synchronize).on('postgres_changes',{event:'*',schema:'public',table:'wash_participants',filter:'evaluation_id=eq.'+evaluationId},synchronize).subscribe();
    const {data:{subscription}}=P.client.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||!s){hooks.readonly(true);hooks.clear();location.replace('/plataforma.html');}});
    setInterval(synchronize,5000);
    addEventListener('online',()=>refresh().then(()=>save()));
    addEventListener('beforeunload',e=>{if(pending||M.changed(base,logical(hooks.get())).length){e.preventDefault();e.returnValue='';}});
    await persist();return true;
  }
  async function save(){
    if(!active)return false;
    await persist();
    if(inFlight)return false;
    if(conflicts.length){hooks.status('error','Conflicto pendiente: revise las dos versiones.');return false;}
    if(!navigator.onLine){hooks.status('pending','Guardado en este dispositivo; pendiente de sincronizar.');return false;}
    inFlight=true;
    try{
      if(pending){if(!canWrite(pending))throw Error('No tiene permiso para modificar estos datos. Se conserva el borrador local.');await sendPending();}
      const candidates=M.changed(base,logical(hooks.get()));
      for(const candidate of candidates){
        if(['general','indicator'].includes(candidate.kind)?readOnly:planReadOnly)throw Error('No tiene permiso para modificar estos datos. Se conserva el borrador local.');
        const stored=rows.find(r=>r.kind===candidate.kind&&r.record_key===candidate.record_key);
        let data=candidate.data;
        if(candidate.kind==='general'&&Object.hasOwn(data,'photos'))data=await P.uploadPhotos(data,evaluation.facility_id,evaluationId);
        const request={...(stored?{id:stored.id,version:stored.version}:{}),facility_id:evaluation.facility_id,evaluation_id:evaluationId,kind:candidate.kind,record_key:candidate.record_key,data};
        if(!pending||M.stable(pending)!==M.stable(request)){pending=request;pendingLocal=M.clone(candidate);currentOperation=crypto.randomUUID();}
        await persist();
        await sendPending();
      }
      const remaining=M.changed(base,logical(hooks.get())).length;hooks.status(remaining?'pending':'saved',remaining?'Hay cambios nuevos pendientes de sincronizar.':'Guardado en la nube.');return !remaining;
    }catch(e){
      if(e.code==='40001'||e.code==='23505'){hooks.status('error','Actualizando y sincronizando cambios…');inFlight=false;await refresh();return false;}
      hooks.status('pending','Guardado local; sincronización pendiente: '+e.message);return false;
    }finally{inFlight=false;}
  }
  async function resolve(key,choice){
    const conflict=conflicts.find(c=>c.key===key);if(!conflict)return;
    if(choice!=='remote'&&choice!=='local')throw Error('INVALID_CONFLICT_CHOICE');
    if(choice==='local'&&(['general','indicator'].includes(conflict.local.kind)?readOnly:planReadOnly))throw Error('No tiene permiso para guardar estos cambios. Use la versión de la nube.');
    if(choice==='remote'&&pending&&pending.kind+':'+pending.record_key===key){pending=null;pendingLocal=null;currentOperation=null;}
    const current=logical(hooks.get());const result=current.map(r=>r.kind+':'+r.record_key===key?(choice==='remote'?conflict.remote:r):r);
    conflicts=conflicts.filter(c=>c.key!==key);hooks.conflicts(conflicts);await apply(result);await persist();if(!conflicts.length)await save();
  }
  function workspace(view='evaluations'){location.href='/plataforma.html?facility='+(evaluation?.facility_id||'')+'&view='+view;}
  async function position(view,module){if(!active||!evaluation)return;const data={view,module};if(JSON.stringify(data)===lastView)return;lastView=JSON.stringify(data);await P.command('state',{evaluation_id:evaluationId,data}).catch(()=>{});}
  async function exportFiles(printing=false){if(!await save())throw Error('Sincronice los cambios y resuelva los conflictos antes de exportar.');return P.exportFiles(evaluationId,evaluation.facility_id,text=>hooks.status('pending',text),printing);}
  root.WashCloud={ready,active,connect,save,resolve,refresh,workspace,position,exportFiles,get evaluation(){return evaluation;}};
})(window);
