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
  $('edSheetOut').disabled=isPlayer(c);
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

function milestoneRuleText(level){
  const rule=relationshipMilestoneRule(level);
  if(!rule)return 'Unknown milestone level';
  if(rule.level===1)return 'Available from the start';
  return rule.shared_activities+' shared activit'+(rule.shared_activities===1?'y':'ies')+
    ' · bond '+rule.bond+' · trust '+rule.trust+
    (rule.agreement_required?' · dating agreement on romantic routes':'');
}

function openRelationshipChapterQuest(character,index){
  const chapter=character.relationship_chapters[index];if(!chapter)return;
  try{
    const result=ensureRelationshipChapterQuest(character,chapter);
    sel=result.quest.uid;focusPath=[];stageIx=0;save();paintAll();
    $('editor').close();openQuestBuilder();
    if(result.created)note('Created the story quest for '+esc(chapter.title)+'. Build its objectives and scenes here.');
  }catch(error){note(esc(error.message));}
}

function paintEditor(){
  const c=P.characters[edIx];if(!c)return;
  c.profile=c.profile||{};c.personality=c.personality||{};c.boundaries=c.boundaries||{};
  c.identity=c.identity||{};c.characteristics=c.characteristics||{};c.custom_stats=c.custom_stats||{};
  c.private_profile=c.private_profile||{};
  c.private_profile.adult_preferences=c.private_profile.adult_preferences||{};
  c.relationship_defaults=c.relationship_defaults||{};
  c.relationship_chapters=c.relationship_chapters||[];
  const social=normalizeSocialPreferences(c);

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
      '<div class="field edfull"><div class="guard">'+(isPlayer(c)
        ? 'This is an old fixed Player sheet and will not export. Remove it from Cast when you no longer need it. '
        : 'This is an NPC sheet. ')+'The Player is created from each user’s choices when a new game starts '+
        'and never needs a character sheet here.</div></div>'+

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

      '<div class="field edfull"><p class="rubric">Social activity preferences</p></div>'+
      '<div class="field"><label>Hangout invitation threshold (0–100)</label>'+
        '<input type="text" id="edInviteThreshold" inputmode="numeric" value="'+
        esc(social.invitation_threshold)+'">'+
        '<p class="hint">Higher values make this character harder to invite successfully.</p></div>'+
      '<div class="field"><label>Preferred non-romantic hangouts</label><div class="social-choice-grid">'+
        PA_SOCIAL_ACTIVITIES.map(activity=>'<label><input type="checkbox" data-social-activity="'+activity.id+'"'+
          (social.preferred_activities.includes(activity.id)?' checked':'')+'> '+esc(activity.name)+'</label>').join('')+
        '</div><p class="hint">Favorites improve acceptance. Hidden venues remain unavailable until the player discovers them.</p></div>'+

      '<div class="field edfull"><p class="rubric">Five relationship story milestones</p>'+
        c.relationship_chapters.map((ch,j)=>{
          const quest=relationshipChapterQuest(c,ch);
          return '<div class="chapline"><span class="lv">'+esc(ch.level||j+1)+'</span>'+
        '<input value="'+esc(ch.id||'')+'" data-chid="'+j+'"><input value="'+esc(ch.title||'')+'" data-chtitle="'+j+'">'+
        '<span class="milestone-rule">'+esc(milestoneRuleText(ch.level||j+1))+'</span>'+
        '<span class="chapter-actions"><button class="btn chapter-quest" data-chquest="'+j+'">'+
          (quest?'Edit story arc':'Build story arc')+'</button>'+
          (j>=5?'<button class="chapter-remove" data-chx="'+j+'" title="Remove extra milestone">×</button>':'')+
        '</span></div>';}).join('')+
        (c.relationship_chapters.length<5?'<button class="btn" id="edAddChap">+ add missing milestone</button>':'')+
        '<p class="hint">The game advances these at the player’s pace using shared activities, bond, and trust. '+
        'Levels 4–5 also require a dating agreement on romantic routes. A story quest with the same id starts when its milestone is reached.</p></div>'+

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
  $('edInviteThreshold').oninput=e=>{
    c.social_preferences.invitation_threshold=Math.max(0,Math.min(100,parseInt(e.target.value,10)||0));save();};
  B.querySelectorAll('[data-social-activity]').forEach(el=>el.onchange=()=>{
    const selected=Array.from(B.querySelectorAll('[data-social-activity]:checked')).map(input=>input.dataset.socialActivity);
    if(!selected.length){el.checked=true;note('Choose at least one preferred hangout.');return;}
    c.social_preferences.preferred_activities=selected;save();
  });
  B.querySelectorAll('[data-chid]').forEach(el=>el.onchange=()=>{
    const index=+el.dataset.chid,chapter=c.relationship_chapters[index];
    const old=chapter.id,next=slug(el.value),linked=relationshipChapterQuest(c,chapter);
    const duplicate=c.relationship_chapters.some((item,j)=>j!==index&&item.id===next);
    const collision=P.content.find(item=>item.type==='quest'&&item.id===next&&item!==linked);
    if(duplicate||collision){el.value=old;note(duplicate?'Every milestone needs a unique id.':'That id already belongs to another quest.');return;}
    if(linked)renameContentId(linked,next);
    chapter.id=next;el.value=next;save();paintEditor();paintSetup();
  });
  B.querySelectorAll('[data-chtitle]').forEach(el=>el.oninput=()=>{
    const chapter=c.relationship_chapters[+el.dataset.chtitle],linked=relationshipChapterQuest(c,chapter);
    chapter.title=el.value;if(linked)linked.title=el.value;save();paintSetup();});
  B.querySelectorAll('[data-chquest]').forEach(button=>button.onclick=()=>
    openRelationshipChapterQuest(c,+button.dataset.chquest));
  B.querySelectorAll('[data-chx]').forEach(b=>b.onclick=()=>{
    c.relationship_chapters.splice(+b.dataset.chx,1);
    c.relationship_chapters.forEach((ch,i)=>ch.level=i+1);save();paintEditor();paintSetup();});
  if($('edAddChap'))$('edAddChap').onclick=()=>{
    const n=c.relationship_chapters.length+1;
    c.relationship_chapters.push({level:n,id:c.id+'_chapter_'+n,title:'New milestone'});
    save();paintEditor();paintSetup();};
}

$('closeEditor').onclick=()=>{$('editor').close();paintAll();};
$('edStoryArc').onclick=()=>{
  $('editor').close();openRelationshipArcWorkshop(edIx);
};

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
  if(!c||isPlayer(c))return raise('The runtime Player is created for each new game and has no character sheet to export.');
  const url=URL.createObjectURL(new Blob([JSON.stringify(sheetOut(c),null,2)],{type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:c.id+'.character'}).click();
  URL.revokeObjectURL(url);
};
