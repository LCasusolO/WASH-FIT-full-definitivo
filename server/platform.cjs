const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
async function authorize(req, env=process.env, request=fetch) {
  if (env.WASH_MULTIUSER !== 'true') return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw Object.assign(Error('La plataforma no está configurada.'), {status:503});
  const token = req.headers.authorization;
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(token || '')) throw Object.assign(Error('Inicie sesión.'), {status:401});
  const headers = {apikey:env.SUPABASE_PUBLISHABLE_KEY, Authorization:token};
  const userResponse = await request(env.SUPABASE_URL + '/auth/v1/user', {headers,signal:AbortSignal.timeout(15000)});
  const user = await userResponse.json();
  if (!userResponse.ok || !user.id || !user.email_confirmed_at) throw Object.assign(Error('La sesión venció o el correo no está verificado.'), {status:401});
  const read = async path => {
    const response = await request(env.SUPABASE_URL + '/rest/v1/' + path, {headers,signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Object.assign(Error('No se pudo verificar el acceso.'),{status:503});
    return response.json();
  };
  return {user, headers, read};
}
async function exportAccess(access,id) {
  if (!UUID.test(id || '')) throw Object.assign(Error('Seleccione una exportación válida.'),{status:400});
  const rows=await access.read('wash_exports?id=eq.'+id+'&select=id,created_by,facility_id,snapshot_id');
  if (rows.length!==1 || rows[0].created_by!==access.user.id) throw Object.assign(Error('No tiene acceso a esta exportación.'),{status:403});
  return rows[0];
}
module.exports={authorize,exportAccess,UUID};
