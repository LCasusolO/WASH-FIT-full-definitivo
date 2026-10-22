module.exports = function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error: 'Método no permitido.'});
  const enabled = process.env.WASH_MULTIUSER === 'true';
  // Solo configuración pública. Nunca devolver una clave secret/service_role.
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (enabled && (!/^https:\/\/[a-z0-9.-]+$/.test(url) || !key.startsWith('sb_publishable_'))) {
    return res.status(503).json({error: 'Falta configurar Supabase. Contacte al administrador.'});
  }
  return res.status(200).json({enabled, ...(enabled ? {url, key} : {})});
};
