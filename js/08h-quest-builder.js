/* ============ quest and event builder ============ */
let qbQuest=null,qbRewardRows=[],qbParticipants=[];

const QB_RELATIONSHIP_REWARDS=[
  ['friendship','Friendship'],['trust','Trust'],['love','Love'],['respect','Respect'],
  ['comfort','Comfort'],['attraction','Attraction'],['commitment','Commitment'],
  ['compatibility','Compatibility'],['satisfaction','Satisfaction'],
  ['resentment','Resentment'],['jealousy','Jealousy'],['lust','Lust']
];
const QB_PLAYER_REWARDS=[
  ['attributes:confidence','Confidence'],['attributes:self_esteem','Self-esteem'],
  ['attributes:motivation','Motivation'],['attributes:creativity','Creativity'],
  ['attributes:charisma','Charisma'],['attributes:empathy','Empathy'],
  ['attributes:reliability','Reliability'],['needs:mood','Mood'],
  ['needs:energy','Energy'],['needs:stress','Stress'],
  ['needs:loneliness','Loneliness'],['needs:fatigue','Fatigue']
];
const QB_REWARD_VALUES=[5,4,3,2,1,-1,-2,-3,-4,-5];

function newQuestForBuilder(){
  const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const giver=P.characters.find(c=>!isPlayer(c))?.id||'';
  const c={uid,type:'quest',id:'quest_'+(P.content.filter(x=>x.type==='quest').length+1),title:'New quest',
    character:giver,hook:'',location:P.locations[0]?.id||'',
    day:'monday',block:'evening',cast:[],premise:'',requires:[],
    stages:[{id:'objective_1',title:'First objective',location:P.locations[0]?.id||'',nodes:[],flag:'',requires:[]}],
    questPlan:{category:'character_story',rewards:'',
      rewardRows:[{character:giver||'player',reward:defaultQuestReward(giver||'player'),value:1}],
      advancedRewards:'',participants:[],deadline:'',branchIdeas:'',event:null,eventDraft:null}};
  P.content.push(c);sel=uid;focusPath=[];stageIx=0;return c;
}

function questObjectiveEntries(c=qbQuest){
  return (c?.stages||[]).map((stage,index)=>({stage,index})).filter(x=>x.stage.id!=='branch');
}

function normalizeQuestObjectiveIds(c){
  let number=0;
  (c?.stages||[]).forEach(stage=>{
    if(stage.id==='branch')return;
    number++;
    if(!stage.id||/^objective_\d+$/.test(stage.id))stage.id='objective_'+number;
    stage.title=String(stage.title||'').trim()||'Objective '+number;
  });
}

function paintQuestObjectives(){
  const c=qbQuest;if(!c)return;
  const entries=questObjectiveEntries(c);
  $('qbObjectives').innerHTML='<p class="rubric later">Objectives</p>'+entries.map((entry,i)=>
    '<div class="row" style="margin:5px 0"><span class="tag">'+(i+1)+'</span><input data-qbo="'+entry.index+'" value="'+
      esc(entry.stage.title||'')+'" placeholder="What must the player do?"><button class="x" data-qbx="'+entry.index+'" aria-label="Remove objective">×</button></div>').join('');
  $('qbObjectives').querySelectorAll('[data-qbo]').forEach(el=>el.oninput=()=>{qbQuest.stages[+el.dataset.qbo].title=el.value;save();});
  $('qbObjectives').querySelectorAll('[data-qbx]').forEach(b=>b.onclick=()=>{
    if(questObjectiveEntries(qbQuest).length<2)return;
    qbQuest.stages.splice(+b.dataset.qbx,1);normalizeQuestObjectiveIds(qbQuest);save();paintQuestObjectives();
  });
}

function questRewardCharacters(){
  const giver=$('qbGiver')?.value||qbQuest?.character||'';
  const ids=['player',giver,...qbParticipants].filter(Boolean);
  return [...new Set(ids)].map(id=>({id,name:id==='player'?(playerChar()?.name||'Player'):(chr(id)?.name||pretty(id))}));
}

function defaultQuestReward(character){
  return character==='player'?'attributes:confidence':'relationship:trust';
}

function rewardOptionsFor(character,current){
  if(character==='player'){
    const attributes=QB_PLAYER_REWARDS.filter(x=>x[0].startsWith('attributes:'));
    const needs=QB_PLAYER_REWARDS.filter(x=>x[0].startsWith('needs:'));
    const options=rows=>rows.map(([value,label])=>'<option value="'+value+'"'+(value===current?' selected':'')+'>'+esc(label)+'</option>').join('');
    return '<optgroup label="Player attributes">'+options(attributes)+'</optgroup><optgroup label="Player needs">'+options(needs)+'</optgroup>';
  }
  const relationships=QB_RELATIONSHIP_REWARDS.map(([key,label])=>{
    const value='relationship:'+key;
    return '<option value="'+value+'"'+(value===current?' selected':'')+'>'+esc(label)+'</option>';
  }).join('');
  const custom=customStatDefs().map(s=>{
    const value='custom:'+s.id;
    return '<option value="'+esc(value)+'"'+(value===current?' selected':'')+'>'+esc(s.label)+'</option>';
  }).join('');
  return '<optgroup label="Relationship">'+relationships+'</optgroup>'+
    (custom?'<optgroup label="Custom character stats">'+custom+'</optgroup>':'');
}

function validRewardFor(character,reward){
  if(character==='player')return QB_PLAYER_REWARDS.some(x=>x[0]===reward);
  if(String(reward).startsWith('relationship:'))return QB_RELATIONSHIP_REWARDS.some(x=>'relationship:'+x[0]===reward);
  if(String(reward).startsWith('custom:'))return customStatDefs().some(x=>'custom:'+x.id===reward);
  return false;
}

function paintQuestRewards(){
  const box=$('qbRewardRows');if(!box)return;
  const characters=questRewardCharacters(),validCharacters=characters.map(x=>x.id);
  qbRewardRows=qbRewardRows.map(row=>{
    const character=validCharacters.includes(row.character)?row.character:(validCharacters[0]||'player');
    const reward=validRewardFor(character,row.reward)?row.reward:defaultQuestReward(character);
    const amount=QB_REWARD_VALUES.includes(+row.value)?+row.value:1;
    return {character,reward,value:amount};
  });
  box.innerHTML=qbRewardRows.length?qbRewardRows.map((row,i)=>
    '<div class="reward-row">'+
      '<div class="reward-field"><label>Who</label><select aria-label="Reward '+(i+1)+' character" data-qbr-character="'+i+'">'+characters.map(c=>
        '<option value="'+esc(c.id)+'"'+(c.id===row.character?' selected':'')+'>'+esc(c.id==='player'&&c.name==='Player'?'Player':c.name+(c.id==='player'?' (Player)':''))+'</option>').join('')+'</select></div>'+
      '<div class="reward-field"><label>What changes</label><select aria-label="Reward '+(i+1)+' change" data-qbr-reward="'+i+'">'+rewardOptionsFor(row.character,row.reward)+'</select></div>'+
      '<div class="reward-field amount"><label>Amount</label><select aria-label="Reward '+(i+1)+' amount" data-qbr-value="'+i+'">'+QB_REWARD_VALUES.map(value=>
        '<option value="'+value+'"'+(value===row.value?' selected':'')+'>'+(value>0?'+':'')+value+'</option>').join('')+'</select></div>'+
      '<button class="x reward-remove" data-qbr-x="'+i+'" aria-label="Remove reward">×</button></div>').join(''):
    '<div class="reward-empty"><b>No rewards added.</b><span>Use “Add another reward” to add Trust, Love, a player stat, or another change.</span></div>';
  box.querySelectorAll('[data-qbr-character]').forEach(el=>el.onchange=()=>{
    const row=qbRewardRows[+el.dataset.qbrCharacter];row.character=el.value;row.reward=defaultQuestReward(el.value);paintQuestRewards();
  });
  box.querySelectorAll('[data-qbr-reward]').forEach(el=>el.onchange=()=>{qbRewardRows[+el.dataset.qbrReward].reward=el.value;});
  box.querySelectorAll('[data-qbr-value]').forEach(el=>el.onchange=()=>{qbRewardRows[+el.dataset.qbrValue].value=+el.value;});
  box.querySelectorAll('[data-qbr-x]').forEach(el=>el.onclick=()=>{qbRewardRows.splice(+el.dataset.qbrX,1);paintQuestRewards();});
}

function paintQuestCast(){
  const giver=$('qbGiver')?.value||'';
  const rewarded=qbRewardRows.map(row=>row.character).filter(id=>id&&id!=='player'&&id!==giver&&chr(id));
  qbParticipants=[...new Set([...qbParticipants,...rewarded].filter(id=>id&&id!=='player'&&id!==giver))];
  const available=P.characters.filter(c=>!isPlayer(c)&&c.id!==giver&&!qbParticipants.includes(c.id));
  $('qbCastAdd').innerHTML=available.length?available.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join(''):
    '<option value="">All quest characters added</option>';
  $('qbCastAdd').disabled=!available.length;$('qbAddCast').disabled=!available.length;
  $('qbCastChips').innerHTML=qbParticipants.length?qbParticipants.map(id=>
    '<span class="quest-cast-chip">'+esc(chr(id)?.name||pretty(id))+'<button class="x" data-qbc-x="'+esc(id)+'" aria-label="Remove character">×</button></span>').join(''):
    '<span class="hint">No additional NPCs yet.</span>';
  $('qbCastChips').querySelectorAll('[data-qbc-x]').forEach(b=>b.onclick=()=>{
    const removed=b.dataset.qbcX;
    qbParticipants=qbParticipants.filter(id=>id!==removed);qbRewardRows=qbRewardRows.filter(row=>row.character!==removed);
    paintQuestCast();paintQuestRewards();
  });
}

function parseQuestRewards(text){
  const rows=[],advanced=[];
  String(text||'').split(';').map(x=>x.trim()).filter(Boolean).forEach(piece=>{
    let match=piece.match(/^playerstat:(attributes|needs):([^\s:]+)\s+([+-]?[1-5])$/i);
    if(match&&QB_PLAYER_REWARDS.some(x=>x[0]===match[1].toLowerCase()+':'+match[2].toLowerCase())){
      rows.push({character:'player',reward:match[1].toLowerCase()+':'+match[2].toLowerCase(),value:+match[3]});return;
    }
    match=piece.match(/^stat:([^:]+):([^\s:]+)\s+([+-]?[1-5])$/i);
    if(match&&chr(match[1].trim())&&customStatDefs().some(x=>x.id===match[2].toLowerCase())){
      rows.push({character:match[1].trim(),reward:'custom:'+match[2].toLowerCase(),value:+match[3]});return;
    }
    match=piece.match(/^([^.\s:]+)\.([^\s:]+)\s+([+-]?[1-5])$/i);
    if(match&&chr(match[1].trim())&&QB_RELATIONSHIP_REWARDS.some(x=>x[0]===match[2].toLowerCase())){
      rows.push({character:match[1].trim(),reward:'relationship:'+match[2].toLowerCase(),value:+match[3]});return;
    }
    advanced.push(piece);
  });
  return {rows,advanced:advanced.join('; ')};
}

function questRewardRowsToEffects(rows){
  return (rows||[]).map(row=>{
    const amount=(+row.value>0?'+':'')+(+row.value);
    if(row.character==='player'){
      const [section,key]=row.reward.split(':');return 'playerstat:'+section+':'+key+' '+amount;
    }
    const [kind,key]=row.reward.split(':');
    return kind==='custom'?'stat:'+row.character+':'+key+' '+amount:row.character+'.'+key+' '+amount;
  }).join('; ');
}

function questRewardEffects(){return questRewardRowsToEffects(qbRewardRows);}

function openQuestBuilder(){
  qbQuest=cur()?.type==='quest'?cur():newQuestForBuilder();
  const c=qbQuest,p=c.questPlan||{},parsed=parseQuestRewards(p.rewards||'');
  const eventDraft=p.eventDraft||p.event||{};
  $('qbGiver').innerHTML='<option value="">— no specific giver —</option>'+P.characters.filter(x=>!isPlayer(x)).map(x=>
    '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  $('qbAfter').innerHTML='<option value="">— available immediately —</option>'+P.content.filter(x=>x.type==='quest'&&x!==c).map(x=>
    '<option value="'+esc(x.id)+'">'+esc(x.title||x.id)+'</option>').join('');
  $('qbLocation').innerHTML=placeOptions(c.location||'');
  $('qbEventLocation').innerHTML=placeOptions(eventDraft.location||c.location||'');
  $('qbTitle').value=c.title||'';$('qbCategory').value=p.category||c._authored?.category||'character_story';
  $('qbGiver').value=c.character||'';$('qbSummary').value=p.summary||c.hook||c.premise||'';
  $('qbLocation').value=c.location||'';
  $('qbAfter').value=c.after||'';$('qbEarliest').value=p.earliestBlock||'';
  $('qbDeadline').value=p.deadline||'';$('qbBranchIdeas').value=p.branchIdeas||'';
  $('qbEventTitle').value=eventDraft.title||'';$('qbEventDate').value=eventDraft.date||'';
  $('qbEventBlock').value=eventDraft.block||'';
  $('qbEventLocation').value=eventDraft.location||c.location||'';
  qbRewardRows=(Array.isArray(p.rewardRows)?p.rewardRows:parsed.rows).map(x=>Object.assign({},x));
  const rewardCharacters=qbRewardRows.map(x=>x.character).filter(id=>id&&id!=='player'&&id!==c.character&&chr(id));
  qbParticipants=[...new Set([...(Array.isArray(p.participants)?p.participants:(c.cast||[])),...rewardCharacters])];
  $('qbRewards').value=p.advancedRewards!==undefined?p.advancedRewards:parsed.advanced;
  $('qbHelp').hidden=true;$('qbHelpButton').setAttribute('aria-expanded','false');
  paintQuestCast();paintQuestRewards();paintQuestObjectives();$('questBuilder').showModal();$('qbTitle').focus();
}

function updateQuestFromBuilder(){
  const c=qbQuest;if(!c)return;
  const giver=$('qbGiver').value,block=$('qbEventBlock').value,date=$('qbEventDate').value.trim();
  const title=$('qbTitle').value.trim()||'Untitled quest';
  const participants=[...new Set([giver,...qbParticipants].filter(Boolean))];
  const eventTitle=$('qbEventTitle').value.trim(),eventLocation=$('qbEventLocation').value;
  const eventDraft=(eventTitle||date||block)?{title:eventTitle,date,block,location:eventLocation}:null;
  const event=block&&date?{id:'event_'+c.id,title:eventTitle||title,date,
    block,location:eventLocation,participants,source:c.id,type:'story_event'}:null;
  const structured=questRewardEffects(),advanced=$('qbRewards').value.trim();
  const previousLocation=c.location||'',nextLocation=$('qbLocation').value;
  c.title=title;c.character=giver;
  c.hook=$('qbSummary').value.trim();c.premise=c.hook;c.after=$('qbAfter').value;
  c.location=nextLocation;
  c.stages.forEach(stage=>{if(stage.id!=='branch'&&(!stage.location||stage.location===previousLocation))stage.location=nextLocation;});
  c.questPlan=Object.assign({},c.questPlan||{},{category:$('qbCategory').value,summary:c.hook,earliestBlock:$('qbEarliest').value,
    rewards:[structured,advanced].filter(Boolean).join('; '),rewardRows:qbRewardRows.map(x=>Object.assign({},x)),
    advancedRewards:advanced,participants:qbParticipants.slice(),deadline:$('qbDeadline').value.trim(),
    branchIdeas:$('qbBranchIdeas').value.trim(),event,eventDraft});
  normalizeQuestObjectiveIds(c);
  return c;
}

function saveQuestPlan(){
  const c=updateQuestFromBuilder();if(!c)return;
  save();paintAll();$('questBuilder').close();note('Quest plan saved. Write each objective in its stage, then export the character sheet.');
}

$('openQuestBuilder').onclick=openQuestBuilder;
$('closeQuestBuilder').onclick=()=>$('questBuilder').close();
$('qbHelpButton').onclick=()=>{
  const help=$('qbHelp'),show=help.hidden;help.hidden=!show;$('qbHelpButton').setAttribute('aria-expanded',String(show));
};
$('qbGiver').onchange=()=>{paintQuestCast();paintQuestRewards();};
$('qbAddCast').onclick=()=>{
  const id=$('qbCastAdd').value;if(!id)return;qbParticipants.push(id);paintQuestCast();paintQuestRewards();
};
$('qbAddReward').onclick=()=>{
  const character=$('qbGiver').value||qbParticipants[0]||'player';
  qbRewardRows.push({character,reward:defaultQuestReward(character),value:1});paintQuestRewards();
};
$('qbAddObjective').onclick=()=>{if(!qbQuest)return;
  const objectiveNumber=questObjectiveEntries(qbQuest).length+1;
  const stage={id:'objective_'+objectiveNumber,title:'Objective '+objectiveNumber,location:qbQuest.location||'',nodes:[],flag:'',requires:[]};
  const branchAt=qbQuest.stages.findIndex(x=>x.id==='branch');
  branchAt<0?qbQuest.stages.push(stage):qbQuest.stages.splice(branchAt,0,stage);
  save();paintQuestObjectives();};
$('saveQuestBuilder').onclick=saveQuestPlan;
