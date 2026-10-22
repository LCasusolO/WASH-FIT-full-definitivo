(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WashRadar=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function svg(indicators,modules){
    const cx=375,cy=240,r=145,n=modules.length;
    const point=(i,scale)=>{const a=i*2*Math.PI/n-Math.PI/2;return [cx+r*scale*Math.cos(a),cy+r*scale*Math.sin(a)];};
    const pairs=points=>points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ');
    let content='';
    for(const level of [20,40,60,80,100]){content+=`<polygon points="${pairs(modules.map((_,i)=>point(i,level/100)))}" fill="none" stroke="#D5E1ED" stroke-width="1"/><text x="380" y="${cy-r*level/100-3}" font-size="10" fill="#64748B">${level}%</text>`;}
    const values=modules.map(mod=>{const done=indicators.filter(i=>i.moduleId===mod.id&&[0,1,2].includes(i.score));return {pct:done.length?Math.round(done.reduce((sum,i)=>sum+i.score,0)/(done.length*2)*100):0,answered:done.length};});
    modules.forEach((mod,i)=>{const [x,y]=point(i,1);content+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#D5E1ED" stroke-width="1"/>`;});
    if(n)content+=`<polygon points="${pairs(values.map((v,i)=>point(i,v.pct/100)))}" fill="#004C97" fill-opacity="0.18" stroke="#004C97" stroke-width="2"/>`;
    modules.forEach((mod,i)=>{const a=i*2*Math.PI/n-Math.PI/2,[x,y]=point(i,1.18),[px,py]=point(i,values[i].pct/100);const anchor=Math.cos(a)>.2?'start':Math.cos(a)<-.2?'end':'middle';const lines=[];for(const word of String(mod.name).split(' ')){if(!lines.length||lines.at(-1).length+word.length>24)lines.push(word);else lines[lines.length-1]+=' '+word;}
      content+=`<circle cx="${px}" cy="${py}" r="3" fill="#004C97"/><text x="${x}" y="${y-8}" text-anchor="${anchor}" font-size="12" font-weight="bold" fill="#153D6A">${lines.map((line,j)=>`<tspan x="${x}" dy="${j?15:0}">${escape(line)}</tspan>`).join('')}<tspan x="${x}" dy="16" fill="#004C97">${values[i].answered?values[i].pct+'%':'Sin evaluar'}</tspan></text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="480" viewBox="0 0 750 480">${content}</svg>`;
  }
  return {svg};
});
