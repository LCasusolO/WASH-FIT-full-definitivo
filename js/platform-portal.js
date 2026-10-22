/* Espacio de trabajo. Las reglas de permisos se vuelven a comprobar en PostgreSQL. */
(function(){
  'use strict';
  const {createApp,ref,computed,onMounted,watch,nextTick}=Vue,P=WashPlatform,M=WashPlatformModel;
  createApp({setup(){
    const configured=ref(false),busy=ref(true),error=ref(''),message=ref(''),user=ref(null),email=ref(''),password=ref(''),newPassword=ref(''),recovering=ref(false);
    const countries=ref([]),countryMembers=ref([]),owners=ref([]),facilities=ref([]),teams=ref([]),members=ref([]),assignments=ref([]),evaluations=ref([]),participants=ref([]),records=ref([]),events=ref([]),invitations=ref([]),snapshots=ref([]);
    const countryId=ref(''),facilityId=ref(new URLSearchParams(location.search).get('facility')||''),teamId=ref(''),view=ref(new URLSearchParams(location.search).get('view')||'evaluations');
    const countryForm=ref({code:'',name:''}),facilityName=ref(''),teamName=ref(''),evaluationName=ref(''),evaluationTeam=ref(''),previousId=ref(''),transferTeams=ref({});
    const invite=ref({scope:'team',email:'',name:'',role:'evaluator'}),inviteLink=ref(''),inviteToken=ref(''),pendingExport=ref(false),actionDraft=ref(null),monitorDraft=ref(null),conflict=ref(null),evidence=ref([]);
    const owner=computed(()=>owners.value.some(o=>o.user_id===user.value?.id));
    const admin=computed(()=>owner.value||countryMembers.value.some(m=>m.country_id===countryId.value&&m.user_id===user.value?.id&&m.role==='admin'));
    const countryFacilities=computed(()=>facilities.value.filter(f=>f.country_id===countryId.value));
    const countryTeams=computed(()=>teams.value.filter(t=>t.country_id===countryId.value));
    const facilityTeams=computed(()=>countryTeams.value.filter(t=>assignments.value.some(a=>a.team_id===t.id&&a.facility_id===facilityId.value)));
    const coordinator=computed(()=>members.value.some(m=>m.user_id===user.value?.id&&m.role==='coordinator'&&facilityTeams.value.some(t=>t.id===m.team_id)));
    const canEditFacility=computed(()=>members.value.some(m=>m.user_id===user.value?.id&&['coordinator','evaluator'].includes(m.role)&&facilityTeams.value.some(t=>t.id===m.team_id)));
    const canManageTeam=computed(()=>!!teamId.value&&(admin.value||members.value.some(m=>m.team_id===teamId.value&&m.user_id===user.value?.id&&m.role==='coordinator')));
    const selectedTeamMembers=computed(()=>members.value.filter(m=>m.team_id===teamId.value));
    const invitationRoles=computed(()=>invite.value.scope==='country'?[{id:'admin',name:'Administrador del país'},{id:'reader',name:'Lector del país'}]:[...(admin.value?[{id:'coordinator',name:'Coordinador responsable'}]:[]),{id:'evaluator',name:'Evaluador'},{id:'reader',name:'Lector'}]);
    const facilityEvaluations=computed(()=>evaluations.value.filter(e=>e.facility_id===facilityId.value).sort((a,b)=>b.created_at.localeCompare(a.created_at)));
    const actions=computed(()=>records.value.filter(r=>r.facility_id===facilityId.value&&r.kind==='action'));
    const monitors=computed(()=>records.value.filter(r=>r.facility_id===facilityId.value&&r.kind==='monitor').sort((a,b)=>(b.data.date||'').localeCompare(a.data.date||'')));
    const facilityEvents=computed(()=>events.value.filter(e=>e.facility_id===facilityId.value).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,200));
    const comparison=ref([]),compareBefore=ref(''),compareAfter=ref('');
    const catalog=INDICATORS_DATA.filter(i=>i.id!=='S_8');
    let channel,timer,authSubscription,formQueue=Promise.resolve();
    const formStore=()=>WashStorage.createStore(indexedDB,'user:'+user.value.id);
    async function clearSavedForms(){await formQueue;await formStore().write('forms:'+facilityId.value,{action:actionDraft.value,monitor:monitorDraft.value});}
    const translations={FORBIDDEN:'No tiene permiso para esta operación.',AUTH_REQUIRED:'Verifique su correo e inicie sesión.',ACTIVE_EVALUATION_EXISTS:'Ya existe una evaluación en elaboración para este establecimiento.',TEAM_ASSIGNMENT_REQUIRED:'Asigne el equipo al establecimiento y designe un coordinador antes de crear la evaluación.',PREVIOUS_VALIDATED_REQUIRED:'Seleccione una evaluación anterior validada.',LAST_COORDINATOR_OR_FORBIDDEN:'Debe quedar un coordinador. Solo el administrador del país puede retirar coordinadores.',INVALID_INVITATION:'La invitación venció, fue utilizada o corresponde a otro correo.',INVITER_REVOKED:'La persona que invitó ya no tiene permiso. Solicite una nueva invitación.',VERSION_CONFLICT:'Otra persona modificó el registro. Su contenido se conserva para que lo revise.',RECORD_LOCKED:'El registro está en revisión o validado.'};
    const explain=e=>translations[e.message]||({'Invalid login credentials':'Correo o contraseña incorrectos.','Email not confirmed':'Confirme su correo antes de ingresar.','Failed to fetch':'No se pudo conectar. Revise su conexión e inténtelo otra vez.'}[e.message])||e.message||'No se pudo completar la operación.';
    const accountRole=computed(()=>owner.value?'Propietario de la plataforma':admin.value?'Administrador del país':coordinator.value?'Coordinador responsable':'Miembro del equipo');
    const inviteReady=computed(()=>invite.value.scope==='country'?!!countryId.value:!!teamId.value);
    async function focusFeedback(){await nextTick();document.getElementById(error.value?'workspace-error':'workspace-message')?.focus();}
    async function focusPanel(id){await nextTick();const panel=document.getElementById(id);panel?.scrollIntoView?.({block:'start',behavior:'smooth'});panel?.focus();}
    function checkEmail(){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))throw Error('Escriba un correo válido para continuar.');}
    async function loadSnapshots(){const selected=facilityId.value;snapshots.value=[];comparison.value=[];compareBefore.value='';compareAfter.value='';if(!selected||!user.value)return;const rows=await P.rows('snapshots',{facility_id:selected,purpose:'validation'},'id,evaluation_id,created_at');if(selected===facilityId.value)snapshots.value=rows;}

    async function run(task){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await task();await load();}catch(e){error.value=explain(e);if(e.code==='40001')conflict.value=M.clone(actionDraft.value||monitorDraft.value||{});if(user.value)pendingExport.value=Boolean(await P.pendingExport().catch(()=>null));}finally{busy.value=false;if(error.value||message.value)await focusFeedback();}}
    async function load(){
      if(!user.value)return;const loadingUser=user.value.id;
      const tables=['countries','country_members','owners','facilities','teams','team_members','assignments','evaluations','participants','records','events','invitations'];
      const values=await Promise.all(tables.map(t=>P.rows(t)));const refs=[countries,countryMembers,owners,facilities,teams,members,assignments,evaluations,participants,records,events,invitations];
      if(user.value?.id!==loadingUser)return;values.forEach((v,i)=>refs[i].value=v);
      if(!countryId.value&&countries.value.length)countryId.value=facilities.value.find(f=>f.id===facilityId.value)?.country_id||countries.value[0].id;
      if(!facilityId.value&&countryFacilities.value.length)facilityId.value=countryFacilities.value[0].id;
      pendingExport.value=Boolean(await P.pendingExport());
      if(facilityId.value)snapshots.value=await P.rows('snapshots',{facility_id:facilityId.value,purpose:'validation'},'id,evaluation_id,created_at');
    }
    const refresh=()=>run(async()=>{message.value='Información actualizada.';});
    const retryExport=()=>run(async()=>{await P.retryExport(text=>message.value=text);message.value='Archivado confirmado en Drive.';});
    const roleLabel=r=>({admin:'Administrador nacional',coordinator:'Coordinador responsable',evaluator:'Evaluador',reader:'Lector'}[r]||r);
    const statusLabel=s=>({draft:'Borrador',editing:'En elaboración',review:'En revisión',validated:'Validada'}[s]||s);
    const teamLabel=id=>teams.value.find(t=>t.id===id)?.name||'Equipo';
    const indicatorLabel=id=>catalog.find(i=>i.id===id)?.title||id;
    const operationLabel=op=>({country:'Registro de país',facility:'Registro de establecimiento',team:'Creación de equipo',assign:'Asignación de equipo',invite:'Invitación',accept_invite:'Invitación aceptada',revoke_invite:'Invitación revocada',remove_member:'Retiro de acceso',evaluation:'Creación de evaluación',evaluation_status:'Cambio de estado de evaluación',save_record:'Registro actualizado',monitor_status:'Cambio de estado de monitoreo',participants:'Participantes actualizados',transfer_evaluation:'Transferencia de equipo',export:'Exportación',export_complete:'Archivado confirmado'}[op]||op);
    const actorLabel=id=>id===user.value?.id?'Usted':members.value.find(m=>m.user_id===id)?.name||countryMembers.value.find(m=>m.user_id===id)?.name||'Cuenta registrada';
    const canEditMonitor=m=>members.value.some(member=>member.user_id===user.value?.id&&member.team_id===m.data.team_id&&['coordinator','evaluator'].includes(member.role));
    const canValidateMonitor=m=>members.value.some(member=>member.user_id===user.value?.id&&member.team_id===m.data.team_id&&member.role==='coordinator');
    const formatDate=v=>new Date(v).toLocaleString('es');
    const canCoordinateEvaluation=e=>admin.value||participants.value.some(p=>p.evaluation_id===e.id&&p.user_id===user.value?.id&&p.active&&p.role==='coordinator');
    const login=()=>run(async()=>{const {error:e}=await P.client.auth.signInWithPassword({email:email.value,password:password.value});password.value='';if(e)throw e;user.value=(await P.requireSession()).user;});
    const register=()=>run(async()=>{checkEmail();if(password.value.length<12)throw Error('Utilice una contraseña de al menos 12 caracteres.');const {error:e}=await P.client.auth.signUp({email:email.value,password:password.value,options:{emailRedirectTo:location.origin+'/plataforma.html'}});password.value='';if(e)throw e;message.value='Revise su correo y confirme la cuenta antes de ingresar.';});
    const recover=()=>run(async()=>{checkEmail();const {error:e}=await P.client.auth.resetPasswordForEmail(email.value,{redirectTo:location.origin+'/plataforma.html'});if(e)throw e;message.value='Si la cuenta existe, recibirá un enlace para recuperar el acceso.';});
    const changePassword=()=>run(async()=>{const {error:e}=await P.client.auth.updateUser({password:newPassword.value});if(e)throw e;newPassword.value='';recovering.value=false;message.value='Contraseña actualizada.';});
    async function logout(){if(actionDraft.value||monitorDraft.value){if(!confirm('Hay un formulario abierto. Guárdelo antes de salir. ¿Descartar el formulario y cerrar sesión?'))return;}await P.client.auth.signOut();location.replace('/plataforma.html');}
    const createCountry=()=>run(async()=>{const c=await P.command('country',{code:countryForm.value.code.toUpperCase(),name:countryForm.value.name});await load();countryId.value=c.id;countryForm.value={code:'',name:''};message.value='País creado. Ahora registre un establecimiento y un equipo.';});
    const createFacility=()=>run(async()=>{const f=await P.command('facility',{country_id:countryId.value,name:facilityName.value});facilityId.value=f.id;facilityName.value='';message.value='Establecimiento creado y seleccionado.';});
    const createTeam=()=>run(async()=>{const t=await P.command('team',{country_id:countryId.value,name:teamName.value});teamId.value=t.id;teamName.value='';message.value='Equipo creado y seleccionado. Asígnelo al establecimiento e invite a su coordinador.';});
    const assignTeam=()=>run(async()=>{await P.command('assign',{facility_id:facilityId.value,team_id:teamId.value});message.value='Equipo asignado al establecimiento.';});
    const createInvite=()=>run(async()=>{
      if(!inviteReady.value)throw Error(invite.value.scope==='country'?'Seleccione un país antes de invitar.':'Seleccione un equipo antes de invitar.');
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
      await P.command('invite',{...(invite.value.scope==='country'?{country_id:countryId.value}:{team_id:teamId.value}),email:invite.value.email,name:invite.value.name,role:invite.value.role,token_hash:hash});
      inviteLink.value=location.origin+'/plataforma.html#invite='+token;message.value='Enlace creado. Cópielo y compártalo con la persona invitada; no se envía por correo automáticamente.';
    });
    const acceptInvite=()=>run(async()=>{await P.command('accept_invite',{token:inviteToken.value});inviteToken.value='';sessionStorage.removeItem('wash-pending-invite');message.value='Invitación aceptada.';});
    const revokeInvite=i=>run(async()=>{await P.command('revoke_invite',{id:i.id});message.value='Invitación revocada.';});
    const removeCountryMember=m=>run(()=>P.command('remove_member',{country_id:countryId.value,user_id:m.user_id}));
    const removeMember=m=>run(async()=>{if(!confirm('Se retirará su acceso al equipo y a sus evaluaciones. La autoría histórica se conserva. ¿Continuar?'))return;await P.command('remove_member',{team_id:teamId.value,user_id:m.user_id});});
    const transferEvaluation=e=>run(async()=>{if(!confirm('Se transferirá el acceso al equipo seleccionado. Se conservarán la autoría y las versiones históricas. ¿Continuar?'))return;await P.command('transfer_evaluation',{evaluation_id:e.id,team_id:transferTeams.value[e.id],version:e.version});});
    const participant=(e,m,remove)=>run(()=>P.command('participants',{evaluation_id:e.id,user_id:m.user_id,remove}));
    async function makeEvaluation(id){if(!evaluationName.value.trim())throw Error('Indique el nombre o periodo.');return P.command('evaluation',{...(id?{id}:{}),facility_id:facilityId.value,team_id:evaluationTeam.value,name:evaluationName.value,kind:facilityEvaluations.value.length?'reassessment':'initial',previous_id:previousId.value||null},id||crypto.randomUUID());}
    const createEvaluation=()=>run(async()=>{await makeEvaluation();evaluationName.value='';message.value='Evaluación creada. Puede abrirla en la lista.';});
    const evaluationStatus=(e,status)=>run(async()=>{if(status==='validated'&&!confirm('Se conservará una versión de la medición y del plan a esta fecha. El monitoreo continuará disponible. ¿Validar?'))return;const reason=e.status==='validated'&&status==='editing'?prompt('Motivo de la corrección (al menos 10 caracteres). Se conservará la versión validada anterior.'):undefined;if(e.status==='validated'&&!reason)return;await P.command('evaluation_status',{evaluation_id:e.id,version:e.version,status,...(reason?{reason}:{})});});
    function newAction(){actionDraft.value={facility_id:facilityId.value,kind:'action',record_key:crypto.randomUUID(),data:{indicator_id:catalog[0].id,action:'',resources:'',responsible:'',targetDate:'',cost:null,trackingStatus:'No Iniciado',change_reason:'Acción inicial',monitor_id:''}};focusPanel('action-form');}
    function editAction(a){actionDraft.value=M.clone(a);actionDraft.value.data.change_reason='';focusPanel('action-form');}
    const saveAction=()=>run(async()=>{await P.command('save_record',actionDraft.value);actionDraft.value=null;await clearSavedForms();message.value='Acción guardada en el plan de mejora.';});
    function newMonitor(){monitorDraft.value={facility_id:facilityId.value,kind:'monitor',record_key:crypto.randomUUID(),data:{team_id:facilityTeams.value.find(t=>members.value.some(m=>m.team_id===t.id&&m.user_id===user.value?.id&&['coordinator','evaluator'].includes(m.role)))?.id||'',date:WashCore.localDate(),title:'',participants:'',findings:'',correctiveMeasures:'',responsible:'',nextReviewDate:'',items:[],photos:[]}};focusPanel('monitor-form');}
    function editMonitor(m){monitorDraft.value=M.clone(m);focusPanel('monitor-form');}
    const saveMonitor=()=>run(async()=>{let m=monitorDraft.value;if(!m.id){const photos=m.data.photos||[];m=await P.command('save_record',{...m,data:{...m.data,photos:[]}});m.data.photos=photos;monitorDraft.value=m;}const data=await P.uploadPhotos(m.data,m.facility_id,m.id);await P.command('save_record',{...m,data});monitorDraft.value=null;await clearSavedForms();message.value='Borrador de monitoreo guardado.';});
    async function monitorPhotos(event){try{const list=monitorDraft.value.data.photos||=[];for(const f of event.target.files){if(list.length>=20||f.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('Máximo 20 fotografías de hasta 5 MB.');list.push(await P.resizePhoto(f));}}catch(e){error.value=explain(e);}event.target.value='';}
    const monitorStatus=(m,status)=>run(()=>P.command('monitor_status',{id:m.id,version:m.version,status}));
    const viewEvidence=m=>run(async()=>{const [r]=await P.hydratePhotos([{kind:'general',data:{photos:m.data.photos||[]}}]);evidence.value=r.data.photos;if(!evidence.value.length)message.value='Este registro no contiene evidencias.';});
    function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    const exportReport=(e,snapshotId)=>run(async()=>{await P.exportFiles(e?.id,facilityId.value,text=>message.value=text,false,typeof snapshotId==='string'?snapshotId:undefined);message.value='JSON y PDF descargados y confirmados en Drive.';});
    const compare=()=>run(async()=>{
      const [before]=await P.rows('snapshots',{id:compareBefore.value});const [after]=await P.rows('snapshots',{id:compareAfter.value});
      if(!before||!after||before.facility_id!==facilityId.value||after.facility_id!==facilityId.value)throw Error('Seleccione dos versiones del mismo establecimiento.');
      if(before.id===after.id||before.created_at>after.created_at)throw Error('Seleccione dos versiones diferentes, de la anterior a la posterior.');
      if(before.data.evaluation.catalog_version!==after.data.evaluation.catalog_version)throw Error('Los catálogos son distintos. Se requiere una correspondencia antes de comparar.');
      const make=snapshot=>{const data=M.dataset(snapshot.data.records,INDICATORS_DATA,WashCore.defaults());data.generalInfo.photos=[];return WashCore.normalizeDataset(data,INDICATORS_DATA);};
      const a=make(before),b=make(after);
      comparison.value=catalog.map(i=>{const x=a.indicators.find(r=>r.id===i.id),y=b.indicators.find(r=>r.id===i.id);const shownA=WashCore.visibleIndicator(x,a.generalInfo,a.indicators),shownB=WashCore.visibleIndicator(y,b.generalInfo,b.indicators);const comparable=shownA&&shownB&&!WashCore.isNotApplicable(x)&&!WashCore.isNotApplicable(y)&&WashCore.hasAssessmentScore(x)&&WashCore.hasAssessmentScore(y);return {id:i.id,title:i.title,before:shownA?(WashCore.isNotApplicable(x)?'No aplicable':x.score??'Sin evaluar'):'Fuera del alcance',after:shownB?(WashCore.isNotApplicable(y)?'No aplicable':y.score??'Sin evaluar'):'Fuera del alcance',change:comparable?(y.score>x.score?'Mejoró':y.score<x.score?'Empeoró':'Sin cambios'):'Sin comparación directa'};});
    });
    async function importDataset(input){
      const platformBackup=input?.format==='wash-fit-platform'?input:null;
      if(platformBackup&&!platformBackup.dataset)return importFacilityBackup(platformBackup);
      if(platformBackup)input=platformBackup.dataset;
      if(!members.value.some(m=>m.team_id===evaluationTeam.value&&m.user_id===user.value.id&&['coordinator','evaluator'].includes(m.role)))throw Error('Para importar debe participar en el equipo seleccionado. El administrador puede invitar su cuenta al equipo.');
      const data=WashCore.normalizeDataset(input,INDICATORS_DATA);
      // El ID y las operaciones se conservan durante un reintento de esta misma importación.
      const key='wash-import:'+user.value.id+':'+facilityId.value;const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));const digest=Array.from(new Uint8Array(fingerprint)).map(x=>x.toString(16).padStart(2,'0')).join('');
      let state=JSON.parse(sessionStorage.getItem(key)||'null');if(state?.digest!==digest)state={digest,id:crypto.randomUUID(),done:{}};sessionStorage.setItem(key,JSON.stringify(state));
      let evaluation=evaluations.value.find(e=>e.id===state.id);if(!evaluation)evaluation=await makeEvaluation(state.id);
      if(!evaluationName.value)evaluationName.value=evaluation.name;
      const uploads=await P.uploadPhotos(data.generalInfo,facilityId.value,evaluation.id);
      const split=M.split({...data,generalInfo:uploads});
      for(const record of split){const keyRecord=record.kind+':'+record.record_key;if(state.done[keyRecord])continue;await P.command('save_record',{...record,facility_id:facilityId.value,evaluation_id:evaluation.id},state.done['op:'+keyRecord]||await rememberOperation(state,key,keyRecord));state.done[keyRecord]=true;sessionStorage.setItem(key,JSON.stringify(state));}
      const importedActions=platformBackup?.payload?.plan?.map((r,index)=>({key:r.id||String(index),data:r.data}))||data.indicators.filter(i=>i.action).map(i=>({key:i.id,data:{indicator_id:i.id,...Object.fromEntries(M.planFields.map(k=>[k,i[k]??'']))}}));
      for(const item of importedActions){const keyRecord='action:'+item.key;if(state.done[keyRecord])continue;await P.command('save_record',{facility_id:facilityId.value,evaluation_id:evaluation.id,kind:'action',record_key:evaluation.id+':'+item.key,data:{...item.data,monitor_id:'',change_reason:'Importación de respaldo'}},state.done['op:'+keyRecord]||await rememberOperation(state,key,keyRecord));state.done[keyRecord]=true;sessionStorage.setItem(key,JSON.stringify(state));}
      const legacy=data.indicators.filter(i=>i.monitoringComments||i.correctiveMeasures||i.history?.length);
      if(legacy.length&&!state.done.legacy){await P.command('save_record',{facility_id:facilityId.value,kind:'monitor',record_key:evaluation.id+':legacy',data:{team_id:evaluationTeam.value,title:'Antecedentes importados; sin validación',date:'',findings:'Comentarios heredados. No se presume fecha, autoría ni validación.',legacy,items:[]}},state.done['op:legacy']||await rememberOperation(state,key,'legacy'));state.done.legacy=true;sessionStorage.setItem(key,JSON.stringify(state));}
      message.value='Importación completada. El archivo y borrador originales se conservaron.';
    }
    async function importFacilityBackup(backup){
      if(!facilityId.value||!evaluationTeam.value)throw Error('Seleccione el establecimiento y un equipo para importar el expediente.');
      if(!members.value.some(m=>m.team_id===evaluationTeam.value&&m.user_id===user.value.id&&['coordinator','evaluator'].includes(m.role)))throw Error('Debe participar en el equipo seleccionado.');
      if(!confirm('Se incorporarán las acciones y monitoreos al establecimiento seleccionado. Los monitoreos se importarán como borradores sin validación. ¿Continuar?'))return;
      const identity='wash-plan-import:'+user.value.id+':'+facilityId.value+':'+backup.exportId;let state=JSON.parse(sessionStorage.getItem(identity)||'{"done":{}}');
      for(const record of backup.payload?.plan||[]){const key='action:'+record.id;if(state.done[key])continue;const op=state.done['op:'+key]||await rememberOperation(state,identity,key);const saved=await P.command('save_record',{facility_id:facilityId.value,kind:'action',record_key:'import:'+backup.exportId+':'+record.id,data:{...record.data,monitor_id:'',change_reason:'Importación del expediente '+backup.exportId}},op);state.done['row:'+key]=saved;state.done[key]=true;sessionStorage.setItem(identity,JSON.stringify(state));}
      for(const record of (backup.payload?.records||[]).filter(r=>r.kind==='monitor')){
        const key='monitor:'+record.id;if(state.done[key])continue;
        let imported=state.done['row:'+key];
        if(!imported){const op=state.done['op:'+key]||await rememberOperation(state,identity,key);imported=await P.command('save_record',{facility_id:facilityId.value,kind:'monitor',record_key:'import:'+backup.exportId+':'+record.id,data:{...record.data,team_id:evaluationTeam.value,title:'Importado sin validación: '+record.data.title,items:(record.data.items||[]).map(item=>({...item,action_id:state.done['row:action:'+item.action_id]?.id||''})),photos:[],source_export:backup.exportId}},op);state.done['row:'+key]=imported;sessionStorage.setItem(identity,JSON.stringify(state));}
        const data=await P.uploadPhotos({...imported.data,photos:record.data.photos||[]},facilityId.value,imported.id);
        await P.command('save_record',{...imported,data},state.done['op:photos:'+key]||await rememberOperation(state,identity,'photos:'+key));state.done[key]=true;sessionStorage.setItem(identity,JSON.stringify(state));
      }message.value='Expediente importado. Los monitoreos requieren revisión del equipo responsable.';
    }
    async function rememberOperation(state,key,name){const op=crypto.randomUUID();state.done['op:'+name]=op;sessionStorage.setItem(key,JSON.stringify(state));return op;}
    const importFile=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;return run(async()=>{if(file.size>WashCore.MAX_IMPORT_BYTES)throw Error('El archivo supera 40 MB.');await importDataset(JSON.parse(await file.text()));});};
    const importLegacyDraft=()=>run(async()=>{const draft=await WashStorage.createStore(indexedDB).read();if(!draft)throw Error('No hay un borrador local anterior.');await importDataset(draft);});
    watch(()=>invite.value.scope,()=>{invite.value.role=invite.value.scope==='country'?'admin':'evaluator';});
    watch(countryId,()=>{if(!countryFacilities.value.some(f=>f.id===facilityId.value))facilityId.value='';if(!countryTeams.value.some(t=>t.id===teamId.value))teamId.value='';inviteLink.value='';});
    watch([countryId,teamId],()=>{inviteLink.value='';});
    watch(facilityId,()=>{loadSnapshots().catch(e=>error.value=explain(e));actionDraft.value=null;monitorDraft.value=null;evidence.value=[];evaluationTeam.value='';previousId.value='';});
    watch([actionDraft,monitorDraft],()=>{if(!user.value||!actionDraft.value&&!monitorDraft.value)return;const store=formStore(),key='forms:'+facilityId.value,data=M.clone({action:actionDraft.value,monitor:monitorDraft.value});formQueue=formQueue.catch(()=>{}).then(()=>store.write(key,data)).catch(()=>{error.value='No se pudo conservar el formulario en el dispositivo. Guárdelo en la nube antes de salir.';});},{deep:true});
    onMounted(async()=>{
      recovering.value=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';const token=new URLSearchParams(location.hash.slice(1)).get('invite');if(token){sessionStorage.setItem('wash-pending-invite',token);history.replaceState(null,'',location.pathname+location.search);}inviteToken.value=sessionStorage.getItem('wash-pending-invite')||'';
      try{const cfg=await P.ready;configured.value=cfg.enabled;if(!cfg.enabled)return;
        const {data}=P.client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')recovering.value=true;if(!session||user.value?.id!==session.user.id){[countries,countryMembers,owners,facilities,teams,members,assignments,evaluations,participants,records,events,invitations].forEach(r=>r.value=[]);evidence.value=[];actionDraft.value=null;monitorDraft.value=null;countryId.value='';facilityId.value='';teamId.value='';}if(!session){user.value=null;return;}user.value=session.user;});authSubscription=data.subscription;
        user.value=(await P.session())?.user||null;await load();
        const saved=user.value&&await formStore().read('forms:'+facilityId.value);if(saved){const form=saved;actionDraft.value=form.action;monitorDraft.value=form.monitor;message.value='Se recuperó un formulario pendiente en esta sesión.';}
        channel=P.client.channel('wash-workspace').on('postgres_changes',{event:'*',schema:'public',table:'wash_records'},()=>{clearTimeout(timer);timer=setTimeout(()=>load().catch(e=>error.value=explain(e)),500);}).subscribe();
        // Revalidar membresías y estados incluso si no llega un evento de revocación.
        setInterval(()=>{if(user.value&&!busy.value)load().catch(e=>error.value=explain(e));},15000);
      }catch(e){error.value=explain(e);}finally{busy.value=false;}
    });
    return {operationLabel,actorLabel,canEditMonitor,canValidateMonitor,accountRole,inviteReady,configured,busy,error,message,user,email,password,newPassword,recovering,countries,countryId,facilities,countryFacilities,facilityId,teams,countryTeams,teamId,members,selectedTeamMembers,owner,admin,coordinator,canEditFacility,canManageTeam,facilityTeams,view,tabs:[{id:'evaluations',name:'Evaluaciones'},{id:'plan',name:'Plan de mejora'},{id:'monitoring',name:'Monitoreo · paso 5'},{id:'organization',name:'País y equipos'},{id:'history',name:'Historial y comparativo'}],countryForm,countryMembers,removeCountryMember,facilityName,teamName,evaluationName,evaluationTeam,previousId,transferTeams,transferEvaluation,invite,invitationRoles,inviteLink,inviteToken,invitations,pendingExport,retryExport,facilityEvaluations,participants,actions,monitors,catalog,actionDraft,monitorDraft,conflict,evidence,facilityEvents,snapshots,comparison,compareBefore,compareAfter,compare,login,register,recover,changePassword,logout,refresh,createCountry,createFacility,createTeam,assignTeam,createInvite,acceptInvite,revokeInvite,removeMember,participant,createEvaluation,evaluationStatus,newAction,editAction,saveAction,newMonitor,editMonitor,saveMonitor,monitorPhotos,monitorStatus,viewEvidence,exportReport,importFile,importLegacyDraft,roleLabel,statusLabel,teamLabel,indicatorLabel,formatDate,canCoordinateEvaluation};
  }}).mount('#platform');
})();
