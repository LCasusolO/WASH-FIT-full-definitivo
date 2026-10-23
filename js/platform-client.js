(function(root){
  'use strict';
  let client,config;
  const ready=(async()=>{
    let response;
    try { response=await fetch('/api/platform-config',{cache:'no-store'}); }
    catch(error) { if(navigator.onLine!==false)throw error;const cached=localStorage.getItem('wash-public-config');if(!cached)throw Error('Abra el aplicativo con conexión antes de utilizarlo sin conexión.');config=JSON.parse(cached); }
    if(response){
    config=await response.json();
    if(!response.ok)throw Error(config.error||'No se pudo cargar la configuración.');
    localStorage.setItem('wash-public-config',JSON.stringify(config));
    }
    if(config.enabled)client=window.WashSupabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    if(config.enabled&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
    return config;
  })();
  ready.catch(()=>{});
  async function session(){await ready;if(!client)return null;const {data,error}=await client.auth.getSession();if(error)throw error;return data.session;}
  async function requireSession(){const s=await session();if(!s)throw Error('Inicie sesión en el espacio de trabajo.');return s;}
  async function command(command,data,operation=crypto.randomUUID()){
    await requireSession();const {data:result,error}=await client.rpc('wash_command',{p_command:command,p_data:data,p_operation:operation});
    if(error){const err=Error(error.message==='VERSION_CONFLICT'?'Otra persona modificó este registro. Revise ambas versiones.':error.message);err.code=error.code;err.details=error.details;throw err;}return result;
  }
  async function rows(table,filters={},columns="*"){
    await requireSession();let query=client.from('wash_'+table).select(columns);for(const [key,value]of Object.entries(filters))query=query.eq(key,value);
    // Paginación explícita para que un país con >1000 registros no pierda resultados.
    const keys={team_members:['team_id','user_id'],participants:['evaluation_id','user_id'],country_members:['country_id','user_id'],assignments:['team_id','facility_id'],owners:['user_id'],user_state:['user_id','evaluation_id']};
    for(const key of keys[table]||['id'])query=query.order(key);
    const result=[];for(let offset=0;;offset+=500){const {data,error}=await query.range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)break;}return result;
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
      const base='WASH-FIT-'+(evaluationId?'evaluacion':'plan-monitoreo')+'-'+job.id;
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
  root.WashPlatform={accountAction,accountStatus,ready,get client(){return client;},get enabled(){return config?.enabled===true;},session,requireSession,command,rows,request,hydratePhotos,uploadPhotos,resizePhoto,exportFiles,pendingExport,retryExport};
})(window);
