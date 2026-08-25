/* ============ graph ============ */
const GW=176,GH=30,GGAP=13,GCOL=22,GDI=26;

function measure(list){
  let h=0,w=GW;
  list.forEach(n=>{
    if(n.type==='line'){h+=GH+GGAP;return;}
    if(n.type==='jump'){h+=22+GGAP;return;}
    const kids=n.options.map(o=>measure(o.nodes));
    const cw=kids.reduce((a,k)=>a+k.w,0)+GCOL*(kids.length-1);
    h+=GDI+GGAP+22+Math.max(0,...kids.map(k=>k.h))+GDI+GGAP;
    w=Math.max(w,cw);
  });
  return {w,h:Math.max(h,GH)};
}

function draw(list,cx,top){
  let y=top,s='';
  list.forEach(n=>{
    if(n.type==='line'){
      const c=chr(n.speaker)||{name:n.speaker,color:'#938599'};
      s+='<rect class="gr-box" x="'+(cx-GW/2)+'" y="'+y+'" width="'+GW+'" height="'+GH+'" rx="3"/>'+
        '<text class="gr-who" x="'+(cx-GW/2+7)+'" y="'+(y+12)+'" fill="'+c.color+'">'+esc(c.name.toUpperCase())+'</text>'+
        '<text class="gr-t" x="'+(cx-GW/2+7)+'" y="'+(y+23)+'">'+esc(n.text.slice(0,30)+(n.text.length>30?'…':''))+'</text>';
      s+='<path class="gr-line" d="M'+cx+' '+(y+GH)+' L'+cx+' '+(y+GH+GGAP)+'"/>';
      y+=GH+GGAP;return;
    }
    if(n.type==='jump'){
      s+='<rect x="'+(cx-GW/2)+'" y="'+y+'" width="'+GW+'" height="22" rx="11" fill="rgba(201,162,39,.1)" '+
        'stroke="#C9A227" stroke-dasharray="3 2"/>'+
        '<text class="gr-t" x="'+cx+'" y="'+(y+15)+'" text-anchor="middle" fill="#C9A227">→ '+
        esc((P.content.find(x=>x.id===n.target)?.title||n.target||'unset').slice(0,24))+'</text>';
      y+=22+GGAP;return;
    }
    const kids=n.options.map(o=>measure(o.nodes));
    const cw=kids.reduce((a,k)=>a+k.w,0)+GCOL*(kids.length-1);
    const kh=Math.max(0,...kids.map(k=>k.h));
    s+='<path class="gr-line" d="M'+(cx-11)+' '+(y+13)+' L'+cx+' '+y+' L'+(cx+11)+' '+(y+13)+
      ' L'+cx+' '+(y+26)+' Z" fill="rgba(143,176,138,.18)" stroke="#8FB08A"/>';
    let x=cx-cw/2;
    n.options.forEach((o,i)=>{
      const kcx=x+kids[i].w/2, ly=y+GDI+GGAP;
      s+='<path class="gr-line" d="M'+cx+' '+(y+GDI)+' L'+cx+' '+(y+GDI+6)+' L'+kcx+' '+(y+GDI+6)+' L'+kcx+' '+ly+'"/>';
      s+='<text class="gr-t" x="'+kcx+'" y="'+(ly+10)+'" text-anchor="middle" fill="#8FB08A">'+
        esc(o.text.slice(0,24)+(o.text.length>24?'…':''))+'</text>';
      if(o.requires?.length)s+='<text class="gr-cond" x="'+kcx+'" y="'+(ly+20)+'" text-anchor="middle">'+
        esc(o.requires.map(condLabel).join(' · ').slice(0,30))+'</text>';
      if(o.flag)s+='<text class="gr-cond" x="'+kcx+'" y="'+(ly+(o.requires?.length?29:20))+
        '" text-anchor="middle" fill="#C9A227">'+esc(o.flag)+'</text>';
      s+=draw(o.nodes,kcx,ly+22);
      const bot=ly+22+kids[i].h;
      s+='<path class="gr-line" d="M'+kcx+' '+bot+' L'+kcx+' '+(y+GDI+GGAP+22+kh+8)+
        ' L'+cx+' '+(y+GDI+GGAP+22+kh+8)+' L'+cx+' '+(y+GDI+GGAP+22+kh+GDI)+'"/>';
      x+=kids[i].w+GCOL;
    });
    y+=GDI+GGAP+22+kh+GDI+GGAP;
  });
  return s;
}

function openGraph(){
  const c=cur();if(!c)return;
  $('grTitle').textContent='Flow — '+(c.title||c.id);
  let svg;
  if(c.type==='quest'){
    const rows=(c.stages||[]).map((s,i)=>{
      const y=i*94+14;
      return '<rect class="gr-box" x="20" y="'+y+'" width="300" height="60" rx="4" stroke="#7FA3C4"/>'+
        '<text class="gr-who" x="32" y="'+(y+16)+'" fill="#7FA3C4">STAGE '+(i+1)+'</text>'+
        '<text class="gr-t" x="32" y="'+(y+30)+'" style="font-size:11px">'+esc(s.title)+'</text>'+
        '<text class="gr-cond" x="32" y="'+(y+42)+'" fill="#938599">'+
          esc(loc(s.location)?.name||'no location')+' · '+countLines(s.nodes||[])+' lines</text>'+
        (s.requires?.length?'<text class="gr-cond" x="32" y="'+(y+53)+'">needs '+
          esc(s.requires.map(condLabel).join(' · ').slice(0,44))+'</text>':'')+
        (s.flag?'<text class="gr-cond" x="330" y="'+(y+34)+'" fill="#C9A227">→ '+esc(s.flag)+'</text>':'')+
        (i<c.stages.length-1?'<path class="gr-line" d="M170 '+(y+60)+' L170 '+(y+94)+'" marker-end="url(#a)"/>':'');
    }).join('');
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="'+((c.stages?.length||1)*94+20)+
      '"><defs><marker id="a" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">'+
      '<path d="M0 0 L7 3.5 L0 7 Z" fill="#938599"/></marker></defs>'+rows+'</svg>';
  }else{
    const m=measure(c.nodes||[]);
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+(m.w+60)+'" height="'+(m.h+30)+'">'+
      draw(c.nodes||[],m.w/2+30,14)+'</svg>';
  }
  $('grBody').innerHTML=svg;
  $('graph').showModal();
}
$('closeGraph').onclick=()=>$('graph').close();
$('grSvg').onclick=()=>{
  const raw=$('grBody').innerHTML.replace('<svg','<svg style="background:#241826"');
  const css='<style>.gr-box{fill:#402B49;stroke:#3d3340}.gr-line{stroke:#938599;stroke-width:1;fill:none}'+
    '.gr-t{font-family:monospace;font-size:9px;fill:#EDE4D3}.gr-who{font-family:monospace;font-size:8px}'+
    '.gr-cond{font-family:monospace;font-size:8px;fill:#7FA3C4}</style>';
  const url=URL.createObjectURL(new Blob([raw.replace('>',' >'+css)],{type:'image/svg+xml'}));
  Object.assign(document.createElement('a'),{href:url,download:(cur()?.id||'flow')+'.svg'}).click();
  URL.revokeObjectURL(url);};
