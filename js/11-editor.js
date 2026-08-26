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
  c.profile=c.profile||{};c.personality=c.personality||{};c.boundaries=c.boundaries||{};
  c.identity=c.identity||{};c.characteristics=c.characteristics||{};c.custom_stats=c.custom_stats||{};
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
      '<div class="field"><label>Gender identity</label><input type="text" id="edGender" value="'+esc(c.profile.gender_identity||'')+'" placeholder="nonbinary, woman, man…"></div>'+
      '<div class="field"><label>Pronouns</label><input type="text" id="edPronouns" value="'+esc(c.identity.pronouns||'')+'" placeholder="they/them"></div>'+
      '<div class="field"><label>Presentation</label><input type="text" id="edPresentation" value="'+esc(c.identity.presentation||'')+'" placeholder="feminine, masc, fluid…"></div>'+
      '<div class="field edfull"><label>Personality traits</label>'+tagList('personality.traits',c.personality?.traits,'ok')+'</div>'+
      '<div class="field"><label>Likes</label>'+tagList('characteristics.likes',c.characteristics.likes,'ok')+'</div>'+
      '<div class="field"><label>Dislikes</label>'+tagList('characteristics.dislikes',c.characteristics.dislikes)+'</div>'+
      '<div class="field"><label>Fears / pressure points</label>'+tagList('characteristics.fears',c.characteristics.fears)+'</div>'+
      '<div class="field"><label>Skills / strengths</label>'+tagList('characteristics.strengths',c.characteristics.strengths,'ok')+'</div>'+
      '<div class="field edfull"><label>Identity change history</label>'+tagList('identity.history',c.identity.history,'ok')+
        '<p class="hint">Use short milestones such as <code>comes_out_to_player</code>. A scene can change the live identity with an identity-change effect.</p></div>'+
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
        '</div>'+
        '<p class="rubric later">Ceilings</p>'+
        '<div class="stats">'+STATS.map(s=>'<div class="stat"><label>'+s.slice(0,9)+'</label>'+
        '<input type="text" data-cap="'+s+'" placeholder="none" value="'+
        (Number.isFinite(+c.stat_caps?.[s])?+c.stat_caps[s]:'')+'"></div>').join('')+
        '</div>'+
      '<p class="hint">A meter with no ceiling can be pushed past every gate on it. '+
        'The game clamps to whatever is set here.</p></div>'+

      (customStatDefs().length?'<div class="field edfull"><p class="rubric">Custom character stats</p><div class="stats">'+
        customStatDefs().map(s=>'<div class="stat"><label>'+esc(s.label)+'</label><input type="text" data-custom-stat="'+s.id+'" value="'+
          (Number.isFinite(+c.custom_stats[s.id])?+c.custom_stats[s.id]:s.default)+'"></div>').join('')+
        '</div><p class="hint">Defined in World builder. These can be checked by scene branches and changed by effects.</p></div>':'')+

      '<div class="field edfull"><p class="rubric">Chapters</p>'+
        c.relationship_chapters.map((ch,j)=>'<div class="chapline"><span class="lv">'+ch.level+'</span>'+
        '<input value="'+esc(ch.id||'')+'" data-chid="'+j+'"><input value="'+esc(ch.title||'')+'" data-chtitle="'+j+'">'+
        (ch.level>1
          ? '<span class="lv" style="opacity:.7">at</span>'+
            '<select data-chstat="'+j+'"><option value="">no threshold</option>'+
            STATS.map(s=>'<option value="'+s+'"'+
              (chapterGate(ch)?.key===s?' selected':'')+'>'+s+'</option>').join('')+'</select>'+
            '<input type="text" data-chval="'+j+'" style="width:52px" placeholder="n" value="'+
            (chapterGate(ch)?.value??'')+'">'
          : '<span class="lv" style="opacity:.55">starts here</span>')+
        '<button data-chx="'+j+'">×</button></div>').join('')+
        '<button class="btn" id="edAddChap">+ chapter</button>'+
        '<p class="hint">Without a threshold a relationship never leaves chapter 1 in play, '+
        'so anything gated higher can never appear.</p></div>'+

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
  $('edGender').oninput=e=>{c.profile.gender_identity=e.target.value.trim();save();paintSheet();};
  $('edPronouns').oninput=e=>{c.identity.pronouns=e.target.value.trim();save();};
  $('edPresentation').oninput=e=>{c.identity.presentation=e.target.value.trim();save();};
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
  B.querySelectorAll('[data-cap]').forEach(el=>el.oninput=()=>{
    c.stat_caps=c.stat_caps||{};
    const n=parseInt(el.value,10);
    if(Number.isFinite(n))c.stat_caps[el.dataset.cap]=n;else delete c.stat_caps[el.dataset.cap];
    save();});
  B.querySelectorAll('[data-custom-stat]').forEach(el=>el.oninput=()=>{
    const def=statDefinition(el.dataset.customStat);if(!def)return;
    c.custom_stats[def.id]=Math.max(def.minimum,Math.min(def.maximum,Number(el.value)||0));save();});
  const setGate=(j)=>{
    const ch=c.relationship_chapters[j];
    const key=B.querySelector('[data-chstat="'+j+'"]')?.value||'';
    const val=parseInt(B.querySelector('[data-chval="'+j+'"]')?.value,10);
    ch.requires=(key&&Number.isFinite(val))
      ? [{type:'stat',character:c.id,key,op:'gte',value:val}] : [];
    save();};
  B.querySelectorAll('[data-chstat]').forEach(el=>el.onchange=()=>setGate(+el.dataset.chstat));
  B.querySelectorAll('[data-chval]').forEach(el=>el.oninput=()=>setGate(+el.dataset.chval));
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

/** The meter threshold a chapter opens on, if one is set. */
function chapterGate(ch){
  return (ch?.requires||[]).find(r=>r.type==='stat')||null;
}

$('closeEditor').onclick=()=>{$('editor').close();paintAll();};

/** Writes the sheet back out with every edit applied and adult fields normalised. */
function gameReady(c){
  const out=JSON.parse(JSON.stringify(c));
  delete out.color;delete out.name;
  out.format_version=out.format_version||1;
  out.display_name=c.name;
  out.profile=out.profile||{};
  if(Object.keys(out.custom_stats||{}).length){
    out.custom_stat_definitions=Object.fromEntries(Object.keys(out.custom_stats).map(key=>{
      const def=statDefinition(key)||{id:key,label:pretty(key),minimum:0,maximum:100,default:0};
      return [key,{label:def.label,minimum:def.minimum,maximum:def.maximum}];
    }));
  }
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
