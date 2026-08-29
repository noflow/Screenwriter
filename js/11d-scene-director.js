/* ============ VN scene director ============ */
const SCENE_DIRECTOR_TRANSITIONS=['','cut','fade','dissolve','wipe_left','wipe_right'];
const SCENE_DIRECTOR_POSITIONS=['','left','center','right','offstage'];
const SCENE_DIRECTOR_EXPRESSIONS=['neutral','happy','warm','amused','playful','surprised',
  'thoughtful','concerned','sad','angry','embarrassed','nervous','flirty','tired'];
const SCENE_DIRECTOR_NODE_FIELDS=['portrait','background_variant','position','transition',
  'music','ambience','sfx'];
const SCENE_DIRECTOR_SCENE_FIELDS=['transition','music','ambience','notes'];

let sceneDirectorUid='',sceneDirectorPath='';

function cloneSceneDirection(value){
  return value&&typeof value==='object'&&!Array.isArray(value)
    ?JSON.parse(JSON.stringify(value)):{};
}

/** Converts a game's optional conversation.presentation block into editable data.
    `_orig` retains future fields this version of the editor does not know yet. */
function sceneDirectionFromAuthored(presentation){
  if(!presentation||typeof presentation!=='object'||Array.isArray(presentation))return undefined;
  const out={_orig:cloneSceneDirection(presentation)};
  SCENE_DIRECTOR_SCENE_FIELDS.forEach(key=>{
    if(Object.prototype.hasOwnProperty.call(presentation,key))out[key]=presentation[key];
  });
  return out;
}

function normalizeSceneDirection(conversation){
  if(!conversation.sceneDirection||typeof conversation.sceneDirection!=='object'||
     Array.isArray(conversation.sceneDirection))conversation.sceneDirection={};
  SCENE_DIRECTOR_SCENE_FIELDS.forEach(key=>{
    if(conversation.sceneDirection[key]===undefined)conversation.sceneDirection[key]='';
  });
  return conversation.sceneDirection;
}

/** Merges writer changes over the imported block, deleting a modeled cue only when
    the writer deliberately clears it. Unknown presentation keys survive. */
function sceneDirectionToAuthored(direction,source){
  if(!direction)return source&&typeof source==='object'&&Object.keys(source).length
    ?cloneSceneDirection(source):undefined;
  const out=Object.assign({},cloneSceneDirection(direction._orig),cloneSceneDirection(source));
  SCENE_DIRECTOR_SCENE_FIELDS.forEach(key=>{
    const value=direction[key];
    if(value!==undefined&&value!==null&&String(value).trim()!=='')out[key]=value;
    else delete out[key];
  });
  return Object.keys(out).length?out:undefined;
}

/** Node cues are direct game fields rendered by Port Alder's VN presentation layer. */
function lineStageFromAuthored(node){
  if(!node||typeof node!=='object')return undefined;
  const hasCue=SCENE_DIRECTOR_NODE_FIELDS.some(key=>Object.prototype.hasOwnProperty.call(node,key));
  if(!hasCue)return undefined;
  const out={};
  SCENE_DIRECTOR_NODE_FIELDS.forEach(key=>{
    if(Object.prototype.hasOwnProperty.call(node,key))out[key]=node[key];
  });
  return out;
}

function normalizeLineStage(line){
  if(!line.stage||typeof line.stage!=='object'||Array.isArray(line.stage))line.stage={};
  SCENE_DIRECTOR_NODE_FIELDS.forEach(key=>{
    if(line.stage[key]===undefined)line.stage[key]='';
  });
  return line.stage;
}

function applyLineStageToAuthored(stage,node){
  if(!stage)return node;
  SCENE_DIRECTOR_NODE_FIELDS.forEach(key=>{
    const value=stage[key];
    if(value!==undefined&&value!==null&&String(value).trim()!=='')node[key]=value;
    else delete node[key];
  });
  return node;
}

function sceneDirectorConversations(){
  return (P.content||[]).filter(item=>item.type==='conversation');
}

function sceneDirectorConversation(){
  return sceneDirectorConversations().find(item=>item.uid===sceneDirectorUid)||null;
}

function sceneDirectorLines(conversation){
  const out=[];
  const scan=(list,path)=>{
    (list||[]).forEach((node,index)=>{
      const nodePath=path.concat(index);
      if(node.type==='line')out.push({node,path:nodePath,key:nodePath.join('.')});
      if(node.type==='choice'||node.type==='gate')
        (node.options||[]).forEach((option,optionIndex)=>scan(option.nodes,nodePath.concat(optionIndex)));
    });
  };
  scan(conversation?.nodes||[],[]);
  return out;
}

function sceneDirectorEntry(){
  const conversation=sceneDirectorConversation();
  const lines=sceneDirectorLines(conversation);
  return lines.find(entry=>entry.key===sceneDirectorPath)||lines[0]||null;
}

function sceneDirectorCharacterColor(character){
  return character?.color||character?.asset_refs?.portraits?.[0]?.accent||'#8db9da';
}

function sceneDirectorPresentationCatalog(){
  return typeof BUNDLED_PRESENTATION_ASSET_CATALOG!=='undefined'&&
    BUNDLED_PRESENTATION_ASSET_CATALOG&&typeof BUNDLED_PRESENTATION_ASSET_CATALOG==='object'
    ?BUNDLED_PRESENTATION_ASSET_CATALOG:{backgrounds:[],portraits:[],audio:[],
      vocabulary:{background_variants:[],portrait_expressions:[]},backlog:{phases:[]}};
}

function sceneDirectorAudioType(asset){
  const explicit=String(asset?.cue_type||asset?.type||'').toLowerCase();
  if(['music','ambience','sfx'].includes(explicit))return explicit;
  const bus=String(asset?.bus||'').toLowerCase();
  return bus==='music'?'music':bus==='ambience'?'ambience':'sfx';
}

function sceneDirectorUniqueAssets(rows){
  const seen=new Set();
  return rows.filter(item=>{
    const id=String(item?.id||'');
    if(!id||seen.has(id))return false;
    seen.add(id);return true;
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}

function sceneDirectorPortraitAssets(entry){
  const characterId=entry?.node?.speaker||'';
  if(!characterId||['player','__player__','__narrator__'].includes(characterId))return [];
  const catalog=sceneDirectorPresentationCatalog();
  const bundled=(catalog.portraits||[]).filter(item=>item.character_id===characterId);
  const live=Array.isArray(chr(characterId)?.asset_refs?.portraits)
    ?chr(characterId).asset_refs.portraits.map(item=>Object.assign({character_id:characterId},item)):[];
  return sceneDirectorUniqueAssets(live.concat(bundled));
}

function sceneDirectorAudioAssets(kind,entry){
  const catalog=sceneDirectorPresentationCatalog();
  const characterId=entry?.node?.speaker||'';
  const allowedOwner=item=>!item.character_id||(characterId&&item.character_id===characterId);
  const bundled=(catalog.audio||[]).filter(item=>allowedOwner(item)&&sceneDirectorAudioType(item)===kind);
  const character=characterId?chr(characterId):null;
  const live=Array.isArray(character?.asset_refs?.audio)
    ?character.asset_refs.audio.map(item=>Object.assign({character_id:characterId},item))
      .filter(item=>sceneDirectorAudioType(item)===kind):[];
  return sceneDirectorUniqueAssets(live.concat(bundled));
}

function sceneDirectorAudioConfigured(){
  if((sceneDirectorPresentationCatalog().audio||[]).length)return true;
  return (P.characters||[]).some(character=>Array.isArray(character?.asset_refs?.audio)&&
    character.asset_refs.audio.length);
}

function sceneDirectorConversationUsesAudio(conversation){
  const direction=conversation?.sceneDirection||{};
  if(['music','ambience'].some(key=>String(direction[key]||'').trim()))return true;
  return sceneDirectorLines(conversation).some(({node})=>
    ['music','ambience','sfx'].some(key=>String(node?.stage?.[key]||'').trim()));
}

function sceneDirectorBackgroundAsset(location){
  return (sceneDirectorPresentationCatalog().backgrounds||[]).find(item=>item.id===location)||null;
}

function sceneDirectorVariantAssets(location){
  const variants=sceneDirectorBackgroundAsset(location)?.variants;
  const registered=variants&&typeof variants==='object'&&!Array.isArray(variants)
    ?Object.keys(variants).sort().map(id=>({id,path:variants[id],registered:true})):[];
  const planned=(sceneDirectorPresentationCatalog().vocabulary?.background_variants||[])
    .map(item=>({id:item.id,label:item.label,planned:true}));
  return sceneDirectorUniqueAssets(registered.concat(planned));
}

function sceneDirectorExpressionVocabulary(){
  const authored=sceneDirectorPresentationCatalog().vocabulary?.portrait_expressions||[];
  const rows=authored.concat(SCENE_DIRECTOR_EXPRESSIONS.map(id=>({id,label:pretty(id)})));
  return sceneDirectorUniqueAssets(rows);
}

function sceneDirectorExpressionStatus(expression,entry){
  const portraits=sceneDirectorPortraitAssets(entry);
  if(expression&&portraits.some(item=>item.id===expression))
    return {state:'registered',text:'Registered expression portrait · '+expression};
  if(expression&&sceneDirectorExpressionVocabulary().some(item=>item.id===expression))
    return {state:'planned',text:'Planned expression · the default portrait is used until this pose is registered'};
  if(expression)
    return {state:'custom',text:'Custom expression · add a matching portrait id when artwork is ready'};
  return {state:'ready',text:sceneDirectorExpressionVocabulary().length+' standardized expressions available'};
}

function sceneDirectorExpressionControl(expression,entry){
  const status=sceneDirectorExpressionStatus(expression,entry);
  return '<div class="field"><label>Expression</label><input type="text" list="sceneDirectorExpressions" data-scene-line="emotion" value="'+esc(expression)+'" placeholder="neutral">'+
    '<small class="scene-asset-status '+status.state+'">'+esc(status.text)+'</small></div>';
}

function sceneDirectorAssetEntries(kind,entry,location){
  if(kind==='portrait')return sceneDirectorPortraitAssets(entry);
  if(kind==='background_variant')return sceneDirectorVariantAssets(location);
  return sceneDirectorAudioAssets(kind,entry);
}

function sceneDirectorAssetNoun(kind,count=1){
  const labels={
    portrait:['portrait','portraits'],
    background_variant:['background variant','background variants'],
    music:['music cue','music cues'],
    ambience:['ambience cue','ambience cues'],
    sfx:['sound effect','sound effects']
  };
  const pair=labels[kind]||[pretty(kind),pretty(kind)+'s'];
  return pair[count===1?0:1];
}

function sceneDirectorAssetStatus(kind,current,assets,location){
  const matched=assets.find(item=>item.id===current);
  if(current==='stop'||current==='silence')
    return {state:'registered',text:'Runtime stop / silence cue'};
  if(matched?.planned&&!matched.registered){
    return {state:'planned',text:'Planned '+sceneDirectorAssetNoun(kind)+' · the main background is used until its artwork is registered'};
  }
  if(matched){
    const owner=matched.character_id?' · '+(chr(matched.character_id)?.name||pretty(matched.character_id)):'';
    return {state:'registered',text:'Registered '+sceneDirectorAssetNoun(kind)+owner+(matched.path?' · '+matched.path:'')};
  }
  if(current){
    const subject=kind==='background_variant'?'variant':kind==='portrait'?'portrait':'audio cue';
    return {state:'custom',text:'Custom '+subject+' · verify it in the game asset catalog before export'};
  }
  if(kind==='background_variant'&&!sceneDirectorBackgroundAsset(location))
    return {state:'fallback',text:'This room uses the game fallback background'};
  return {state:assets.length?'ready':'empty',text:assets.length+
    ' registered '+sceneDirectorAssetNoun(kind,assets.length)+' available'};
}

function sceneDirectorBackgroundStatus(location){
  const asset=sceneDirectorBackgroundAsset(location);
  return asset
    ?'<small class="scene-asset-status registered">Registered background · '+esc(asset.path||asset.id)+'</small>'
    :'<small class="scene-asset-status fallback">Runtime fallback · add this room to vn_art.json for unique art</small>';
}

function sceneDirectorAssetControl(label,current,kind,scope,field,entry,location,emptyLabel){
  const assets=sceneDirectorAssetEntries(kind,entry,location),known=assets.some(item=>item.id===current);
  const builtin=['music','ambience','sfx'].includes(kind)&&['stop','silence'].includes(current);
  const custom=Boolean(current)&&!known&&!builtin;
  const status=sceneDirectorAssetStatus(kind,current,assets,location);
  const options='<option value=""'+(!current?' selected':'')+'>'+esc(emptyLabel)+'</option>'+
    (['music','ambience','sfx'].includes(kind)?'<option value="stop"'+(current==='stop'||current==='silence'?' selected':'')+'>Stop / silence</option>':'')+
    assets.map(item=>'<option value="'+esc(item.id)+'"'+(item.id===current?' selected':'')+'>'+esc(item.id)+
      (item.character_id?' · '+esc(chr(item.character_id)?.name||pretty(item.character_id)):'')+
      (item.planned&&!item.registered?' · planned':'')+'</option>').join('')+
    '<option value="__custom__"'+(custom?' selected':'')+'>Custom id…</option>';
  return '<div class="field scene-asset-field" data-scene-asset-control><label>'+esc(label)+'</label>'+
    '<select data-scene-asset-select data-scene-asset-scope="'+scope+'" data-scene-asset-key="'+field+'">'+options+'</select>'+
    '<input type="text" data-scene-asset-custom value="'+esc(custom?current:'')+'" placeholder="Custom '+esc(pretty(kind).toLowerCase())+' id"'+(custom?'':' hidden')+'>'+
    '<small class="scene-asset-status '+status.state+'" data-scene-asset-status>'+esc(status.text)+'</small></div>';
}

function sceneDirectorCharacterOptions(conversation){
  const ids=[...(conversation.cast||[])];
  sceneDirectorLines(conversation).forEach(({node})=>{
    if(node.speaker&&node.speaker!=='__narrator__'&&!ids.includes(node.speaker))ids.push(node.speaker);
  });
  return ids.filter(id=>id!=='player'&&id!=='__player__'&&id!=='__narrator__');
}

function sceneDirectorTransitionOptions(current,inheritLabel='Inherit scene'){
  return SCENE_DIRECTOR_TRANSITIONS.map((value,index)=>'<option value="'+esc(value)+'"'+
    (value===current?' selected':'')+'>'+esc(index?pretty(value):inheritLabel)+'</option>').join('');
}

function sceneDirectorPositionOptions(current){
  return SCENE_DIRECTOR_POSITIONS.map((value,index)=>'<option value="'+esc(value)+'"'+
    (value===current?' selected':'')+'>'+esc(index?'Portrait '+pretty(value):'Automatic position')+'</option>').join('');
}

function sceneDirectorCueLabel(entry,index){
  const speaker=chr(entry.node.speaker)?.name||pretty(entry.node.speaker||'Narration');
  const excerpt=String(entry.node.text||'Empty line').replace(/\s+/g,' ').slice(0,52);
  return '<button class="scene-cue'+(entry.key===sceneDirectorPath?' on':'')+'" data-scene-cue="'+
    esc(entry.key)+'"><span>'+(index+1)+'</span><b>'+esc(speaker)+'</b><small>'+esc(excerpt)+'</small></button>';
}

function sceneDirectorPreviewMarkup(){
  const conversation=sceneDirectorConversation(),entry=sceneDirectorEntry();
  if(!conversation||!entry)return '<div class="scene-director-empty">Add a dialogue line to stage this scene.</div>';
  const line=entry.node,stage=normalizeLineStage(line),direction=normalizeSceneDirection(conversation);
  const speaker=chr(line.speaker),narrator=line.speaker==='__narrator__';
  const cast=sceneDirectorCharacterOptions(conversation);
  const speakerPosition=SCENE_DIRECTOR_POSITIONS.includes(stage.position)&&stage.position
    ?stage.position:'center';
  const automatic=['left','center','right'];
  const openPositions=automatic.filter(position=>position!==speakerPosition);
  const orderedCast=line.speaker&&cast.includes(line.speaker)
    ?[line.speaker].concat(cast.filter(id=>id!==line.speaker)):cast.slice();
  const stagedCast=orderedCast.slice(0,3);
  const hiddenCast=Math.max(0,cast.length-stagedCast.length);
  let supportingIndex=0;
  const cards=stagedCast.map(id=>{
    const character=chr(id)||{id,name:pretty(id)},active=id===line.speaker;
    const position=active?speakerPosition:(openPositions[supportingIndex++%openPositions.length]||'left');
    if(position==='offstage')return '';
    const expression=active?(line.emotion||'neutral'):'neutral';
    return '<div class="scene-portrait '+esc(position)+(active?' speaking':'')+'" style="--portrait:'+esc(sceneDirectorCharacterColor(character))+'">'+
      '<div class="scene-portrait-figure"><span>'+esc((character.name||'?').slice(0,1))+'</span></div><b>'+esc(character.name||pretty(id))+
      '</b><small>'+esc(expression)+(active&&stage.portrait?' · '+esc(stage.portrait):'')+'</small></div>';
  }).join('');
  const location=conversation.location?placeName(conversation.location):'Unplaced scene';
  const variant=stage.background_variant||'';
  const cueBits=[stage.transition||direction.transition,stage.music||direction.music,
    stage.ambience||direction.ambience,stage.sfx].filter(Boolean);
  return '<div class="scene-screen" data-scene-location="'+esc(conversation.location||'')+'">'+
    '<div class="scene-screen-atmosphere"><span>'+esc(location)+'</span>'+
    (variant?'<b>Variant · '+esc(pretty(variant))+'</b>':'')+'</div>'+cards+
    ((speakerPosition==='offstage'&&!narrator)||hiddenCast?'<div class="scene-offstage">'+
      (speakerPosition==='offstage'&&!narrator?esc(speaker?.name||pretty(line.speaker))+' · offstage':'')+
      (speakerPosition==='offstage'&&!narrator&&hiddenCast?' · ':'')+(hiddenCast?'+'+hiddenCast+' cast offstage':'')+'</div>':'')+
    '<div class="scene-dialogue'+(narrator?' narration':'')+'"><b>'+esc(narrator?'Narration':speaker?.name||pretty(line.speaker))+
    (line.emotion?' · '+esc(line.emotion):'')+'</b><p>'+dress(line.text||'Empty dialogue line')+'</p></div>'+
    (cueBits.length?'<div class="scene-cue-strip">'+cueBits.map(bit=>'<span>'+esc(pretty(bit))+'</span>').join('')+'</div>':'')+
    '</div>';
}

function renderSceneDirectorPreview(){
  const target=$('sceneDirectorPreview');if(target)target.innerHTML=sceneDirectorPreviewMarkup();
}

function paintSceneDirector(){
  const conversations=sceneDirectorConversations(),selector=$('sceneDirectorConversation');
  selector.innerHTML=conversations.map(item=>'<option value="'+esc(item.uid)+'"'+
    (item.uid===sceneDirectorUid?' selected':'')+'>'+esc(item.title||pretty(item.id))+'</option>').join('');
  const body=$('sceneDirectorBody'),conversation=sceneDirectorConversation();
  if(!conversation){
    body.innerHTML='<div class="scene-director-empty"><b>No conversations yet.</b><span>Create or import a conversation before opening the director.</span></div>';
    return;
  }
  const direction=normalizeSceneDirection(conversation),lines=sceneDirectorLines(conversation);
  if(!lines.some(entry=>entry.key===sceneDirectorPath))sceneDirectorPath=lines[0]?.key||'';
  const entry=sceneDirectorEntry(),stage=entry?normalizeLineStage(entry.node):null;
  const lineIndex=Math.max(0,lines.findIndex(item=>item.key===sceneDirectorPath));
  const expression=entry?.node?.emotion||'';
  const audioActive=sceneDirectorAudioConfigured()||sceneDirectorConversationUsesAudio(conversation);
  const transitionControl='<div class="field"><label>Opening transition</label><select data-scene-direction="transition">'+sceneDirectorTransitionOptions(direction.transition,'Runtime default')+'</select></div>';
  const sceneAudioControls=audioActive
    ?'<div class="two">'+transitionControl+sceneDirectorAssetControl('Music cue',direction.music,'music','direction','music',null,conversation.location,'Runtime default')+'</div>'+
      sceneDirectorAssetControl('Ambience',direction.ambience,'ambience','direction','ambience',null,conversation.location,'Runtime default')
    :transitionControl+'<p class="scene-audio-dormant">Audio is not configured for this project. Its controls will appear automatically if audio cues are added later.</p>';
  const cueAudioControls=audioActive&&entry
    ?'<div class="two">'+sceneDirectorAssetControl('Music override',stage.music,'music','stage','music',entry,conversation.location,'Inherit scene')+
      sceneDirectorAssetControl('Ambience override',stage.ambience,'ambience','stage','ambience',entry,conversation.location,'Inherit scene')+'</div>'+
      sceneDirectorAssetControl('Sound effect',stage.sfx,'sfx','stage','sfx',entry,conversation.location,'No sound effect')
    :'';
  const runtimeNote=audioActive
    ?'<b>Live in Port Alder:</b> artwork, transitions, music, ambience, and SFX use the registered runtime catalog.'
    :'<b>Artwork-first project:</b> portraits, expressions, positions, variants, and transitions are active. Audio remains dormant.';
  body.innerHTML='<div class="scene-director-layout">'+
    '<aside class="scene-cue-list"><header><b>Cue sheet</b><span>'+lines.length+' line'+(lines.length===1?'':'s')+'</span></header>'+lines.map(sceneDirectorCueLabel).join('')+'</aside>'+
    '<main class="scene-director-main"><section class="scene-director-preview" id="sceneDirectorPreview">'+sceneDirectorPreviewMarkup()+'</section>'+
    '<div class="scene-director-step"><button class="btn" data-scene-step="-1"'+(lineIndex<=0?' disabled':'')+'>← Previous cue</button><span>'+(lines.length?lineIndex+1:0)+' / '+lines.length+'</span><button class="btn" data-scene-step="1"'+(lineIndex>=lines.length-1?' disabled':'')+'>Next cue →</button></div></main>'+
    '<aside class="scene-director-controls"><section><h4>Scene</h4><div class="field"><label>Background / room</label><select data-scene-base="location">'+placeOptions(conversation.location)+'</select>'+sceneDirectorBackgroundStatus(conversation.location)+'</div>'+
    sceneAudioControls+
    '<div class="field"><label>Director notes</label><textarea data-scene-direction="notes" placeholder="Lighting, pacing, camera, or performance notes">'+esc(direction.notes)+'</textarea></div></section>'+
    (entry?'<section><div class="scene-director-section-head"><h4>Selected cue</h4><button data-scene-reset>Clear overrides</button></div>'+
      '<div class="scene-line-summary"><b>'+esc(chr(entry.node.speaker)?.name||pretty(entry.node.speaker))+'</b><span>'+esc(entry.node.text||'Empty dialogue line')+'</span></div>'+
      '<div class="two">'+sceneDirectorExpressionControl(expression,entry)+sceneDirectorAssetControl('Portrait',stage.portrait,'portrait','stage','portrait',entry,conversation.location,'Automatic / default')+'</div>'+
      '<datalist id="sceneDirectorExpressions">'+sceneDirectorExpressionVocabulary().map(item=>'<option value="'+esc(item.id)+'">'+esc(item.label||pretty(item.id))+'</option>').join('')+'</datalist>'+
      '<div class="two"><div class="field"><label>Position</label><select data-scene-stage="position">'+sceneDirectorPositionOptions(stage.position)+'</select></div><div class="field"><label>Transition</label><select data-scene-stage="transition">'+sceneDirectorTransitionOptions(stage.transition)+'</select></div></div>'+
      sceneDirectorAssetControl('Background variant',stage.background_variant,'background_variant','stage','background_variant',entry,conversation.location,'Inherit main background')+
      cueAudioControls+
      '<p class="scene-runtime-note">'+runtimeNote+'</p></section>':'<section class="scene-director-empty">Write a line before adding cue direction.</section>')+'</aside></div>';
  wireSceneDirector();
}

function wireSceneDirector(){
  const conversation=sceneDirectorConversation(),entry=sceneDirectorEntry();if(!conversation)return;
  $('sceneDirectorBody').querySelectorAll('[data-scene-cue]').forEach(button=>button.onclick=()=>{
    sceneDirectorPath=button.dataset.sceneCue;paintSceneDirector();
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-step]').forEach(button=>button.onclick=()=>{
    const lines=sceneDirectorLines(conversation),index=lines.findIndex(item=>item.key===sceneDirectorPath);
    const next=lines[index+Number(button.dataset.sceneStep)];if(next){sceneDirectorPath=next.key;paintSceneDirector();}
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-base]').forEach(control=>control.onchange=()=>{
    conversation[control.dataset.sceneBase]=control.value;save();paintSceneDirector();
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-direction]').forEach(control=>{
    const update=()=>{normalizeSceneDirection(conversation)[control.dataset.sceneDirection]=control.value;save();renderSceneDirectorPreview();};
    control.oninput=update;control.onchange=update;
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-stage]').forEach(control=>{
    const update=()=>{normalizeLineStage(entry.node)[control.dataset.sceneStage]=control.value;save();renderSceneDirectorPreview();};
    control.oninput=update;control.onchange=update;
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-line]').forEach(control=>{
    const update=()=>{
      entry.node[control.dataset.sceneLine]=control.value.trim().toLowerCase();
      if(control.dataset.sceneLine==='emotion'){
        const status=control.parentElement.querySelector('.scene-asset-status');
        const report=sceneDirectorExpressionStatus(entry.node.emotion,entry);
        if(status){status.className='scene-asset-status '+report.state;status.textContent=report.text;}
      }
      save();renderSceneDirectorPreview();
    };
    control.oninput=update;control.onchange=()=>{update();paintSceneDirector();};
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-asset-select]').forEach(control=>{
    control.onchange=()=>{
      const wrapper=control.closest('[data-scene-asset-control]');
      const custom=wrapper.querySelector('[data-scene-asset-custom]');
      const owner=control.dataset.sceneAssetScope==='direction'
        ?normalizeSceneDirection(conversation):normalizeLineStage(entry.node);
      const key=control.dataset.sceneAssetKey;
      if(control.value==='__custom__'){
        const status=wrapper.querySelector('[data-scene-asset-status]');
        owner[key]='';custom.value='';custom.hidden=false;
        status.className='scene-asset-status custom';status.textContent='Enter a custom asset id';
        save();renderSceneDirectorPreview();custom.focus();
        return;
      }
      owner[key]=control.value;save();paintSceneDirector();
    };
  });
  $('sceneDirectorBody').querySelectorAll('[data-scene-asset-custom]').forEach(control=>{
    const wrapper=control.closest('[data-scene-asset-control]');
    const select=wrapper.querySelector('[data-scene-asset-select]');
    const status=wrapper.querySelector('[data-scene-asset-status]');
    const update=()=>{
      const owner=select.dataset.sceneAssetScope==='direction'
        ?normalizeSceneDirection(conversation):normalizeLineStage(entry.node);
      owner[select.dataset.sceneAssetKey]=control.value.trim();
      status.className='scene-asset-status custom';
      status.textContent=control.value.trim()
        ?'Custom cue · verify it in the game asset catalog before export':'Enter a custom asset id';
      save();renderSceneDirectorPreview();
    };
    control.oninput=update;control.onchange=()=>{update();paintSceneDirector();};
  });
  const reset=$('sceneDirectorBody').querySelector('[data-scene-reset]');
  if(reset)reset.onclick=()=>{entry.node.stage={};save();paintSceneDirector();};
}

function openSceneDirector(conversationUid,path){
  const conversations=sceneDirectorConversations();
  if(!conversations.length){note('Create or import a conversation before opening the Scene Director.',true);return;}
  const requested=conversations.find(item=>item.uid===conversationUid);
  sceneDirectorUid=(requested||((cur()?.type==='conversation')?cur():null)||conversations[0]).uid;
  const lines=sceneDirectorLines(sceneDirectorConversation());
  sceneDirectorPath=Array.isArray(path)?path.join('.'):(String(path||''));
  if(!lines.some(entry=>entry.key===sceneDirectorPath))sceneDirectorPath=lines[0]?.key||'';
  paintSceneDirector();$('sceneDirector').showModal();
}

$('openSceneDirector').onclick=()=>openSceneDirector();
$('sceneDirectorConversation').onchange=()=>{
  sceneDirectorUid=$('sceneDirectorConversation').value;
  sceneDirectorPath=sceneDirectorLines(sceneDirectorConversation())[0]?.key||'';
  paintSceneDirector();
};
$('sceneDirectorClose').onclick=()=>{$('sceneDirector').close();paintBody();};
