-- Separar las altas globales de las altas nacionales sin alterar accesos existentes.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_role_creation;
revoke all on function wash_private.command_before_role_creation(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_command in ('facility','team','assign','evaluation') and wash_private.owner() then
  raise exception 'COUNTRY_ADMIN_CREATION_REQUIRED' using errcode='42501';
 end if;
 return wash_private.command_before_role_creation(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;

alter function wash_private.account_service(text,uuid,jsonb) rename to account_service_before_role_creation;
revoke all on function wash_private.account_service_before_role_creation(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function wash_private.account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action='reserve' and exists(select 1 from public.wash_owners where user_id=p_actor)
    and (coalesce(p_data->>'scope','')<>'country' or coalesce(p_data->>'role','')<>'admin') then
  raise exception 'OWNER_CREATES_ADMINS_ONLY' using errcode='42501';
 end if;
 return wash_private.account_service_before_role_creation(p_action,p_actor,p_data);
end $$;
revoke all on function wash_private.account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function wash_private.account_service(text,uuid,jsonb) to service_role;
