const {authorize,exportAccess,exportIdentity}=require('../server/platform.cjs');
const Model=require('../js/platform-model');
const Core=require('../js/core');
const fs=require('node:fs');
const vm=require('node:vm');
const catalog=vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/data/indicators.js'),'utf8')+';INDICATORS_DATA');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={facilityName:'Establecimiento',countryCode:'País',district:'Ciudad',level:'Nivel',type:'Tipo de institución',setting:'Ámbito',populationServed:'Población atendida',ageGroups:'Grupos etarios',under5:'Menores de 5 años',age5to17:'5 a 17 años',over18to59:'18 a 59 años',over60:'60 años o más',evaluationDate:'Fecha de evaluación',latitude:'Latitud',longitude:'Longitud',sanitationSystem:'Sistema de saneamiento',summary:'Resumen y conclusiones',jmpWater:'Información de agua',wasteTreatmentRoute:'Ruta de tratamiento de residuos',wasteSafeTreatment:'Tratamiento seguro de residuos',source:'Fuente',location:'Ubicación',available:'Disponibilidad',action:'Acción',resources:'Recursos',responsible:'Responsable',targetDate:'Plazo',cost:'Costo',trackingStatus:'Estado',indicator_id:'Indicador',change_reason:'Motivo del ajuste',monitor_id:'Monitoreo asociado',date:'Fecha',title:'Título',participants:'Participantes',findings:'Avances y dificultades',correctiveMeasures:'Medidas correctivas',nextReviewDate:'Próxima revisión',items:'Elementos revisados',notes:'Observaciones',change:'Cambio observado',action_id:'Acción asociada',legacy:'Antecedentes importados'};
function table(rows,headers){return '<table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function valueHtml(value){if(Array.isArray(value))return '<ul>'+value.map(v=>'<li>'+valueHtml(v)+'</li>').join('')+'</ul>';if(value&&typeof value==='object')return detail(value);return escape(value);}
function detail(data){return Object.entries(data).filter(([k])=>!['photos','url','selectedS9Option','editor_fields','editor_indicator_id'].includes(k)).map(([k,v])=>'<div><strong>'+escape(labels[k]||k)+':</strong> '+valueHtml(v)+'</div>').join('');}
async function reportHtml({payload,dataset,facility,country,job,mapRequest=fetch}){
  const evaluation=payload.evaluation;
  if(evaluation){
    const monitors=(payload.monitoring||[]).filter(m=>!m.data.editor_indicator_id);
    const supplement=monitors.length?'<section class="report-step"><h2>Registros adicionales de monitoreo</h2>'+monitors.map(m=>'<article><h3>'+escape(m.data.title)+'</h3>'+detail(m.data)+(m.data.photos||[]).filter(p=>p.url).map(p=>'<figure><img src="'+escape(p.url)+'"><figcaption>'+escape(p.name)+'</figcaption></figure>').join('')+'</article>').join('')+'</section>':'';
    const mapHtml=await require('../server/report-map.cjs').render(dataset.generalInfo.latitude,dataset.generalInfo.longitude,{request:mapRequest});
    return require('../server/original-report.cjs').render(dataset,{title:Core.evaluationFileBase({facilityName:facility.name,countryCode:country.code},job.identity?.evaluation||evaluation),facility,country,payload,generatedAt:job.created_at,supplement,mapHtml});
  }
  let body='<h1>WASH FIT · '+escape(evaluation?'Evaluación integral':'Plan de mejora y monitoreo')+'</h1><p>'+escape(country.name)+' · '+escape(facility.name)+'</p><p>Fecha de corte: '+escape(job.created_at)+' · Exportación: '+escape(job.id)+'</p>';
  body+='<h2>Plan de mejora a la fecha de corte</h2>'+(payload.plan||[]).map(a=>'<article><h3>'+escape(a.data.indicator_id)+'</h3>'+detail(a.data)+'</article>').join('');
  if(!evaluation||payload.monitoring?.length)body+='<h2>Paso 5 · Monitoreo, revisión, adaptación y mejora</h2>'+(evaluation?payload.monitoring||[]:payload.records||[]).filter(r=>r.kind==='monitor').map(m=>'<article><h3>'+escape(m.data.title)+'</h3><p>Estado: '+escape(m.status)+'</p>'+detail(m.data)+(m.data.editor_fields?.history?.length?'<h4>Historial de revisiones</h4>'+table(m.data.editor_fields.history.map(h=>[h.recordedAt,h.indicatorChange,h.responsible,h.correctiveMeasures,h.monitoringComments,h.nextReviewDate]),['Fecha','Cambio observado','Responsable','Medidas correctivas','Comentarios','Próxima revisión']):'')+(m.data.photos||[]).filter(p=>p.url).map(p=>'<figure><img src="'+escape(p.url)+'"><figcaption>'+escape(p.name)+'</figcaption></figure>').join('')+'</article>').join('');
  body+=(dataset?.generalInfo.photos||[]).filter(p=>p.url).map(p=>'<figure><img src="'+escape(p.url)+'"><figcaption>'+escape(p.name)+'</figcaption></figure>').join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>WASH FIT</title><style>@page{size:A4 landscape;margin:12mm}body{font:10px Arial;color:#17395b}h1{font-size:22px}h2{font-size:16px;margin-top:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #ccd6df;padding:5px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#e9f3fa}p{white-space:pre-wrap;overflow-wrap:anywhere}article{break-inside:avoid;border-bottom:1px solid #ccc;padding:8px 0}img{max-width:85%;max-height:350px}tr{break-inside:avoid}</style></head><body><div class="report-content">'+body+'</div></body></html>';
}
async function hydrate(records,access,env,request){
  let total=0;
  return Promise.all(records.map(async r=>{
    if(!r.data?.photos)return r;
    const photos=[];
    for(const p of r.data.photos){
      if(!p.path){if(p.url?.startsWith('data:image/'))photos.push(p);continue;}
      if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(jpeg|png|webp)$/.test(p.path))throw Error('Referencia de evidencia inválida.');
      const response=await request(env.SUPABASE_URL+'/storage/v1/object/authenticated/wash-evidence/'+p.path,{headers:access.headers,signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('No se pudo recuperar una evidencia autorizada.');
      const bytes=Buffer.from(await response.arrayBuffer());total+=bytes.length;if(total>20*1024*1024)throw Error('Las evidencias del reporte superan 20 MB.');
      photos.push({name:p.name,url:'data:image/'+p.path.split('.').at(-1)+';base64,'+bytes.toString('base64')});
    }return {...r,data:{...r.data,photos}};
  }));
}
function createHandler({env=process.env,request=fetch}={}){return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const access=await authorize(req,env,request);if(!access)return res.status(503).json({error:'El espacio de trabajo no está activado.'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;const job=await exportAccess(access,body?.exportId);
    const [snapshot]=await access.read('wash_snapshots?id=eq.'+job.snapshot_id+'&select=*');if(!snapshot)throw Object.assign(Error('No tiene acceso a la versión.'),{status:403});
    const [facility]=await access.read('wash_facilities?id=eq.'+job.facility_id+'&select=*');const [country]=await access.read('wash_countries?id=eq.'+facility.country_id+'&select=*');
    const identity=await exportIdentity(access,job,env,request);
    const payload={...snapshot.data,records:await hydrate(snapshot.data.records||[],access,env,request),monitoring:await hydrate(snapshot.data.monitoring||[],access,env,request)};
    let dataset=null;
    if(payload.evaluation){dataset=Core.normalizeDataset(Model.dataset([...payload.records,...payload.monitoring],catalog,Core.defaults(),payload.plan||[]),catalog);}
    const backup={format:'wash-fit-platform',schemaVersion:1,exportId:job.id,exportedAt:snapshot.created_at,facility,country,dataset,payload};
    const html=await reportHtml({payload,dataset,facility,country,job:{...job,identity,created_at:snapshot.created_at}});
    if(Buffer.byteLength(JSON.stringify(backup))+Buffer.byteLength(html)>3500000)return res.status(413).json({error:'El reporte supera el tamaño permitido. Reduzca las fotografías.'});
    return res.status(200).json({dataset:backup,html,fileBaseName:Core.evaluationFileBase(identity,identity.evaluation)});
  }catch(e){return res.status(e.status||502).json({error:e.status?e.message:'No se pudo preparar el reporte. Revise las evidencias y reintente.'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.reportHtml=reportHtml;
