// Solo el servidor QA local inyecta estos controles. Nunca forma parte de dist.
exports.script=`<script>(()=>{
 const nativeFetch=window.fetch.bind(window),offline=()=>localStorage.getItem('wash-qa-offline')==='1';
 Object.defineProperty(navigator,'onLine',{get:()=>!offline(),configurable:true});
 window.fetch=(url,options)=>offline()&&!String(url).includes('/__qa/')?Promise.reject(new TypeError('QA network offline')):nativeFetch(url,options);
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.createElement('button');button.id='qa-network';button.style='position:fixed;right:12px;top:8px;z-index:99999;font:14px sans-serif;padding:8px';
  const label=()=>button.textContent=offline()?'QA: Reconectar':'QA: Desconectar';label();
  button.onclick=async()=>{const next=!offline();await nativeFetch('/__qa/network?offline='+(next?'1':'0'));if(next)localStorage.setItem('wash-qa-offline','1');else localStorage.removeItem('wash-qa-offline');label();window.dispatchEvent(new Event(next?'offline':'online'));};
  document.body.append(button);
 });
})();</script>`;
