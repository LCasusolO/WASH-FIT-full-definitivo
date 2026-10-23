-- Cerrar reservas de altas interrumpidas para liberar también su usuario pendiente.
do $patch$
declare source text; marker text:='update wash_private.account_retirements set released_at=now() where user_id=uid;';
begin
 source:=pg_get_functiondef('wash_private.account_service(text,uuid,jsonb)'::regprocedure);
 if strpos(source,marker)=0 then raise exception 'RETIREMENT_FINALIZATION_NOT_FOUND';end if;
 source:=replace(source,marker,$replacement$
  update wash_private.account_jobs j set complete=true,target_id=uid
   where not j.complete and (j.target_id=uid or (j.target_id is null
    and j.id::text=(select u.raw_app_meta_data->>'account_operation' from auth.users u where u.id=uid)
    and lower(j.request->>'email')=lower(retired.original_email)));
  update wash_private.account_retirements set released_at=now() where user_id=uid;
 $replacement$);
 execute source;
end $patch$;
