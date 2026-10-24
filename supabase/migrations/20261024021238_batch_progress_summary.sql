-- El resumen no necesita construir miles de enlaces que luego se descartan.
-- La función privada comprueba la cuenta y cada evaluación solicitada antes de
-- leer sus registros sin repetir RLS por cada uno de los campos del catálogo.
create function wash_private.batch_progress(requested uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
with ev as materialized (
 select e.id,e.facility_id,e.team_id from public.wash_evaluations e
 where (select wash_private.account_ready()) and e.id=any(requested)
 and e.status<>'validated' and wash_private.read_evaluation(e.id)
), generals as materialized (
 select e.*,coalesce((select jsonb_object_agg(j.key,j.value order by case when r.record_key='general' then 0 else 1 end,r.updated_at,r.id)
 from public.wash_records r cross join lateral jsonb_each(r.data) j where r.evaluation_id=e.id and r.kind='general'),'{}') as g
 from ev e
), visible as materialized (
 select e.id,e.facility_id,e.team_id,k.key,coalesce(r.data,'{}') as d
 from generals e cross join wash_private.catalog_keys k
 left join public.wash_records r on r.evaluation_id=e.id and r.kind='indicator' and r.record_key=k.key
 where k.key<>'S_8'
 and not (k.key='A_1a' and coalesce(lower(e.g->>'level') ~ 'segundo|tercer|secundari|terciari',false))
 and not (k.key in ('A_1b','A_16','RES_16','RES_17','L_13','L_15','L_16','M_11') and not coalesce(lower(e.g->>'level') ~ 'segundo|tercer|secundari|terciari',false))
 and not (k.key in ('S_9a','S_10a') and coalesce(e.g->>'sanitationSystem','')<>'alcantarillado')
 and not (k.key in ('S_8b','S_9b','S_10b') and coalesce(e.g->>'sanitationSystem','')<>'insitu')
 and (k.key<>'S_13' or exists(select 1 from public.wash_records x where x.evaluation_id=e.id and x.kind='indicator' and x.record_key='S_11' and x.data->'score' in ('1'::jsonb,'2'::jsonb)))
), gaps as materialized (
 select v.*,coalesce(a.data,'{}') as a,coalesce(m.data,'{}') as mon from visible v
 left join lateral (select data from public.wash_records x where x.facility_id=v.facility_id and x.kind='action' and x.data->>'indicator_id'=v.key order by updated_at desc,id desc limit 1) a on true
 left join lateral (select data from public.wash_records x where x.facility_id=v.facility_id and x.kind='monitor' and x.data->>'editor_indicator_id'=v.key and x.data->>'team_id'=v.team_id::text order by updated_at desc,id desc limit 1) m on true
 where v.d->'score' in ('0'::jsonb,'1'::jsonb)
), items as (
 select e.id,1 as step,coalesce(x.ok,false) as ok from generals e cross join lateral (values
 (length(trim(coalesce(g->>'facilityName','')))>0),(length(trim(coalesce(g->>'countryCode','')))>0),
 (length(trim(coalesce(g->>'district','')))>0),(length(trim(coalesce(g->>'level','')))>0),
 (length(trim(coalesce(g->>'type','')))>0),(length(trim(coalesce(g->>'setting','')))>0),
 (case when jsonb_typeof(g->'populationServed')='number' then wash_private.number_between(g->'populationServed',0,9007199254740991) and trunc((g->>'populationServed')::numeric)=(g->>'populationServed')::numeric else false end),
 (wash_private.valid_date(g->>'evaluationDate')),
 (wash_private.number_between(g->'latitude',-90,90) and wash_private.number_between(g->'longitude',-180,180)),
 (exists(select 1 from public.wash_participants p where p.evaluation_id=e.id and p.active and p.role='coordinator'))
 ) x(ok)
 union all select id,2,coalesce(g->>'sanitationSystem' in ('alcantarillado','insitu'),false) from generals
 union all select id,2,coalesce(d->'score' in ('0'::jsonb,'1'::jsonb,'2'::jsonb) or length(trim(regexp_replace(coalesce(d->>'notes',''),'[•[:space:]]','','g')))>0,false) from visible
 union all select v.id,3,coalesce(x.ok,false) from gaps v cross join lateral (values
 (length(trim(regexp_replace(coalesce(d->>'problemDesc',''),'[•[:space:]]','','g')))>0),
 (length(trim(regexp_replace(coalesce(d->>'associatedRisks',''),'[•[:space:]]','','g')))>0),
 (wash_private.number_between(d->'severity',0,10)),(wash_private.number_between(d->'likelihood',0,10))) x(ok)
 union all select v.id,4,coalesce(x.ok,false) from gaps v cross join lateral (values
 (length(trim(regexp_replace(coalesce(a->>'action',''),'[•[:space:]]','','g')))>0),
 (length(trim(regexp_replace(coalesce(a->>'resources',''),'[•[:space:]]','','g')))>0),
 (length(trim(regexp_replace(coalesce(a->>'responsible',''),'[•[:space:]]','','g')))>0),
 (wash_private.valid_date(a->>'targetDate')),(wash_private.number_between(a->'cost',0,999999999999))) x(ok)
 union all select id,5,coalesce(wash_private.valid_date(coalesce(mon->'editor_fields'->>'nextReviewDate',mon->>'nextReviewDate')),false) from gaps
), base as materialized (
 select e.id,s.step,count(i.id)::int as total,count(i.id) filter(where i.ok)::int as done
 from ev e cross join generate_series(1,5) s(step) left join items i on i.id=e.id and i.step=s.step group by e.id,s.step
), counts as (
 select b.*,b.total+case when b.step>=3 and exists(select 1 from base prev where prev.id=b.id and prev.step>=2 and prev.step<b.step and prev.done<prev.total) then 1 else 0 end as effective_total from base b
), summary as (
 select id,sum(effective_total)::int as total,sum(done)::int as done,
 jsonb_agg(jsonb_build_object('step',step,'total',effective_total,'done',done,'complete',effective_total=done) order by step) as steps from counts group by id
)
select coalesce(jsonb_object_agg(id,jsonb_build_object('evaluation_id',id,'complete',done=total,'percent',case when total=0 then 0 when done=total then 100 else least(99,round(100.0*done/total)) end,'steps',steps,'issues','[]'::jsonb,'issueCount',total-done,'detailsLoaded',false)),'{}'::jsonb) from summary
$$;
revoke all on function wash_private.batch_progress(uuid[]) from public,anon,service_role;
grant execute on function wash_private.batch_progress(uuid[]) to authenticated;
create or replace function public.wash_evaluation_progress() returns jsonb
language sql stable security invoker set search_path='' as $$
 select wash_private.batch_progress(coalesce(array_agg(id),'{}'::uuid[])) from public.wash_evaluations where status<>'validated'
$$;
