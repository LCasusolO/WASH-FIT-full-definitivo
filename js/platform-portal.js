/* Espacio de trabajo. Las reglas de permisos se vuelven a comprobar en PostgreSQL. */
(function(){
  'use strict';
  const {createApp,ref,computed,onMounted,watch,nextTick}=Vue,P=WashPlatform,M=WashPlatformModel;
  const EvaluationAccess={props:['evaluation','people','teamMembers','assignedTeams','selectedTeam','canTransfer','canCoordinate','busy','roleLabel'],emits:['transfer','participant','update-team'],template:`<div class="evaluation-access"><details v-if="canTransfer"><summary>Transferir equipo responsable</summary><p v-if="!assignedTeams.length">No hay otro equipo activo con coordinador en este país.</p><template v-else><label>Nuevo equipo<select :value="selectedTeam || ''" @change="$emit('update-team',$event.target.value)"><option value="">Seleccione</option><option v-for="t in assignedTeams" :value="t.id">{{t.name}}</option></select></label><button @click="$emit('transfer',evaluation)" :disabled="busy || !assignedTeams.some(t=>t.id===selectedTeam)">Transferir acceso al equipo</button><small>El nuevo equipo quedará asignado al establecimiento y recibirá el acceso a esta evaluación.</small></template></details><details><summary>Participantes y acceso</summary><ul><li v-for="p in people" :key="p.user_id">{{p.name}} — {{roleLabel(p.role)}} — {{p.active?'activo':'retirado'}} <button v-if="canCoordinate && evaluation.status!=='validated'" @click="$emit('participant',evaluation,p,p.active)" :disabled="busy || (!p.active && !teamMembers.some(m=>m.user_id===p.user_id))" :title="!p.active && !teamMembers.some(m=>m.user_id===p.user_id)?'Para agregarlo debe pertenecer al equipo responsable.':undefined">{{p.active?'Retirar de esta evaluación':'Agregar a la evaluación'}}</button></li></ul><p v-if="!people.length">Todavía no hay participantes.</p><small v-if="evaluation.status==='validated'">Los participantes de la medición validada se conservan como parte de su historial.</small></details></div>`};
  const CompletionSummary={props:['progress','evaluation','canComplete','busy','expanded'],emits:['complete','pending'],computed:{pendingCount(){return this.progress?.issueCount??this.progress?.issues?.length??0;}},methods:{stepPercent(s){return s.complete?100:s.total?Math.min(99,Math.round(100*s.done/s.total)):0;},link(i){if(i.field==='team')return 'plataforma.html?'+new URLSearchParams({view:'organization',facility:this.evaluation.facility_id});return 'index.html?'+new URLSearchParams({evaluation:this.evaluation.id,view:i.view,module:i.module||'',indicator:i.indicator||'',field:i.field||''})}},template:`<div class="completion-summary" v-if="progress"><strong>Avance de los pasos: {{progress.percent}}%</strong><ol class="completion-steps"><li v-for="s in progress.steps" :key="s.step" :class="s.complete?'step-complete':'step-pending'">Paso {{s.step}} · {{stepPercent(s)}}%</li></ol><details v-if="pendingCount" :open="expanded" @toggle="$event.target.open && progress.detailsLoaded===false && $emit('pending',evaluation)"><summary>Ver campos pendientes ({{pendingCount}})</summary><p v-if="progress.detailsLoaded===false">Consultando campos pendientes…</p><ul v-else><li v-for="(i,n) in progress.issues" :key="n"><a :href="link(i)">Paso {{i.step}}: {{i.label}} — Corregir</a></li></ul></details><p v-else>Los cinco pasos están completos. El monitoreo continuará después del cierre.</p><button v-if="canComplete && evaluation.status!=='validated'" @click="$emit('complete',evaluation)" :disabled="busy">Finalizar evaluación</button></div>`};
  createApp({components:{EvaluationAccess,CompletionSummary},setup(){
    const showPassword=ref(false),showRecoveryHelp=ref(false),copiedCredentials=ref(false),iconCache=new Map();
    const iconSvg=name=>{if(!name||!window.lucide?.icons?.[name])return '';if(!iconCache.has(name))iconCache.set(name,window.lucide.createElement(window.lucide.icons[name],{'width':20,'height':20,'stroke-width':1.8,'aria-hidden':'true','focusable':'false'}).outerHTML);return iconCache.get(name);};
    const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase();
    const roleClass=role=>({owner:'role-owner',admin:'role-admin',coordinator:'role-coordinator',evaluator:'role-evaluator'})[role]||'';
    const tabCount=id=>{if(id==='users'&&!directoryLoaded.value)return null;return({evaluations:evaluations.value.length,organization:teams.value.length,users:accountUsers.value.filter(a=>a.status!=='deleted').length,history:snapshots.value.length})[id]||0;};
    async function copyCredentials(){if(!credentials.value?.temporary_password)return;try{await navigator.clipboard.writeText('Acceso WASH FIT\nUsuario: '+credentials.value.username+'\nContraseña temporal: '+credentials.value.temporary_password+'\nEnlace: '+location.origin+'/plataforma.html');copiedCredentials.value=true;}catch{error.value='No se pudieron copiar las credenciales. Seleccione y copie la contraseña mostrada en pantalla.';await focusFeedback();}}
    const profileForm=ref(null),showDeletedAccounts=ref(false),passwordDialog=ref(null),passwordError=ref('');
    let passwordReturnFocus=null;
    const directoryLoaded=ref(false);let directoryPromise,directoryUser;
    const profile=ref(null),accountUsers=ref([]),accountEvents=ref([]),accountSearch=ref(''),confirmationNeeded=ref(false),confirmationSent=ref(false),credentials=ref(null);
    const accountForm=ref({username:'',name:'',email:'',scope:'team',role:'evaluator',team_id:'',country_id:'',request_id:crypto.randomUUID()}),roleForm=ref({user_id:'',scope:'team',role:'evaluator',team_id:'',country_id:''});
    const connectionOnline=ref(navigator.onLine!==false);
    const offlineMode=ref(navigator.onLine===false),offlineList=ref([]),lastSyncedAt=ref(''),syncing=ref(false),syncFailed=ref(false);
    const syncView=computed(()=>{const display=M.syncDisplay(connectionOnline.value,syncFailed.value?'error':actionDraft.value||monitorDraft.value?'pending':syncing.value?'syncing':lastSyncedAt.value?'synced':'connecting',lastSyncedAt.value);return display.tone==='synced'?{...display,label:'En línea · Información actualizada'}:syncFailed.value?{...display,detail:'No se pudo actualizar la información. Se volverá a intentar automáticamente.'}:display;});
    const syncTime=value=>M.syncDisplay(true,'synced',value).time;
    const configured=ref(false),busy=ref(true),error=ref(''),message=ref(''),user=ref(null),email=ref(''),password=ref(''),newPassword=ref(''),confirmPassword=ref(''),showNewPassword=ref(false),showConfirmPassword=ref(false),passwordChangeOpen=ref(false),recovering=ref(false);
    const countries=ref([]),countryMembers=ref([]),owners=ref([]),facilities=ref([]),teams=ref([]),members=ref([]),assignments=ref([]),evaluations=ref([]),participants=ref([]),records=ref([]),events=ref([]),snapshots=ref([]);
    const countryId=ref(''),facilityId=ref(new URLSearchParams(location.search).get('facility')||''),teamId=ref(''),view=ref(['evaluations','organization','users','history'].includes(new URLSearchParams(location.search).get('view'))?new URLSearchParams(location.search).get('view'):'evaluations');
    const countryForm=ref({code:'',name:''}),facilityName=ref(''),teamName=ref(''),evaluationTeam=ref(''),previousId=ref(''),transferTeams=ref({});
    const pendingExport=ref(false),actionDraft=ref(null),monitorDraft=ref(null),conflict=ref(null),evidence=ref([]);
    const owner=computed(()=>owners.value.some(o=>o.user_id===user.value?.id));
    const admin=computed(()=>owner.value||countryMembers.value.some(m=>m.country_id===countryId.value&&m.user_id===user.value?.id&&m.role==='admin'));
    const evaluationChoices=ref({}),evaluationStarts=new Map();
    const nationalAdmin=computed(()=>!owner.value&&countryMembers.value.some(m=>m.user_id===user.value?.id&&m.role==='admin'));
    const managedCountries=computed(()=>countries.value.filter(c=>!owner.value&&countryMembers.value.some(m=>m.country_id===c.id&&m.user_id===user.value?.id&&m.role==='admin')));
    const adminForCountry=id=>owner.value||countryMembers.value.some(m=>m.country_id===id&&m.user_id===user.value?.id&&m.role==='admin');
    const facilityNameFor=id=>facilities.value.find(f=>f.id===id)?.name||'Establecimiento';
    const countryNameFor=id=>countries.value.find(c=>c.id===id)?.name||'País';
    const facilityCountry=id=>facilities.value.find(f=>f.id===id)?.country_id;
    const teamsForFacility=id=>teams.value.filter(t=>assignments.value.some(a=>a.team_id===t.id&&a.facility_id===id));
    const canCreateAt=id=>!owner.value&&(adminForCountry(facilityCountry(id))||members.value.some(m=>m.user_id===user.value?.id&&m.role==='coordinator'&&teamsForFacility(id).some(t=>t.id===m.team_id)));
    const evaluationFacilities=computed(()=>facilities.value.filter(f=>canCreateAt(f.id)));
    const allEvaluations=computed(()=>[...evaluations.value].sort((a,b)=>b.created_at.localeCompare(a.created_at)));
    const activeEvaluations=computed(()=>evaluations.value.filter(e=>['draft','editing','review'].includes(e.status)));
    const myTeamMembers=computed(()=>members.value.filter(m=>members.value.some(own=>own.user_id===user.value?.id&&own.team_id===m.team_id)));
    const teamFacilities=id=>assignments.value.filter(a=>a.team_id===id).map(a=>facilityNameFor(a.facility_id)).join(', ')||'Sin establecimiento asignado';
    const transferOptions=e=>teams.value.filter(t=>t.id!==e.team_id&&t.active!==false&&t.country_id===facilityCountry(e.facility_id)&&members.value.some(m=>m.team_id===t.id&&m.role==='coordinator'));
    const completion=ref({}),completionExpanded=ref('');
    const evaluatorOnly=computed(()=>!owner.value&&!nationalAdmin.value&&!members.value.some(m=>m.user_id===user.value?.id&&m.role==='coordinator'));
    const organizationTeams=computed(()=>owner.value?teams.value:nationalAdmin.value?countryTeams.value:teams.value.filter(t=>members.value.some(m=>m.team_id===t.id&&m.user_id===user.value?.id)));
    const teamDirectory=computed(()=>organizationTeams.value.flatMap(t=>{const people=members.value.filter(m=>m.team_id===t.id);return (people.length?people:[null]).map(m=>({team:t,member:m,key:t.id+':'+(m?.user_id||'empty')}));}));
    const facilitiesInCountry=id=>facilities.value.filter(f=>f.country_id===id);
    const organizationName=computed(()=>owner.value?'País y establecimientos':'Establecimientos y equipos');
    const organizationFacilities=computed(()=>nationalAdmin.value?countryFacilities.value:facilities.value);
    const selectedStartFacility=computed(()=>evaluationFacilities.value.some(f=>f.id===facilityId.value)?facilityId.value:evaluationFacilities.value[0]?.id||'');
    const creationTeamsFor=id=>teamsForFacility(id).filter(t=>t.active!==false&&members.value.some(m=>m.team_id===t.id&&m.role==='coordinator')&&(adminForCountry(facilityCountry(id))||members.value.some(m=>m.team_id===t.id&&m.user_id===user.value?.id&&m.role==='coordinator')));
    const chosenEvaluationTeam=id=>{const available=creationTeamsFor(id);return available.length===1?available[0].id:available.some(t=>t.id===evaluationChoices.value[id])?evaluationChoices.value[id]:'';};
    const adminFacilities=computed(()=>facilities.value.filter(f=>managedCountries.value.some(c=>c.id===f.country_id)));
    const evaluationsByFacility=computed(()=>{const groups={};for(const e of allEvaluations.value)(groups[e.facility_id]||=[]).push(e);return groups;});
    const evaluationsAt=id=>evaluationsByFacility.value[id]||[];
    const activeAt=id=>evaluationsAt(id).find(e=>['draft','editing','review'].includes(e.status));
    const latestValidatedAt=id=>evaluationsAt(id).find(e=>e.status==='validated');
    const evaluationStatusLabel=s=>s==='validated'?'Validada':'En curso';
    const evaluationLinkLabel=e=>e.status==='validated'?'Ver evaluación validada':'Continuar evaluación';
    const currentAt=id=>activeAt(id)||latestValidatedAt(id);
    const previousAt=id=>evaluationsAt(id).filter(e=>e.id!==currentAt(id)?.id);
    const canCorrect=e=>e?.status==='validated'&&adminForCountry(facilityCountry(e.facility_id));
    const visibleEvaluationFacilities=computed(()=>facilities.value);
    const facilityStatus=id=>activeAt(id)?'En curso':latestValidatedAt(id)?'Validada':'Falta evaluar';
    const startEvaluation=async id=>{
      if(busy.value)return;
      const target=typeof id==='string'?id:selectedStartFacility.value;let destination='';
      await run(async()=>{
        if(!canCreateAt(target))throw Error('FORBIDDEN');
        const existing=(await P.rows('evaluations',{facility_id:target})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
        const active=existing.find(e=>['draft','editing','review'].includes(e.status));
        if(active){destination=active.id;return;}
        const assignedTeam=chosenEvaluationTeam(target);if(!assignedTeam)throw Error('Seleccione el equipo asignado que realizará la evaluación.');
        const previous=existing.find(e=>e.status==='validated');
        const payload={facility_id:target,team_id:assignedTeam,kind:existing.length?'reassessment':'initial',previous_id:previous?.id||null};
        const key=JSON.stringify(payload);if(!evaluationStarts.has(key))evaluationStarts.set(key,crypto.randomUUID());
        const created=await P.command('evaluation',payload,evaluationStarts.get(key));destination=created.id;
      });
      if(destination)location.assign('/index.html?evaluation='+encodeURIComponent(destination));
    };
    const countryFacilities=computed(()=>facilities.value.filter(f=>f.country_id===countryId.value));
    const countryTeams=computed(()=>teams.value.filter(t=>t.country_id===countryId.value));
    const facilityTeams=computed(()=>teamsForFacility(facilityId.value));
    const coordinator=computed(()=>members.value.some(m=>m.user_id===user.value?.id&&m.role==='coordinator'&&facilityTeams.value.some(t=>t.id===m.team_id)));
    const canEditFacility=computed(()=>members.value.some(m=>m.user_id===user.value?.id&&['coordinator','evaluator'].includes(m.role)&&facilityTeams.value.some(t=>t.id===m.team_id)));
    const canManageTeam=computed(()=>!!teamId.value&&(admin.value||members.value.some(m=>m.team_id===teamId.value&&m.user_id===user.value?.id&&m.role==='coordinator')));
    const selectedTeamMembers=computed(()=>members.value.filter(m=>m.team_id===teamId.value));
    const facilityEvaluations=computed(()=>evaluations.value.filter(e=>e.facility_id===facilityId.value).sort((a,b)=>b.created_at.localeCompare(a.created_at)));
    const actions=computed(()=>records.value.filter(r=>r.facility_id===facilityId.value&&r.kind==='action'));
    const monitors=computed(()=>records.value.filter(r=>r.facility_id===facilityId.value&&r.kind==='monitor').sort((a,b)=>(b.data.date||'').localeCompare(a.data.date||'')));
    const facilityEvents=computed(()=>events.value.filter(e=>e.facility_id===facilityId.value).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,200));
    const comparison=ref([]),compareBefore=ref(''),compareAfter=ref('');
    const catalog=INDICATORS_DATA.filter(i=>i.id!=='S_8');
    let channel,timer,authSubscription,formQueue=Promise.resolve(),loadPromise,loadUser,networkFeedback=false,realtimeReady=false,lastFullCheck=0,lastActivity=Date.now(),facilityRefresh=null,dirtyActor='';
    const pollFactor=1+Math.random()*0.2;
    const dirtyFacilities=new Set();let progressRevisions={};
    let autoRetryAt=0,autoFailures=0;
    function autoFailed(){autoFailures=Math.min(autoFailures+1,6);autoRetryAt=Date.now()+Math.min(30000,1000*2**(autoFailures-1))*(0.75+Math.random()*0.5);}
    function autoSucceeded(){autoFailures=0;autoRetryAt=0;}
    const formStore=()=>WashStorage.createStore(indexedDB,'user:'+user.value.id);
    async function clearSavedForms(){await formQueue;await formStore().write('forms:'+facilityId.value,{action:actionDraft.value,monitor:monitorDraft.value});}
    const translations={FORBIDDEN:'No tiene permiso para esta operación.',COUNTRY_ADMIN_CREATION_REQUIRED:'El administrador del país registra establecimientos, equipos y evaluaciones.',OWNER_CREATES_ADMINS_ONLY:'Desde la administración global solo se crean administradores del país.',AUTH_REQUIRED:'Verifique su correo e inicie sesión.',ACTIVE_EVALUATION_EXISTS:'Ya existe una evaluación en elaboración para este establecimiento.',TEAM_ASSIGNMENT_REQUIRED:'Asigne el equipo al establecimiento y designe un coordinador antes de crear la evaluación.',PREVIOUS_VALIDATED_REQUIRED:'Seleccione una evaluación anterior validada.',LAST_COORDINATOR_OR_FORBIDDEN:'Debe quedar un coordinador. Solo el administrador del país puede retirar coordinadores.',INVALID_INVITATION:'La invitación venció, fue utilizada o corresponde a otro correo.',INVITER_REVOKED:'La persona que invitó ya no tiene permiso. Solicite una nueva invitación.',VERSION_CONFLICT:'Otra persona modificó el registro. Su contenido se conserva para que lo revise.',RECORD_LOCKED:'El registro está en revisión o validado.'};
    const explain=e=>M.isNetworkError(e)?'No se pudo conectar con el servidor. La plataforma volverá a actualizarse automáticamente. Si estaba realizando una operación, revise su resultado antes de repetirla.':translations[e.message]||({'Invalid login credentials':'Correo o contraseña incorrectos.','Email not confirmed':'Confirme su correo antes de ingresar.','Failed to fetch':'No se pudo conectar. Revise su conexión e inténtelo otra vez.'}[e.message])||e.message||'No se pudo completar la operación.';
    function setError(e){networkFeedback=M.isNetworkError(e);if(networkFeedback)syncFailed.value=true;error.value=explain(e);}
    const accountRole=computed(()=>owner.value?'Propietario de la plataforma':nationalAdmin.value?'Administrador del país':members.value.some(m=>m.user_id===user.value?.id&&m.role==='coordinator')?'Coordinador responsable':members.value.some(m=>m.user_id===user.value?.id&&m.role==='evaluator')?'Evaluador':'Sin rol asignado');

    async function focusFeedback(){if(passwordChangeOpen.value&&error.value){passwordError.value=error.value;await nextTick();document.getElementById('password-dialog-error')?.focus();return;}await nextTick();document.getElementById(error.value?'workspace-error':'workspace-message')?.focus();}
    async function focusPanel(id){await nextTick();const panel=document.getElementById(id);panel?.scrollIntoView?.({block:'start',behavior:'smooth'});panel?.focus();}
    function checkEmail(){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))throw Error('Escriba un correo válido para continuar.');}
    async function loadSnapshots(){const selected=facilityId.value;snapshots.value=[];comparison.value=[];compareBefore.value='';compareAfter.value='';if(!selected||!user.value)return;const rows=await P.rows('snapshots',{facility_id:selected,purpose:'validation'},'id,evaluation_id,created_at');if(selected===facilityId.value)snapshots.value=rows;}

    async function run(task){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await task();directoryLoaded.value=false;await load();}catch(e){setError(e);if(e.code==='40001')conflict.value=M.clone(actionDraft.value||monitorDraft.value||{});if(user.value)pendingExport.value=Boolean(await P.pendingExport().catch(()=>null));}finally{busy.value=false;if(error.value||message.value)await focusFeedback();}}
    async function load(){
      if(!user.value||navigator.onLine===false)return;const id=user.value.id;if(loadPromise&&loadUser===id)return loadPromise;if(facilityRefresh){await facilityRefresh;if(user.value?.id!==id)return;if(loadPromise&&loadUser===id)return loadPromise;}loadUser=id;const work=performLoad(id);loadPromise=work;try{return await work;}finally{if(loadPromise===work){loadPromise=null;loadUser=null;}}
    }
    async function performLoad(loadingUser){
      syncing.value=true;try{const loadedProfile=await P.accountStatus();if(user.value?.id!==loadingUser)return;profile.value=loadedProfile;if(!profile.value?.ready)return;
      const tables=['countries','country_members','owners','facilities','teams','team_members','assignments','evaluations','participants'];
      const values=await Promise.all(tables.map(t=>P.rows(t)));const refs=[countries,countryMembers,owners,facilities,teams,members,assignments,evaluations,participants];
      const scope=[...new Set([...values[3].map(f=>f.id),...Object.keys(progressRevisions)])];
      const delta=P.progressSync?await P.progressSync(progressRevisions,scope):null,loadedCompletion=delta?delta.progress:await P.progress();
      await expandProgress(loadedCompletion);if(user.value?.id!==loadingUser)return;
      const nextCompletion=delta?{...completion.value}:{};if(delta){const changed=new Set(delta.changed);for(const e of evaluations.value)if(changed.has(e.facility_id))delete nextCompletion[e.id];progressRevisions=delta.revisions;}
      values.forEach((v,i)=>refs[i].value=v);completion.value={...nextCompletion,...loadedCompletion};
      if(owner.value&&accountForm.value.role!=='admin')accountForm.value.role='admin';
      if(!countryId.value&&countries.value.length)countryId.value=facilities.value.find(f=>f.id===facilityId.value)?.country_id||countries.value[0].id;
      if(nationalAdmin.value&&!managedCountries.value.some(c=>c.id===countryId.value))countryId.value=managedCountries.value[0]?.id||'';
      if(!facilityId.value&&countryFacilities.value.length)facilityId.value=countryFacilities.value[0].id;
      const loadedPending=Boolean(await P.pendingExport());if(user.value?.id!==loadingUser)return;pendingExport.value=loadedPending;
      const selected=facilityId.value;if(selected){const loadedSnapshots=await P.rows('snapshots',{facility_id:selected,purpose:'validation'},'id,evaluation_id,created_at');if(user.value?.id!==loadingUser)return;if(facilityId.value===selected)snapshots.value=loadedSnapshots;}
      await loadFacilityContext();
      if(profile.value.can_manage&&view.value==='users')await loadDirectory(true);
      if(user.value?.id!==loadingUser)return;lastFullCheck=Date.now();autoSucceeded();syncFailed.value=false;if(networkFeedback){error.value='';networkFeedback=false;}if(!actionDraft.value&&!monitorDraft.value){lastSyncedAt.value=new Date().toISOString();await formStore().write('lastSync',lastSyncedAt.value);}
      }catch(e){if(user.value?.id!==loadingUser)return;autoFailed();syncFailed.value=true;throw e;}finally{if(user.value?.id===loadingUser)syncing.value=false;}
    }
    async function loadDirectory(force=false){
      const actor=user.value?.id;if(!actor||!profile.value?.can_manage)return;if(directoryPromise&&directoryUser===actor)return directoryPromise;if(directoryLoaded.value&&!force)return;directoryUser=actor;
      const work=Promise.all([P.accountAction('list'),P.accountAction('audit')]).then(([directory,audit])=>{if(user.value?.id!==actor)return;accountUsers.value=directory.users;accountEvents.value=audit.events;directoryLoaded.value=true;});directoryPromise=work;try{await work;}finally{if(directoryPromise===work)directoryPromise=null;}
    }
    async function refreshFacilities(ids){
      const actor=user.value?.id;if(!actor||!ids.length||navigator.onLine===false)return;
      if(loadPromise&&loadUser===actor)await loadPromise;
      const current=P.evaluationsFor?await P.evaluationsFor(ids):(await Promise.all(ids.map(id=>P.rows('evaluations',{facility_id:id})))).flat(),delta=P.progressSync?await P.progressSync(progressRevisions,ids):null,progress=delta?delta.progress:await P.progress(ids);
      if(user.value?.id!==actor)return;
      const affected=new Set(ids),changed=new Set(delta?delta.changed:ids);if(delta){for(const id of delta.changed)delete progressRevisions[id];progressRevisions={...progressRevisions,...delta.revisions};}
      await expandProgress(progress);
      if(user.value?.id!==actor)return;
      const next={...completion.value};for(const e of evaluations.value)if(changed.has(e.facility_id))delete next[e.id];evaluations.value=[...evaluations.value.filter(e=>!affected.has(e.facility_id)),...current];completion.value={...next,...progress};
      if(affected.has(facilityId.value))await loadFacilityContext();
      if(user.value?.id!==actor)return;autoSucceeded();syncFailed.value=false;if(networkFeedback){error.value='';networkFeedback=false;}
      if(!actionDraft.value&&!monitorDraft.value){lastSyncedAt.value=new Date().toISOString();await formStore().write('lastSync',lastSyncedAt.value);}
    }
    async function drainFacilities(){
      if(Date.now()<autoRetryAt)return;
      if(facilityRefresh)return facilityRefresh;
      const actor=user.value?.id;const work=(async()=>{if(dirtyFacilities.size&&user.value?.id===actor&&navigator.onLine!==false){const ids=[...dirtyFacilities];dirtyFacilities.clear();try{await refreshFacilities(ids);}catch(e){if(user.value?.id===actor){ids.forEach(id=>dirtyFacilities.add(id));autoFailed();syncFailed.value=true;setError(e);}}}})();
      facilityRefresh=work;try{await work;}finally{if(facilityRefresh===work)facilityRefresh=null;if(dirtyFacilities.size&&!syncFailed.value){clearTimeout(timer);timer=setTimeout(drainFacilities,500);}}
    }
    function changedFacility(payload){const id=payload?.new?.facility_id||payload?.old?.facility_id;if(!id)return;const actor=user.value?.id;if(!actor)return;if(dirtyActor!==actor){dirtyFacilities.clear();dirtyActor=actor;}dirtyFacilities.add(id);lastActivity=Date.now();clearTimeout(timer);timer=setTimeout(drainFacilities,500);}
    const pendingLoads=new Map();
    async function expandProgress(progress){const fetched=new Set();let id=completionExpanded.value;while(id&&progress[id]&&!fetched.has(id)){fetched.add(id);progress[id]=await (pendingLoads.get(user.value?.id+':'+id)||P.checks(id));id=completionExpanded.value;}}
    async function loadPending(e){const actor=user.value?.id,key=actor+':'+e.id;if(pendingLoads.has(key))return pendingLoads.get(key);completionExpanded.value=e.id;const work=P.checks(e.id).then(data=>{if(user.value?.id===actor)completion.value={...completion.value,[e.id]:data};return data;}).catch(error=>{if(user.value?.id===actor)setError(error);}).finally(()=>pendingLoads.delete(key));pendingLoads.set(key,work);return work;}
    let contextLoad,contextKey;
    async function loadFacilityContext(){const actor=user.value?.id,selected=facilityId.value,scope=view.value;if(!actor||!selected||!['history','plan','monitoring'].includes(scope)){records.value=[];events.value=[];return;}const key=actor+':'+selected+':'+scope;if(contextLoad&&contextKey===key)return contextLoad;contextKey=key;const work=(async()=>{try{const data=scope==='history'?[]:(await Promise.all(['action','monitor'].map(kind=>P.rows('records',{facility_id:selected,kind})))).flat(),audit=scope==='history'?await P.rows('events',{facility_id:selected},'id,facility_id,actor,operation,created_at',{limit:200,ascending:false}):[];if(user.value?.id!==actor||facilityId.value!==selected||view.value!==scope)return;records.value=data;events.value=audit;}catch(e){if(user.value?.id===actor&&facilityId.value===selected&&view.value===scope)throw e;}})();contextLoad=work;try{return await work;}finally{if(contextLoad===work)contextLoad=null;}}
    const refresh=()=>run(async()=>{message.value='Información actualizada.';});
    const retryExport=()=>run(async()=>{await P.retryExport(text=>message.value=text);message.value='Archivado confirmado en Drive.';});
    const roleLabel=r=>({admin:'Administrador nacional',coordinator:'Coordinador responsable',evaluator:'Evaluador'}[r]||r);
    const statusLabel=s=>({draft:'Borrador',editing:'En elaboración',review:'En revisión',validated:'Validada'}[s]||s);
    const teamLabel=id=>teams.value.find(t=>t.id===id)?.name||'Equipo';
    const indicatorLabel=id=>catalog.find(i=>i.id===id)?.title||id;
    const operationLabel=op=>({country:'Registro de país',facility:'Registro de establecimiento',team:'Creación de equipo',assign:'Asignación de equipo',invite:'Invitación',accept_invite:'Invitación aceptada',revoke_invite:'Invitación revocada',remove_member:'Retiro de acceso',evaluation:'Creación de evaluación',complete_evaluation:'Comprobación y cierre de evaluación',evaluation_status:'Cambio de estado de evaluación',save_record:'Registro actualizado',monitor_status:'Cambio de estado de monitoreo',participants:'Participantes actualizados',transfer_evaluation:'Transferencia de equipo',export:'Exportación',export_complete:'Archivado confirmado'}[op]||op);
    const actorLabel=id=>id===user.value?.id?'Usted':members.value.find(m=>m.user_id===id)?.name||countryMembers.value.find(m=>m.user_id===id)?.name||'Cuenta registrada';
    const canEditMonitor=m=>members.value.some(member=>member.user_id===user.value?.id&&member.team_id===m.data.team_id&&['coordinator','evaluator'].includes(member.role));
    const canValidateMonitor=m=>members.value.some(member=>member.user_id===user.value?.id&&member.team_id===m.data.team_id&&member.role==='coordinator');
    const formatDate=v=>new Date(v).toLocaleString('es');
    const canCoordinateEvaluation=e=>adminForCountry(facilityCountry(e.facility_id))||participants.value.some(p=>p.evaluation_id===e.id&&p.user_id===user.value?.id&&p.active&&p.role==='coordinator');
    const login=()=>run(async()=>{confirmationNeeded.value=false;try{const result=await P.accountAction('login',{login:email.value,password:password.value});const {error:e}=await P.client.auth.setSession(result.session);if(e)throw e;password.value='';showPassword.value=false;user.value=(await P.requireSession()).user;}catch(e){confirmationNeeded.value=e.code==='EMAIL_CONFIRMATION_REQUIRED';throw e;}});
    const sendConfirmation=()=>run(async()=>{const result=await P.accountAction('send_confirmation',{login:email.value,password:password.value});confirmationSent.value=true;message.value=result.message;});
    watch(email,()=>{confirmationSent.value=false;confirmationNeeded.value=false;});
    const recover=()=>run(async()=>{if(!email.value.trim())throw Error('Escriba su usuario o correo para recuperar el acceso.');const result=await P.accountAction('recover',{login:email.value});message.value=result.message;});
    const cancelPasswordChange=()=>{passwordDialog.value?.close();passwordChangeOpen.value=false;newPassword.value='';confirmPassword.value='';showNewPassword.value=false;showConfirmPassword.value=false;if(error.value===passwordError.value)error.value='';passwordError.value='';passwordReturnFocus?.focus();passwordReturnFocus=null;};
    const openPasswordChange=async event=>{
      if(!profile.value?.ready||busy.value)return;
      newPassword.value='';confirmPassword.value='';showNewPassword.value=false;showConfirmPassword.value=false;passwordError.value='';passwordChangeOpen.value=true;
      const menu=event?.currentTarget?.closest?.('details');passwordReturnFocus=menu?.querySelector?.('summary')||null;menu?.removeAttribute('open');
      await nextTick();passwordDialog.value?.showModal();document.getElementById('dialog-new-password')?.focus();
    };
    const changePassword=()=>run(async()=>{
      if(newPassword.value.length<12||newPassword.value.length>128)throw Error('Use entre 12 y 128 caracteres para la nueva contraseña.');
      if(newPassword.value!==confirmPassword.value)throw Error('Las contraseñas no coinciden. Revise ambos campos.');
      const result=await P.accountAction('complete_password',{new_password:newPassword.value});const {error:e}=await P.client.auth.setSession(result.session);if(e)throw e;
      cancelPasswordChange();recovering.value=false;message.value=result.message;
    });
    const filteredAccounts=computed(()=>accountUsers.value.filter(a=>(showDeletedAccounts.value?a.status==='deleted':a.status!=='deleted')).filter(a=>[a.username,a.full_name,a.email,...a.countries.map(c=>c.country_name),...a.teams.map(t=>t.team_name)].join(' ').toLowerCase().includes(accountSearch.value.toLowerCase())));
    const accountRoles=computed(()=>owner.value?[{id:'admin',name:'Administrador del país'}]:[{id:'coordinator',name:'Coordinador responsable'},{id:'evaluator',name:'Evaluador'}]);
    const accountTeams=computed(()=>teams.value.filter(t=>t.country_id===accountForm.value.country_id));
    const accountScopeReady=computed(()=>{const f=accountForm.value;return f.role==='admin'?owner.value&&countries.value.some(c=>c.id===f.country_id):(!owner.value&&countryMembers.value.some(m=>m.user_id===user.value?.id&&m.country_id===f.country_id&&m.role==='admin'))&&accountTeams.value.some(t=>t.id===f.team_id);});
    function suggestAccountUsername(){const f=accountForm.value,c=countries.value.find(c=>c.id===f.country_id);f.username=(f.role==='admin'?!!c:!!f.name.trim())?M.accountUsername({role:f.role,name:f.name,countryName:c?.name}):'';}
    const createAccount=()=>run(async()=>{if(!accountScopeReady.value)throw Error('Seleccione el país y el equipo correspondiente al rol.');accountForm.value.scope=accountForm.value.role==='admin'?'country':'team';suggestAccountUsername();credentials.value=null;sessionStorage.setItem('wash-account-create:'+user.value.id,JSON.stringify(M.clone(accountForm.value)));const result=await P.accountAction('create',M.clone(accountForm.value));credentials.value={...result,username:result.username||accountForm.value.username};message.value=result.message;sessionStorage.removeItem('wash-account-create:'+user.value.id);if(result.needs_reset)message.value+=' Genere otra contraseña temporal desde la lista de usuarios.';accountForm.value.request_id=crypto.randomUUID();accountForm.value.username='';accountForm.value.name='';accountForm.value.email='';});
    const resetAccount=a=>run(async()=>{if(!confirm('Se invalidará el acceso de las sesiones anteriores y se generará otra contraseña temporal para '+a.username+'. ¿Continuar?'))return;const result=await P.accountAction('reset_password',{user_id:a.user_id});credentials.value={...result,username:a.username};message.value=result.message;});
    const deleteAccount=a=>run(async()=>{if(!confirm('Eliminar la cuenta de '+a.username+' bloqueará sus sesiones y retirará todos sus accesos. Su correo y usuario quedarán libres para crear otra cuenta desde cero. La cuenta anterior quedará cerrada y no se restaurará; su autoría histórica se conserva. ¿Eliminar cuenta y liberar correo?'))return;const result=await P.accountAction('delete',{user_id:a.user_id});credentials.value=null;profileForm.value=null;roleForm.value.user_id='';message.value=result.message;});
    const setAccountState=(a,action)=>run(async()=>{if(!confirm((action==='suspend'?'Se bloqueará el acceso de ':'Se reactivará la cuenta de ')+a.username+'. ¿Continuar?'))return;const result=await P.accountAction(action,{user_id:a.user_id});message.value=result.message;});
    const editAccountProfile=a=>{profileForm.value={user_id:a.user_id,username:a.username,name:a.full_name};focusPanel('profile-form');};
    const saveAccountProfile=()=>run(async()=>{const result=await P.accountAction('rename',M.clone(profileForm.value));profileForm.value=null;message.value=result.message;});
    const editAccountRole=(a,scope,membership)=>{roleForm.value={user_id:a.user_id,scope,role:membership?.role||'evaluator',team_id:membership?.team_id||'',country_id:membership?.country_id||countryId.value};focusPanel('role-form');};
    const myParticipation = id => members.value.find(m=>m.user_id===user.value?.id&&m.team_id===id)?.role||'';
    const setMyParticipation = async (t,event) => {
      const control=event.target,role=control.value;
      await run(async()=>{
        if(!nationalAdmin.value||!managedCountries.value.some(c=>c.id===t.country_id)||!teams.value.some(team=>team.id===t.id&&team.country_id===t.country_id)||!['','coordinator','evaluator'].includes(role))throw Error('FORBIDDEN');
        if(myParticipation(t.id)===role)return;
        await P.accountAction('set_role',{user_id:user.value.id,scope:'team',team_id:t.id,role:role||'remove'});
        message.value=(role?'Su participación en '+t.name+' es '+roleLabel(role)+'.':'Se retiró su participación en '+t.name+'.')+' Conserva su rol de administrador del país.';
      });
      control.value=myParticipation(t.id);
    };
    const manageTeamMembers=async t=>{
      if(!nationalAdmin.value||!managedCountries.value.some(c=>c.id===t.country_id))return;
      message.value='';error.value='';view.value='users';accountForm.value.country_id=t.country_id;await nextTick();accountForm.value.team_id=t.id;
      await focusPanel('users-section');
    };
    const saveAccountRole=()=>run(async()=>{const result=await P.accountAction('set_role',M.clone(roleForm.value));roleForm.value.user_id='';message.value=result.message;});
    const removeAccountRole=(a,scope,membership)=>run(async()=>{if(!confirm('Se retirará este acceso a '+a.username+'. Su autoría histórica se conserva. ¿Continuar?'))return;const result=await P.accountAction('set_role',{user_id:a.user_id,scope,role:'remove',country_id:membership.country_id,team_id:membership.team_id});message.value=result.message;});
    watch(credentials,()=>{copiedCredentials.value=false;});
    watch(accountForm,()=>{if(!busy.value&&user.value&&profile.value?.can_manage&&!credentials.value)sessionStorage.setItem('wash-account-create:'+user.value.id,JSON.stringify(M.clone(accountForm.value)));},{deep:true});
    watch(()=>accountForm.value.role,role=>{accountForm.value.scope=role==='admin'?'country':'team';if(role==='admin')accountForm.value.team_id='';});
    watch(()=>accountForm.value.country_id,()=>{if(!accountTeams.value.some(t=>t.id===accountForm.value.team_id))accountForm.value.team_id='';});
    watch(()=>[accountForm.value.role,accountForm.value.name,accountForm.value.country_id],suggestAccountUsername);
    watch(countryId,()=>{accountForm.value.country_id=countryId.value;accountForm.value.team_id='';});
    async function logout(){credentials.value=null;if(actionDraft.value||monitorDraft.value){if(!confirm('Hay un formulario abierto. Guárdelo antes de salir. ¿Descartar el formulario y cerrar sesión?'))return;}cancelPasswordChange();await P.client.auth.signOut();location.replace('/plataforma.html');}
    const createCountry=()=>run(async()=>{const c=await P.command('country',{code:countryForm.value.code.toUpperCase(),name:countryForm.value.name});await load();countryId.value=c.id;countryForm.value={code:'',name:''};message.value='País creado. Registre su administrador desde Usuarios y permisos.';});
    const createFacility=()=>run(async()=>{if(!nationalAdmin.value||!managedCountries.value.some(c=>c.id===countryId.value))throw Error('FORBIDDEN');const f=await P.command('facility',{country_id:countryId.value,name:facilityName.value});facilityId.value=f.id;facilityName.value='';message.value='Establecimiento creado y seleccionado.';});
    const createTeam=()=>run(async()=>{if(!nationalAdmin.value||!managedCountries.value.some(c=>c.id===countryId.value))throw Error('FORBIDDEN');const t=await P.command('team',{country_id:countryId.value,name:teamName.value});teamId.value=t.id;teamName.value='';message.value='Equipo creado y seleccionado. Asígnelo al establecimiento y cree la cuenta del coordinador en Usuarios y permisos.';});
    const assignTeam=()=>run(async()=>{await P.command('assign',{facility_id:facilityId.value,team_id:teamId.value});message.value='Equipo asignado al establecimiento.';});
    const transferEvaluation=e=>run(async()=>{if(!adminForCountry(facilityCountry(e.facility_id))||!transferOptions(e).some(t=>t.id===transferTeams.value[e.id]))throw Error('Seleccione otro equipo activo del mismo país que tenga coordinador.');if(!confirm('El equipo seleccionado quedará asignado al establecimiento y recibirá el acceso a la evaluación. Se conservarán la autoría y las versiones históricas. ¿Continuar?'))return;await P.command('transfer_evaluation',{evaluation_id:e.id,team_id:transferTeams.value[e.id],version:e.version});transferTeams.value[e.id]='';message.value='Equipo responsable transferido. El nuevo equipo tiene acceso a la evaluación.';});
    const participant=(e,m,remove)=>run(()=>P.command('participants',{evaluation_id:e.id,user_id:m.user_id,remove}));
    async function makeEvaluation(id){if(!canCreateAt(facilityId.value))throw Error('FORBIDDEN');return P.command('evaluation',{...(id?{id}:{}),facility_id:facilityId.value,team_id:evaluationTeam.value,kind:facilityEvaluations.value.length?'reassessment':'initial',previous_id:previousId.value||null},id||crypto.randomUUID());}
    const checkAndComplete=e=>run(async()=>{const result=await P.checks(e.id);completion.value={...completion.value,[e.id]:result};completionExpanded.value=e.id;if(!result.complete){message.value='Campos pendientes: '+result.issues.length+'. Abra los enlaces Corregir para completar los pasos.';return;}try{await P.command('complete_evaluation',{evaluation_id:e.id,version:e.version});}catch(error){const latest=await P.checks(e.id);completion.value={...completion.value,[e.id]:latest};if(!latest.complete){message.value='La evaluación cambió durante la comprobación. Revise los '+latest.issues.length+' pendientes actualizados.';return;}throw error;}message.value='Evaluación completada. Se conservó su versión histórica; el monitoreo continúa disponible.';});
    const evaluationStatus=(e,status)=>run(async()=>{if(e.status==='validated'&&status==='editing'&&!canCorrect(e))throw Error('FORBIDDEN');if(status==='validated'&&!confirm('Se conservará una versión de la medición y del plan a esta fecha. El monitoreo continuará disponible. ¿Validar?'))return;const reason=e.status==='validated'&&status==='editing'?prompt('Motivo de la corrección (al menos 10 caracteres). Se conservará la versión validada anterior.'):undefined;if(e.status==='validated'&&!reason)return;await P.command('evaluation_status',{evaluation_id:e.id,version:e.version,status,...(reason?{reason}:{})});});
    function newAction(){actionDraft.value={facility_id:facilityId.value,kind:'action',record_key:crypto.randomUUID(),data:{indicator_id:catalog[0].id,action:'',resources:'',responsible:'',targetDate:'',cost:null,trackingStatus:'No Iniciado',change_reason:'Acción inicial',monitor_id:''}};focusPanel('action-form');}
    function editAction(a){actionDraft.value={...M.clone(a),syncBase:M.clone(a.data)};actionDraft.value.data.change_reason='';focusPanel('action-form');}
    function fieldRequest(draft,data=draft.data){const {syncBase,...request}=draft;return {...request,data,field_changes:M.fieldChanges(syncBase||{},data)};}
    const saveAction=()=>run(async()=>{await P.command('save_record',fieldRequest(actionDraft.value));actionDraft.value=null;await clearSavedForms();message.value='Acción guardada en el plan de mejora.';});
    function newMonitor(){monitorDraft.value={facility_id:facilityId.value,kind:'monitor',record_key:crypto.randomUUID(),data:{team_id:facilityTeams.value.find(t=>members.value.some(m=>m.team_id===t.id&&m.user_id===user.value?.id&&['coordinator','evaluator'].includes(m.role)))?.id||'',date:WashCore.localDate(),title:'',participants:'',findings:'',correctiveMeasures:'',responsible:'',nextReviewDate:'',items:[],photos:[]}};focusPanel('monitor-form');}
    function editMonitor(m){monitorDraft.value={...M.clone(m),syncBase:M.clone(m.data)};focusPanel('monitor-form');}
    const saveMonitor=()=>run(async()=>{let m=monitorDraft.value;if(!m.id){const photos=m.data.photos||[];m=await P.command('save_record',fieldRequest(m,{...m.data,photos:[]}));m.syncBase=M.clone(m.data);m.data.photos=photos;monitorDraft.value=m;}const data=await P.uploadPhotos(m.data,m.facility_id,m.id);await P.command('save_record',fieldRequest(m,data));monitorDraft.value=null;await clearSavedForms();message.value='Borrador de monitoreo guardado.';});
    async function monitorPhotos(event){try{const list=monitorDraft.value.data.photos||=[];for(const f of event.target.files){if(list.length>=20||f.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('Máximo 20 fotografías de hasta 5 MB.');list.push(await P.resizePhoto(f));}}catch(e){setError(e);}event.target.value='';}
    const monitorStatus=(m,status)=>run(()=>P.command('monitor_status',{id:m.id,version:m.version,status}));
    const viewEvidence=m=>run(async()=>{const [r]=await P.hydratePhotos([{kind:'general',data:{photos:m.data.photos||[]}}]);evidence.value=r.data.photos;if(!evidence.value.length)message.value='Este registro no contiene evidencias.';});
    function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    const exportReport=(e,snapshotId)=>run(async()=>{await P.exportFiles(e?.id,e?.facility_id||facilityId.value,text=>message.value=text,false,typeof snapshotId==='string'?snapshotId:undefined);message.value='JSON y PDF descargados y confirmados en Drive.';});
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
      if(!members.value.some(m=>m.team_id===evaluationTeam.value&&m.user_id===user.value.id&&['coordinator','evaluator'].includes(m.role)))throw Error('Para importar debe participar en el equipo seleccionado. El administrador puede asignar su cuenta al equipo desde Usuarios y permisos.');
      const data=WashCore.normalizeDataset(input,INDICATORS_DATA);
      // El ID y las operaciones se conservan durante un reintento de esta misma importación.
      const key='wash-import:'+user.value.id+':'+facilityId.value;const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));const digest=Array.from(new Uint8Array(fingerprint)).map(x=>x.toString(16).padStart(2,'0')).join('');
      let state=JSON.parse(sessionStorage.getItem(key)||'null');if(state?.digest!==digest)state={digest,id:crypto.randomUUID(),done:{}};sessionStorage.setItem(key,JSON.stringify(state));
      let evaluation=evaluations.value.find(e=>e.id===state.id);if(!evaluation)evaluation=await makeEvaluation(state.id);
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
    watch(countryId,()=>{if(!countryFacilities.value.some(f=>f.id===facilityId.value))facilityId.value='';if(!countryTeams.value.some(t=>t.id===teamId.value))teamId.value='';});
    watch(view,()=>{loadFacilityContext().catch(setError);if(view.value==='users')loadDirectory(true).catch(setError);});
    watch(facilityId,()=>{loadFacilityContext().catch(setError);loadSnapshots().catch(e=>setError(e));actionDraft.value=null;monitorDraft.value=null;evidence.value=[];evaluationTeam.value='';previousId.value='';});
    watch([actionDraft,monitorDraft],()=>{if(!user.value||!actionDraft.value&&!monitorDraft.value)return;const store=formStore(),key='forms:'+facilityId.value,data=M.clone({action:actionDraft.value,monitor:monitorDraft.value});formQueue=formQueue.catch(()=>{}).then(()=>store.write(key,data)).catch(()=>{error.value='No se pudo conservar el formulario en el dispositivo. Guárdelo en la nube antes de salir.';});},{deep:true});
    onMounted(async()=>{
      const openOffline=async()=>{connectionOnline.value=false;offlineMode.value=true;user.value=(await P.session())?.user||null;offlineList.value=await P.offlineEvaluations();lastSyncedAt.value=user.value?await formStore().read('lastSync')||'':'';};
      addEventListener('offline',()=>openOffline().catch(e=>setError(e)));
      addEventListener('online',async()=>{connectionOnline.value=true;if(!offlineMode.value)return;busy.value=true;try{user.value=(await P.session())?.user||null;await load();offlineMode.value=false;error.value='';}catch(e){setError(e);}finally{busy.value=false;}});
      setInterval(()=>{if(!navigator.onLine||!user.value||busy.value||offlineMode.value||Date.now()<autoRetryAt)return;const now=Date.now(),idle=(typeof document!=='undefined'&&document.hidden)||now-lastActivity>60000,interval=(realtimeReady?(idle?120000:60000):15000)*pollFactor;if(dirtyFacilities.size)return drainFacilities();if(syncFailed.value||now-lastFullCheck>=interval)return load().catch(e=>setError(e));},5000);
      addEventListener('focus',()=>{lastActivity=Date.now();autoRetryAt=0;if(navigator.onLine&&user.value)return load().catch(setError);});
      recovering.value=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';sessionStorage.removeItem('wash-pending-invite');if(new URLSearchParams(location.hash.slice(1)).has('invite')){message.value='Las invitaciones anteriores ya no están vigentes. Solicite credenciales al administrador.';history.replaceState(null,'',location.pathname+location.search);}
      try{const cfg=await P.ready;configured.value=cfg.enabled;if(!cfg.enabled)return;
        const {data}=P.client.auth.onAuthStateChange((event,session)=>{if(!navigator.onLine&&!session&&event!=='SIGNED_OUT')return;if(event==='PASSWORD_RECOVERY')recovering.value=true;if(!session||user.value?.id!==session.user.id){dirtyFacilities.clear();dirtyActor='';progressRevisions={};completion.value={};completionExpanded.value='';directoryLoaded.value=false;accountUsers.value=[];accountEvents.value=[];profile.value=null;[countries,countryMembers,owners,facilities,teams,members,assignments,evaluations,participants,records,events].forEach(r=>r.value=[]);evidence.value=[];actionDraft.value=null;monitorDraft.value=null;countryId.value='';facilityId.value='';teamId.value='';}if(!session){cancelPasswordChange();user.value=null;profile.value=null;accountUsers.value=[];accountEvents.value=[];credentials.value=null;return;}user.value=session.user;});authSubscription=data.subscription;
        user.value=(await P.session())?.user||null;if(!navigator.onLine){await openOffline();return;}await load();
        if(user.value&&profile.value?.can_manage){try{const pending=sessionStorage.getItem('wash-account-create:'+user.value.id);if(pending){const draft=JSON.parse(pending);const context=draft.scope==='team'?teams.value.find(t=>t.id===draft.team_id)?.country_id:draft.country_id;if(countries.value.some(c=>c.id===context)){countryId.value=context;await nextTick();if(!['admin','coordinator','evaluator'].includes(draft.role)||(draft.role==='admin'&&!owner.value)||(owner.value&&draft.role!=='admin')){sessionStorage.removeItem('wash-account-create:'+user.value.id);}else{accountForm.value=draft;suggestAccountUsername();}}else sessionStorage.removeItem('wash-account-create:'+user.value.id);}}catch{sessionStorage.removeItem('wash-account-create:'+user.value.id);}}
        const saved=user.value&&await formStore().read('forms:'+facilityId.value);if(saved){const form=saved;actionDraft.value=form.action;monitorDraft.value=form.monitor;message.value='Se recuperó un formulario pendiente en esta sesión.';}
        channel=P.client.channel('wash-workspace').on('postgres_changes',{event:'*',schema:'public',table:'wash_records'},changedFacility).on('postgres_changes',{event:'*',schema:'public',table:'wash_evaluations'},changedFacility).on('postgres_changes',{event:'*',schema:'public',table:'wash_team_members'},()=>{lastFullCheck=0;}).on('postgres_changes',{event:'*',schema:'public',table:'wash_country_members'},()=>{lastFullCheck=0;}).subscribe(status=>{realtimeReady=status==='SUBSCRIBED';if(realtimeReady&&user.value)load().catch(setError);});
        // Revalidar membresías y estados incluso si no llega un evento de revocación.

      }catch(e){setError(e);}finally{busy.value=false;}
    });
    return {refreshFacilities,loadPending,evaluationStatusLabel,evaluationLinkLabel,currentAt,previousAt,canCorrect,visibleEvaluationFacilities,syncView,syncTime,lastSyncedAt,offlineMode,offlineList,completion,completionExpanded,checkAndComplete,confirmationSent,showNewPassword,showConfirmPassword,evaluatorOnly,transferOptions,organizationTeams,teamDirectory,passwordDialog,passwordError,manageTeamMembers,myParticipation,setMyParticipation,openPasswordChange,cancelPasswordChange,confirmPassword,passwordChangeOpen,evaluationChoices,facilitiesInCountry,organizationName,organizationFacilities,selectedStartFacility,creationTeamsFor,chosenEvaluationTeam,adminFacilities,evaluationsAt,activeAt,latestValidatedAt,facilityStatus,nationalAdmin,managedCountries,adminForCountry,facilityNameFor,countryNameFor,facilityCountry,teamsForFacility,canCreateAt,evaluationFacilities,allEvaluations,activeEvaluations,myTeamMembers,teamFacilities,startEvaluation,evaluations,showPassword,showRecoveryHelp,copiedCredentials,iconSvg,initials,roleClass,tabCount,copyCredentials,showDeletedAccounts,deleteAccount,profileForm,editAccountProfile,saveAccountProfile,suggestAccountUsername,profile,accountUsers,accountEvents,accountSearch,confirmationNeeded,credentials,accountForm,roleForm,filteredAccounts,accountRoles,accountTeams,accountScopeReady,sendConfirmation,createAccount,resetAccount,setAccountState,editAccountRole,saveAccountRole,removeAccountRole,operationLabel,actorLabel,canEditMonitor,canValidateMonitor,accountRole,configured,busy,error,message,user,email,password,newPassword,recovering,countries,countryId,facilities,countryFacilities,facilityId,teams,countryTeams,teamId,members,selectedTeamMembers,owner,admin,coordinator,canEditFacility,canManageTeam,facilityTeams,view,tabs:[{id:'evaluations',name:'Evaluaciones'},{id:'organization',get name(){return organizationName.value;}},{id:'users',name:'Usuarios y permisos'},{id:'history',name:'Historial y comparativo'}],countryForm,countryMembers,facilityName,teamName,evaluationTeam,previousId,transferTeams,transferEvaluation,pendingExport,retryExport,facilityEvaluations,participants,actions,monitors,catalog,actionDraft,monitorDraft,conflict,evidence,facilityEvents,snapshots,comparison,compareBefore,compareAfter,compare,login,recover,changePassword,logout,refresh,createCountry,createFacility,createTeam,assignTeam,participant,evaluationStatus,newAction,editAction,saveAction,newMonitor,editMonitor,saveMonitor,monitorPhotos,monitorStatus,viewEvidence,exportReport,importFile,importLegacyDraft,roleLabel,statusLabel,teamLabel,indicatorLabel,formatDate,canCoordinateEvaluation};
  }}).mount('#platform');
})();
