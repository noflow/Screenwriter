/* ============ setup strip ============ */
function paintSetup(){
  const c=cur(),bar=$('setup');
  if($('condbar'))$('condbar').remove();
  if(!c){bar.innerHTML='<span class="lbl">no content selected</span>';return;}
  const opts=(arr,v,f)=>arr.map(x=>'<option value="'+esc(x)+'"'+(x===v?' selected':'')+'>'+esc(f?f(x):x)+'</option>').join('');
  const chapters=(chr(c.character)||chr(c.cast?.[0]))?.relationship_chapters||[];

  bar.innerHTML=
    '<span class="lbl">'+esc(c.type)+'</span>'+
    '<input type="text" id="cTitle" value="'+esc(c.title||'')+'" style="width:170px">'+
    '<input type="text" id="cId" value="'+esc(c.id||'')+'" style="width:130px" title="Export id">'+
    '<span class="lbl">at</span><select id="cLoc" style="max-width:250px">'+
      placeOptions(c.location)+'</select>'+
    '<select id="cDay">'+opts(DAYS,c.day,pretty)+'</select>'+
    '<select id="cBlock">'+opts(BLOCKS,c.block,pretty)+'</select>'+
    (chapters.length?'<span class="lbl">chapter</span><select id="cChap">'+
      chapters.map(ch=>'<option value="'+ch.level+'"'+(+c.chapter===ch.level?' selected':'')+'>'+
      ch.level+' · '+esc(ch.title)+'</option>').join('')+'</select>':'')+
    (c.type==='quest'?'<span class="lbl">after</span><select id="cAfter">'+
      '<option value="">— nothing, starts on its own —</option>'+
      P.content.filter(x=>x.type==='quest'&&x.id!==c.id).map(x=>
        '<option value="'+esc(x.id)+'"'+(x.id===c.after?' selected':'')+'>'+esc(x.title||x.id)+'</option>'
      ).join('')+'</select>':'')+
    '<label class="lbl" style="display:flex;align-items:center;gap:4px;cursor:pointer">'+
      '<input type="checkbox" id="cStart"'+(c.start?' checked':'')+'> start</label>'+
    '<span class="who" id="presence"></span>';

  const cb=document.createElement('div');
  cb.className='condbar';cb.id='condbar';
  cb.innerHTML='<span class="lbl">plays only if</span>'+condEditor(c.requires,'content')+
    (c.type!=='repeatable'?'<span style="margin-left:auto;display:flex;gap:6px">'+
      '<button class="btn" id="btnGraph">Flow</button>'+
      '<button class="btn" id="btnWalk">Walk routes</button></span>':'');
  bar.after(cb);
  wireConds(cb);
  if($('btnGraph'))$('btnGraph').onclick=openGraph;
  if($('btnWalk'))$('btnWalk').onclick=openWalk;

  $('cTitle').oninput=e=>{c.title=e.target.value;paintContent();save()};
  $('cId').oninput=e=>{c.id=slug(e.target.value);save()};
  $('cLoc').onchange=e=>{c.location=e.target.value;save();paintBody()};
  $('cDay').onchange=e=>{c.day=e.target.value;save();paintPresence();paintBody()};
  $('cBlock').onchange=e=>{c.block=e.target.value;save();paintPresence();paintBody()};
  if($('cChap'))$('cChap').onchange=e=>{c.chapter=+e.target.value;save()};
  $('cStart').onchange=e=>{c.start=e.target.checked;save()};
  if($('cAfter'))$('cAfter').onchange=e=>{c.after=e.target.value;save();paintBody();};
  paintPresence();
}

function paintPresence(){
  const c=cur(),box=$('presence');if(!c||!box)return;
  c.cast=c.cast||[];
  box.innerHTML=P.characters.map(ch=>{
    if(isPlayer(ch))return '<span class="pres in pc" title="The player is always in the scene">'+
      '<span class="dot"></span>'+esc(ch.name)+'</span>';
    const a=availability(ch,c.day,c.block),here=whereIs(ch,c.day,c.block);
    const on=c.cast.includes(ch.id);
    const mismatch=c.location&&here&&locPart(here)!==locPart(c.location);
    return '<span class="pres'+(on?' in':'')+(mismatch?' elsewhere':'')+'" data-p="'+ch.id+'" '+
      'title="'+esc(a.why)+(here?' · at '+esc(loc(here)?.name||pretty(here)):'')+
      (mismatch?' — this scene is somewhere else':'')+'">'+
      '<span class="dot '+(a.free?'free':'busy')+'"></span>'+esc(ch.name)+
      (mismatch?'<span class="warnmark">≠</span>':'')+'</span>';
  }).join('');
  box.querySelectorAll('[data-p]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.p;
    c.cast=c.cast.includes(id)?c.cast.filter(x=>x!==id):c.cast.concat(id);
    save();paintPresence();paintBody();});
}
