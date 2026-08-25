/* ============ rail ============ */
document.querySelectorAll('.railtabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.railtabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.railpane').forEach(p=>p.classList.toggle('on',p.dataset.pane===b.dataset.tab));
});

function paintCast(){
  $('castList').innerHTML=P.characters.length?P.characters.map((c,i)=>
    '<div class="chip'+(selChar===i?' on':'')+(isPlayer(c)?' pc':'')+'" data-c="'+i+'">'+
    '<span class="swatch" style="background:'+c.color+'"></span>'+
    esc(c.name)+'<span class="tag">'+(isPlayer(c)?'PLAYER'
      :esc(c.profile?.role?pretty(c.profile.role):c.id))+'</span>'+
    '<button class="x" data-cx="'+i+'">×</button></div>').join('')
    :'<p class="empty">No characters. Press Import sheets, or drop .character files onto the window.</p>';
  $('castList').querySelectorAll('.chip').forEach(el=>el.onclick=e=>{
    if(e.target.dataset.cx!==undefined)return;
    selChar=selChar===+el.dataset.c?null:+el.dataset.c;paintCast();paintSheet();});
  $('castList').querySelectorAll('[data-cx]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();P.characters.splice(+b.dataset.cx,1);selChar=null;save();paintAll();});
}

function paintSheet(){
  const box=$('sheetPanel');
  if(selChar===null||!P.characters[selChar]){box.innerHTML='';return;}
  const c=P.characters[selChar],p=c.profile||{},pe=c.personality||{};
  const lim=[...(c.boundaries?.hard_limits||[]),...(c.private_profile?.adult_preferences?.hard_limits||[])];
  box.innerHTML='<div class="sheetinfo" style="margin-top:12px">'+
    (p.age?'<b>'+esc(p.age)+'</b> · ':'')+esc(pretty(p.occupation||p.role||''))+'<br>'+
    (pe.archetype?'<b>'+esc(pretty(pe.archetype))+'</b><br>':'')+
    (pe.traits?esc(pe.traits.map(pretty).join(', '))+'<br>':'')+
    (c.text_style?.tone?'voice: <b>'+esc(pretty(c.text_style.tone))+'</b><br>':'')+
    (c.home?.residence?'lives: '+esc(c.home.residence)+'<br>':'')+
    (c.conversation_topics?'talks about: '+esc(c.conversation_topics.map(pretty).join(', '))+'<br>':'')+
    (c.relationship_chapters?'chapters: '+c.relationship_chapters.length+'<br>':'')+
    (lim.length?'<span class="lim">never: '+esc(lim.map(pretty).join(', '))+'</span>':
      '<span class="lim">no hard limits set</span>')+
    '</div>'+
    (function(){
      const written=new Set(P.content.filter(x=>x.type==='quest').map(x=>x.id));
      const left=(c.quest_hooks||[]).filter(hk=>!written.has(hk));
      return left.length
        ? '<button class="btn wide gold" id="draftHook">Draft quest: '+esc(pretty(left[0]))+'</button>'+
          '<p class="hint" style="margin:4px 0 10px">'+left.length+' hook'+(left.length===1?'':'s')+
          ' still unwritten</p>'
        : '';
    })()+
    '<button class="btn wide" id="editSched">Edit schedule</button>'+
    '<button class="btn wide" id="editSheet" style="margin-top:5px">Edit sheet &amp; limits</button>'+
    '<div class="field" style="margin-top:10px"><label>Colour</label><input type="color" id="cColor" value="'+c.color+
      '" style="width:100%;height:28px;background:none;border:1px solid var(--edge);border-radius:3px"></div>';
  if($('draftHook'))$('draftHook').onclick=openHooks;
  $('editSched').onclick=()=>openSchedule(selChar);
  $('editSheet').onclick=()=>openEditor(selChar);
  $('cColor').oninput=e=>{c.color=e.target.value;paintCast();paintBody();save();};
}

function paintPlaces(){
  $('placeList').innerHTML=P.locations.length?P.locations.map((l,i)=>
    '<div class="chip'+(selPlace===i?' on':'')+'" data-l="'+i+'">'+esc(l.name)+
    '<span class="tag">'+((l.rooms||[]).length?l.rooms.length+' rooms':esc(l.background||''))+
    '</span><button class="x" data-lx="'+i+'">×</button></div>').join('')
    :'<p class="empty">Drop your all_locations.json on the window to load the real registry. '+
     'Until then, placeholder locations get derived from each character sheet.</p>';
  $('placeList').querySelectorAll('.chip').forEach(el=>el.onclick=e=>{
    if(e.target.dataset.lx!==undefined)return;
    selPlace=selPlace===+el.dataset.l?null:+el.dataset.l;paintPlaces();paintPlaceForm();});
  $('placeList').querySelectorAll('[data-lx]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();P.locations.splice(+b.dataset.lx,1);selPlace=null;save();paintAll();});
}
function paintPlaceForm(){
  const box=$('placeForm');
  if(selPlace===null||!P.locations[selPlace]){box.innerHTML='';return;}
  const l=P.locations[selPlace];
  const d=DISTRICTS.find(x=>x.id===l.district);
  box.innerHTML=
    (l.tags?.includes('package')
      ? '<div class="sheetinfo" style="margin-top:12px">'+
        (d?'<b>'+esc(d.name)+'</b> — '+esc(d.character)+'<br>':'')+
        (l.type?esc(pretty(l.type))+'<br>':'')+
        (l.residents?.length?'lives here: '+esc(l.residents.map(id=>chr(id)?.name||pretty(id)).join(', '))+'<br>':'')+
        (l.services?.length?'services: '+esc(l.services.map(pretty).join(', ')):'')+
        '</div>'+
        ((l.rooms||[]).length
          ? '<p class="rubric">Rooms</p><div class="chip-list">'+l.rooms.map(r=>
              '<div class="chip" style="cursor:default"><span class="swatch" style="background:'+
              (r.access==='shared'?'var(--sage)':r.access==='restricted'?'var(--rose)':'var(--ash)')+
              '"></span>'+esc(r.name)+'<span class="tag">'+esc(pretty(r.access||''))+'</span></div>'+
              (r.actions?.length?'<p class="hint" style="margin:-1px 0 5px 18px">'+
                esc(r.actions.map(pretty).join(' · '))+'</p>':'')
            ).join('')+'</div>'
          : '')
      : '')+
    '<div class="field" style="margin-top:12px"><label>Name</label><input type="text" id="lName" value="'+esc(l.name)+'"></div>'+
    '<div class="two"><div class="field"><label>ID</label><input type="text" id="lId" value="'+esc(l.id)+'"></div>'+
    '<div class="field"><label>Background</label><input type="text" id="lBg" value="'+esc(l.background||'')+'"></div></div>'+
    '<div class="field"><label>What it\'s like</label><textarea id="lNotes">'+esc(l.notes||'')+'</textarea>'+
    '<p class="hint">Sent to the model so dialogue references the real space — sound, light, who else is around.</p></div>';
  $('lName').oninput=e=>{l.name=e.target.value;paintPlaces();save()};
  $('lId').oninput=e=>{l.id=slug(e.target.value);paintPlaces();save()};
  $('lBg').oninput=e=>{l.background=e.target.value;paintPlaces();save()};
  $('lNotes').oninput=e=>{l.notes=e.target.value;save()};
}

function paintContent(){
  const g=(t,el)=>{
    const items=P.content.filter(c=>c.type===t);
    $(el).innerHTML=items.length?items.map(c=>
      '<div class="chip'+(sel===c.uid?' on':'')+'" data-u="'+c.uid+'">'+esc(c.title||'Untitled')+
      '<span class="tag">'+(c.type==='repeatable'?(c.lines?.length||0)+' lines'
        :c.type==='activity'?((c.stages||[]).length-1)+' milestones'
        :c.type==='quest'?(c.stages?.length||0)+' stages':countLines(c.nodes||[])+' lines')+
      '</span><button class="x" data-ux="'+c.uid+'">×</button></div>').join('')
      :'<p class="empty">None yet.</p>';
  };
  g('conversation','convList');g('quest','questList');
  g('activity','actList');g('repeatable','repList');
  document.querySelectorAll('[data-u]').forEach(el=>el.onclick=e=>{
    if(e.target.dataset.ux!==undefined)return;
    sel=el.dataset.u;focusPath=[];stageIx=0;paintAll();});
  document.querySelectorAll('[data-ux]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();P.content=P.content.filter(c=>c.uid!==b.dataset.ux);
    if(sel===b.dataset.ux)sel=null;save();paintAll();});
}
