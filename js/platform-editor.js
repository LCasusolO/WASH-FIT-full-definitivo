(function(root){
  'use strict';
  const P=root.WashPlatform,M=root.WashPlatformModel;
  let evaluation,facility,store,hooks,base=[],rows=[],conflicts=[],inFlight=false,pending=null,lastView='',channel,timer,active=false;
  let lastSyncedAt='',syncState='connecting',syncRows=[],syncContext=null,cachedDirty=false,remoteEpoch=0,checkedEpoch=0,lastCheck=0,lastActivity=Date.now(),realtimeReady=false,cacheEpoch=0,lastEvent=0;
  const photoCache=new Map();
  const sync=state=>{syncState=state;hooks?.sync?.({state,lastSyncedAt});};
  function synced(){lastSyncedAt=new Date().toISOString();sync('synced');}
  let userId='',lastPosition=null,lastLocal='',persistQueue=Promise.resolve(),needsRefresh=false;
  let currentOperation=null,pendingLocal=null,readOnly=true,planReadOnly=true,editingTeam='';
  const context=()=>({teamId:editingTeam,includeEmpty:true});
  const logical=data=>M.editorRecords(data,rows,context());
  function canonical(data){const result=WashCore.normalizeDataset(data,INDICATORS_DATA);for(const ind of result.indicators){ind.responsible=WashCore.responsibleName(ind,result.generalInfo.team);ind.responsibleId='';for(const key of ['associatedRisks','action','resources','responsible','correctiveMeasures','monitoringComments'])if(ind[key])ind[key]=WashCore.bulletEdit(ind[key]).value;}return result;}
  function cachedBase(cached){return M.editorRecords(canonical(M.dataset(cached.base,INDICATORS_DATA,WashCore.defaults(),cached.base.filter(r=>r.kind==='action'))),cached.rows||[],{teamId:cached.editingTeam||'',includeEmpty:true});}
  const evaluationId=new URLSearchParams(location.search).get('evaluation');
  const ready=P.ready;
  function scheduleSync(hint=true){if(hint)remoteEpoch++;clearTimeout(timer);timer=setTimeout(()=>{if(!inFlight)return synchronize(!hint);},300);}
  function changed(payload){
    lastActivity=Date.now();lastEvent=Date.now();const r=payload?.new;
    if(r?.facility_id===evaluation?.facility_id&&['general','indicator'].includes(r.kind)&&r.evaluation_id!==evaluationId)return;
    if(r?.id&&syncRows.some(x=>x.id===r.id&&x.version>=r.version))return;
    if(P.editorSync&&r?.facility_id===evaluation?.facility_id&&Number.isSafeInteger(r.version)&&r.data&&typeof r.data==='object'&&typeof r.record_key==='string'&&(['action','monitor'].includes(r.kind)||['general','indicator'].includes(r.kind)&&r.evaluation_id===evaluationId)){
      syncRows=syncRows.filter(x=>x.id!==r.id);syncRows.push(r);cacheEpoch++;cachedDirty=true;scheduleSync(false);return;
    }
    if(P.editorSync&&payload?.eventType==='DELETE'&&syncRows.some(x=>x.id===payload.old?.id)){syncRows=syncRows.filter(x=>x.id!==payload.old.id);cacheEpoch++;cachedDirty=true;scheduleSync(false);return;}
    scheduleSync();
  }
  async function readRemote(cacheOnly=false){
    const seen=remoteEpoch;let recordRows,participants,actions,monitors,assignments,members,facilityRowsInfo,country;
    if(P.editorSync){
      let data=syncContext;
      if(!cacheOnly||!data){
        data=await P.editorSync(evaluationId,Object.fromEntries(syncRows.map(r=>[r.id,r.version])));
        const removed=new Set(data.removed||[]),byId=new Map(syncRows.filter(r=>!removed.has(r.id)).map(r=>[r.id,r]));
        for(const r of data.rows||[])if(!byId.has(r.id)||byId.get(r.id).version<=r.version)byId.set(r.id,r);
        syncRows=[...byId.values()];syncContext=data;checkedEpoch=seen;lastCheck=Date.now();
      }
      evaluation=data.evaluation;recordRows=syncRows;participants=data.participants;actions=syncRows.filter(r=>r.kind==='action');monitors=syncRows.filter(r=>r.kind==='monitor');assignments=data.assignments;members=data.members;facilityRowsInfo=[data.facility];country=data.country;
    }else{
      const evaluations=await P.rows('evaluations',{id:evaluationId});evaluation=evaluations[0];
      [recordRows,participants]=await Promise.all([P.rows('records',{evaluation_id:evaluationId}),P.rows('participants',{evaluation_id:evaluationId})]);
      if(evaluation)[actions,monitors,assignments,members,facilityRowsInfo]=await Promise.all([P.rows('records',{facility_id:evaluation.facility_id,kind:'action'}),P.rows('records',{facility_id:evaluation.facility_id,kind:'monitor'}),P.rows('assignments',{facility_id:evaluation.facility_id}),P.rows('team_members',{user_id:(await P.requireSession()).user.id}),P.rows('facilities',{id:evaluation.facility_id})]);
      checkedEpoch=seen;lastCheck=Date.now();
    }
    if(!evaluation){hooks?.readonly(true);throw Error('ACCESS_REVOKED');}
    const session=await P.requireSession();
    const canEdit=['draft','editing','review'].includes(evaluation.status)&&participants.some(p=>p.user_id===session.user.id&&p.active&&['coordinator','evaluator'].includes(p.role));
    readOnly=!canEdit;hooks?.readonly(readOnly);facility=facilityRowsInfo[0];
    editingTeam=[evaluation.team_id,...assignments.map(a=>a.team_id)].find(id=>assignments.some(a=>a.team_id===id)&&members.some(m=>m.team_id===id&&m.user_id===session.user.id&&['coordinator','evaluator'].includes(m.role)))||'';
    planReadOnly=!editingTeam;hooks?.planReadonly?.(planReadOnly);
    const selected=[...recordRows.filter(r=>['general','indicator'].includes(r.kind)),...actions.filter(r=>r.kind==='action'),...monitors.filter(r=>r.kind==='monitor')];
    const derivedEpoch=cacheEpoch;
    const hydrated=await Promise.all(selected.filter(r=>['general','indicator'].includes(r.kind)).map(async r=>{if(r.kind!=='general')return r;const cached=photoCache.get(r.id);if(cached?.version===r.version)return cached.row;const [row]=await P.hydratePhotos([r]);photoCache.set(r.id,{version:r.version,row});return row;}));
    const dataset=M.dataset([...hydrated,...selected.filter(r=>r.kind==='monitor')],INDICATORS_DATA,WashCore.defaults(),selected.filter(r=>r.kind==='action'));
    if(!selected.some(r=>r.kind==='general')&&facility){if(!country)[country]=await P.rows('countries',{id:facility.country_id});dataset.generalInfo.facilityName=facility.name;dataset.generalInfo.countryCode=country?.code||'';}
    cachedDirty=cacheEpoch!==derivedEpoch;return {rows:selected,logical:M.editorRecords(canonical(dataset),selected,context())};
  }

  const recordKey=r=>r.kind+':'+r.record_key;
  const localIdentity=data=>M.stable({generalInfo:data.generalInfo,indicators:data.indicators});
  const canWrite=r=>['general','indicator'].includes(r.kind)?!readOnly:!planReadOnly;
  const emptyAction=r=>r?.kind==='action'&&M.planFields.every(k=>k==='cost'?r.data[k]==null||r.data[k]==='':k==='trackingStatus'?!r.data[k]||r.data[k]==='No Iniciado':!String(r.data[k]||'').trim());
  const obsoleteKeys=(previous,local)=>new Set(previous.filter(c=>{const current=local.find(r=>recordKey(r)===c.key);return emptyAction(c.local)&&(!c.base||emptyAction(c.base))&&(!current||emptyAction(current));}).map(c=>c.key));
  async function mergeRemote(before,local,remote,previous=[]){
    // Los campos del plan se proyectan usando las filas de su propia caché.
    // Una vista de consulta nunca publica un borrador antiguo sobre la nube.
    const protectedChanges=M.changed(before,local).filter(r=>!canWrite(r));
    if(protectedChanges.length){
      const backup=await store.read('readonlyDrafts')||{};
      for(const record of protectedChanges)if(M.stable(backup[recordKey(record)]?.record)!==M.stable(record))backup[recordKey(record)]={record:M.clone(record),savedAt:new Date().toISOString()};
      await store.write('readonlyDrafts',backup);
    }
    const obsolete=obsoleteKeys(previous,local);
    const merged=M.merge(before,local.filter(r=>canWrite(r)&&!obsolete.has(recordKey(r))),remote,{fieldMergeKinds:['general','indicator','action','monitor']});
    conflicts=M.retainConflicts(previous.filter(c=>canWrite(c.local)&&!obsolete.has(c.key)&&!['general','indicator','action','monitor'].includes(c.local.kind)),merged,remote);
    if(pending&&(!canWrite(pending)||obsolete.has(recordKey(pending)))){pending=null;pendingLocal=null;currentOperation=null;}
    return merged.records;
  }
  async function persist(){
    if(!store)return;
    const state=M.clone({base,rows,local:hooks.get(),conflicts,pending,pendingLocal,currentOperation,editingTeam,readOnly,planReadOnly,evaluation,facility,lastPosition,lastSyncedAt});
    persistQueue=persistQueue.catch(()=>{}).then(async()=>{
      await store.write('sync',state);lastLocal=localIdentity(state.local);
      if(P.rememberOfflineEvaluation)await P.rememberOfflineEvaluation(userId,{id:state.evaluation.id,name:state.evaluation.name,facilityName:state.local.generalInfo.facilityName||state.facility?.name||'Establecimiento',lastSyncedAt:state.lastSyncedAt,savedAt:new Date().toISOString()});
    });return persistQueue;
  }
  async function persistLocal(){if(!active)return false;await persist();if(!navigator.onLine){sync('offline');hooks.status('pending','Guardado en este dispositivo; pendiente de sincronizar.');}else if(M.changed(base,logical(hooks.get())).length)sync('pending');return true;}
  async function sendPending(){
    if(!pending)return;
    if(!pending.field_changes){const before=base.find(r=>recordKey(r)===recordKey(pending));pending={...pending,field_changes:M.fieldChanges(before?.data||{},pending.data)};await persist();}
    const request=pending,record=pendingLocal||{kind:request.kind,record_key:request.record_key,data:request.data};
    const saved=await P.command('save_record',request,currentOperation);
    if(P.editorSync){const known=syncRows.find(r=>r.id===saved.id);if(!known||known.version<=saved.version){syncRows=syncRows.filter(r=>r.id!==saved.id);syncRows.push(saved);}cacheEpoch++;cachedDirty=true;}
    rows=rows.filter(r=>r.id!==saved.id);rows.push(saved);
    base=base.filter(r=>recordKey(r)!==recordKey(record));base.push(record);
    pending=null;pendingLocal=null;currentOperation=null;await persist();
  }
  async function apply(records){if(M.stable(logical(hooks.get()))===M.stable(records))return;await hooks.apply(canonical(M.dataset(records,INDICATORS_DATA,WashCore.defaults(),records.filter(r=>r.kind==='action'))));}
  async function refresh(cacheOnly=false){
    if(inFlight||!active||!navigator.onLine)return false;
    inFlight=true;
    try{
      let remote=await readRemote(cacheOnly===true&&!pending&&remoteEpoch===checkedEpoch);
      if(pending&&canWrite(pending)){await sendPending();remote=await readRemote();}
      const local=logical(hooks.get());
      const merged=await mergeRemote(base,local,remote.logical,conflicts);
      rows=remote.rows;base=remote.logical;
      hooks.conflicts(conflicts);await apply(merged);await persist();
      needsRefresh=false;
      if(!conflicts.length&&M.changed(base,logical(hooks.get())).length){sync('pending');hooks.status('pending','Cambios locales pendientes de sincronizar.');}else{synced();hooks.status('saved','Guardado en la nube.');}await persist();return true;
    }catch(e){if(e.message==='ACCESS_REVOKED')location.replace('/plataforma.html');else hooks.status('pending','No se pudo actualizar. Se conserva el trabajo local.');needsRefresh=true;sync(navigator.onLine?'error':'offline');return false;}
    finally{inFlight=false;if(!needsRefresh&&(cachedDirty||remoteEpoch>checkedEpoch))scheduleSync(false);}
  }
  async function synchronize(cacheOnly=false){if(await refresh(cacheOnly)&&!conflicts.length&&M.changed(base,logical(hooks.get())).length)await save();}
  async function connect(callbacks){
    await ready;if(!P.enabled)return false;
    if(!evaluationId){location.replace('/plataforma.html');return true;}
    const session=await P.session();if(!session){location.replace('/plataforma.html');return true;}
    userId=session.user.id;hooks=callbacks;store=WashStorage.createStore(indexedDB,'user:'+session.user.id+':evaluation:'+evaluationId);
    const cached=await store.read('sync');lastPosition=cached?.lastPosition||null;lastSyncedAt=cached?.lastSyncedAt||'';sync(navigator.onLine?'connecting':'offline');
    try{
      if(navigator.onLine===false)throw Error('OFFLINE');
      let remote=await readRemote();rows=remote.rows;
      if(cached){
        pending=cached.pending;pendingLocal=cached.pendingLocal;currentOperation=cached.currentOperation;
        const local=M.editorRecords(cached.local,cached.rows||[],{teamId:cached.editingTeam||'',includeEmpty:true});
        let before=cachedBase(cached);
        // Confirmar el envío previo antes de incorporar campos recibidos de la nube:
        // esos campos nunca deben confundirse con una nueva edición del usuario.
        if(pending&&canWrite(pending)&&!obsoleteKeys(cached.conflicts||[],local).has(recordKey(pending))){
          base=before;rows=cached.rows||[];await hooks.apply(cached.local);await sendPending();before=base;remote=await readRemote();rows=remote.rows;
        }
        const merged=await mergeRemote(before,local,remote.logical,cached.conflicts||[]);base=remote.logical;await apply(merged);
      }
      else {base=remote.logical;await apply(base);}
    }catch(e){
      if(e.message==='ACCESS_REVOKED'||navigator.onLine||!cached?.evaluation||cached.evaluation.id!==evaluationId)throw e;
      needsRefresh=true;facility=cached.facility;lastPosition=cached.lastPosition||null;
      evaluation=cached.evaluation;editingTeam=cached.editingTeam||'';planReadOnly=cached.planReadOnly??true;hooks.planReadonly?.(planReadOnly);base=cachedBase(cached);rows=cached.rows;conflicts=[];pending=cached.pending;pendingLocal=cached.pendingLocal;currentOperation=cached.currentOperation;readOnly=cached.readOnly!==false || !['draft','editing','review'].includes(evaluation?.status);hooks.readonly(readOnly);await hooks.apply(cached.local);hooks.status('pending','Sin conexión: cambios guardados solo en este dispositivo.');
    }
    if(!syncRows.length&&cached)syncRows=cached.rows||[];
    active=true;root.WashCloud.active=true;hooks.conflicts(conflicts);
    if(navigator.onLine){const [position]=await P.rows('user_state',{evaluation_id:evaluationId}).catch(()=>[]);lastPosition=position?.data||cached?.lastPosition||null;}
    if(lastPosition)hooks.position(lastPosition);
    channel=P.client.channel('wash-evaluation-'+evaluationId).on('postgres_changes',{event:'*',schema:'public',table:'wash_records',filter:'facility_id=eq.'+evaluation.facility_id},changed).on('postgres_changes',{event:'UPDATE',schema:'public',table:'wash_evaluations',filter:'id=eq.'+evaluationId},()=>scheduleSync()).on('postgres_changes',{event:'*',schema:'public',table:'wash_participants',filter:'evaluation_id=eq.'+evaluationId},()=>scheduleSync()).on('postgres_changes',{event:'*',schema:'public',table:'wash_team_members',filter:'user_id=eq.'+userId},()=>scheduleSync()).subscribe(status=>{realtimeReady=status==='SUBSCRIBED';if(realtimeReady){lastEvent=Date.now();scheduleSync();}});
    const {data:{subscription}}=P.client.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||(!s&&navigator.onLine)){hooks.readonly(true);hooks.clear();location.replace('/plataforma.html');}});
    setInterval(()=>{if(!navigator.onLine)return;const now=Date.now(),idle=(typeof document!=='undefined'&&document.hidden)||now-lastActivity>60000,interval=realtimeReady?(idle?120000:30000):15000;if(pending||needsRefresh||['pending','error'].includes(syncState)||(now-lastCheck>=interval&&(!realtimeReady||now-lastEvent>=15000||now-lastCheck>=120000)))return synchronize();},5000);
    addEventListener('focus',()=>{lastActivity=Date.now();return synchronize();});
    addEventListener('offline',()=>{sync('offline');needsRefresh=true;persistLocal().catch(()=>hooks.status('error','No se pudo guardar en este dispositivo.'));});
    addEventListener('online',()=>{sync('syncing');return synchronize();});
    addEventListener('pagehide',()=>persistLocal().catch(()=>{}));
    addEventListener('beforeunload',e=>{if(localIdentity(hooks.get())!==lastLocal){persistLocal().catch(()=>{});e.preventDefault();e.returnValue='';}});
    if(navigator.onLine){if(M.changed(base,logical(hooks.get())).length)sync('pending');else synced();}else sync('offline');
    await persist();return true;
  }
  async function save(){
    lastActivity=Date.now();
    if(!active)return false;
    await persist();
    if(inFlight)return false;
    if(conflicts.length){hooks.status('error','Conflicto pendiente: revise las dos versiones.');return false;}
    if(!navigator.onLine){sync('offline');needsRefresh=true;hooks.status('pending','Guardado en este dispositivo; pendiente de sincronizar.');return false;}
    if(needsRefresh&&!await refresh())return false;
    inFlight=true;sync('syncing');
    const hadPending=Boolean(pending);
    try{
      if(pending){if(!canWrite(pending))throw Error('No tiene permiso para modificar estos datos. Se conserva el borrador local.');await sendPending();}
      const candidates=M.changed(base,logical(hooks.get()));
      for(const candidate of candidates){
        if(['general','indicator'].includes(candidate.kind)?readOnly:planReadOnly)throw Error('No tiene permiso para modificar estos datos. Se conserva el borrador local.');
        const stored=rows.find(r=>r.kind===candidate.kind&&r.record_key===candidate.record_key);
        let data=candidate.data;
        if(candidate.kind==='general'&&Object.hasOwn(data,'photos'))data=await P.uploadPhotos(data,evaluation.facility_id,evaluationId);
        const before=base.find(r=>recordKey(r)===recordKey(candidate));
        const request={...(stored?{id:stored.id,version:stored.version}:{}),facility_id:evaluation.facility_id,evaluation_id:evaluationId,kind:candidate.kind,record_key:candidate.record_key,data,field_changes:M.fieldChanges(before?.data||{},data)};
        if(!pending||M.stable(pending)!==M.stable(request)){pending=request;pendingLocal=M.clone(candidate);currentOperation=crypto.randomUUID();}
        await persist();
        await sendPending();
      }
      const remaining=M.changed(base,logical(hooks.get())).length;if(remaining)sync('pending');else if(hadPending||candidates.length)synced();else sync('synced');await persist();hooks.status(remaining?'pending':'saved',remaining?'Hay cambios nuevos pendientes de sincronizar.':'Guardado en la nube.');return !remaining;
    }catch(e){
      if(e.code==='40001'||e.code==='23505'){hooks.status('error','Actualizando y sincronizando cambios…');inFlight=false;await refresh();return false;}
      needsRefresh=true;sync(navigator.onLine?'error':'offline');hooks.status('pending','Guardado local; sincronización pendiente: '+e.message);return false;
    }finally{inFlight=false;if(!needsRefresh&&(cachedDirty||remoteEpoch>checkedEpoch))scheduleSync(false);}
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
  async function position(view,module){if(!active||!evaluation)return;const data={view,module};if(JSON.stringify(data)===lastView)return;lastView=JSON.stringify(data);lastPosition=data;await persist();if(!navigator.onLine)return;await P.command('state',{evaluation_id:evaluationId,data}).catch(()=>{});}
  async function exportFiles(printing=false){if(!await save())throw Error('Sincronice los cambios y resuelva los conflictos antes de exportar.');return P.exportFiles(evaluationId,evaluation.facility_id,text=>hooks.status('pending',text),printing);}
  root.WashCloud={ready,active,connect,save,persistLocal,resolve,refresh,workspace,position,exportFiles,get evaluation(){return evaluation;}};
})(window);
