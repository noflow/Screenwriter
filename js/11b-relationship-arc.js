/* ============ relationship story arc workshop ============ */
let relationshipArcCharacterIndex=null,relationshipArcDraggedStage=null;

function relationshipArcLineCount(nodes){
  return (nodes||[]).reduce((total,node)=>total+(node.type==='line'?1:
    (node.options||[]).reduce((sum,option)=>sum+relationshipArcLineCount(option.nodes),0)),0);
}

function relationshipArcConversations(quest){
  if(!quest)return [];
  const ids=new Set();
  const remember=completion=>{
    if(completion?.conversation)ids.add(completion.conversation);
  };
  (quest.stages||[]).forEach(stage=>{
    remember(stage.completion);remember(stage._authored?.completion);
  });
  (quest._authored?.objectives||[]).forEach(objective=>remember(objective.completion));
  return P.content.filter(item=>item.type==='conversation'&&(
    [...ids].some(id=>item.id===id||item.id.startsWith(id+'__'))||
    item._authored?.activation?.quest_active===quest.id));
}

function relationshipArcQuestMetrics(character,chapter){
  const quest=relationshipChapterQuest(character,chapter);
  const objectives=(quest?.stages||[]).map((stage,index)=>({stage,index})).filter(row=>row.stage.id!=='branch');
  const conversations=relationshipArcConversations(quest);
  const stageLines=(quest?.stages||[]).reduce((total,stage)=>total+relationshipArcLineCount(stage.nodes),0);
  const conversationLines=conversations.reduce((total,item)=>total+relationshipArcLineCount(item.nodes),0);
  return {quest,objectives,conversations,lineCount:stageLines+conversationLines};
}

function relationshipArcPlanIssues(character,chapter,metrics=relationshipArcQuestMetrics(character,chapter)){
  const plan=chapter.story_plan||{},issues=[];
  if(!metrics.quest)issues.push('No matching story quest yet.');
  else{
    if(!metrics.objectives.length)issues.push('The quest has no objectives.');
    if(!metrics.lineCount)issues.push('No quest scene or linked conversation has dialogue yet.');
  }
  if(!String(plan.conflict||'').trim())issues.push('Add the central conflict.');
  if(!String(plan.important_choice||'').trim())issues.push('Add the player’s important choice.');
  if(!String(plan.consequence||'').trim())issues.push('Add a lasting consequence.');
  if(!String(plan.callback||'').trim())issues.push('Add a future callback.');
  if(!String(plan.primary_location||'').trim())issues.push('Choose a primary location.');
  if(chapter.route==='romantic'&&character.profile?.romance_eligible!==true)
    issues.push('This character is not romance eligible.');
  (plan.supporting_characters||[]).filter(id=>!chr(id)||isPlayer(chr(id))).forEach(id=>
    issues.push('Supporting character "'+id+'" has no NPC sheet.'));
  (plan.prerequisite_quests||[]).filter(id=>!P.content.some(item=>item.type==='quest'&&item.id===id)).forEach(id=>
    issues.push('Prerequisite quest "'+id+'" does not exist.'));
  return issues;
}

function relationshipArcStatus(character,chapter,metrics,issues){
  if(!metrics.quest)return 'unwritten';
  if(chapter.story_plan?.status==='complete')return issues.length?'complete_needs_work':'complete';
  if(chapter.story_plan?.status==='ready')return issues.length?'ready_needs_work':'ready';
  return 'draft';
}

function relationshipArcRuleText(level){
  const rule=relationshipMilestoneRule(level);
  if(!rule)return 'Unknown milestone rule';
  if(rule.level===1)return 'Available from the start';
  return rule.shared_activities+' shared activit'+(rule.shared_activities===1?'y':'ies')+
    ' · bond '+rule.bond+' · trust '+rule.trust+
    (rule.agreement_required?' · dating agreement on romantic routes':'');
}

function relationshipArcList(value){
  return [...new Set(String(value||'').split(',').map(item=>slug(item)).filter(Boolean))];
}

function relationshipArcSummary(character){
  const rows=(character.relationship_chapters||[]).map(chapter=>{
    const metrics=relationshipArcQuestMetrics(character,chapter);
    const issues=relationshipArcPlanIssues(character,chapter,metrics);
    return {chapter,metrics,issues,status:relationshipArcStatus(character,chapter,metrics,issues)};
  });
  return {rows,quests:rows.filter(row=>row.metrics.quest).length,
    ready:rows.filter(row=>row.status==='ready').length,
    complete:rows.filter(row=>row.status==='complete').length};
}

function openRelationshipArcWorkshop(index=selChar){
  const character=P.characters[index];if(!character||isPlayer(character))return;
  relationshipArcCharacterIndex=index;
  character.relationship_chapters=character.relationship_chapters||[];
  character.relationship_chapters.forEach(chapter=>normalizeRelationshipChapterStory(character,chapter));
  save();paintRelationshipArcWorkshop();
  const dialog=$('relationshipArcWorkshop');if(!dialog.open)dialog.showModal();
}

function paintRelationshipArcWorkshop(){
  const character=P.characters[relationshipArcCharacterIndex];if(!character)return;
  const summary=relationshipArcSummary(character);
  $('relationshipArcName').textContent=character.name+' — story arc';
  $('relationshipArcBody').innerHTML='<div class="arc-overview">'+
      '<div><b>'+summary.quests+'/5</b><span>quests built</span></div>'+
      '<div><b>'+summary.ready+'</b><span>ready for review</span></div>'+
      '<div><b>'+summary.complete+'</b><span>complete</span></div>'+
      '<p>'+esc(character.name)+' prefers '+esc((character.social_preferences?.preferred_activities||[]).map(pretty).join(', ')||'no hangouts yet')+
        '. Relationship progression remains player-paced.</p></div>'+
    '<div class="arc-card-list">'+summary.rows.map((row,index)=>{
      const chapter=row.chapter,plan=chapter.story_plan,metrics=row.metrics;
      const statusLabel=pretty(row.status).replace('needs work','· needs work');
      const objectiveRows=metrics.objectives.map(objective=>'<div class="arc-objective" draggable="true" data-arc-stage="'+index+':'+objective.index+'">'+
        '<span class="arc-drag" title="Drag to reorder">⋮⋮</span><span><b>'+esc(objective.stage.title||objective.stage.id)+'</b><small>'+relationshipArcLineCount(objective.stage.nodes)+' inline lines</small></span>'+
        '<button data-arc-up="'+index+':'+objective.index+'" title="Move objective up">↑</button>'+
        '<button data-arc-down="'+index+':'+objective.index+'" title="Move objective down">↓</button></div>').join('');
      const conversationRows=metrics.conversations.map(conversation=>'<button class="arc-conversation" data-arc-conversation="'+esc(conversation.uid)+'">'+
        esc(conversation.title||conversation.id)+' · '+relationshipArcLineCount(conversation.nodes)+' lines</button>').join('');
      return '<section class="arc-card '+row.status+'">'+
        '<header><span class="arc-level">'+esc(chapter.level||index+1)+'</span><span><b>'+esc(chapter.title||pretty(chapter.id))+'</b><small>'+esc(chapter.id||'missing_id')+'</small></span>'+
          '<span class="arc-status '+row.status+'">'+esc(statusLabel)+'</span></header>'+
        '<p class="arc-rule">'+esc(relationshipArcRuleText(chapter.level||index+1))+'</p>'+
        '<div class="arc-controls"><div class="field"><label>Route</label><select data-arc-route="'+index+'">'+
          PA_RELATIONSHIP_ROUTES.map(route=>'<option value="'+route.id+'"'+(chapter.route===route.id?' selected':'')+'>'+esc(route.name)+'</option>').join('')+
          '</select></div><div class="field"><label>Writing status</label><select data-arc-status="'+index+'">'+
          PA_STORY_STATUSES.map(status=>'<option value="'+status+'"'+(plan.status===status?' selected':'')+'>'+esc(pretty(status))+'</option>').join('')+
          '</select></div><div class="field"><label>Primary location</label><select data-arc-location="'+index+'">'+placeOptions(plan.primary_location)+'</select></div></div>'+
        '<div class="arc-story-grid">'+
          '<div class="field"><label>Central conflict</label><textarea data-arc-field="'+index+':conflict" placeholder="What pressure or problem drives this chapter?">'+esc(plan.conflict)+'</textarea></div>'+
          '<div class="field"><label>Important player choice</label><textarea data-arc-field="'+index+':important_choice" placeholder="What meaningful direction can the player choose?">'+esc(plan.important_choice)+'</textarea></div>'+
          '<div class="field"><label>Lasting consequence</label><textarea data-arc-field="'+index+':consequence" placeholder="What changes after this chapter?">'+esc(plan.consequence)+'</textarea></div>'+
          '<div class="field"><label>Future callback</label><textarea data-arc-field="'+index+':callback" placeholder="What should later chapters remember?">'+esc(plan.callback)+'</textarea></div></div>'+
        '<div class="arc-detail-grid">'+
          '<div class="field"><label>Supporting NPC ids</label><input value="'+esc(plan.supporting_characters.join(', '))+'" data-arc-list="'+index+':supporting_characters" placeholder="emma_rowan, marcus_lee"></div>'+
          '<div class="field"><label>Required memories</label><input value="'+esc(plan.required_memories.join(', '))+'" data-arc-list="'+index+':required_memories" placeholder="shared_a_secret"></div>'+
          '<div class="field"><label>Prerequisite quest ids</label><input value="'+esc(plan.prerequisite_quests.join(', '))+'" data-arc-list="'+index+':prerequisite_quests" placeholder="earlier_quest"></div></div>'+
        '<div class="field"><label>Writer notes</label><textarea data-arc-field="'+index+':notes" placeholder="Tone, scene ideas, alternate outcomes…">'+esc(plan.notes)+'</textarea></div>'+
        '<div class="arc-quest-box"><div><b>'+(metrics.quest?esc(metrics.quest.title):'No quest')+'</b><span>'+metrics.objectives.length+' objectives · '+metrics.conversations.length+' linked conversations · '+metrics.lineCount+' lines</span></div>'+
          '<button class="btn '+(metrics.quest?'':'gold')+'" data-arc-quest="'+index+'">'+(metrics.quest?'Edit quest':'Create quest')+'</button></div>'+
        (objectiveRows?'<div class="arc-objectives"><p>Quest objectives · drag or use arrows to reorder</p>'+objectiveRows+'</div>':'')+
        (conversationRows?'<div class="arc-conversations"><p>Linked conversations</p>'+conversationRows+'</div>':'')+
        (row.issues.length?'<ul class="arc-issues">'+row.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':
          '<div class="arc-clean">This milestone has a complete writing plan and playable content.</div>')+
      '</section>';
    }).join('')+'</div>';
  wireRelationshipArcWorkshop(character);
}

function moveRelationshipArcStage(quest,stageIndex,direction){
  const indices=(quest.stages||[]).map((stage,index)=>({stage,index})).filter(row=>row.stage.id!=='branch').map(row=>row.index);
  const position=indices.indexOf(stageIndex),target=indices[position+direction];
  if(position<0||target===undefined)return;
  [quest.stages[stageIndex],quest.stages[target]]=[quest.stages[target],quest.stages[stageIndex]];
  save();paintRelationshipArcWorkshop();
}

function openRelationshipArcQuest(character,index){
  const chapter=character.relationship_chapters[index];if(!chapter)return;
  try{
    const result=ensureRelationshipChapterQuest(character,chapter);
    normalizeRelationshipChapterStory(character,chapter);
    sel=result.quest.uid;focusPath=[];stageIx=0;save();paintAll();
    $('relationshipArcWorkshop').close();openQuestBuilder();
    if(result.created)note('Created '+esc(chapter.title)+'. Build its objectives and scenes in the quest builder.');
  }catch(error){note(esc(error.message));}
}

function wireRelationshipArcWorkshop(character){
  const body=$('relationshipArcBody');
  body.querySelectorAll('[data-arc-route]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcRoute].route=select.value;save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-status]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcStatus].story_plan.status=select.value;save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-location]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcLocation].story_plan.primary_location=select.value;save();});
  body.querySelectorAll('[data-arc-field]').forEach(field=>field.oninput=()=>{
    const [index,key]=field.dataset.arcField.split(':');character.relationship_chapters[+index].story_plan[key]=field.value;save();});
  body.querySelectorAll('[data-arc-list]').forEach(field=>field.onchange=()=>{
    const [index,key]=field.dataset.arcList.split(':');character.relationship_chapters[+index].story_plan[key]=relationshipArcList(field.value);
    field.value=character.relationship_chapters[+index].story_plan[key].join(', ');save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-quest]').forEach(button=>button.onclick=()=>openRelationshipArcQuest(character,+button.dataset.arcQuest));
  body.querySelectorAll('[data-arc-conversation]').forEach(button=>button.onclick=()=>{
    sel=button.dataset.arcConversation;focusPath=[];stageIx=0;save();$('relationshipArcWorkshop').close();paintAll();});
  body.querySelectorAll('[data-arc-up]').forEach(button=>button.onclick=()=>{
    const [chapterIndex,stageIndex]=button.dataset.arcUp.split(':').map(Number);
    moveRelationshipArcStage(relationshipArcQuestMetrics(character,character.relationship_chapters[chapterIndex]).quest,stageIndex,-1);});
  body.querySelectorAll('[data-arc-down]').forEach(button=>button.onclick=()=>{
    const [chapterIndex,stageIndex]=button.dataset.arcDown.split(':').map(Number);
    moveRelationshipArcStage(relationshipArcQuestMetrics(character,character.relationship_chapters[chapterIndex]).quest,stageIndex,1);});
  body.querySelectorAll('[data-arc-stage]').forEach(row=>{
    row.ondragstart=()=>{relationshipArcDraggedStage=row.dataset.arcStage;};
    row.ondragover=event=>event.preventDefault();
    row.ondrop=event=>{
      event.preventDefault();if(!relationshipArcDraggedStage)return;
      const [fromChapter,fromStage]=relationshipArcDraggedStage.split(':').map(Number);
      const [toChapter,toStage]=row.dataset.arcStage.split(':').map(Number);
      relationshipArcDraggedStage=null;if(fromChapter!==toChapter||fromStage===toStage)return;
      const quest=relationshipArcQuestMetrics(character,character.relationship_chapters[fromChapter]).quest;
      const item=quest.stages.splice(fromStage,1)[0],adjusted=fromStage<toStage?toStage-1:toStage;
      quest.stages.splice(adjusted,0,item);save();paintRelationshipArcWorkshop();
    };
  });
}

function scaffoldRelationshipArcQuests(){
  const character=P.characters[relationshipArcCharacterIndex];if(!character)return;
  let created=0;const errors=[];
  (character.relationship_chapters||[]).forEach(chapter=>{
    normalizeRelationshipChapterStory(character,chapter);
    try{if(ensureRelationshipChapterQuest(character,chapter).created)created++;}
    catch(error){errors.push(error.message);}
  });
  save();paintAll();paintRelationshipArcWorkshop();
  note(created+' relationship quest'+(created===1?'':'s')+' scaffolded.'+(errors.length?' '+esc(errors[0]):''));
}

if(typeof document!=='undefined'){
  $('closeRelationshipArc').onclick=()=>{$('relationshipArcWorkshop').close();paintAll();};
  $('scaffoldRelationshipArcs').onclick=scaffoldRelationshipArcQuests;
}
