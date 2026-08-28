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

function isResidenceLocation(location,currentId=''){
  if(!location)return false;
  if(location.id===currentId||location.housing||(location.residents||[]).length)return true;
  return /(residence|residential|apartment|dorm|house|townhouse|condo|penthouse|studio)/.test(location.type||'');
}

function residenceOptions(character){
  const current=character?.home?.location_id||character?.home?.residence_id||'',groups={};
  P.locations.filter(location=>isResidenceLocation(location,current)).forEach(location=>{
    const district=location.district||'other';(groups[district]=groups[district]||[]).push(location);
  });
  const districtName=id=>(DISTRICTS.find(district=>district.id===id)||{}).name||pretty(id);
  const unknown=current&&!loc(current)?'<option value="'+esc(current)+'" selected>⚠ Unknown — '+esc(current)+'</option>':'';
  return '<option value="">— choose a residence —</option>'+unknown+
    Object.keys(groups).sort((a,b)=>districtName(a).localeCompare(districtName(b))).map(district=>
      '<optgroup label="'+esc(districtName(district))+'">'+groups[district].sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id))).map(location=>
        '<option value="'+esc(location.id)+'"'+(location.id===current?' selected':'')+'>'+esc(location.name)+'</option>').join('')+'</optgroup>').join('');
}

function residenceRoomOptions(home,current){
  const rooms=home?.rooms||[],known=rooms.some(room=>room.id===current);
  return '<option value=""'+(!current?' selected':'')+'>— not placed at home —</option>'+
    (current&&!known?'<option value="'+esc(current)+'" selected>⚠ Unknown room — '+esc(current)+'</option>':'')+
    rooms.map(room=>'<option value="'+esc(room.id)+'"'+(room.id===current?' selected':'')+'>'+esc(room.name)+'</option>').join('');
}

function residenceRoomTarget(home,target){
  if(!target)return '';
  if(String(target).includes('.'))return placeName(target);
  return (home?.rooms||[]).find(room=>room.id===target)?.name||pretty(target);
}

function residenceEditorHtml(character){
  const home=characterHomeLocation(character),discovery=home?.discovery||{},access=home?.access||{};
  const specialLayout=residenceLayout(home),entranceId=residenceEntranceId(home);
  const district=home?(DISTRICTS.find(item=>item.id===home.district)?.name||pretty(home.district||'unassigned')):'No district';
  const residents=(home?.residents||[]).map(id=>chr(id)?.name||pretty(id));
  const accessRules=Object.entries(access).filter(([,value])=>value===true).map(([key])=>pretty(key));
  const rooms=(home?.rooms||[]).map(room=>{
    const navigation=Object.entries(residenceRoomNavigation(home,room)).map(([direction,target])=>
      '<span><b>'+esc(direction==='up'?'↑':direction==='down'?'↓':direction==='left'?'←':'→')+'</b> '+esc(residenceRoomTarget(home,target))+'</span>').join('');
    const actions=(room.actions||[]).map(pretty).join(', ');
    return '<div class="residence-room'+(room.id===entranceId?' entrance':'')+'"><header><b>'+esc(room.name||pretty(room.id))+'</b><small>'+esc(room.id)+'</small></header>'+
      '<div class="residence-room-badges">'+(room.id===entranceId?'<span>entrance</span>':'')+
      (room.access?'<span>'+esc(pretty(room.access))+'</span>':'<span>shared access</span>')+'</div>'+
      (navigation?'<div class="residence-room-nav">'+navigation+'</div>':'<p>No room exits mapped</p>')+
      (actions?'<p class="residence-room-actions"><b>Actions:</b> '+esc(actions)+'</p>':'')+'</div>';
  }).join('');
  const routine=character.home_routine?.default_by_block||{};
  const homePlacements=(character.schedule?.fixed_commitments||[]).filter(item=>item.home_placement?.room);
  return '<div class="field edfull residence-editor"><p class="rubric">Residence</p>'+
    '<div class="residence-link-grid"><div class="field"><label>Home location</label><select id="edHomeLocation">'+residenceOptions(character)+'</select></div>'+
    '<div class="residence-fact"><span>District</span><b>'+esc(district)+'</b></div>'+
    '<div class="residence-fact"><span>Registry residents</span><b>'+esc(residents.join(', ')||'None listed')+'</b></div>'+
    '<div class="residence-fact"><span>Entrance</span><b>'+esc(entranceId?residenceRoomTarget(home,entranceId):'Not mapped')+'</b></div></div>'+
    '<div class="field"><label>Character-sheet household</label>'+tagList('home.household',character.home?.household||[],'ok')+
      '<p class="hint">Household describes who this character lives with. Registry residents above are synchronized automatically for authored NPC sheets.</p></div>'+
    (!home?'<div class="guard">Choose a registered residence to see its access rules, rooms, and home routine.</div>':
      '<div class="residence-policy"><label><input type="checkbox" id="edHomeDiscoverable"'+(discovery.discoverable!==false?' checked':'')+'> Discoverable</label>'+
      '<label><input type="checkbox" id="edHomeHidden"'+(discovery.hidden_until_discovered?' checked':'')+'> Hidden until discovered</label>'+
      '<label><input type="checkbox" id="edHomeInvitation"'+(access.requires_invitation?' checked':'')+'> Invitation required</label>'+
      '<div class="field"><label>Discovery sources</label><input id="edHomeSources" value="'+esc((discovery.sources||[]).join(', '))+'" placeholder="quest, invitation, exploration"></div></div>'+
      '<p class="residence-summary">'+esc(home.name)+' · '+esc(pretty(home.type||'residence'))+' · '+(home.rooms||[]).length+' rooms'+
        (accessRules.length?' · '+esc(accessRules.join(', ')):'')+'. Changes to visibility and access are saved with the location registry.</p>'+
      (specialLayout?'<p class="hint residence-runtime-note">Room arrows and the entrance below come from the '+esc(specialLayout.source)+
        '. Room names, access, actions, residents, and discovery settings come from the location registry.</p>':'')+
      '<div class="residence-section-head"><b>Room navigation</b><button class="btn quiet" id="edOpenHomeLocation">Open in Places</button></div>'+
      '<div class="residence-room-map">'+(rooms||'<div class="guard">This residence has no rooms mapped yet.</div>')+'</div>'+
      '<div class="residence-section-head"><b>Default home routine</b><button class="btn quiet" id="edHomeSchedule">Open weekly schedule</button></div>'+
      '<div class="home-routine-grid"><div class="home-routine-head">Time</div><div class="home-routine-head">Room</div><div class="home-routine-head">Activity label</div><div class="home-routine-head">Activity id</div><div class="home-routine-head">Visible</div>'+
      BLOCKS.map(block=>{const placement=routine[block]||{};return '<div class="home-routine-time">'+esc(pretty(block))+'</div>'+
        '<select data-home-routine-room="'+block+'">'+residenceRoomOptions(home,placement.room||'')+'</select>'+
        '<input data-home-routine-label="'+block+'" value="'+esc(placement.label||'')+'" placeholder="At home">'+
        '<input data-home-routine-activity="'+block+'" value="'+esc(placement.activity||'')+'" placeholder="at_home">'+
        '<label class="home-routine-visible"><input type="checkbox" data-home-routine-spawn="'+block+'"'+
          (placement.room&&placement.spawn!==false?' checked':'')+'> show</label>';}).join('')+'</div>'+
      (homePlacements.length?'<div class="scheduled-home-placements"><b>Weekly home placements</b>'+homePlacements.map(item=>
        '<span>'+esc(item.label||pretty(item.activity))+' · '+esc((item.days||[]).map(day=>day.slice(0,3)).join(', '))+' · '+
        esc((item.blocks||[]).map(pretty).join(', '))+' · '+esc(residenceRoomTarget(home,item.home_placement.room))+'</span>').join('')+'</div>':'')+
      '<p class="hint">Room positions are optional. The game uses these room assignments to decide whether the NPC appears when the player enters.</p>')+'</div>';
}

function openRelationshipChapterQuest(character,index){
  const chapter=character.relationship_chapters[index];if(!chapter)return;
  try{
    const plan=normalizeRelationshipChapterStory(character,chapter);
    if(plan.quest_count<1)plan.quest_count=1;
    const result=ensureRelationshipChapterQuest(character,relationshipChapterQuestSlots(character,chapter)[0]);
    sel=result.quest.uid;focusPath=[];stageIx=0;save();paintAll();
    $('editor').close();openQuestBuilder();
    if(result.created)note('Created the story quest for '+esc(chapter.title)+'. Build its objectives and scenes here.');
  }catch(error){note(esc(error.message));}
}

function paintEditor(){
  const c=P.characters[edIx];if(!c)return;
  c.profile=c.profile||{};c.personality=c.personality||{};c.boundaries=c.boundaries||{};
  c.identity=c.identity||{};c.characteristics=c.characteristics||{};c.custom_stats=c.custom_stats||{};
  c.home=c.home||{location_id:'',district:'',residence:'',household:[]};
  if(!Array.isArray(c.home.household))c.home.household=[];
  c.home_routine=c.home_routine||{actor_color:String(c.color||'').replace('#',''),default_by_block:{}};
  c.home_routine.default_by_block=c.home_routine.default_by_block||{};
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
      '<div class="field edfull"><label>Display name</label><input type="text" id="edDisplayName" value="'+esc(c.name||c.display_name||'')+'">'+
        '<p class="hint">You can rename the character at any time. Their internal id <code>'+esc(c.id)+'</code> stays unchanged so existing quests and conversations remain connected.</p></div>'+
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

      residenceEditorHtml(c)+

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

      '<div class="field edfull"><p class="rubric">Five relationship levels</p>'+
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
        'Levels 4–5 also require a dating agreement on romantic routes. Open the Story arc workshop to choose how many quests happen at each level; the first quest keeps the level id.</p></div>'+

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

  $('edDisplayName').onchange=event=>{
    try{
      const name=setCharacterDisplayName(c,event.target.value);
      event.target.value=name;$('edName').textContent=name;
      save();paintCast();paintSheet();paintSetup();
    }catch(error){
      event.target.value=c.name||c.display_name||'';note(esc(error.message));
    }
  };

  $('edHomeLocation').onchange=event=>{
    try{
      setCharacterHomeLocation(c,event.target.value);
      save();paintCast();paintSheet();paintSetup();paintEditor();
    }catch(error){event.target.value=c.home.location_id||'';note(esc(error.message));}
  };
  const home=characterHomeLocation(c);
  if(home){
    const discovery=()=>home.discovery=home.discovery&&typeof home.discovery==='object'?home.discovery:{};
    const access=()=>home.access=home.access&&typeof home.access==='object'?home.access:{};
    const saveResidence=()=>{rememberResidenceOverride(home);save();};
    $('edHomeDiscoverable').onchange=event=>{discovery().discoverable=event.target.checked;saveResidence();};
    $('edHomeHidden').onchange=event=>{discovery().hidden_until_discovered=event.target.checked;saveResidence();};
    $('edHomeInvitation').onchange=event=>{access().requires_invitation=event.target.checked;saveResidence();};
    $('edHomeSources').onchange=event=>{
      discovery().sources=[...new Set(String(event.target.value||'').split(',').map(value=>slug(value)).filter(Boolean))];
      event.target.value=discovery().sources.join(', ');saveResidence();
    };
    const routineEntry=block=>{
      c.home_routine.default_by_block=c.home_routine.default_by_block||{};
      return c.home_routine.default_by_block[block]=c.home_routine.default_by_block[block]||
        {room:'',spawn:false,activity:'at_home',label:'At home'};
    };
    B.querySelectorAll('[data-home-routine-room]').forEach(select=>select.onchange=()=>{
      const entry=routineEntry(select.dataset.homeRoutineRoom);entry.room=select.value;
      entry.spawn=!!select.value;if(select.value&&!entry.activity)entry.activity='at_home';
      if(select.value&&!entry.label)entry.label='At home';save();paintEditor();
    });
    B.querySelectorAll('[data-home-routine-label]').forEach(input=>input.oninput=()=>{
      routineEntry(input.dataset.homeRoutineLabel).label=input.value;save();
    });
    B.querySelectorAll('[data-home-routine-activity]').forEach(input=>input.oninput=()=>{
      routineEntry(input.dataset.homeRoutineActivity).activity=input.value.trim()?slug(input.value):'';save();
    });
    B.querySelectorAll('[data-home-routine-spawn]').forEach(input=>input.onchange=()=>{
      const entry=routineEntry(input.dataset.homeRoutineSpawn);
      if(input.checked&&!entry.room){input.checked=false;note('Choose a home room before showing this character there.');return;}
      entry.spawn=input.checked;save();
    });
    $('edOpenHomeLocation').onclick=()=>{
      selPlace=P.locations.indexOf(home);$('editor').close();
      const placesTab=document.querySelector('.railtabs button[data-tab="places"]');if(placesTab)placesTab.click();
      paintPlaces();paintPlaceForm();
    };
    $('edHomeSchedule').onclick=()=>{$('editor').close();openSchedule(edIx);};
  }

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
    const old=chapter.id,next=slug(el.value);
    const linked=P.content.filter(item=>item.type==='quest'&&item.character===c.id&&(
      item.id===old||item.id.startsWith(old+'_part_')||item.questPlan?.relationshipArc?.chapter_id===old));
    const duplicate=c.relationship_chapters.some((item,j)=>j!==index&&item.id===next);
    const partOf=quest=>+quest.questPlan?.relationshipArc?.part||
      (quest.id===old?1:(parseInt(quest.id.slice((old+'_part_').length),10)||1));
    const maxPart=Math.max(1,normalizeRelationshipChapterStory(c,chapter).quest_count,
      ...linked.map(partOf));
    const targets=new Set(Array.from({length:maxPart},(_,partIndex)=>partIndex?next+'_part_'+(partIndex+1):next));
    const collision=P.content.find(item=>item.type==='quest'&&!linked.includes(item)&&targets.has(item.id));
    if(duplicate||collision){el.value=old;note(duplicate?'Every milestone needs a unique id.':'That id already belongs to another quest.');return;}
    linked.sort((a,b)=>partOf(b)-partOf(a)).forEach(quest=>{
      const part=partOf(quest);renameContentId(quest,part>1?next+'_part_'+part:next);
      if(quest.questPlan?.relationshipArc)quest.questPlan.relationshipArc.chapter_id=next;
    });
    chapter.id=next;el.value=next;save();paintEditor();paintSetup();
  });
  B.querySelectorAll('[data-chtitle]').forEach(el=>el.oninput=()=>{
    const chapter=c.relationship_chapters[+el.dataset.chtitle];
    chapter.title=el.value;
    P.content.filter(item=>item.type==='quest'&&item.character===c.id&&(
      item.id===chapter.id||item.id.startsWith(chapter.id+'_part_')||
      item.questPlan?.relationshipArc?.chapter_id===chapter.id)).forEach(quest=>{
        const part=+quest.questPlan?.relationshipArc?.part||
          (quest.id===chapter.id?1:(parseInt(quest.id.slice((chapter.id+'_part_').length),10)||1));
        quest.title=part>1?el.value+' — Part '+part:el.value;
      });
    save();paintSetup();});
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
