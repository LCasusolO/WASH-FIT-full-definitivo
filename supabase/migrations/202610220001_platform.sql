-- Ejecutar una vez en Supabase SQL Editor. Escrituras exclusivamente mediante RPC.
begin;
create schema if not exists wash_private;
revoke all on schema wash_private from public;
grant usage on schema wash_private to authenticated;

create table wash_private.catalog_keys(key text primary key);
insert into wash_private.catalog_keys values ('A_1a'),('A_1b'),('A_2'),('A_3'),('A_4'),('A_5'),('A_6'),('A_7'),('A_8'),('A_9'),('A_10'),('A_11'),('A_12'),('A_13'),('A_14'),('A_15'),('A_16'),('A_17'),('S_1'),('S_2'),('S_3'),('S_4'),('S_5'),('S_6'),('S_7'),('S_8'),('S_8b'),('S_9a'),('S_9b'),('S_10a'),('S_10b'),('S_11'),('S_12'),('S_13'),('RES_1'),('RES_2'),('RES_3'),('RES_4'),('RES_5'),('RES_6'),('RES_7'),('RES_8'),('RES_9'),('RES_10'),('RES_11'),('RES_12'),('RES_13'),('RES_14'),('RES_15'),('RES_16'),('RES_17'),('RES_18'),('RES_19'),('RES_20'),('H_1'),('H_2'),('H_3'),('H_4'),('H_5'),('L_1'),('L_2'),('L_3'),('L_4'),('L_5'),('L_6'),('L_7'),('L_8'),('L_9'),('L_10'),('L_11'),('L_12'),('L_13'),('L_14'),('L_15'),('L_16'),('E_1'),('E_2'),('E_3'),('E_4'),('E_5'),('E_6'),('E_7'),('E_8'),('E_9'),('E_10'),('E_11'),('E_12'),('E_13'),('M_1'),('M_2'),('M_3'),('M_4'),('M_5'),('M_6'),('M_7'),('M_8'),('M_9'),('M_10'),('M_11'),('M_12');

create table public.wash_owners (user_id uuid primary key references auth.users(id));
create table public.wash_countries (id uuid primary key default gen_random_uuid(), code text unique not null check(length(code)=3), name text not null);
create table public.wash_country_members (country_id uuid references public.wash_countries(id), user_id uuid references auth.users(id), role text not null check(role in ('admin','reader')), name text not null default '', primary key(country_id,user_id));
create table public.wash_facilities (id uuid primary key default gen_random_uuid(), country_id uuid not null references public.wash_countries(id), name text not null, active boolean not null default true);
create table public.wash_teams (id uuid primary key default gen_random_uuid(), country_id uuid not null references public.wash_countries(id), name text not null, active boolean not null default true);
create table public.wash_team_members (team_id uuid references public.wash_teams(id), user_id uuid references auth.users(id), name text not null, role text not null check(role in ('coordinator','evaluator','reader')), primary key(team_id,user_id));
create table public.wash_assignments (team_id uuid references public.wash_teams(id), facility_id uuid references public.wash_facilities(id), primary key(team_id,facility_id));
create table public.wash_evaluations (
  id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.wash_facilities(id), team_id uuid not null references public.wash_teams(id),
  name text not null, kind text not null check(kind in ('initial','reassessment')), previous_id uuid references public.wash_evaluations(id),
  status text not null default 'draft' check(status in ('draft','editing','review','validated')), version integer not null default 1,
  catalog_version text not null default 'wash-fit-2-2026', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.wash_participants (evaluation_id uuid references public.wash_evaluations(id), user_id uuid references auth.users(id), name text not null, role text not null check(role in ('coordinator','evaluator','reader')), active boolean not null default true, primary key(evaluation_id,user_id));
create table public.wash_records (
  id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.wash_facilities(id), evaluation_id uuid references public.wash_evaluations(id),
  kind text not null check(kind in ('general','indicator','action','monitor')), record_key text not null,
  data jsonb not null default '{}', status text not null default 'draft' check(status in ('draft','review','validated')),
  version integer not null default 1, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  check(jsonb_typeof(data)='object'), check(octet_length(data::text)<=8000000),
  check((kind in ('general','indicator') and evaluation_id is not null) or kind in ('action','monitor'))
);
create unique index wash_record_identity on public.wash_records(facility_id,coalesce(evaluation_id,'00000000-0000-0000-0000-000000000000'::uuid),kind,record_key);
create index wash_records_evaluation on public.wash_records(evaluation_id);
create index wash_records_facility on public.wash_records(facility_id);
create index wash_participants_user on public.wash_participants(user_id,evaluation_id);
create table public.wash_events (id bigint generated always as identity primary key, facility_id uuid references public.wash_facilities(id), evaluation_id uuid references public.wash_evaluations(id), actor uuid not null references auth.users(id), operation text not null, target_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());
create table public.wash_snapshots (id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.wash_facilities(id), evaluation_id uuid references public.wash_evaluations(id), record_id uuid references public.wash_records(id), purpose text not null, data jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now());
create table public.wash_exports (id uuid primary key default gen_random_uuid(), snapshot_id uuid not null references public.wash_snapshots(id), facility_id uuid not null references public.wash_facilities(id), created_by uuid not null references auth.users(id), files jsonb, created_at timestamptz not null default now());
create table public.wash_invitations (id uuid primary key default gen_random_uuid(), country_id uuid references public.wash_countries(id), team_id uuid references public.wash_teams(id), email text not null, name text not null, role text not null, token_hash text unique not null, expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked boolean not null default false, created_by uuid not null references auth.users(id), check((country_id is null) <> (team_id is null)));
create table public.wash_operations (user_id uuid references auth.users(id), operation_id uuid, request jsonb not null, result jsonb not null, primary key(user_id,operation_id));
create table public.wash_user_state (user_id uuid references auth.users(id), evaluation_id uuid references public.wash_evaluations(id), data jsonb not null, primary key(user_id,evaluation_id));

create function wash_private.owner() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.wash_owners where user_id=auth.uid()) $$;
create function wash_private.admin(c uuid) returns boolean language sql stable security definer set search_path='' as $$ select wash_private.owner() or exists(select 1 from public.wash_country_members where country_id=c and user_id=auth.uid() and role='admin') $$;
create function wash_private.team_member(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.wash_team_members where team_id=t and user_id=auth.uid()) $$;
create function wash_private.coordinate(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.wash_team_members where team_id=t and user_id=auth.uid() and role='coordinator') $$;
create function wash_private.read_evaluation(e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_evaluations v join public.wash_facilities f on f.id=v.facility_id where v.id=e and (wash_private.admin(f.country_id) or exists(select 1 from public.wash_country_members where country_id=f.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_participants where evaluation_id=e and user_id=auth.uid() and active))) $$;
create function wash_private.read_facility(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_facilities x where x.id=f and (wash_private.admin(x.country_id) or exists(select 1 from public.wash_country_members where country_id=x.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_assignments a where a.facility_id=f and wash_private.team_member(a.team_id)) or exists(select 1 from public.wash_evaluations e join public.wash_participants p on p.evaluation_id=e.id where e.facility_id=f and p.user_id=auth.uid() and p.active))) $$;
create function wash_private.edit_evaluation(e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_evaluations v join public.wash_participants p on p.evaluation_id=v.id where v.id=e and v.status in ('draft','editing') and p.user_id=auth.uid() and p.active and p.role in ('coordinator','evaluator')) $$;
create function wash_private.edit_facility(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_assignments a join public.wash_team_members m on m.team_id=a.team_id where a.facility_id=f and m.user_id=auth.uid() and m.role in ('coordinator','evaluator')) $$;
create function wash_private.coordinate_facility(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_assignments a where a.facility_id=f and wash_private.coordinate(a.team_id)) $$;
create function wash_private.read_country(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select wash_private.admin(c) or exists(select 1 from public.wash_country_members where country_id=c and user_id=auth.uid()) or exists(select 1 from public.wash_teams t where t.country_id=c and wash_private.team_member(t.id)) or exists(select 1 from public.wash_facilities f where f.country_id=c and wash_private.read_facility(f.id)) $$;
create function wash_private.read_record(r uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.wash_records x where x.id=r and case when x.kind in ('general','indicator') then wash_private.read_evaluation(x.evaluation_id) else wash_private.read_facility(x.facility_id) end) $$;

do $$ declare t text; begin
 foreach t in array array['owners','countries','country_members','facilities','teams','team_members','assignments','evaluations','participants','records','events','snapshots','exports','invitations','operations','user_state'] loop
 execute format('alter table public.wash_%I enable row level security',t);
 execute format('revoke all on public.wash_%I from anon, authenticated',t);
 execute format('grant select on public.wash_%I to authenticated',t);
 end loop;
end $$;
create policy owner_read on public.wash_owners for select to authenticated using(user_id=auth.uid() or wash_private.owner());
create policy country_read on public.wash_countries for select to authenticated using(wash_private.read_country(id));
create policy country_member_read on public.wash_country_members for select to authenticated using(user_id=auth.uid() or wash_private.admin(country_id));
create policy facility_read on public.wash_facilities for select to authenticated using(wash_private.read_facility(id));
create policy team_read on public.wash_teams for select to authenticated using(wash_private.admin(country_id) or wash_private.team_member(id));
create policy member_read on public.wash_team_members for select to authenticated using(wash_private.team_member(team_id) or exists(select 1 from public.wash_teams t where t.id=team_id and wash_private.admin(t.country_id)));
create policy assignment_read on public.wash_assignments for select to authenticated using(wash_private.read_facility(facility_id));
create policy evaluation_read on public.wash_evaluations for select to authenticated using(wash_private.read_evaluation(id));
create policy participant_read on public.wash_participants for select to authenticated using(wash_private.read_evaluation(evaluation_id));
create policy record_read on public.wash_records for select to authenticated using(case when kind in ('general','indicator') then wash_private.read_evaluation(evaluation_id) else wash_private.read_facility(facility_id) end);
create policy event_read on public.wash_events for select to authenticated using(case when evaluation_id is not null then wash_private.read_evaluation(evaluation_id) else wash_private.read_facility(facility_id) end);
create policy snapshot_read on public.wash_snapshots for select to authenticated using(case when evaluation_id is not null then wash_private.read_evaluation(evaluation_id) else wash_private.read_facility(facility_id) end);
create policy export_read on public.wash_exports for select to authenticated using(created_by=auth.uid() and exists(select 1 from public.wash_snapshots s where s.id=snapshot_id and case when s.evaluation_id is not null then wash_private.read_evaluation(s.evaluation_id) else wash_private.read_facility(s.facility_id) end));
create policy invitation_read on public.wash_invitations for select to authenticated using(created_by=auth.uid());
-- Los recibos de idempotencia pueden contener versiones históricas privadas.
revoke select on public.wash_operations from authenticated;
create policy state_read on public.wash_user_state for select to authenticated using(user_id=auth.uid() and wash_private.read_evaluation(evaluation_id));

-- Todas las mutaciones y snapshots de un establecimiento comparten el mismo lock.
create function public.wash_command(p_command text,p_data jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); c uuid; f uuid; t uuid; e uuid; rid uuid; out jsonb; old jsonb; current_record public.wash_records; v public.wash_evaluations;
 invitation public.wash_invitations; next_status text; role_name text; snapshot_id uuid; payload jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000000 then raise exception 'INVALID_REQUEST'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_operation::text,0));
 select request,result into old,out from public.wash_operations where user_id=u and operation_id=p_operation;
 if found then
   if old<>jsonb_build_object('command',p_command,'data',p_data) then raise exception 'OPERATION_REUSED'; end if;
   if coalesce(out->>'facility_id',p_data->>'facility_id') is not null and not wash_private.read_facility(coalesce(out->>'facility_id',p_data->>'facility_id')::uuid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if coalesce(out->>'evaluation_id',p_data->>'evaluation_id') is not null and not wash_private.read_evaluation(coalesce(out->>'evaluation_id',p_data->>'evaluation_id')::uuid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   return out;
 end if;
 f:=nullif(p_data->>'facility_id','')::uuid; e:=nullif(p_data->>'evaluation_id','')::uuid; t:=nullif(p_data->>'team_id','')::uuid;
 c:=nullif(p_data->>'country_id','')::uuid; rid:=nullif(p_data->>'id','')::uuid;
 if e is not null then select * into v from public.wash_evaluations where id=e; if not found then raise exception 'NOT_FOUND'; end if; f:=v.facility_id; end if;
 if p_command in ('save_record','monitor_status') and rid is not null then
   select * into current_record from public.wash_records where id=rid;
   if not found then raise exception 'NOT_FOUND'; end if;
   f:=current_record.facility_id; e:=current_record.evaluation_id;
 end if;
 if f is not null then
   perform pg_advisory_xact_lock(hashtextextended(f::text,0));
   select country_id into c from public.wash_facilities where id=f;
   if not found then raise exception 'NOT_FOUND'; end if;
 end if;
 if p_command='country' then
   if not wash_private.owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   insert into public.wash_countries(code,name) values(upper(p_data->>'code'),p_data->>'name') returning to_jsonb(wash_countries.*) into out;
 elsif p_command in ('facility','team') then
   if not wash_private.admin(c) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if length(trim(p_data->>'name')) not between 1 and 300 then raise exception 'NAME_REQUIRED'; end if;
   if p_command='facility' then insert into public.wash_facilities(country_id,name) values(c,p_data->>'name') returning to_jsonb(wash_facilities.*) into out;
   else insert into public.wash_teams(country_id,name) values(c,p_data->>'name') returning to_jsonb(wash_teams.*) into out; end if;
 elsif p_command='assign' then
   if not wash_private.admin(c) or not exists(select 1 from public.wash_teams where id=t and country_id=c and active) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   insert into public.wash_assignments values(t,f) on conflict do nothing; out:='{}';
 elsif p_command='invite' then
   if t is not null then
     select country_id into c from public.wash_teams where id=t;
     if not found or not (wash_private.admin(c) or wash_private.coordinate(t)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
     if p_data->>'role' not in ('coordinator','evaluator','reader') then raise exception 'INVALID_ROLE'; end if;
     if p_data->>'role'='coordinator' and not wash_private.admin(c) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   else
     if not wash_private.owner() or c is null or p_data->>'role' not in ('admin','reader') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   end if;
   if p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_data->>'token_hash' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INVITATION'; end if;
   insert into public.wash_invitations(country_id,team_id,email,name,role,token_hash,created_by)
   values(case when t is null then c end,t,lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->>'token_hash',u)
   returning jsonb_build_object('id',id,'expires_at',expires_at) into out;
 elsif p_command='accept_invite' then
   select * into invitation from public.wash_invitations where token_hash=encode(sha256(convert_to(p_data->>'token','UTF8')),'hex') for update;
   if not found or invitation.revoked or invitation.accepted_at is not null or invitation.expires_at<now() or invitation.email<>(select lower(email) from auth.users where id=u) then raise exception 'INVALID_INVITATION'; end if;
   if invitation.team_id is null then
     if not exists(select 1 from public.wash_owners where user_id=invitation.created_by) then raise exception 'INVITER_REVOKED'; end if;
     if invitation.role='reader' and exists(select 1 from public.wash_country_members where country_id=invitation.country_id and user_id=u and role='admin') and (select count(*) from public.wash_country_members where country_id=invitation.country_id and role='admin')<=1 then raise exception 'LAST_COUNTRY_ADMIN'; end if;
     insert into public.wash_country_members values(invitation.country_id,u,invitation.role,invitation.name) on conflict(country_id,user_id) do update set role=excluded.role,name=excluded.name;
   else
     select country_id into c from public.wash_teams where id=invitation.team_id;
     if not exists(select 1 from public.wash_owners where user_id=invitation.created_by) and not exists(select 1 from public.wash_country_members where country_id=c and user_id=invitation.created_by and role='admin') and not exists(select 1 from public.wash_team_members where team_id=invitation.team_id and user_id=invitation.created_by and role='coordinator' and invitation.role<>'coordinator') then raise exception 'INVITER_REVOKED'; end if;
     -- Una invitación no degrada un coordinador existente.
     insert into public.wash_team_members values(invitation.team_id,u,invitation.name,invitation.role) on conflict(team_id,user_id) do update set name=excluded.name,role=case when wash_team_members.role='coordinator' then 'coordinator' else excluded.role end;
   end if;
   update public.wash_invitations set accepted_at=now() where id=invitation.id; out:='{}';
 elsif p_command='revoke_invite' then
   update public.wash_invitations set revoked=true where id=rid and created_by=u; if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if; out:='{}';
 elsif p_command='remove_member' then
   if t is not null then
     perform pg_advisory_xact_lock(hashtextextended(t::text,0));
     select country_id into c from public.wash_teams where id=t;
     if not (wash_private.admin(c) or wash_private.coordinate(t)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
     select role into role_name from public.wash_team_members where team_id=t and user_id=(p_data->>'user_id')::uuid;
     if role_name='coordinator' and (not wash_private.admin(c) or (select count(*) from public.wash_team_members where team_id=t and role='coordinator')<=1) then raise exception 'LAST_COORDINATOR_OR_FORBIDDEN'; end if;
     if role_name='coordinator' and exists(select 1 from public.wash_evaluations ev join public.wash_participants p on p.evaluation_id=ev.id where ev.team_id=t and ev.status<>'validated' and p.user_id=(p_data->>'user_id')::uuid and p.active and p.role='coordinator' and (select count(*) from public.wash_participants x where x.evaluation_id=ev.id and x.active and x.role='coordinator')<=1) then raise exception 'LAST_EVALUATION_COORDINATOR'; end if;
     delete from public.wash_team_members where team_id=t and user_id=(p_data->>'user_id')::uuid;
     update public.wash_participants set active=false where user_id=(p_data->>'user_id')::uuid and evaluation_id in (select id from public.wash_evaluations where team_id=t);
   else
     if not wash_private.owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
     if exists(select 1 from public.wash_country_members where country_id=c and user_id=(p_data->>'user_id')::uuid and role='admin') and (select count(*) from public.wash_country_members where country_id=c and role='admin')<=1 then raise exception 'LAST_COUNTRY_ADMIN'; end if;
     delete from public.wash_country_members where country_id=c and user_id=(p_data->>'user_id')::uuid;
   end if;
   out:='{}';
 elsif p_command='evaluation' then
   if not (wash_private.admin(c) or wash_private.coordinate(t)) or not exists(select 1 from public.wash_assignments where team_id=t and facility_id=f) or not exists(select 1 from public.wash_team_members where team_id=t and role='coordinator') then raise exception 'TEAM_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
   if exists(select 1 from public.wash_evaluations where facility_id=f and status<>'validated') then raise exception 'ACTIVE_EVALUATION_EXISTS'; end if;
   if exists(select 1 from public.wash_evaluations where facility_id=f) then
     if p_data->>'kind'<>'reassessment' or not exists(select 1 from public.wash_evaluations where id=(p_data->>'previous_id')::uuid and facility_id=f and status='validated') then raise exception 'PREVIOUS_VALIDATED_REQUIRED'; end if;
   elsif p_data->>'kind'<>'initial' then raise exception 'INITIAL_REQUIRED'; end if;
   insert into public.wash_evaluations(id,facility_id,team_id,name,kind,previous_id,created_by) values(coalesce(rid,gen_random_uuid()),f,t,p_data->>'name',p_data->>'kind',nullif(p_data->>'previous_id','')::uuid,u) returning * into v;
   insert into public.wash_participants(evaluation_id,user_id,name,role) select v.id,user_id,name,role from public.wash_team_members where team_id=t;
   out:=to_jsonb(v); e:=v.id;
 elsif p_command='transfer_evaluation' then
   select * into v from public.wash_evaluations where id=e for update;
   if not wash_private.admin(c) or not exists(select 1 from public.wash_assignments where team_id=t and facility_id=f) or not exists(select 1 from public.wash_team_members where team_id=t and role='coordinator') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if v.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
   old:=to_jsonb(v);
   update public.wash_participants set active=false where evaluation_id=e;
   insert into public.wash_participants(evaluation_id,user_id,name,role) select e,user_id,name,role from public.wash_team_members where team_id=t on conflict(evaluation_id,user_id) do update set name=excluded.name,role=excluded.role,active=true;
   update public.wash_evaluations set team_id=t,version=version+1,status=case when status='review' then 'editing' else status end,updated_at=now() where id=e returning to_jsonb(wash_evaluations.*) into out;
 elsif p_command='participants' then
   select * into v from public.wash_evaluations where id=e for update;
   if not (wash_private.admin(c) or wash_private.coordinate(v.team_id)) or v.status='validated' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if p_data->>'remove'='true' then
     if exists(select 1 from public.wash_participants where evaluation_id=e and user_id=(p_data->>'user_id')::uuid and active and role='coordinator') and (select count(*) from public.wash_participants where evaluation_id=e and active and role='coordinator')<=1 then raise exception 'LAST_COORDINATOR'; end if;
     update public.wash_participants set active=false where evaluation_id=e and user_id=(p_data->>'user_id')::uuid;
   else
     insert into public.wash_participants(evaluation_id,user_id,name,role) select e,user_id,name,role from public.wash_team_members where team_id=v.team_id and user_id=(p_data->>'user_id')::uuid on conflict(evaluation_id,user_id) do update set name=excluded.name,role=excluded.role,active=true;
   end if;
   out:='{}';
 elsif p_command='save_record' then
   -- Releer después del lock: nunca escribir usando la versión leída antes de bloquear.
   if rid is not null then
     select * into current_record from public.wash_records where id=rid;
     if current_record.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001',detail=to_jsonb(current_record)::text; end if;
     if current_record.status<>'draft' then raise exception 'RECORD_LOCKED'; end if;
   end if;
   role_name:=coalesce(current_record.kind,p_data->>'kind');
   if role_name in ('general','indicator') then
     if not wash_private.edit_evaluation(e) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   elsif role_name in ('action','monitor') then
     if not wash_private.edit_facility(f) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
     if rid is null and e is not null and not exists(select 1 from public.wash_evaluations where id=e and facility_id=f) then raise exception 'INVALID_SOURCE'; end if;
   else raise exception 'INVALID_KIND'; end if;
   if jsonb_typeof(p_data->'data')<>'object' then raise exception 'INVALID_DATA'; end if;
   if exists(select 1 from jsonb_each(p_data->'data') x where jsonb_typeof(x.value)='string' and length(x.value#>>'{}')>20000) then raise exception 'TEXT_TOO_LONG'; end if;
   if p_data->'data' ? 'photos' and (jsonb_typeof(p_data->'data'->'photos')<>'array' or jsonb_array_length(p_data->'data'->'photos')>20) then raise exception 'INVALID_PHOTOS'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(p_data->'data'->'photos','[]')) photo where jsonb_typeof(photo)<>'object' or photo->>'path' is null or split_part(photo->>'path','/',1)<>f::text or photo->>'path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}\.(jpeg|png|webp)$') then raise exception 'INVALID_PHOTO_REFERENCE'; end if;
   if role_name='general' and coalesce(current_record.record_key,p_data->>'record_key') not in ('general','identification','location','population','team','photos','summary') then raise exception 'INVALID_GENERAL_BLOCK'; end if;

   if role_name='indicator' then
     if not exists(select 1 from wash_private.catalog_keys where key=coalesce(current_record.record_key,p_data->>'record_key')) then raise exception 'INVALID_INDICATOR'; end if;
     if p_data->'data' ? 'score' and p_data->'data'->'score' not in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'null'::jsonb) then raise exception 'INVALID_SCORE'; end if;
     if p_data->'data' ? 'severity' and p_data->'data'->'severity'<>'null'::jsonb and (p_data->'data'->>'severity' !~ '^[0-9]+$' or (p_data->'data'->>'severity')::numeric>10) then raise exception 'INVALID_SEVERITY'; end if;
     if p_data->'data' ? 'likelihood' and p_data->'data'->'likelihood'<>'null'::jsonb and (p_data->'data'->>'likelihood' !~ '^[0-9]+$' or (p_data->'data'->>'likelihood')::numeric>10) then raise exception 'INVALID_LIKELIHOOD'; end if;
   end if;
   if role_name='monitor' then
     if not exists(select 1 from public.wash_assignments a join public.wash_team_members m on m.team_id=a.team_id where a.facility_id=f and a.team_id=(p_data->'data'->>'team_id')::uuid and m.user_id=u and m.role in ('coordinator','evaluator')) then raise exception 'MONITOR_TEAM_REQUIRED' using errcode='42501'; end if;
     if rid is not null and p_data->'data'->>'team_id' is distinct from current_record.data->>'team_id' then raise exception 'MONITOR_TEAM_IMMUTABLE'; end if;
   end if;
   if role_name='action' and nullif(p_data->'data'->>'monitor_id','') is not null and not exists(select 1 from public.wash_records where id=(p_data->'data'->>'monitor_id')::uuid and facility_id=f and kind='monitor' and status='validated') then raise exception 'INVALID_MONITOR_LINK'; end if;

   if rid is null then
     insert into public.wash_records(facility_id,evaluation_id,kind,record_key,data,updated_by) values(f,e,role_name,p_data->>'record_key',p_data->'data',u) returning * into current_record;
   else
     old:=to_jsonb(current_record);
     update public.wash_records set data=p_data->'data',version=version+1,updated_by=u,updated_at=now() where id=rid returning * into current_record;
   end if;
   -- El monitoreo registra hallazgos; no puede modificar respuestas de la evaluación.
   out:=to_jsonb(current_record); rid:=current_record.id;
 elsif p_command='evaluation_status' then
   select * into v from public.wash_evaluations where id=e for update;
   if v.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
   if not (wash_private.admin(c) or exists(select 1 from public.wash_participants where evaluation_id=e and user_id=u and active and role='coordinator')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   next_status:=p_data->>'status';
   if not ((v.status in ('draft','editing') and next_status in ('editing','review')) or (v.status='review' and next_status in ('editing','validated')) or (v.status='validated' and next_status='editing' and coalesce(length(trim(p_data->>'reason')),0)>=10)) then raise exception 'INVALID_TRANSITION'; end if;
   if v.status='validated' and exists(select 1 from public.wash_evaluations where facility_id=f and id<>e and status<>'validated') then raise exception 'ACTIVE_EVALUATION_EXISTS'; end if;
   if v.status='validated' then insert into public.wash_events(facility_id,evaluation_id,actor,operation,target_id,after_data) values(f,e,u,'correction_reason',e,jsonb_build_object('reason',p_data->>'reason')); end if;
   if next_status='validated' then
     if not exists(select 1 from public.wash_records where evaluation_id=e and kind='general') then raise exception 'EMPTY_EVALUATION'; end if;
     payload:=jsonb_build_object('validated_at',now(),'evaluation',to_jsonb(v)||jsonb_build_object('status','validated','version',v.version+1),'records',(select coalesce(jsonb_agg(r),'[]') from public.wash_records r where evaluation_id=e and kind in ('general','indicator')),'participants',(select coalesce(jsonb_agg(p),'[]') from public.wash_participants p where evaluation_id=e),'plan',(select coalesce(jsonb_agg(r),'[]') from public.wash_records r where facility_id=f and kind='action'));
     insert into public.wash_snapshots(facility_id,evaluation_id,purpose,data,created_by) values(f,e,'validation',payload,u);
   end if;
   old:=to_jsonb(v); update public.wash_evaluations set status=next_status,version=version+1,updated_at=now() where id=e returning to_jsonb(wash_evaluations.*) into out;
 elsif p_command='monitor_status' then
   select * into current_record from public.wash_records where id=rid;
   if current_record.kind<>'monitor' or current_record.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
   next_status:=p_data->>'status';
   if not ((current_record.status='draft' and next_status='review' and wash_private.edit_facility(f) and exists(select 1 from public.wash_team_members where team_id=(current_record.data->>'team_id')::uuid and user_id=u and role in ('coordinator','evaluator'))) or (current_record.status='review' and next_status in ('draft','validated') and wash_private.coordinate((current_record.data->>'team_id')::uuid))) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if next_status='validated' then
     payload:=jsonb_build_object('monitor',to_jsonb(current_record),'team',(select coalesce(jsonb_agg(m),'[]') from public.wash_team_members m join public.wash_assignments a on a.team_id=m.team_id where a.facility_id=f and m.team_id=(current_record.data->>'team_id')::uuid));
     insert into public.wash_snapshots(facility_id,record_id,purpose,data,created_by) values(f,rid,'monitor_validation',payload,u);
   end if;
   old:=to_jsonb(current_record); update public.wash_records set status=next_status,version=version+1,updated_by=u,updated_at=now() where id=rid returning to_jsonb(wash_records.*) into out;
 elsif p_command='export' then
   if not wash_private.read_facility(f) or (e is not null and not wash_private.read_evaluation(e)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if nullif(p_data->>'snapshot_id','') is not null then
     select data into payload from public.wash_snapshots where id=(p_data->>'snapshot_id')::uuid and evaluation_id=e and purpose='validation';
     if not found then raise exception 'INVALID_SNAPSHOT'; end if;
   elsif e is not null and v.status='validated' then
     select data into payload from public.wash_snapshots where evaluation_id=e and purpose='validation' order by created_at desc limit 1;
   else
     payload:=jsonb_build_object('evaluation',(select to_jsonb(x) from public.wash_evaluations x where id=e),'records',(select coalesce(jsonb_agg(r),'[]') from public.wash_records r where facility_id=f and (e is null and kind in ('action','monitor') or evaluation_id=e and kind in ('general','indicator'))),'participants',(select coalesce(jsonb_agg(p),'[]') from public.wash_participants p where evaluation_id=e),'plan',(select coalesce(jsonb_agg(r),'[]') from public.wash_records r where facility_id=f and kind='action'));
   end if;
   insert into public.wash_snapshots(facility_id,evaluation_id,purpose,data,created_by) values(f,e,'export',payload,u) returning id into snapshot_id;
   insert into public.wash_exports(snapshot_id,facility_id,created_by) values(snapshot_id,f,u) returning jsonb_build_object('id',id,'snapshot_id',wash_exports.snapshot_id,'data',payload,'created_at',created_at) into out;
 elsif p_command='export_complete' then
   if jsonb_typeof(p_data->'files')<>'array' then raise exception 'INVALID_FILES'; end if;
   update public.wash_exports set files=p_data->'files' where id=rid and created_by=u and wash_private.read_facility(facility_id) returning to_jsonb(wash_exports.*) into out;
   if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 elsif p_command='state' then
   if not wash_private.read_evaluation(e) or octet_length((p_data->'data')::text)>2000 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   insert into public.wash_user_state values(u,e,p_data->'data') on conflict(user_id,evaluation_id) do update set data=excluded.data; out:='{}';
 else raise exception 'UNKNOWN_COMMAND'; end if;
 insert into public.wash_operations values(u,p_operation,jsonb_build_object('command',p_command,'data',p_data),out);
 if p_command<>'state' then insert into public.wash_events(facility_id,evaluation_id,actor,operation,target_id,before_data,after_data) values(f,e,u,p_command,coalesce(rid,e,t,c),old,out); end if;
 return out;
end $$;
revoke all on function public.wash_command(text,jsonb,uuid) from public,anon;
grant execute on function public.wash_command(text,jsonb,uuid) to authenticated;
revoke all on all functions in schema wash_private from public,anon;
grant execute on all functions in schema wash_private to authenticated;

-- Realtime transporta solo filas que el usuario puede consultar mediante RLS.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['wash_records','wash_evaluations','wash_participants','wash_team_members','wash_country_members'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop;
 end if;
end $$;
commit;
