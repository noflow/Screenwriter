/* ============ scene planner ============ */
const SCENE_TEMPLATES={
  meeting:{label:'First meeting',goal:'Two people size each other up and find a reason to talk again.',tension:'Neither knows whether the other is safe to trust.',beat:'A small unexpected kindness changes the first impression.',tone:'curious, cautious, grounded',ending:'Offer to meet again, or leave it there.'},
  apology:{label:'Apology',goal:'The player tries to repair a recent hurt.',tension:'The other person is not ready to forgive automatically.',beat:'The apology names a specific harm instead of making excuses.',tone:'quiet, honest, fragile',ending:'Accept a small step forward, or ask for space.'},
  date:{label:'Date',goal:'Two people test a new level of closeness.',tension:'Both risk embarrassment by being sincere.',beat:'A private joke or shared memory makes the moment personal.',tone:'warm, playful, tentative',ending:'Extend the evening, or end on a hopeful note.'},
  confrontation:{label:'Confrontation',goal:'A hidden problem can no longer be avoided.',tension:'Each person wants something incompatible.',beat:'One person says the thing they were avoiding.',tone:'tense, direct, emotionally honest',ending:'Work toward a compromise, or leave the conflict unresolved.'},
  quest:{label:'Quest handoff',goal:'A character asks the player for help with a concrete problem.',tension:'The request costs something or has an unclear motive.',beat:'The player learns why this matters personally.',tone:'purposeful, character-led',ending:'Take the task, negotiate terms, or decline.'}
};
function newPlannedScene(){
  if(cur())return cur();
  const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  P.content.push({uid,type:'conversation',id:'scene_'+(P.content.length+1),title:'Planned scene',
    location:P.locations[0]?.id||'',day:'monday',block:'evening',chapter:1,
    cast:[],requires:[],nodes:[],premise:'',scenePlan:{}});
  sel=uid;focusPath=[];stageIx=0;mode='scene';save();paintAll();
  return cur();
}

function plannerFields(){
  const character=$('pStatCharacter').value,key=$('pStatKey').value;
  const high=$('pStatHigh').value.trim(),middle=$('pStatMiddle').value.trim(),low=$('pStatLow').value.trim();
  const consequenceCharacter=$('pConsequenceCharacter').value;
  const chapter=Math.max(0,parseInt($('pChapterUnlock').value,10)||0);
  const rawMemoryId=$('pMemoryId').value.trim();
  const memoryId=rawMemoryId?slug(rawMemoryId):'';
  const identity=Object.fromEntries(Object.entries({gender_identity:$('pIdentityGender').value.trim(),pronouns:$('pIdentityPronouns').value.trim(),
    presentation:$('pIdentityPresentation').value.trim(),milestone:slug($('pIdentityMilestone').value.trim())}).filter(([,v])=>v));
  const hasIdentity=Object.values(identity).some(Boolean);
  return {setting:$('pSetting').value.trim(),goal:$('pGoal').value.trim(),
    tension:$('pTension').value.trim(),beat:$('pBeat').value.trim(),
    tone:$('pTone').value.trim(),ending:$('pEnding').value.trim(),
    outline:$('pOutline').value.trim(),
    statGate:character&&key&&high&&low?{character,key,value:Math.max(0,parseInt($('pStatValue').value,10)||0),high,low,
      lowValue:Math.max(0,parseInt($('pStatLowValue').value,10)||0),middle,
      highEffect:$('pStatHighEffect').value.trim(),middleEffect:$('pStatMiddleEffect').value.trim(),
      lowEffect:$('pStatLowEffect').value.trim()}:null,
    consequence:consequenceCharacter&&(chapter>0||memoryId||hasIdentity)?{character:consequenceCharacter,chapter,memoryId,
      identity:hasIdentity?identity:null}:null};
}

function plannerBrief(p){
  return [p.setting&&'Setting: '+p.setting,p.goal&&'Goal: '+p.goal,
    p.tension&&'Tension: '+p.tension,p.beat&&'Must-hit beat: '+p.beat,
    p.tone&&'Tone: '+p.tone,p.ending&&'Ending choice: '+p.ending,
    p.statGate&&'Conditional outcome: if '+(chr(p.statGate.character)?.name||p.statGate.character)+
      ' '+p.statGate.key+' is '+p.statGate.value+' or higher, '+p.statGate.high+
      '; otherwise, '+p.statGate.low,
    p.statGate?.middle&&'Middle outcome between '+p.statGate.lowValue+' and '+(p.statGate.value-1)+': '+p.statGate.middle,
    p.statGate?.highEffect&&'High outcome effects: '+p.statGate.highEffect,
    p.statGate?.lowEffect&&'Low outcome effects: '+p.statGate.lowEffect,
    p.consequence?.chapter&&'On completion: unlock chapter '+p.consequence.chapter+' for '+(chr(p.consequence.character)?.name||p.consequence.character),
    p.consequence?.memoryId&&'On completion: create memory '+p.consequence.memoryId+' for '+(chr(p.consequence.character)?.name||p.consequence.character),
    p.consequence?.identity&&'On completion: update identity for '+(chr(p.consequence.character)?.name||p.consequence.character)+
      ' ('+Object.entries(p.consequence.identity).map(([k,v])=>k+': '+v).join(', ')+')'].filter(Boolean).join('\n');
}

function putPlanOnScene(){
  const c=newPlannedScene(),p=plannerFields();
  p.brief=plannerBrief(p);c.scenePlan=p;c.premise=p.brief;
  const place=P.locations.find(l=>l.id===p.setting||l.name.toLowerCase()===p.setting.toLowerCase());
  if(place)c.location=place.id;
  if(p.goal&&(!c.title||c.title==='Planned scene'))c.title=p.goal.slice(0,60);
  save();paintSetup();paintContent();
  return c;
}

function openPlanner(){
  const p=cur()?.scenePlan||{};
  $('pTemplate').innerHTML='<option value="">— start from scratch —</option>'+Object.entries(SCENE_TEMPLATES)
    .map(([id,t])=>'<option value="'+id+'">'+t.label+'</option>').join('');
  const gate=p.statGate||{};
  $('pStatCharacter').innerHTML='<option value="">— no stat outcome —</option>'+P.characters
    .filter(c=>!isPlayer(c)).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
  $('pConsequenceCharacter').innerHTML='<option value="">— no lasting consequence —</option>'+P.characters
    .filter(c=>!isPlayer(c)).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
  $('pStatKey').innerHTML=STAT_KEYS.map(k=>'<option value="'+k+'">'+k+'</option>').join('');
  $('pSetting').value=p.setting||'';$('pGoal').value=p.goal||'';
  $('pTension').value=p.tension||'';$('pBeat').value=p.beat||'';
  $('pTone').value=p.tone||'';$('pEnding').value=p.ending||'';
  $('pStatCharacter').value=gate.character||'';$('pStatKey').value=gate.key||'friendship';
  $('pStatValue').value=gate.value??50;$('pStatHigh').value=gate.high||'';$('pStatLow').value=gate.low||'';
  $('pStatLowValue').value=gate.lowValue??Math.max(0,(gate.value??50)-26);
  $('pStatMiddle').value=gate.middle||'';$('pStatMiddleEffect').value=gate.middleEffect||'';
  $('pStatHighEffect').value=gate.highEffect||'';$('pStatLowEffect').value=gate.lowEffect||'';
  const consequence=p.consequence||{};
  $('pConsequenceCharacter').value=consequence.character||gate.character||'';
  const chapters=chr($('pConsequenceCharacter').value)?.relationship_chapters||[];
  $('pChapterUnlock').innerHTML='<option value="0">— do not unlock a chapter —</option>'+chapters
    .filter(ch=>ch.level>1).map(ch=>'<option value="'+ch.level+'">Chapter '+ch.level+' — '+esc(ch.title)+'</option>').join('');
  $('pChapterUnlock').value=consequence.chapter||0;
  $('pMemoryId').value=consequence.memoryId||'';
  $('pIdentityGender').value=consequence.identity?.gender_identity||'';
  $('pIdentityPronouns').value=consequence.identity?.pronouns||'';
  $('pIdentityPresentation').value=consequence.identity?.presentation||'';
  $('pIdentityMilestone').value=consequence.identity?.milestone||'';
  const initial=chr(gate.character)?.relationship_defaults?.[gate.key]??0;
  $('pStatPreview').value=gate.preview??initial;
  updateGatePreview();
  $('pOutline').value=p.outline||'';$('planner').showModal();
  $('pGoal').focus();
}

function applySceneTemplate(){
  const t=SCENE_TEMPLATES[$('pTemplate').value];if(!t)return;
  $('pGoal').value=t.goal;$('pTension').value=t.tension;$('pBeat').value=t.beat;
  $('pTone').value=t.tone;$('pEnding').value=t.ending;
  $('pOutline').value='';updateGatePreview();
}

function updateGatePreview(){
  const character=$('pStatCharacter').value,key=$('pStatKey').value;
  const value=Number($('pStatValue').value)||0,low=Number($('pStatLowValue').value)||0,preview=Number($('pStatPreview').value)||0;
  const name=chr(character)?.name||'This character';
  $('pGatePreview').value=character
    ? preview>=value?name+' '+key+' '+preview+' → high outcome'
      :$('pStatMiddle').value.trim()&&preview>low?name+' '+key+' '+preview+' → middle outcome'
      :name+' '+key+' '+preview+' → low outcome'
    : 'Choose a character to preview';
}

function updateConsequenceChapters(){
  const previous=$('pChapterUnlock').value;
  const chapters=chr($('pConsequenceCharacter').value)?.relationship_chapters||[];
  $('pChapterUnlock').innerHTML='<option value="0">— do not unlock a chapter —</option>'+chapters
    .filter(ch=>ch.level>1).map(ch=>'<option value="'+ch.level+'">Chapter '+ch.level+' — '+esc(ch.title)+'</option>').join('');
  $('pChapterUnlock').value=chapters.some(ch=>String(ch.level)===previous)?previous:'0';
}

function outlinePrompt(p){
  return 'You are planning a scene for a life-sim visual novel. Make a concise, practical beat outline. '+
    'Use ordinary text, never JSON. The scene should leave room for player agency.\n\n'+
    '# Available characters\n'+P.characters.map(c=>c.name+' ('+c.id+')').join(', ')+
    '\n\n# Plan\n'+(plannerBrief(p)||'Create a grounded scene that fits the available characters.')+
    '\n\nReturn these headings:\nOPENING\nBEATS\nTURNING POINT\n'+
    (p.statGate?('STAT OUTCOME — HIGH\n'+(p.statGate.middle?'STAT OUTCOME — MIDDLE\n':'')+'STAT OUTCOME — LOW\n'):'CHOICE\nBRANCH 1\nBRANCH 2\n')+
    'Keep each section brief and concrete. The branches must lead to meaningfully different emotional directions.';
}

function plannerBusy(on){
  $('draftOutline').disabled=on;$('writePlanned').disabled=on;
  $('draftOutline').textContent=on?'Planning…':'Draft outline';
  $('go').disabled=on;$('stop').disabled=!on;
}

async function draftSceneOutline(){
  if(busy)return;
  const p=plannerFields();
  if(!p.goal&&!p.beat&&!p.setting)return note('Add a goal, a must-hit beat, or a setting before drafting an outline.',true);
  putPlanOnScene();busy=true;abort=new AbortController();plannerBusy(true);
  try{
    const outline=await askModel(outlinePrompt(p),abort.signal,false);
    $('pOutline').value=outline.trim();
    putPlanOnScene();note('Outline drafted. Edit it if you like, then write the scene.');
  }catch(e){
    if(e.name!=='AbortError')note('Could not draft the outline: '+esc(e.message),true);
  }finally{busy=false;abort=null;plannerBusy(false);}
}

function writeSceneFromPlan(){
  const c=putPlanOnScene();
  if(!c.scenePlan.outline)return note('Draft or paste an outline first.',true);
  $('planner').close();mode='scene';$('line').value='';paintModes();run();
}

$('closePlanner').onclick=()=>$('planner').close();
$('draftOutline').onclick=draftSceneOutline;
$('writePlanned').onclick=writeSceneFromPlan;
$('pTemplate').onchange=applySceneTemplate;
['pStatCharacter','pStatKey','pStatValue','pStatLowValue','pStatMiddle','pStatPreview'].forEach(id=>{
  $(id).oninput=updateGatePreview;$(id).onchange=updateGatePreview;
});
$('pConsequenceCharacter').onchange=updateConsequenceChapters;

function paintMemory(){
  const notes=P.storyNotes||[];
  $('memoryList').innerHTML=notes.length?'<p class="rubric later">Saved facts</p>'+notes.map((n,i)=>
    '<div class="issue info"><span class="sev">canon</span><span class="msg">'+esc(n.text)+
    '<span class="where">'+esc((n.tags||[]).join(', ')||'all scenes')+'</span><button class="fix" data-memory-del="'+i+'">remove</button></span></div>').join('')
    :'<p class="empty" style="margin-top:14px">No canon facts saved yet.</p>';
  $('memoryList').querySelectorAll('[data-memory-del]').forEach(b=>b.onclick=()=>{
    P.storyNotes.splice(+b.dataset.memoryDel,1);save();paintMemory();});
}
function openMemory(){ $('memoryText').value='';$('memoryTags').value='';paintMemory();$('memory').showModal();$('memoryText').focus(); }
$('openMemory').onclick=openMemory;
$('closeMemory').onclick=()=>$('memory').close();
$('addMemory').onclick=()=>{
  const text=$('memoryText').value.trim();if(!text)return;
  const tags=$('memoryTags').value.split(',').map(x=>x.trim()).filter(Boolean).map(x=>
    P.characters.find(c=>c.id===x||c.name.toLowerCase()===x.toLowerCase())?.id||x);
  P.storyNotes=P.storyNotes||[];P.storyNotes.push({text:text.slice(0,500),tags});save();
  $('memoryText').value='';$('memoryTags').value='';paintMemory();
};
