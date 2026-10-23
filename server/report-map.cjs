// Mismo proveedor cartográfico de la evaluación; imágenes incorporadas al PDF.
const cache=new Map();
async function render(latitude,longitude,{request=fetch}={}){
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return '';
 if(Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Coordenadas inválidas para el mapa.');
 const z=14,n=2**z,lat=Math.max(-85.0511,Math.min(85.0511,latitude))*Math.PI/180;
 const px=(longitude+180)/360*n*256,py=(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n*256;
 const left=px-256,top=py-128,tiles=[];
 for(let y=Math.floor(top/256);y<=Math.floor((top+255)/256);y++)for(let x=Math.floor(left/256);x<=Math.floor((left+511)/256);x++)tiles.push({x,y});
 const images=await Promise.all(tiles.map(async({x,y})=>{
  if(y<0||y>=n)return '';
  const url=`https://tile.openstreetmap.org/${z}/${((x%n)+n)%n}/${y}.png`;
  let item=cache.get(url);
  if(!item||Date.now()-item.time>7*86400000){
   let response;for(let attempt=0;attempt<2;attempt++){response=await request(url,{headers:{'User-Agent':'WASH-FIT/2.0 (+https://washfit-full.vercel.app)'},signal:AbortSignal.timeout(10000)});if(response.ok)break;}
   if(!response?.ok)throw Object.assign(Error('No se pudo cargar el mapa del reporte. Revise la conexión y vuelva a exportar.'),{status:502});
   const data=Buffer.from(await response.arrayBuffer());if(data.length>400000||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('El mapa recibido no es válido.');
   item={time:Date.now(),data:data.toString('base64')};cache.set(url,item);if(cache.size>64)cache.delete(cache.keys().next().value);
  }
  return `<image x="${x*256}" y="${y*256}" width="256" height="256" href="data:image/png;base64,${item.data}"/>`;
 }));
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} 512 256" role="img" aria-label="Mapa georreferenciado del establecimiento" style="width:100%;height:240px;border:1px solid #ccd6df"><rect x="${left}" y="${top}" width="512" height="256" fill="#edf3f7"/>${images.join('')}<path d="M ${px} ${py} c -28 -32 -16 -48 0 -48 c 16 0 28 16 0 48" fill="#d93025" stroke="white" stroke-width="2"/><circle cx="${px}" cy="${py-31}" r="5" fill="white"/><rect x="${left}" y="${top+235}" width="512" height="21" fill="white" fill-opacity=".9"/><text x="${left+6}" y="${top+249}" font-family="Arial" font-size="10" fill="#17395b">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</text><text x="${left+506}" y="${top+249}" text-anchor="end" font-family="Arial" font-size="10" fill="#17395b">© OpenStreetMap contributors</text></svg>`;
}
module.exports={render};
