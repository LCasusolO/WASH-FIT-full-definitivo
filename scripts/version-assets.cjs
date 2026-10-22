const path=require('node:path');
// La revisión forma parte del nombre físico, no solo de la consulta de la URL.
function assetFilename(file,revision){
  if(!/^[a-f0-9]{12}$/.test(revision))throw Error('Revisión inválida');
  const ext=path.posix.extname(file);
  return file.slice(0,-ext.length)+'.'+revision+ext;
}
module.exports={assetFilename};
