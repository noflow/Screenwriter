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

/** Node cues are direct game fields. Portrait and background_variant already render
    in Port Alder; the remaining cues are forward-compatible direction metadata. */
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

function sceneDirectorPortraitOptions(entry){
  const character=chr(entry?.node?.speaker),current=normalizeLineStage(entry.node).portrait||'';
  const portraits=Array.isArray(character?.asset_refs?.portraits)?character.asset_refs.portraits:[];
  const known=portraits.some(item=>item.id===current);
  return '<option value=""'+(!current?' selected':'')+'>Automatic / default</option>'+
    (current&&!known?'<option value="'+esc(current)+'" selected>Custom · '+esc(current)+'</option>':'')+
    portraits.map(item=>'<option value="'+esc(item.id||'default')+'"'+
      ((item.id||'default')===current?' selected':'')+'>'+esc(pretty(item.id||'default'))+'</option>').join('');
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
  body.innerHTML='<div class="scene-director-layout">'+
    '<aside class="scene-cue-list"><header><b>Cue sheet</b><span>'+lines.length+' line'+(lines.length===1?'':'s')+'</span></header>'+lines.map(sceneDirectorCueLabel).join('')+'</aside>'+
    '<main class="scene-director-main"><section class="scene-director-preview" id="sceneDirectorPreview">'+sceneDirectorPreviewMarkup()+'</section>'+
    '<div class="scene-director-step"><button class="btn" data-scene-step="-1"'+(lineIndex<=0?' disabled':'')+'>← Previous cue</button><span>'+(lines.length?lineIndex+1:0)+' / '+lines.length+'</span><button class="btn" data-scene-step="1"'+(lineIndex>=lines.length-1?' disabled':'')+'>Next cue →</button></div></main>'+
    '<aside class="scene-director-controls"><section><h4>Scene</h4><div class="field"><label>Background / room</label><select data-scene-base="location">'+placeOptions(conversation.location)+'</select></div>'+
    '<div class="two"><div class="field"><label>Opening transition</label><select data-scene-direction="transition">'+sceneDirectorTransitionOptions(direction.transition,'Runtime default')+'</select></div><div class="field"><label>Music cue</label><input type="text" data-scene-direction="music" value="'+esc(direction.music)+'" placeholder="track id"></div></div>'+
    '<div class="field"><label>Ambience</label><input type="text" data-scene-direction="ambience" value="'+esc(direction.ambience)+'" placeholder="rain, café room tone, traffic…"></div>'+
    '<div class="field"><label>Director notes</label><textarea data-scene-direction="notes" placeholder="Lighting, pacing, camera, or performance notes">'+esc(direction.notes)+'</textarea></div></section>'+
    (entry?'<section><div class="scene-director-section-head"><h4>Selected cue</h4><button data-scene-reset>Clear overrides</button></div>'+
      '<div class="scene-line-summary"><b>'+esc(chr(entry.node.speaker)?.name||pretty(entry.node.speaker))+'</b><span>'+esc(entry.node.text||'Empty dialogue line')+'</span></div>'+
      '<div class="two"><div class="field"><label>Expression</label><input type="text" list="sceneDirectorExpressions" data-scene-line="emotion" value="'+esc(expression)+'" placeholder="neutral"></div><div class="field"><label>Portrait</label><select data-scene-stage="portrait">'+sceneDirectorPortraitOptions(entry)+'</select></div></div>'+
      '<datalist id="sceneDirectorExpressions">'+SCENE_DIRECTOR_EXPRESSIONS.map(value=>'<option value="'+esc(value)+'"></option>').join('')+'</datalist>'+
      '<div class="two"><div class="field"><label>Position</label><select data-scene-stage="position">'+sceneDirectorPositionOptions(stage.position)+'</select></div><div class="field"><label>Transition</label><select data-scene-stage="transition">'+sceneDirectorTransitionOptions(stage.transition)+'</select></div></div>'+
      '<div class="field"><label>Background variant</label><input type="text" data-scene-stage="background_variant" value="'+esc(stage.background_variant)+'" placeholder="inherit · night · rain"></div>'+
      '<div class="two"><div class="field"><label>Music override</label><input type="text" data-scene-stage="music" value="'+esc(stage.music)+'" placeholder="inherit"></div><div class="field"><label>Ambience override</label><input type="text" data-scene-stage="ambience" value="'+esc(stage.ambience)+'" placeholder="inherit"></div></div>'+
      '<div class="field"><label>Sound effect</label><input type="text" data-scene-stage="sfx" value="'+esc(stage.sfx)+'" placeholder="door_close, phone_buzz…"></div>'+
      '<p class="scene-runtime-note"><b>Live now:</b> portrait and background variant. Position, transitions, music, ambience, and SFX are saved as runtime-ready cues for the next presentation pass.</p></section>':'<section class="scene-director-empty">Write a line before adding cue direction.</section>')+'</aside></div>';
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
    conversation[control.dataset.sceneBase]=control.value;save();renderSceneDirectorPreview();
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
    const update=()=>{entry.node[control.dataset.sceneLine]=control.value.trim().toLowerCase();save();renderSceneDirectorPreview();};
    control.oninput=update;control.onchange=update;
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
