/* ============ sheet editor ============ */
let edIx=null;
const STATS=['friendship','love','attraction','lust','trust','respect','resentment','jealousy',
  'comfort','commitment','compatibility','satisfaction'];
const ALCOHOL=['never_when_impaired','requires_sober_consent','no_restriction'];

/** A character is treated as adult-content-eligible only if the sheet says so explicitly. */
function isAdult(c){const a=+(c.profile?.age); return Number.isFinite(a)&&a>=18;}

function openEditor(i){
  edIx=i;const c=P.characters[i];if(!c)return;
  $('edName').textContent=c.name;
  paintEditor();
  $('editor').showModal();
}

/** Editable chip list bound to a path on the character object. */
function tagList(id,arr,tone){
  return '<div class="tags" data-tags="'+id+'">'+
    (arr||[]).map((t,j)=>'<span class="tag-x'+(tone==='ok'?' ok':'')+'">'+esc(pretty(t))+
      '<button data-rm="'+id+':'+j+'">×</button></span>').join('')+
    '<input placeholder="add… (enter)" data-add="'+id+'"></div>';
}

function paintEditor(){
  const c=P.characters[edIx];if(!c)return;
  c.profile=c.profile||{};c.boundaries=c.boundaries||{};
  c.private_profile=c.private_profile||{};
  c.private_profile.adult_preferences=c.private_profile.adult_preferences||{};
  c.relationship_defaults=c.relationship_defaults||{};
  c.relationship_chapters=c.relationship_chapters||[];

  const adult=isAdult(c), ap=c.private_profile.adult_preferences;
  const romance=c.profile.romance_eligible===true&&adult;

  $('edBody').innerHTML='<div class="edbody">'+
    (!adult?'<div class="guard">This sheet has no age, or an age under 18. Romance and adult fields '+
      'stay locked and export as <code>false</code>. Set <code>profile.age</code> to 18 or over to unlock them.</div>':'')+

    '<div class="edgrid">'+
      '<div class="field"><label>Age</label><input type="text" id="edAge" value="'+esc(c.profile.age??'')+'"></div>'+
      '<div class="field"><label>Role</label><input type="text" id="edRole" value="'+esc(c.profile.role||'')+'"></div>'+
      '<div class="field edfull"><label><input type="checkbox" id="edPC" style="width:auto"'+
        (isPlayer(c)?' checked':'')+'> This is the player character</label>'+
        '<p class="hint">The person playing. Their words come from choice options, never from '+
        'generated dialogue, and they are in every scene regardless of schedule.</p></div>'+

      '<div class="field edfull"><p class="rubric" style="margin-top:6px">Limits</p></div>'+

      '<div class="field'+(adult?'':' locked')+'"><label>'+
        '<input type="checkbox" id="edRom" style="width:auto"'+(romance?' checked':'')+
        (adult?'':' disabled')+'> Romance eligible</label>'+
        '<p class="hint">Off means the model is told, up front, never to write romance or attraction with the player.</p></div>'+

      '<div class="field"><label><input type="checkbox" id="edFam" style="width:auto"'+
        (c.boundaries.family_only?' checked':'')+'> Family only</label>'+
        '<p class="hint">Warmth stays parental or sibling, never romantic.</p></div>'+

      '<div class="field"><label>Alcohol consent</label><select id="edAlc">'+
        ALCOHOL.map(a=>'<option value="'+a+'"'+(c.boundaries.alcohol_consent===a?' selected':'')+'>'+
        esc(pretty(a))+'</option>').join('')+'</select></div>'+

      '<div class="field"><label>Protection policy</label>'+
        '<input type="text" id="edProt" value="'+esc(c.boundaries.protection_policy||'')+'"></div>'+

      '<div class="field edfull"><label>Hard limits — never written, at any chapter</label>'+
        tagList('boundaries.hard_limits',c.boundaries.hard_limits)+
        '<p class="hint">These go into the prompt as absolute constraints, above everything else.</p></div>'+

      '<div class="field edfull'+(romance?'':' locked')+'"><label>Adult hard limits</label>'+
        tagList('private_profile.adult_preferences.hard_limits',ap.hard_limits)+'</div>'+

      '<div class="field'+(romance?'':' locked')+'"><label>Established preferences</label>'+
        tagList('private_profile.adult_preferences.established',ap.established,'ok')+'</div>'+

      '<div class="field'+(romance?'':' locked')+'"><label>Discoverable preferences</label>'+
        tagList('private_profile.adult_preferences.discoverable',ap.discoverable,'ok')+
        '<p class="hint">Only reachable once the chapter level earns it.</p></div>'+

      '<div class="field edfull"><p class="rubric">Relationship starting values</p>'+
        '<div class="stats">'+STATS.map(s=>'<div class="stat"><label>'+s.slice(0,9)+'</label>'+
        '<input type="text" data-stat="'+s+'" value="'+(+c.relationship_defaults[s]||0)+'"></div>').join('')+
        '</div></div>'+

      '<div class="field edfull"><p class="rubric">Chapters</p>'+
        c.relationship_chapters.map((ch,j)=>'<div class="chapline"><span class="lv">'+ch.level+'</span>'+
        '<input value="'+esc(ch.id||'')+'" data-chid="'+j+'"><input value="'+esc(ch.title||'')+'" data-chtitle="'+j+'">'+
        '<button data-chx="'+j+'">×</button></div>').join('')+
        '<button class="btn" id="edAddChap">+ chapter</button></div>'+

      '<div class="field edfull"><label>Conversation topics</label>'+
        tagList('conversation_topics',c.conversation_topics,'ok')+'</div>'+
      '<div class="field edfull"><label>Quest hooks</label>'+
        tagList('quest_hooks',c.quest_hooks,'ok')+'</div>'+
    '</div></div>';

  wireEditor(c,adult,romance);
}

function wireEditor(c,adult,romance){
  const B=$('edBody');
  const setPath=(path,val)=>{
    const keys=path.split('.');let o=c;
    for(let i=0;i<keys.length-1;i++){o[keys[i]]=o[keys[i]]||{};o=o[keys[i]];}
    o[keys[keys.length-1]]=val;
  };
  const getPath=path=>path.split('.').reduce((o,k)=>o?.[k],c)||[];

  B.querySelectorAll('[data-add]').forEach(el=>el.onkeydown=e=>{
    if(e.key!=='Enter')return;e.preventDefault();
    const v=slug(el.value);if(!v)return;
    const path=el.dataset.add,list=getPath(path).slice();
    if(!list.includes(v))list.push(v);
    setPath(path,list);el.value='';save();paintEditor();paintSheet();
  });
  B.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
    const [path,j]=b.dataset.rm.split(':');
    const list=getPath(path).slice();list.splice(+j,1);
    setPath(path,list);save();paintEditor();paintSheet();
  });

  $('edAge').oninput=e=>{const n=parseInt(e.target.value,10);
    c.profile.age=Number.isFinite(n)?n:e.target.value;
    if(!isAdult(c)){c.profile.romance_eligible=false;delete c.private_profile.adult_preferences.established;
      delete c.private_profile.adult_preferences.discoverable;}
    save();paintSheet();};
  $('edAge').onblur=()=>paintEditor();
  $('edRole').oninput=e=>{c.profile.role=slug(e.target.value);save();paintCast();};
  $('edPC').onchange=e=>{
    if(e.target.checked)P.characters.forEach(x=>{if(x!==c&&x.profile)x.profile.is_player=false;});
    c.profile.is_player=e.target.checked;
    save();paintCast();paintEditor();paintPresence();};
  $('edFam').onchange=e=>{c.boundaries.family_only=e.target.checked;save();paintSheet();};
  $('edAlc').onchange=e=>{c.boundaries.alcohol_consent=e.target.value;save();};
  $('edProt').oninput=e=>{c.boundaries.protection_policy=e.target.value;save();};
  if(adult)$('edRom').onchange=e=>{c.profile.romance_eligible=e.target.checked;save();paintEditor();paintSheet();};

  B.querySelectorAll('[data-stat]').forEach(el=>el.oninput=()=>{
    c.relationship_defaults[el.dataset.stat]=parseInt(el.value,10)||0;save();});
  B.querySelectorAll('[data-chid]').forEach(el=>el.oninput=()=>{
    c.relationship_chapters[+el.dataset.chid].id=slug(el.value);save();});
  B.querySelectorAll('[data-chtitle]').forEach(el=>el.oninput=()=>{
    c.relationship_chapters[+el.dataset.chtitle].title=el.value;save();paintSetup();});
  B.querySelectorAll('[data-chx]').forEach(b=>b.onclick=()=>{
    c.relationship_chapters.splice(+b.dataset.chx,1);
    c.relationship_chapters.forEach((ch,i)=>ch.level=i+1);save();paintEditor();paintSetup();});
  $('edAddChap').onclick=()=>{
    const n=c.relationship_chapters.length+1;
    c.relationship_chapters.push({level:n,id:'chapter_'+n,title:'New chapter'});
    save();paintEditor();paintSetup();};
}

$('closeEditor').onclick=()=>{$('editor').close();paintAll();};

/** Writes the sheet back out with every edit applied and adult fields normalised. */
function gameReady(c){
  const out=JSON.parse(JSON.stringify(c));
  delete out.color;delete out.name;
  out.format_version=out.format_version||1;
  out.display_name=c.name;
  out.profile=out.profile||{};
  const adult=isAdult(c);
  out.profile.romance_eligible=adult&&out.profile.romance_eligible===true;
  out.boundaries=out.boundaries||{};
  out.boundaries.hard_limits=out.boundaries.hard_limits||[];
  if(!out.profile.romance_eligible){
    if(out.private_profile?.adult_preferences){
      out.private_profile.adult_preferences={hard_limits:
        out.private_profile.adult_preferences.hard_limits||[]};
    }
    ['romance_with_player','sexual_content_with_player'].forEach(l=>{
      if(!out.boundaries.hard_limits.includes(l))out.boundaries.hard_limits.push(l);});
  }
  return out;
}

$('edSheetOut').onclick=()=>{
  const c=P.characters[edIx];
  const url=URL.createObjectURL(new Blob([JSON.stringify(sheetOut(c),null,2)],{type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:c.id+'.character'}).click();
  URL.revokeObjectURL(url);
};
