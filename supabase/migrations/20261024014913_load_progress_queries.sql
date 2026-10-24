-- Búsquedas exactas de indicadores, acciones y monitoreo sin recorrer todo el expediente.
create index wash_records_indicator_lookup on public.wash_records(evaluation_id,kind,record_key);
create index wash_records_action_lookup on public.wash_records(facility_id,(data->>'indicator_id'),updated_at desc,id desc) where kind='action';
create index wash_records_monitor_lookup on public.wash_records(facility_id,(data->>'editor_indicator_id'),(data->>'team_id'),updated_at desc,id desc) where kind='monitor';
-- Acumulación en array expandido: evita copiar un JSON creciente por cada campo.
create or replace function wash_private.evaluation_checks(e uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ev public.wash_evaluations;g jsonb:='{}';r record;k record;d jsonb;a jsonb;mon jsonb;items jsonb[]:='{}';steps jsonb;issues jsonb;hospital boolean;visible boolean;key text;label text;okay boolean;n integer;done integer;
begin
 if not wash_private.account_ready() or not wash_private.read_evaluation(e) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into ev from public.wash_evaluations where id=e;if not found then raise exception 'NOT_FOUND';end if;
 for r in select data from public.wash_records where evaluation_id=e and kind='general' order by case when record_key='general' then 0 else 1 end,updated_at,id loop g:=g||r.data;end loop;
 for key,label in select * from (values ('facilityName','Nombre del establecimiento'),('countryCode','País'),('district','Ciudad'),('level','Nivel de atención'),('type','Tipo de institución'),('setting','Ámbito')) x(k,l) loop
  items:=array_append(items,(wash_private.completion_item(1,length(trim(coalesce(g->>key,'')))>0,label,'general','','',key)->0));
 end loop;
 items:=array_append(items,(wash_private.completion_item(1,case when jsonb_typeof(g->'populationServed')='number' then wash_private.number_between(g->'populationServed',0,9007199254740991) and trunc((g->>'populationServed')::numeric)=(g->>'populationServed')::numeric else false end,'Población Atendida Total','general','','','populationServed')->0));
 items:=array_append(items,(wash_private.completion_item(1,wash_private.valid_date(g->>'evaluationDate'),'Fecha de evaluación','general','','','evaluationDate')->0));
 items:=array_append(items,(wash_private.completion_item(1,wash_private.number_between(g->'latitude',-90,90) and wash_private.number_between(g->'longitude',-180,180),'Georreferenciación del establecimiento','general','','','latitude')->0));
 items:=array_append(items,(wash_private.completion_item(1,exists(select 1 from public.wash_participants where evaluation_id=e and active and role='coordinator'),'Coordinador del equipo evaluador','general','','','team')->0));
 items:=array_append(items,(wash_private.completion_item(2,g->>'sanitationSystem' in ('alcantarillado','insitu'),'Sistema de saneamiento','assessment','sanitation','S_7','sanitationSystem')->0));
 hospital:=coalesce(lower(g->>'level') ~ 'segundo|tercer|secundari|terciari',false);
 for k in select cat.* from wash_private.catalog_keys cat where cat.key<>'S_8' order by cat.key loop
  visible:=true;
  if k.key='A_1a' and hospital or k.key='A_1b' and not hospital or k.key in ('A_16','RES_16','RES_17','L_13','L_15','L_16','M_11') and not hospital then visible:=false;end if;
  if k.key in ('S_9a','S_10a') and coalesce(g->>'sanitationSystem','')<>'alcantarillado' or k.key in ('S_8b','S_9b','S_10b') and coalesce(g->>'sanitationSystem','')<>'insitu' then visible:=false;end if;
  if k.key='S_13' and not exists(select 1 from public.wash_records where evaluation_id=e and kind='indicator' and record_key='S_11' and data->'score' in ('1'::jsonb,'2'::jsonb)) then visible:=false;end if;
  if not visible then continue;end if;
  select data into d from public.wash_records where evaluation_id=e and kind='indicator' and record_key=k.key;d:=coalesce(d,'{}');
  label:=coalesce(k.metadata->>'title',k.key);
  okay:=d->'score' in ('0'::jsonb,'1'::jsonb,'2'::jsonb) or length(trim(regexp_replace(coalesce(d->>'notes',''),'[•[:space:]]','','g')))>0;
  items:=array_append(items,(wash_private.completion_item(2,okay,label||': respuesta o justificación','assessment',k.metadata->>'module',k.key,'notes')->0));
  if d->'score' not in ('0'::jsonb,'1'::jsonb) or d->'score' is null then continue;end if;
  for key,label in select * from (values ('problemDesc','Descripción del problema'),('associatedRisks','Riesgos asociados'),('severity','Gravedad'),('likelihood','Probabilidad')) x(k,l) loop
   okay:=case when key in ('severity','likelihood') then wash_private.number_between(d->key,0,10) else length(trim(regexp_replace(coalesce(d->>key,''),'[•[:space:]]','','g')))>0 end;
   items:=array_append(items,(wash_private.completion_item(3,okay,k.key||': '||label,'step3',k.metadata->>'module',k.key,key)->0));
  end loop;
  select data into a from public.wash_records where facility_id=ev.facility_id and kind='action' and data->>'indicator_id'=k.key order by updated_at desc,id desc limit 1;a:=coalesce(a,'{}');
  for key,label in select * from (values ('action','Acción de mejora'),('resources','Recursos necesarios'),('responsible','Responsable'),('targetDate','Plazo'),('cost','Costo estimado (0 si no requiere presupuesto)')) x(k,l) loop
   okay:=case when key='targetDate' then wash_private.valid_date(a->>key) when key='cost' then wash_private.number_between(a->key,0,999999999999) else length(trim(regexp_replace(coalesce(a->>key,''),'[•[:space:]]','','g')))>0 end;
   items:=array_append(items,(wash_private.completion_item(4,okay,k.key||': '||label,'step4',k.metadata->>'module',k.key,key)->0));
  end loop;
  select data into mon from public.wash_records where facility_id=ev.facility_id and kind='monitor' and data->>'editor_indicator_id'=k.key and data->>'team_id'=ev.team_id::text order by updated_at desc,id desc limit 1;
  items:=array_append(items,(wash_private.completion_item(5,wash_private.valid_date(coalesce(mon->'editor_fields'->>'nextReviewDate',mon->>'nextReviewDate')),k.key||': Programar fecha de monitoreo','step5',k.metadata->>'module',k.key,'nextReviewDate')->0));
 end loop;
 for n in 3..5 loop
  if exists(select 1 from unnest(items) x where (x->>'step')::int=n-1 and not (x->>'complete')::boolean) then
   items:=array_append(items,(wash_private.completion_item(n,false,'Completar primero el paso '||(n-1),case n when 3 then 'assessment' when 4 then 'step3' else 'step4' end)->0));
  end if;
 end loop;
 select coalesce(jsonb_agg(x order by (x->>'step')::int),'[]') into issues from unnest(items) x where not (x->>'complete')::boolean;
 select jsonb_agg(jsonb_build_object('step',s,'total',(select count(*) from unnest(items) x where (x->>'step')::int=s),'done',(select count(*) from unnest(items) x where (x->>'step')::int=s and (x->>'complete')::boolean),'complete',not exists(select 1 from jsonb_array_elements(issues) x where (x->>'step')::int=s)) order by s) into steps from generate_series(1,5) s;
 n:=cardinality(items);done:=n-jsonb_array_length(issues);
 return jsonb_build_object('evaluation_id',e,'complete',jsonb_array_length(issues)=0,'percent',case when n=0 then 0 when done=n then 100 else least(99,round(100.0*done/n)) end,'steps',steps,'issues',issues);
end $$;

-- La lista recibe porcentajes y cantidad; los enlaces se consultan al desplegarlos.
create function public.wash_evaluation_progress() returns jsonb language sql stable security invoker set search_path='' as $$
 with calculated as materialized (
  select id,wash_private.evaluation_checks(id) as data from public.wash_evaluations where status<>'validated'
 ) select coalesce(jsonb_object_agg(id,(data-'issues')||jsonb_build_object('issues','[]'::jsonb,'issueCount',jsonb_array_length(data->'issues'),'detailsLoaded',false)),'{}'::jsonb) from calculated
$$;
revoke all on function public.wash_evaluation_progress() from public,anon,service_role;
grant execute on function public.wash_evaluation_progress() to authenticated;
