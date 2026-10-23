// Datos completos de QA para pruebas históricas cuyo objetivo no es comprobar campos.
const fs=require('node:fs'),vm=require('node:vm'),Core=require('../../js/core');
const catalog=vm.runInNewContext(fs.readFileSync('js/data/indicators.js','utf8')+';INDICATORS_DATA');
async function fill(db,id){
 await db.exec('reset role');const ev=(await db.query('select * from wash_evaluations where id=$1',[id])).rows[0];
 let g=Core.defaults();for(const r of (await db.query("select data from wash_records where evaluation_id=$1 and kind='general' order by updated_at",[id])).rows)g={...g,...r.data};
 for(const [key,value]of Object.entries({facilityName:'Centro QA',countryCode:'PER',district:'Ciudad QA',populationServed:100,level:'Primer Nivel',type:'Público',setting:'Urbano',sanitationSystem:'alcantarillado',evaluationDate:'2026-10-23',latitude:0,longitude:0}))if(g[key]==null||g[key]==='')g[key]=value;
 const identification=(await db.query("select id from wash_records where evaluation_id=$1 and kind='general' and record_key='identification'",[id])).rows[0];
 if(identification)await db.query('update wash_records set data=$2 where id=$1',[identification.id,JSON.stringify(g)]);else await db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'general','identification',$3,$4)",[ev.facility_id,id,JSON.stringify(g),ev.created_by]);
 for(const i of catalog.filter(i=>i.id!=='S_8')){
  let r=(await db.query("select * from wash_records where evaluation_id=$1 and kind='indicator' and record_key=$2",[id,i.id])).rows[0];
  if(!r){await db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'indicator',$3,$4,$5)",[ev.facility_id,id,i.id,JSON.stringify({score:2}),ev.created_by]);continue;}
  if(![0,1].includes(r.data.score))continue;
  await db.query('update wash_records set data=$2 where id=$1',[r.id,JSON.stringify({problemDesc:'Problema QA',associatedRisks:'Riesgo QA',severity:0,likelihood:0,...r.data})]);
  let action=(await db.query("select * from wash_records where facility_id=$1 and kind='action' and data->>'indicator_id'=$2 order by updated_at desc limit 1",[ev.facility_id,i.id])).rows[0];
  const data={indicator_id:i.id,action:'Acción QA',resources:'Recursos QA',responsible:'Equipo QA',targetDate:'2026-12-31',cost:0,...action?.data};for(const key of ['action','resources','responsible','targetDate','cost'])if(data[key]==null||data[key]==='')data[key]=key==='cost'?0:key==='targetDate'?'2026-12-31':'Dato QA';
  if(action)await db.query('update wash_records set data=$2 where id=$1',[action.id,JSON.stringify(data)]);else await db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'action',$3,$4,$5)",[ev.facility_id,id,'editor:'+i.id,JSON.stringify(data),ev.created_by]);
  const mon={team_id:ev.team_id,editor_indicator_id:i.id,nextReviewDate:'2026-12-31',editor_fields:{nextReviewDate:'2026-12-31'}};
  const existing=(await db.query("select id from wash_records where facility_id=$1 and kind='monitor' and data->>'editor_indicator_id'=$2 limit 1",[ev.facility_id,i.id])).rows[0];
  if(existing)await db.query('update wash_records set data=data||$2::jsonb where id=$1',[existing.id,JSON.stringify(mon)]);else await db.query("insert into wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values($1,$2,'monitor',$3,$4,$5)",[ev.facility_id,id,'editor:'+ev.team_id+':'+i.id+':initial',JSON.stringify(mon),ev.created_by]);
 }
}
module.exports={fill,catalog};
