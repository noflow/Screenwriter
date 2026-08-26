/* ============ routes ============ */
/** Enumerates every path through a node tree. Returns [{picks:[{text,path,reqs}], lines:n}] */
function routes(list,picks){
  picks=picks||[];
  let out=null;
  for(let i=0;i<list.length;i++){
    if(list[i].type==='jump')return [{picks,lines:countLines(list.slice(0,i)),jump:list[i].target}];
    if(list[i].type!=='choice'&&list[i].type!=='gate')continue;
    out=[];
    list[i].options.forEach((o,j)=>{
      const deeper=routes(o.nodes,picks.concat({text:(list[i].type==='gate'?'[auto] ':'')+o.text,reqs:o.requires||[]}));
      const rest=routes(list.slice(i+1),[]);
      deeper.forEach(d=>rest.forEach(r=>out.push({
        picks:d.picks,lines:countLines(list.slice(0,i))+d.lines+r.lines})));
    });
    break;
  }
  return out||[{picks,lines:countLines(list)}];
}

function simState(){
  const S={stats:{},flags:{},chapters:{}};
  P.characters.forEach(c=>{
    S.chapters[c.id]=1;
    Object.entries(c.relationship_defaults||{}).forEach(([k,v])=>S.stats[c.id+'.'+k]=+v||0);
  });
  return S;
}
let WS=null,wkStack=[],wkLog=[],wkPending=null,wkRoute=-1;

function openWalk(){
  const c=cur();if(!c||c.type==='repeatable')return;
  $('wkTitle').textContent='Walk — '+(c.title||c.id);
  WS=WS||simState();
  wkRestart();$('walk').showModal();
}
function wkRestart(){
  const c=cur();
  wkStack=[{nodes:(c.type==='quest'||c.type==='activity')?(c.stages[stageIx]?.nodes||[]):c.nodes,index:0}];
  wkLog=[];wkPending=null;wkStep();
}
function wkStep(){
  while(wkStack.length){
    const f=wkStack[wkStack.length-1];
    if(f.index>=f.nodes.length){wkStack.pop();continue;}
    const n=f.nodes[f.index++];
    if(n.type==='line'){wkLog.push(n);continue;}
    if(n.type==='jump'){wkLog.push({jump:n.target});wkStack.length=0;break;}
    if(n.type==='gate'){
      const o=(n.options||[]).find(x=>allMet(x.requires,WS));
      if(o){wkLog.push({gate:o.text});applyFlag(o.flag,WS);wkStack.push({nodes:o.nodes,index:0});}
      continue;
    }
    wkPending=n;return paintWalk();
  }
  wkPending=null;paintWalk();
}
function wkChoose(i){
  const o=wkPending.options[i];
  if(!allMet(o.requires,WS))return;
  wkLog.push({pick:o.text});
  if(o.flag)applyFlag(o.flag,WS);
  wkStack.push({nodes:o.nodes,index:0});
  wkPending=null;wkStep();
}
function applyFlag(raw,S){
  // Effects arrive as "a.b +1; flag_name; c.d -2" — semicolons first, then the value.
  String(raw||'').split(';').forEach(piece=>{
    const p=piece.trim().split(/\s+/).filter(Boolean);
    if(!p.length)return;
    if(p.length===1){
      if(p[0].includes('='))S.flags[p[0].split('=')[0]]=p[0].split('=')[1];
      else S.flags[p[0]]=true;
      return;
    }
    const k=p[0],d=parseInt(p[1],10)||0;
    if(k.includes('.'))S.stats[k]=(+S.stats[k]||0)+d; else S.flags[k]=(+S.flags[k]||0)+d;
  });
}

function paintWalk(){
  const c=cur();
  const all=routes((c.type==='quest'||c.type==='activity')?(c.stages[stageIx]?.nodes||[]):c.nodes,[]);
  $('wkRoutes').innerHTML='<div class="route" style="border:none;background:none;cursor:default">'+
    all.length+' route'+(all.length===1?'':'s')+'</div>'+
    all.map((r,i)=>{
      const blocked=r.picks.some(p=>!allMet(p.reqs,WS));
      return '<div class="route'+(wkRoute===i?' on':'')+(blocked?' blocked':'')+'" data-r="'+i+'">'+
        '<b>Route '+(i+1)+'</b> · '+r.lines+' lines'+(blocked?' · gated':'')+
        '<span class="path">'+(r.picks.length?r.picks.map(p=>esc(p.text)).join(' → '):'no choices')+'</span></div>';
    }).join('');
  $('wkRoutes').querySelectorAll('[data-r]').forEach(el=>el.onclick=()=>{
    wkRoute=+el.dataset.r;autoWalk(all[wkRoute]);});

  let h=wkLog.map(l=>l.jump!==undefined
    ?'<div class="wkline"><div class="n" style="color:var(--brass)">→ jumps to</div><div class="t">'+
      esc(P.content.find(x=>x.id===l.jump)?.title||l.jump||'(nothing set)')+'</div></div>'
    :l.pick!==undefined
    ?'<div class="wkline"><div class="n" style="color:var(--sage)">▸ player</div><div class="t">'+esc(l.pick)+'</div></div>'
    :l.gate!==undefined
    ?'<div class="wkline"><div class="n" style="color:var(--blue)">◇ stat outcome</div><div class="t">'+esc(l.gate)+'</div></div>'
    :'<div class="wkline"><div class="n" style="color:'+(chr(l.speaker)?.color||'#938599')+'">'+
      esc(chr(l.speaker)?.name||l.speaker)+'</div><div class="t">'+dress(l.text)+'</div></div>').join('');
  if(wkPending)h+='<div class="wkopts">'+wkPending.options.map((o,i)=>{
    const ok=allMet(o.requires,WS);
    return '<button class="wkopt'+(ok?'':' blocked')+'" data-o="'+i+'"'+(ok?'':' disabled')+'>'+esc(o.text)+
      (o.requires?.length?'<small>needs '+esc(o.requires.map(condLabel).join(' · '))+'</small>':'')+
      (o.flag?'<small>sets '+esc(o.flag)+'</small>':'')+'</button>';}).join('')+'</div>';
  else if(!wkStack.length)h+='<div class="wkline" style="color:var(--ash);font-family:var(--util);font-size:10px">— end of route —</div>';
  $('wkPlay').innerHTML=h||'<p class="empty">Nothing in this scene yet.</p>';
  $('wkPlay').querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>wkChoose(+b.dataset.o));
  $('wkPlay').scrollTop=$('wkPlay').scrollHeight;

  const gate=cur().requires||[];
  $('wkState').innerHTML='<div class="h">Simulated state'+
    (gate.length?' — scene needs '+esc(gate.map(condLabel).join(' · '))+
      (allMet(gate,WS)?' ✓':' ✗'):'')+'</div><div class="wkvars">'+
    P.characters.map(c=>'<div class="wkvar"><label>'+esc(c.name.split(' ')[0])+' chapter</label>'+
      '<input value="'+(WS.chapters[c.id]||1)+'" data-ws="ch:'+c.id+'"></div>'+
      ['love','trust','friendship'].map(k=>'<div class="wkvar"><label>'+esc(c.name.split(' ')[0])+' '+k+'</label>'+
      '<input value="'+(WS.stats[c.id+'.'+k]||0)+'" data-ws="st:'+c.id+'.'+k+'"></div>').join('')).join('')+
    Object.keys(WS.flags).map(k=>'<div class="wkvar"><label>'+esc(k)+'</label>'+
      '<input value="'+(WS.flags[k]===true?1:WS.flags[k])+'" data-ws="fl:'+k+'"></div>').join('')+
    '</div>';
  $('wkState').querySelectorAll('[data-ws]').forEach(el=>el.onblur=()=>{
    const [t,k]=el.dataset.ws.split(':'),v=parseInt(el.value,10)||0;
    if(t==='ch')WS.chapters[k]=v; else if(t==='st')WS.stats[k]=v; else WS.flags[k]=v;
    paintWalk();});
}
function autoWalk(route){
  wkRestart();let n=0;
  while(wkPending&&n<route.picks.length){
    const i=wkPending.options.findIndex(o=>o.text===route.picks[n].text);
    if(i<0)break;
    wkLog.push({pick:wkPending.options[i].text});
    if(wkPending.options[i].flag)applyFlag(wkPending.options[i].flag,WS);
    wkStack.push({nodes:wkPending.options[i].nodes,index:0});
    wkPending=null;n++;wkStep();
  }
  paintWalk();
}
$('closeWalk').onclick=()=>$('walk').close();
$('wkRestart').onclick=()=>{wkRoute=-1;wkRestart();};
