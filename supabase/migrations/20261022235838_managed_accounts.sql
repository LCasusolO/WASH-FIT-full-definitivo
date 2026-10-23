-- Cuentas administradas. Las contraseñas solo las procesa Supabase Auth.
create table public.wash_accounts(
 user_id uuid primary key references auth.users(id), username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,59}$'),
 full_name text not null default '', status text not null default 'pending' check(status in ('pending','active','suspended')),
 must_change_password boolean not null default true, session_floor timestamptz not null default '-infinity',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.wash_accounts enable row level security;
revoke all on public.wash_accounts from public,anon,authenticated;
grant select on public.wash_accounts to authenticated;
create policy account_self on public.wash_accounts for select to authenticated using(user_id=(select auth.uid()));
insert into public.wash_accounts(user_id,username,full_name,status,must_change_password)
select id,'usuario-'||replace(id::text,'-',''),split_part(email,'@',1),'active',false from auth.users;
-- La cuenta existente mantiene correo y contraseña; puede usar también este usuario.
update public.wash_accounts a set username='propietario' where user_id=(select user_id from public.wash_owners order by user_id limit 1);
create table wash_private.account_jobs(id uuid primary key,actor uuid not null references auth.users(id),request jsonb not null,target_id uuid references auth.users(id),complete boolean not null default false,created_at timestamptz not null default now());
create unique index account_jobs_pending_username on wash_private.account_jobs((request->>'username')) where not complete;
create index account_jobs_actor on wash_private.account_jobs(actor);
create index account_jobs_target on wash_private.account_jobs(target_id);
create table wash_private.account_audit(id bigint generated always as identity primary key,actor uuid references auth.users(id),target_id uuid references auth.users(id),country_id uuid references public.wash_countries(id),operation text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create index account_audit_actor on wash_private.account_audit(actor);
create index account_audit_target on wash_private.account_audit(target_id);
create index account_audit_country_date on wash_private.account_audit(country_id,created_at desc);
create table wash_private.auth_limits(key text primary key,window_start timestamptz not null,count integer not null);
create index auth_limits_window on wash_private.auth_limits(window_start);
alter table wash_private.account_jobs enable row level security;
alter table wash_private.account_audit enable row level security;
alter table wash_private.auth_limits enable row level security;
create policy deny_jobs on wash_private.account_jobs to authenticated using(false) with check(false);
create policy deny_audit on wash_private.account_audit to authenticated using(false) with check(false);
create policy deny_limits on wash_private.auth_limits to authenticated using(false) with check(false);
revoke all on wash_private.account_jobs,wash_private.account_audit,wash_private.auth_limits from public,anon,authenticated;

-- raw_app_meta_data solo lo puede establecer Auth Admin; user_metadata no se utiliza.
create function wash_private.managed_user_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.raw_app_meta_data->>'wash_managed','false')<>'true' then raise exception 'REGISTRATION_CLOSED'; end if;
 return new;
end $$;
create trigger wash_require_managed_account before insert on auth.users for each row execute function wash_private.managed_user_insert();
create function wash_private.managed_user_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.wash_accounts(user_id,username) values(new.id,'usuario-'||replace(new.id::text,'-',''));
 return new;
end $$;
create trigger wash_account_profile after insert on auth.users for each row execute function wash_private.managed_user_profile();

create function wash_private.session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_accounts a join auth.sessions s on s.user_id=a.user_id
 where a.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and s.created_at>=a.session_floor)
$$;
create function wash_private.account_ready() returns boolean language sql stable security definer set search_path='' as $$
 select wash_private.session_valid() and exists(select 1 from public.wash_accounts a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and a.status='active' and not a.must_change_password and u.email_confirmed_at is not null)
$$;
revoke all on function wash_private.session_valid(),wash_private.account_ready() from public,anon;
grant execute on function wash_private.session_valid(),wash_private.account_ready() to authenticated;
-- El bloqueo aplica también a JWT ya emitidos y a llamadas directas a REST/Storage.
do $$ declare p record; begin
 for p in select * from pg_policies where (schemaname='public' and tablename like 'wash_%' and tablename<>'wash_accounts') or (schemaname='storage' and policyname like 'wash_evidence_%') loop
  if p.qual is not null then execute format('alter policy %I on %I.%I using ((select wash_private.account_ready()) and (%s))',p.policyname,p.schemaname,p.tablename,p.qual); end if;
  if p.with_check is not null then execute format('alter policy %I on %I.%I with check ((select wash_private.account_ready()) and (%s))',p.policyname,p.schemaname,p.tablename,p.with_check); end if;
 end loop;
end $$;
alter function wash_private.command(text,jsonb,uuid) rename to legacy_command;
revoke all on function wash_private.legacy_command(text,jsonb,uuid) from public,anon,authenticated;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501'; end if;
 if p_command in ('invite','accept_invite','revoke_invite','remove_member') then raise exception 'USE_ACCOUNT_MANAGEMENT'; end if;
 return wash_private.legacy_command(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
update public.wash_invitations set revoked=true where accepted_at is null;

create function wash_private.account_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('username',a.username,'full_name',a.full_name,'status',a.status,'must_change_password',a.must_change_password,
 'session_valid',wash_private.session_valid(),'ready',wash_private.account_ready(),'owner',exists(select 1 from public.wash_owners where user_id=a.user_id),
 'can_manage',exists(select 1 from public.wash_owners where user_id=a.user_id) or exists(select 1 from public.wash_country_members where user_id=a.user_id and role='admin'),
 'has_access',exists(select 1 from public.wash_owners where user_id=a.user_id) or exists(select 1 from public.wash_country_members where user_id=a.user_id) or exists(select 1 from public.wash_team_members where user_id=a.user_id))
 from public.wash_accounts a where a.user_id=auth.uid()
$$;
revoke all on function wash_private.account_status() from public,anon;
grant execute on function wash_private.account_status() to authenticated;
create function public.wash_account_status() returns jsonb language sql security invoker set search_path='' as $$ select wash_private.account_status() $$;
revoke all on function public.wash_account_status() from public,anon;
grant execute on function public.wash_account_status() to authenticated;

-- Este único punto administrativo solo es invocable por la función de servidor.
create function wash_private.account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.wash_accounts; target public.wash_accounts; c uuid; t uuid; uid uuid; r text; scope text; own boolean; old_role text; job wash_private.account_jobs; result jsonb; count_now integer; k text;
begin
 if p_action='limit' then
  k:=p_data->>'key'; if k !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_REQUEST'; end if;
  delete from wash_private.auth_limits where window_start<now()-interval '1 day';
  insert into wash_private.auth_limits values(k,now(),1) on conflict(key) do update set
   count=case when auth_limits.window_start<now()-interval '15 minutes' then 1 else auth_limits.count+1 end,
   window_start=case when auth_limits.window_start<now()-interval '15 minutes' then now() else auth_limits.window_start end returning count into count_now;
  if count_now>20 then raise exception 'RATE_LIMITED'; end if; return '{}';
 end if;
 if p_action='lookup' then
  select to_jsonb(x) into result from (select u.id,u.email,lookup_ac.username,lookup_ac.status,lookup_ac.must_change_password,u.raw_app_meta_data->>'account_operation' as account_operation from auth.users u join public.wash_accounts lookup_ac on lookup_ac.user_id=u.id
   where lookup_ac.username=lower(trim(p_data->>'login')) or lower(u.email)=lower(trim(p_data->>'login')) limit 1) x;
  return result;
 end if;
 select * into a from public.wash_accounts where user_id=p_actor;
 if not found or a.status<>'active' or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'FORBIDDEN'; end if;
 if p_action in ('rotate_begin','rotate_complete') then
  if p_action='rotate_begin' then update public.wash_accounts set must_change_password=true,session_floor=clock_timestamp(),updated_at=now() where user_id=p_actor;
  else update public.wash_accounts set must_change_password=false,updated_at=now() where user_id=p_actor; end if;
  insert into wash_private.account_audit(actor,target_id,operation) values(p_actor,p_actor,p_action);return '{}';
 end if;
 if a.must_change_password then raise exception 'ACCOUNT_SETUP_REQUIRED'; end if;
 own:=exists(select 1 from public.wash_owners where user_id=p_actor);
 if not own and not exists(select 1 from public.wash_country_members where user_id=p_actor and role='admin') then raise exception 'FORBIDDEN'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.username),'[]') into result from (
   select ac.user_id,ac.username,ac.full_name,ac.status,ac.must_change_password,u.email,u.email_confirmed_at is not null as email_confirmed,
   exists(select 1 from public.wash_owners where user_id=ac.user_id) as is_owner,
   (select coalesce(jsonb_agg(jsonb_build_object('country_id',m.country_id,'country_name',co.name,'role',m.role)),'[]') from public.wash_country_members m join public.wash_countries co on co.id=m.country_id where m.user_id=ac.user_id and (own or exists(select 1 from public.wash_country_members z where z.user_id=p_actor and z.country_id=m.country_id and z.role='admin'))) as countries,
   (select coalesce(jsonb_agg(jsonb_build_object('team_id',m.team_id,'team_name',te.name,'country_id',te.country_id,'role',m.role)),'[]') from public.wash_team_members m join public.wash_teams te on te.id=m.team_id where m.user_id=ac.user_id and (own or exists(select 1 from public.wash_country_members z where z.user_id=p_actor and z.country_id=te.country_id and z.role='admin'))) as teams
   from public.wash_accounts ac join auth.users u on u.id=ac.user_id where own or exists(select 1 from public.wash_country_members mine where mine.user_id=p_actor and mine.role='admin' and (exists(select 1 from public.wash_country_members m where m.user_id=ac.user_id and m.country_id=mine.country_id) or exists(select 1 from public.wash_team_members m join public.wash_teams te on te.id=m.team_id where m.user_id=ac.user_id and te.country_id=mine.country_id)))
  ) x; return result;
 end if;
 if p_action='audit' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select au.id,au.created_at,au.operation,au.details,ac.username as actor,ta.username as target
   from wash_private.account_audit au left join public.wash_accounts ac on ac.user_id=au.actor left join public.wash_accounts ta on ta.user_id=au.target_id
   where own or exists(select 1 from public.wash_country_members m where m.user_id=p_actor and m.role='admin' and m.country_id=au.country_id)
   order by au.id desc limit 100) x;return result;
 end if;
 if p_action='reserve' then
  scope:=p_data->>'scope';t:=nullif(p_data->>'team_id','')::uuid;c:=nullif(p_data->>'country_id','')::uuid;r:=p_data->>'role';
  if scope='team' then select country_id into c from public.wash_teams where id=t; end if;
  if scope is null or r is null or c is null or (scope='country' and (not own or r not in ('admin','reader'))) or (scope='team' and (r not in ('coordinator','evaluator','reader') or not (own or exists(select 1 from public.wash_country_members where country_id=c and user_id=p_actor and role='admin')))) or scope not in ('country','team') then raise exception 'FORBIDDEN'; end if;
  if coalesce(p_data->>'username','') !~ '^[a-z0-9][a-z0-9._-]{2,59}$' or coalesce(length(p_data->>'name'),0) not between 1 and 300 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_ACCOUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(p_data->>'email'),0));
  select * into job from wash_private.account_jobs where id=(p_data->>'request_id')::uuid for update;
  if found then if job.actor<>p_actor or job.request<>p_data then raise exception 'OPERATION_REUSED'; end if;return jsonb_build_object('existing_id',job.target_id,'complete',job.complete,'request_id',job.id);end if;
  select id into uid from auth.users where lower(email)=lower(p_data->>'email');
  if uid is not null and not own and (exists(select 1 from public.wash_owners where user_id=uid) or exists(select 1 from public.wash_country_members where user_id=uid and role='admin')) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.wash_accounts where username=p_data->>'username' and user_id is distinct from uid) then raise exception 'USERNAME_TAKEN';end if;
  if exists(select 1 from wash_private.account_jobs where not complete and request->>'username'=p_data->>'username') then raise exception 'USERNAME_TAKEN';end if;
  insert into wash_private.account_jobs(id,actor,request,target_id) values((p_data->>'request_id')::uuid,p_actor,p_data,uid);
  return jsonb_build_object('existing_id',uid,'complete',false,'request_id',p_data->>'request_id');
 end if;
 if p_action='cancel_reservation' then
  delete from wash_private.account_jobs j where j.id=(p_data->>'request_id')::uuid and j.actor=p_actor and not j.complete and j.target_id is null and not exists(select 1 from auth.users u where u.raw_app_meta_data->>'account_operation'=j.id::text);
  return '{}';
 end if;
 if p_action='provision' then
  select * into job from wash_private.account_jobs where id=(p_data->>'request_id')::uuid and actor=p_actor for update;
  if not found then raise exception 'INVALID_REQUEST';end if;if job.complete then return jsonb_build_object('user_id',job.target_id,'reused',true);end if;
  uid:=(p_data->>'user_id')::uuid;
  if not exists(select 1 from auth.users where id=uid and lower(email)=lower(job.request->>'email')) or (job.target_id is not null and job.target_id<>uid) then raise exception 'INVALID_ACCOUNT';end if;
  if job.target_id is null then
   if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'account_operation'=job.id::text) then raise exception 'INVALID_ACCOUNT';end if;
   update public.wash_accounts set username=job.request->>'username',full_name=job.request->>'name',status='active',updated_at=now() where user_id=uid;
  end if;
  p_data:=job.request||jsonb_build_object('user_id',uid);p_action:='set_role';
 end if;
 uid:=nullif(p_data->>'user_id','')::uuid;select * into target from public.wash_accounts where user_id=uid for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 if p_action in ('reset_begin','suspend','reactivate','rename') then
  if p_action in ('suspend','reactivate','rename') and not own then raise exception 'FORBIDDEN';end if;
  if p_action in ('suspend','reset_begin') and uid=p_actor then raise exception 'CANNOT_LOCK_SELF';end if;
  if not own then
   if exists(select 1 from public.wash_owners where user_id=uid) or exists(select 1 from public.wash_country_members where user_id=uid and role='admin') then raise exception 'FORBIDDEN';end if;
   if not exists(select 1 from public.wash_team_members m join public.wash_teams te on te.id=m.team_id join public.wash_country_members me on me.country_id=te.country_id and me.user_id=p_actor and me.role='admin' where m.user_id=uid) then raise exception 'FORBIDDEN';end if;
   if exists(select 1 from (select country_id from public.wash_country_members where user_id=uid union select te.country_id from public.wash_team_members m join public.wash_teams te on te.id=m.team_id where m.user_id=uid) z where not exists(select 1 from public.wash_country_members me where me.user_id=p_actor and me.role='admin' and me.country_id=z.country_id)) then raise exception 'SHARED_ACCOUNT_OWNER_REQUIRED';end if;
  end if;
  if p_action='suspend' and exists(select 1 from public.wash_owners where user_id=uid) then raise exception 'OWNER_PROTECTED';end if;
  if p_action='suspend' and (
   exists(select 1 from public.wash_country_members m where m.user_id=uid and m.role='admin' and not exists(select 1 from public.wash_country_members x join public.wash_accounts ac on ac.user_id=x.user_id where x.country_id=m.country_id and x.user_id<>uid and x.role='admin' and ac.status='active'))
   or exists(select 1 from public.wash_team_members m where m.user_id=uid and m.role='coordinator' and not exists(select 1 from public.wash_team_members x join public.wash_accounts ac on ac.user_id=x.user_id where x.team_id=m.team_id and x.user_id<>uid and x.role='coordinator' and ac.status='active'))
   or exists(select 1 from public.wash_participants pa join public.wash_evaluations ev on ev.id=pa.evaluation_id where pa.user_id=uid and pa.active and pa.role='coordinator' and ev.status<>'validated' and not exists(select 1 from public.wash_participants x join public.wash_accounts ac on ac.user_id=x.user_id where x.evaluation_id=pa.evaluation_id and x.user_id<>uid and x.active and x.role='coordinator' and ac.status='active'))
  ) then raise exception 'LAST_ACTIVE_RESPONSIBLE';end if;

  if p_action='reset_begin' then update public.wash_accounts set must_change_password=true,session_floor=clock_timestamp(),updated_at=now() where user_id=uid;end if;
  if p_action='suspend' then update public.wash_accounts set status='suspended',session_floor=clock_timestamp(),updated_at=now() where user_id=uid;end if;
  if p_action='reactivate' then update public.wash_accounts set status='active',updated_at=now() where user_id=uid;end if;
  if p_action='rename' then update public.wash_accounts set username=lower(p_data->>'username'),full_name=p_data->>'name',updated_at=now() where user_id=uid;end if;
 else
  if p_action<>'set_role' then raise exception 'INVALID_REQUEST';end if;
  scope:=p_data->>'scope';t:=nullif(p_data->>'team_id','')::uuid;c:=nullif(p_data->>'country_id','')::uuid;r:=p_data->>'role';
  if scope='team' then select country_id into c from public.wash_teams where id=t;end if;
  if scope is null or r is null or c is null or (scope='country' and (not own or r not in ('admin','reader','remove'))) or (scope='team' and (r not in ('coordinator','evaluator','reader','remove') or not (own or exists(select 1 from public.wash_country_members where country_id=c and user_id=p_actor and role='admin')))) or scope not in ('country','team') then raise exception 'FORBIDDEN';end if;
  if not own and exists(select 1 from public.wash_owners where user_id=uid) then raise exception 'FORBIDDEN';end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(t,c)::text,0));
  if scope='country' then
   select role into old_role from public.wash_country_members where country_id=c and user_id=uid;
   if old_role='admin' and r<>'admin' and not exists(select 1 from public.wash_country_members m join public.wash_accounts ac on ac.user_id=m.user_id where m.country_id=c and m.user_id<>uid and m.role='admin' and ac.status='active') then raise exception 'LAST_COUNTRY_ADMIN';end if;
   if r='remove' then delete from public.wash_country_members where country_id=c and user_id=uid;
   else insert into public.wash_country_members(country_id,user_id,role,name) values(c,uid,r,target.full_name) on conflict(country_id,user_id) do update set role=excluded.role,name=excluded.name;end if;
  else
   select role into old_role from public.wash_team_members where team_id=t and user_id=uid;
   if old_role='coordinator' and r<>'coordinator' then
    if not exists(select 1 from public.wash_team_members m join public.wash_accounts ac on ac.user_id=m.user_id where m.team_id=t and m.user_id<>uid and m.role='coordinator' and ac.status='active') then raise exception 'LAST_COORDINATOR';end if;
    if exists(select 1 from public.wash_evaluations ev join public.wash_participants pa on pa.evaluation_id=ev.id where ev.team_id=t and ev.status<>'validated' and pa.user_id=uid and pa.active and pa.role='coordinator' and not exists(select 1 from public.wash_participants z where z.evaluation_id=ev.id and z.user_id<>uid and z.active and z.role='coordinator')) then raise exception 'LAST_EVALUATION_COORDINATOR';end if;
   end if;
   if r='remove' then delete from public.wash_team_members where team_id=t and user_id=uid;update public.wash_participants set active=false where user_id=uid and evaluation_id in(select id from public.wash_evaluations where team_id=t);
   else
    insert into public.wash_team_members(team_id,user_id,name,role) values(t,uid,target.full_name,r) on conflict(team_id,user_id) do update set role=excluded.role,name=excluded.name;
    update public.wash_participants set role=r,name=target.full_name where user_id=uid and active and evaluation_id in(select id from public.wash_evaluations where team_id=t);
    insert into public.wash_participants(evaluation_id,user_id,name,role) select id,uid,target.full_name,r from public.wash_evaluations where team_id=t and status<>'validated' on conflict(evaluation_id,user_id) do update set role=excluded.role,name=excluded.name,active=true;
   end if;
  end if;
 end if;
 if job.id is not null then update wash_private.account_jobs set target_id=uid,complete=true where id=job.id;end if;
 insert into wash_private.account_audit(actor,target_id,country_id,operation,details) values(p_actor,uid,c,p_action,jsonb_build_object('scope',scope,'team_id',t,'role',r,'previous_role',old_role));
 return jsonb_build_object('user_id',uid,'username',(select username from public.wash_accounts where user_id=uid));
end $$;
revoke all on function wash_private.account_service(text,uuid,jsonb) from public,anon,authenticated;
grant usage on schema wash_private to service_role;
grant execute on function wash_private.account_service(text,uuid,jsonb) to service_role;
create function public.wash_account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select wash_private.account_service(p_action,p_actor,p_data) $$;
revoke all on function public.wash_account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wash_account_service(text,uuid,jsonb) to service_role;

revoke all on function wash_private.managed_user_insert(),wash_private.managed_user_profile() from public,anon,authenticated;
