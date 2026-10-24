(function(root){
  'use strict';
  let client,config;
  const offlineStores=new Map();
  function offlineStore(userId){if(!offlineStores.has(userId))offlineStores.set(userId,root.WashStorage.createStore(indexedDB,'user:'+userId));return offlineStores.get(userId);}
  let authRenewalTimer=null,authRenewalEpoch=0,latestSession=null;
  function cancelAuthRenewal(){if(authRenewalTimer!==null)clearTimeout(authRenewalTimer);authRenewalTimer=null;authRenewalEpoch++;}
  function scheduleAuthRenewal(session){
    cancelAuthRenewal();latestSession=session;
    const expires=Number(session?.expires_at)*1000;if(navigator.onLine===false||!Number.isFinite(expires)||!expires)return;
    // Repartir las renovaciones entre siete y dos minutos antes de caducar:
    // un grupo que inició sesión junto no debe renovar en una sola ráfaga.
    const remaining=expires-Date.now(),earliest=Math.max(0,remaining-420000),latest=Math.max(0,remaining-120000);
    const epoch=authRenewalEpoch;let failures=0;
    async function renew(){
      authRenewalTimer=null;if(epoch!==authRenewalEpoch||navigator.onLine===false)return;
      try{
        const result=await client.auth.refreshSession();
        if(epoch!==authRenewalEpoch)return; // TOKEN_REFRESHED ya programó la siguiente.
        if(result.error)throw result.error;
        scheduleAuthRenewal(result.data?.session||null);
      }catch{
        if(epoch!==authRenewalEpoch||navigator.onLine===false)return;
        failures=Math.min(failures+1,4);
        authRenewalTimer=setTimeout(renew,Math.min(300000,60000*2**(failures-1))*(1+Math.random()*2));
      }
    }
    authRenewalTimer=setTimeout(renew,earliest+Math.random()*(latest-earliest));
  }
  const ready=(async()=>{
    let response;
    try { response=await fetch('/api/platform-config',{cache:'no-store'}); }
    catch(error) { if(navigator.onLine!==false)throw error;const cached=localStorage.getItem('wash-public-config');if(!cached)throw Error('Abra el aplicativo con conexión antes de utilizarlo sin conexión.');config=JSON.parse(cached); }
    if(response){
    config=await response.json();
    if(!response.ok)throw Error(config.error||'No se pudo cargar la configuración.');
    localStorage.setItem('wash-public-config',JSON.stringify(config));
    }
    // El SDK obtiene/renueva el token antes de llamar a fetch. El presupuesto de
    // red comienza aquí, conservando también cualquier cancelación del llamador.
    const platformFetch=(input,options={})=>{
      const target=typeof input==='string'||input instanceof URL?input:input.url;
      if(!new URL(target,config.url).pathname.startsWith('/rest/v1/'))return fetch(input,options);
      const caller=options.signal||input?.signal,deadline=AbortSignal.timeout(20000);
      return fetch(input,{...options,signal:caller?AbortSignal.any([caller,deadline]):deadline});
    };
    if(config.enabled)client=window.WashSupabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:navigator.onLine!==false,detectSessionInUrl:true},db:{retry:false},global:{fetch:platformFetch}});
    if(config.enabled){
      client.auth.onAuthStateChange((event,session)=>{scheduleAuthRenewal(event==='SIGNED_OUT'?null:session);if(event==='SIGNED_OUT')localStorage.removeItem('wash-offline-user');else if(session?.user?.id)localStorage.setItem('wash-offline-user',JSON.stringify({id:session.user.id}));});
      addEventListener('offline',()=>{cancelAuthRenewal();client.auth.stopAutoRefresh();});addEventListener('online',()=>{scheduleAuthRenewal(latestSession);client.auth.startAutoRefresh();});
    }
    if(config.enabled&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
    return config;
  })();
  ready.catch(()=>{});
  async function session(){
    await ready;if(!client)return null;
    // Identidad local solo para abrir el borrador; no es una sesión de servidor.
    if(navigator.onLine===false){const user=JSON.parse(localStorage.getItem('wash-offline-user')||'null');return user?.id?{user,offline:true}:null;}
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session?.user?.id)localStorage.setItem('wash-offline-user',JSON.stringify({id:data.session.user.id}));
    return data.session;
  }
  async function offlineEvaluations(){const s=await session();if(!s)return [];const list=await offlineStore(s.user.id).read('offlineEvaluations');return Object.values(list||{}).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));}
  async function rememberOfflineEvaluation(userId,item){await offlineStore(userId).update('offlineEvaluations',list=>({...list,[item.id]:item}));}
  async function requireSession(){const s=await session();if(s?.offline)throw Error('Sin conexión: se conserva el borrador en este dispositivo.');if(!s)throw Error('Inicie sesión en la plataforma.');return s;}
  async function command(command,data,operation=crypto.randomUUID()){
    await requireSession();const endpoint=command==='save_record'&&Array.isArray(data?.field_changes)?'wash_command_fields':'wash_command';
    const {data:result,error}=await client.rpc(endpoint,{p_command:command,p_data:data,p_operation:operation});
    if(error){const err=Error(error.message==='VERSION_CONFLICT'?'Otra persona modificó este registro. Revise ambas versiones.':error.message);err.code=error.code;err.details=error.details;throw err;}return result;
  }
  async function checks(evaluationId=null){await requireSession();const {data,error}=await client.rpc('wash_evaluation_checks',{p_evaluation:evaluationId});if(error)throw Error(error.message);return data;}
  async function progress(facilityIds=null){await requireSession();if(facilityIds&& !facilityIds.length)return {};const {data,error}=await client.rpc(facilityIds?'wash_facility_progress':'wash_evaluation_progress',facilityIds?{p_facilities:facilityIds}:undefined);if(error)throw Error(error.message);return data;}
  async function progressSync(known={},facilityIds=null){
    await requireSession();const ids=facilityIds===null?null:[...new Set(facilityIds)],result={revisions:{},changed:[],progress:{}},changed=new Set();
    const batches=ids===null?[null]:Array.from({length:Math.ceil(ids.length/2)},(_,i)=>ids.slice(i*2,i*2+2));
    for(const scope of batches){const revisions=scope===null?known:Object.fromEntries(scope.filter(id=>Object.hasOwn(known,id)).map(id=>[id,known[id]]));const {data,error}=await client.rpc('wash_progress_sync',{p_known:revisions,p_facilities:scope});if(error)throw Error(error.message);Object.assign(result.revisions,data.revisions);Object.assign(result.progress,data.progress);data.changed.forEach(id=>changed.add(id));}
    result.changed=[...changed];return result;
  }
  async function editorSync(evaluationId,known={}){await requireSession();const {data,error}=await client.rpc('wash_editor_sync',{p_evaluation:evaluationId,p_known:known});if(error){const e=Error(error.code==='42501'?'ACCESS_REVOKED':error.message);e.code=error.code;throw e;}return data;}
  async function rows(table,filters={},columns="*",options={}){
    await requireSession();let query=client.from('wash_'+table).select(columns);for(const [key,value]of Object.entries(filters))query=query.eq(key,value);
    // Paginación explícita para que un país con >1000 registros no pierda resultados.
    const keys={team_members:['team_id','user_id'],participants:['evaluation_id','user_id'],country_members:['country_id','user_id'],assignments:['team_id','facility_id'],owners:['user_id'],user_state:['user_id','evaluation_id']};
    for(const key of keys[table]||['id'])query=query.order(key,{ascending:options.ascending!==false});
    const limit=Number.isSafeInteger(options.limit)&&options.limit>0?options.limit:Infinity;
    const result=[];for(let offset=0;offset<limit;offset+=500){const end=Math.min(offset+499,limit-1),{data,error}=await query.range(offset,end);if(error)throw error;result.push(...data);if(data.length<end-offset+1)break;}return result;
  }
  async function evaluationsFor(facilityIds){
    await requireSession();const ids=[...new Set(facilityIds)],result=[];
    for(let i=0;i<ids.length;i+=100){const query=client.from('wash_evaluations').select('*').in('facility_id',ids.slice(i,i+100)).order('id');for(let offset=0;;offset+=500){const {data,error}=await query.range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)break;}}
    return result;
  }
  async function request(url,options={}){
    const s=await session();return fetch(url,{...options,headers:{...options.headers,...(s?{Authorization:'Bearer '+s.access_token}:{})}});
  }
  async function accountAction(action,data={}){
    const send=['login','recover','send_confirmation'].includes(action)?fetch:request;
    const response=await send('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
    const result=await response.json();if(!response.ok){const error=Error(result.error||'No se pudo completar la operación.');error.code=result.code;throw error;}return result;
  }
  async function accountStatus(){await ready;const {data,error}=await client.rpc('wash_account_status');if(error)throw error;return data;}
  async function hydratePhotos(records){
    return Promise.all(records.map(async r=>{
      if(r.kind!=='general'||!r.data.photos)return r;
      const photos=await Promise.all(r.data.photos.map(async p=>{
        if(!p.path)return p;
        const {data,error}=await client.storage.from('wash-evidence').download(p.path);if(error)throw error;
        const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(data);});
        return {name:p.name,url};
      }));return {...r,data:{...r.data,photos}};
    }));
  }
  async function uploadPhotos(data,facility,evaluation){
    const photos=[];for(const p of data.photos||[]){
      if(p.path){photos.push(p);continue;}
      if(!/^data:image\/(jpeg|png|webp);base64,/.test(p.url||''))throw Error('Fotografía inválida.');
      const blob=await(await fetch(p.url)).blob();if(blob.size>5*1024*1024)throw Error('Fotografía demasiado grande.');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const path=facility+'/'+evaluation+'/'+digest+'.'+blob.type.split('/')[1];
      const {error}=await client.storage.from('wash-evidence').upload(path,blob,{upsert:false,contentType:blob.type});
      if(error&&String(error.statusCode)!=='409'&&!/already exists|Duplicate/i.test(error.message))throw error;
      photos.push({name:p.name,path});
    }return {...data,photos};
  }
  async function resizePhoto(file){
    const url=URL.createObjectURL(file);
    try{const image=new Image();image.src=url;await image.decode();const factor=Math.min(1,1200/image.width,1200/image.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {name:file.name.replace(/\.[^.]+$/,'')+'.jpg',url:canvas.toDataURL('image/jpeg',.7)};}
    finally{URL.revokeObjectURL(url);}
  }
  async function exportFiles(evaluationId,facilityId,progress=()=>{},printing=false,snapshotId){
    const popup=printing?root.WashChrome.preparePrint():null;
    try{
      const job=await command('export',{facility_id:facilityId,...(evaluationId?{evaluation_id:evaluationId}:{}),...(snapshotId?{snapshot_id:snapshotId}:{})});
      const response=await request('/api/platform-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exportId:job.id})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo preparar el reporte.');
      const base=result.fileBaseName||root.WashCore.evaluationFileBase({facilityName:result.dataset.facility.name,countryCode:result.dataset.country.code},result.dataset.payload?.evaluation);
      const json=new Blob([JSON.stringify(result.dataset,null,2)],{type:'application/json'});
      function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      if(printing)await root.WashChrome.print(result.html,base,popup);else download(json,base+'.json');
      progress('Generando PDF…');const pdf=await root.WashChrome.generate(result.html,base,job.id);if(!printing)download(pdf,base+'.pdf');
      const archiveJob={exportId:job.id,dataset:{generalInfo:{facilityName:result.dataset.facility.name,countryCode:result.dataset.country.code}},json,pdf};
      const session=await requireSession();const store=root.WashStorage.createStore(indexedDB,'user:'+session.user.id);
      await store.write('pendingExport',{job:archiveJob,createdAt:Date.now()});
      let archive;
      try{archive=await root.WashArchive.save(archiveJob,progress,request);await command('export_complete',{id:job.id,files:archive.files});await store.write('pendingExport',null);}
      catch(error){await store.write('pendingExport',{job:archiveJob,createdAt:Date.now()});throw Error('Los archivos ya se generaron. El archivado en Drive está pendiente: '+error.message);}
      return {saved:true,job,archive};
    }catch(e){popup?.close();throw e;}
  }
  async function pendingExport(){const s=await requireSession();return root.WashStorage.createStore(indexedDB,'user:'+s.user.id).read('pendingExport');}
  async function retryExport(progress=()=>{}){
    const s=await requireSession(),store=root.WashStorage.createStore(indexedDB,'user:'+s.user.id),pending=await store.read('pendingExport');
    if(!pending)throw Error('No hay un archivado pendiente en este navegador.');
    if(Date.now()-pending.createdAt>3500000){delete pending.job.session;delete pending.job.ids;}
    try{const result=await root.WashArchive.save(pending.job,progress,request);await command('export_complete',{id:pending.job.exportId,files:result.files});await store.write('pendingExport',null);return result;}
    catch(error){await store.write('pendingExport',pending);throw error;}
  }
  root.WashPlatform={evaluationsFor,progressSync,editorSync,progress,offlineEvaluations,rememberOfflineEvaluation,checks,accountAction,accountStatus,ready,get client(){return client;},get enabled(){return config?.enabled===true;},session,requireSession,command,rows,request,hydratePhotos,uploadPhotos,resizePhoto,exportFiles,pendingExport,retryExport};
})(window);
