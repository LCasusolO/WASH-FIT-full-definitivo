// Controles exclusivos del servidor QA. No se copian a dist ni a producción.
exports.script=`<script>(()=>{
 let failed=false;const nativeFetch=window.fetch.bind(window);
 window.fetch=(url,options)=>failed&&(/\\/rest\\/|\\/api\\//.test(String(url)))?Promise.reject(new TypeError('Failed to fetch')):nativeFetch(url,options);
 document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('button');b.id='qa-network-failure';b.style='position:fixed;top:6px;right:8px;z-index:99999;font:12px sans-serif;padding:6px';b.textContent='QA: Fallar red';b.onclick=()=>{failed=!failed;b.textContent=failed?'QA: Recuperar red':'QA: Fallar red';};document.body.append(b);});
})();</script>`;
