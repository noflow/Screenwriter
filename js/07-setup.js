/* ============ setup strip ============ */
function paintSetup(){
  const c=cur(),bar=$('setup');
  if($('condbar'))$('condbar').remove();
  if(!c){bar.innerHTML='<span class="lbl">no content selected</span>';return;}
  const opts=(arr,v,f)=>arr.map(x=>'<option value="'+esc(x)+'"'+(x===v?' selected':'')+'>'+esc(f?f(x):x)+'</option>').join('');
  const chapters=(chr(c.character)||chr(c.cast?.[0]))?.relationship_chapters||[];
  const multiDay=c.type==='conversation'||c.type==='activity';
  const chosenDays=contentDays(c);
  const dayPicker='<details class="daypick"><summary title="Choose one or more days">'+
    esc(chosenDays.length?chosenDays.map(d=>d.slice(0,3)).join(' · '):'any day')+'</summary><div class="daypop">'+
    DAYS.map(d=>'<label><input type="checkbox" data-cday="'+d+'"'+
      (chosenDays.includes(d)?' checked':'')+'><span>'+esc(pretty(d))+'</span></label>').join('')+
    '<button class="btn quiet" type="button" id="cAnyDay">Any day</button></div></details>';
  const ownerOptions='<option value="">— choose owner —</option>'+npcs().map(ch=>
    '<option value="'+esc(ch.id)+'"'+(ch.id===c.character?' selected':'')+'>'+esc(ch.name)+'</option>').join('');

  bar.innerHTML=
    '<span class="lbl">'+esc(c.type)+'</span>'+
    '<input type="text" id="cTitle" value="'+esc(c.title||'')+'" style="width:170px">'+
    '<input type="text" id="cId" value="'+esc(c.id||'')+'" style="width:130px" title="Export id">'+
    (c.type==='activity'?'<span class="lbl">owner</span><select id="cOwner" title="The NPC who offers this activity">'+ownerOptions+'</select>':'')+
    '<span class="lbl">at</span><select id="cLoc" style="max-width:250px">'+
      placeOptions(c.location)+'</select>'+
    (multiDay?dayPicker:'<select id="cDay">'+opts(DAYS,c.day,pretty)+'</select>')+
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
  $('cId').oninput=e=>{
    renameContentId(c,e.target.value);
    save();paintBody();
  };
  if($('cOwner'))$('cOwner').onchange=e=>{
    const old=c.character;c.character=e.target.value;c.cast=c.cast||[];
    if(old)c.cast=c.cast.filter(id=>id!==old);
    if(c.character&&!c.cast.includes(c.character))c.cast.unshift(c.character);
    save();paintPresence();paintBody();
  };
  $('cLoc').onchange=e=>{c.location=e.target.value;save();paintBody()};
  if($('cDay'))$('cDay').onchange=e=>{c.day=e.target.value;save();paintPresence();paintBody()};
  bar.querySelectorAll('[data-cday]').forEach(el=>el.onchange=()=>{
    setContentDays(c,[...bar.querySelectorAll('[data-cday]:checked')].map(x=>x.dataset.cday));
    const summary=bar.querySelector('.daypick summary');
    if(summary)summary.textContent=c.days.length?c.days.map(d=>d.slice(0,3)).join(' · '):'any day';
    save();paintPresence();paintBody();
  });
  if($('cAnyDay'))$('cAnyDay').onclick=()=>{
    bar.querySelectorAll('[data-cday]').forEach(el=>el.checked=false);setContentDays(c,[]);
    const summary=bar.querySelector('.daypick summary');if(summary)summary.textContent='any day';
    save();paintPresence();paintBody();
  };
  $('cBlock').onchange=e=>{
    setContentBlock(c,e.target.value);
    save();paintPresence();paintBody();
  };
  if($('cChap'))$('cChap').onchange=e=>{c.chapter=+e.target.value;save()};
  $('cStart').onchange=e=>{c.start=e.target.checked;save()};
  if($('cAfter'))$('cAfter').onchange=e=>{c.after=e.target.value;save();paintBody();};
  paintPresence();
}

function paintPresence(){
  const c=cur(),box=$('presence');if(!c||!box)return;
  c.cast=c.cast||[];
  box.innerHTML='<span class="pres in pc" title="Created from this user’s choices when a new game starts">'+
    '<span class="dot"></span>Player <small>runtime</small></span>'+npcs().map(ch=>{
    const checks=contentAvailability(ch,c);
    const conflicts=checks.filter(a=>!a.free);
    const elsewhere=checks.filter(a=>c.location&&a.where&&locPart(a.where)!==locPart(c.location));
    const a=checks[0]||{free:true,why:'free',where:null},here=a.where;
    const on=c.cast.includes(ch.id);
    const mismatch=elsewhere.length>0;
    const detail=checks.map(x=>pretty(x.day)+': '+x.why+
      (x.where?' · at '+(loc(locPart(x.where))?.name||pretty(x.where)):'')).join(' | ');
    return '<span class="pres'+(on?' in':'')+(mismatch?' elsewhere':'')+'" data-p="'+ch.id+'" '+
      'title="'+esc(detail||a.why)+
      (mismatch?' — this scene is somewhere else':'')+'">'+
      '<span class="dot '+(conflicts.length?'busy':'free')+'"></span>'+esc(ch.name)+
      (mismatch?'<span class="warnmark">≠</span>':'')+'</span>';
  }).join('');
  box.querySelectorAll('[data-p]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.p;
    c.cast=c.cast.includes(id)?c.cast.filter(x=>x!==id):c.cast.concat(id);
    save();paintPresence();paintBody();});
}
