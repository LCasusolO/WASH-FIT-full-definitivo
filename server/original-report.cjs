// La exportación usa la misma plantilla y CSS del reporte de la evaluación.
const fs=require('node:fs'),path=require('node:path');
const {createSSRApp}=require('vue'),{renderToString}=require('vue/server-renderer');
const Core=require('../js/core'),Radar=require('../js/report-radar');
const root=path.join(__dirname,'..');
let template,css;
function sources(){
 if(template)return;
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
 const start=html.indexOf('<div class="report-content">');
 const end=html.indexOf('\n    </section>\n  </div> <!-- Cierre',start);
 if(start<0||end<0)throw Error('No se encontró la plantilla original del reporte.');
 template=html.slice(start,end).trim().replace('<div id="report-map"></div>','<div class="report-static-map" v-html="reportMapHtml"></div>');
 css=fs.readFileSync(path.join(root,'css/styles.css'),'utf8');
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render(dataset,{title,facility,country,payload,generatedAt,supplement='',mapHtml=''}){
 sources();
 const info={...dataset.generalInfo,facilityName:dataset.generalInfo.facilityName||facility.name,countryCode:country.code};
 if(!info.team.length)info.team=(payload.participants||[]).filter(p=>p.active!==false).map(p=>({id:p.user_id,name:p.name,role:p.role==='coordinator'?'Coordinador responsable':'Evaluador',institution:'',responsibility:'',email:''}));
 const visible=dataset.indicators.filter(i=>Core.visibleIndicator(i,info,dataset.indicators));
 const answered=visible.filter(Core.hasAssessmentScore),applicable=visible.filter(i=>!Core.isNotApplicable(i));
 const sum=list=>list.reduce((n,i)=>n+i.score,0),percent=list=>list.length?Math.round(sum(list)/(list.length*2)*100):0;
 const modules=[['water','Agua'],['sanitation','Saneamiento'],['waste','Gestión de Residuos'],['hygiene','Higiene de Manos'],['cleaning','Limpieza Hospitalaria'],['energy','Energía'],['management','Gestión y Administración']].map(([id,name])=>({id,name}));
 const byModule=id=>visible.filter(i=>i.moduleId===id),answeredIn=id=>byModule(id).filter(Core.hasAssessmentScore);
 const risk=i=>i.severity==null||i.severity===''||i.likelihood==null||i.likelihood===''?null:Number(i.severity)+Number(i.likelihood);
 const state={reportMapHtml:mapHtml,generalInfo:info,reportIndicators:visible,reportRisks:visible.filter(i=>i.score!==null),reportPlans:visible.filter(i=>i.score===0||i.score===1||i.action||i.history?.length),
  modulesList:modules,answeredCount:answered.length,totalVisibleIndicators:applicable.length,progressPercentage:applicable.length?Math.round(answered.length/applicable.length*100):0,overallCompliance:percent(answered),
  facilityValuation:answered.length?Core.valuation(answered.length,applicable.length,percent(answered)):{label:'Sin indicadores evaluados'},populationWarning:Core.populationWarning(info),jmpCalculatedStatus:Core.calculateJmp(info,dataset.indicators),reportRadarSvg:Radar.svg(visible,modules),
  getModuleTotalCount:id=>byModule(id).filter(i=>!Core.isNotApplicable(i)).length,getModuleAnsweredCount:id=>answeredIn(id).length,getModuleScoreAchieved:id=>sum(answeredIn(id)),getModulePercentage:id=>percent(answeredIn(id)),
  calculateRiskScore:risk,getRiskLabel:n=>n==null?'Sin evaluar':n>=15?'Alto':n>=8?'Medio':'Bajo',getAssessmentResult:Core.assessmentResult,getResponsibleName:i=>Core.responsibleName(i,info.team),getTrackingStatus:Core.trackingStatus,
  reviewBullets:Core.reviewBullets,reviewHistoryText:Core.reviewHistoryText,changeLabel:Core.changeLabel,formatThousands:n=>Number(n).toLocaleString('es'),formatDate:d=>d?new Date(d+'T12:00:00').toLocaleDateString('es'):''};
 const rendered=await renderToString(createSSRApp({template,setup:()=>state}));
 const metadata='<p>'+escape(country.name)+' · '+escape(payload.evaluation.name)+' · Fecha de corte: '+escape(generatedAt)+'</p>';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+escape(title)+'</title><style>body{font-family:Arial,sans-serif}'+css.replace(/<\/style/gi,'<\\/style')+'</style></head><body><section class="print-report report-open">'+rendered.replace(/(<h1>[^<]*<\/h1>)/,'$1'+metadata).replace(/<section class="report-step" data-report-step="6"/,supplement+'<section class="report-step" data-report-step="6"')+'</section></body></html>';
}
module.exports={render};
