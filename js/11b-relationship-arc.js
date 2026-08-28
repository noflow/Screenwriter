/* ============ relationship story arc workshop ============ */
let relationshipArcCharacterIndex=null,relationshipArcDraggedStage=null,
  characterArcSelection='relationship';

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

function relationshipArcQuestMetrics(character,slot){
  const quest=relationshipChapterQuest(character,slot);
  const objectives=(quest?.stages||[]).map((stage,index)=>({stage,index})).filter(row=>row.stage.id!=='branch');
  const conversations=relationshipArcConversations(quest);
  const stageLines=(quest?.stages||[]).reduce((total,stage)=>total+relationshipArcLineCount(stage.nodes),0);
  const conversationLines=conversations.reduce((total,item)=>total+relationshipArcLineCount(item.nodes),0);
  return {slot,quest,objectives,conversations,lineCount:stageLines+conversationLines};
}

function relationshipArcChapterMetrics(character,chapter){
  const questRows=relationshipChapterQuestSlots(character,chapter).map(slot=>relationshipArcQuestMetrics(character,slot));
  return {questRows,planned:questRows.length,built:questRows.filter(row=>row.quest).length,
    objectiveCount:questRows.reduce((total,row)=>total+row.objectives.length,0),
    conversationCount:questRows.reduce((total,row)=>total+row.conversations.length,0),
    lineCount:questRows.reduce((total,row)=>total+row.lineCount,0)};
}

function relationshipArcPlanIssues(character,chapter,metrics=relationshipArcChapterMetrics(character,chapter)){
  const plan=chapter.story_plan||{},issues=[];
  if(!metrics.planned)return issues;
  metrics.questRows.forEach((row,index)=>{
    const label=metrics.planned>1?'Quest '+(index+1):'The quest';
    if(!row.quest)issues.push(label+' has not been created yet.');
    else{
      if(!row.objectives.length)issues.push(label+' has no objectives.');
      if(!row.lineCount)issues.push(label+' has no quest scene or linked conversation dialogue yet.');
    }
  });
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
  if(!metrics.planned)return 'skipped';
  if(!metrics.built)return 'unwritten';
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
    const metrics=relationshipArcChapterMetrics(character,chapter);
    const issues=relationshipArcPlanIssues(character,chapter,metrics);
    return {chapter,metrics,issues,status:relationshipArcStatus(character,chapter,metrics,issues)};
  });
  return {rows,planned:rows.reduce((total,row)=>total+row.metrics.planned,0),
    quests:rows.reduce((total,row)=>total+row.metrics.built,0),
    ready:rows.filter(row=>row.status==='ready').length,
    complete:rows.filter(row=>row.status==='complete').length};
}

function setRelationshipArcQuestTotal(character,value){
  const chapters=character.relationship_chapters||[];if(!chapters.length)return;
  const target=Math.max(0,Math.min(chapters.length*PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX,
    parseInt(value,10)||0));
  chapters.forEach(chapter=>normalizeRelationshipChapterStory(character,chapter));
  let total=chapters.reduce((sum,chapter)=>sum+chapter.story_plan.quest_count,0);
  while(total<target){
    const available=chapters.filter(chapter=>chapter.story_plan.quest_count<PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX);
    if(!available.length)break;
    available.sort((a,b)=>a.story_plan.quest_count-b.story_plan.quest_count||a.level-b.level)[0].story_plan.quest_count++;
    total++;
  }
  while(total>target){
    const available=chapters.filter(chapter=>chapter.story_plan.quest_count>0);
    if(!available.length)break;
    available.sort((a,b)=>b.story_plan.quest_count-a.story_plan.quest_count||b.level-a.level)[0].story_plan.quest_count--;
    total--;
  }
}

function openRelationshipArcWorkshop(index=selChar){
  const character=P.characters[index];if(!character||isPlayer(character))return;
  relationshipArcCharacterIndex=index;
  character.relationship_chapters=character.relationship_chapters||[];
  character.relationship_chapters.forEach(chapter=>normalizeRelationshipChapterStory(character,chapter));
  normalizeCharacterStoryArcs(character);
  if(characterArcSelection!=='relationship'&&
    !character.story_arcs.some(arc=>arc.id===characterArcSelection))characterArcSelection='relationship';
  save();paintRelationshipArcWorkshop();
  const dialog=$('relationshipArcWorkshop');if(!dialog.open)dialog.showModal();
}

function characterArcTabsHtml(character){
  return '<div class="character-arc-tabs"><button class="'+(characterArcSelection==='relationship'?'on':'')+'" data-character-arc="relationship">Relationship path</button>'+
    normalizeCharacterStoryArcs(character).map(arc=>'<button class="'+(characterArcSelection===arc.id?'on':'')+'" data-character-arc="'+esc(arc.id)+'">'+esc(arc.title||pretty(arc.id))+'</button>').join('')+
    '<button class="add" id="addCharacterStoryArc">+ New story arc</button></div>';
}

function wireCharacterArcTabs(character){
  const body=$('relationshipArcBody');
  body.querySelectorAll('[data-character-arc]').forEach(button=>button.onclick=()=>{
    characterArcSelection=button.dataset.characterArc;paintRelationshipArcWorkshop();
  });
  const add=body.querySelector('#addCharacterStoryArc');if(add)add.onclick=()=>{
    let number=character.story_arcs.length+1,arc=defaultCharacterStoryArc(character,number-1);
    const used=new Set(character.story_arcs.map(item=>item.id));
    while(used.has(arc.id)||P.content.some(item=>item.type==='quest'&&item.id===arc.id)){
      number++;arc=defaultCharacterStoryArc(character,number-1);
    }
    character.story_arcs.push(arc);characterArcSelection=arc.id;
    save();paintRelationshipArcWorkshop();
  };
}

function paintRelationshipArcWorkshop(){
  const character=P.characters[relationshipArcCharacterIndex];if(!character)return;
  normalizeCharacterStoryArcs(character);
  if(characterArcSelection!=='relationship'){
    const arc=character.story_arcs.find(item=>item.id===characterArcSelection);
    if(arc){paintCharacterStoryArcWorkshop(character,arc);return;}
    characterArcSelection='relationship';
  }
  const summary=relationshipArcSummary(character);
  $('relationshipArcName').textContent=character.name+' — character stories';
  $('relationshipArcBody').innerHTML=characterArcTabsHtml(character)+'<div class="arc-length-bar"><div class="field"><label>Total planned quests</label>'+
      '<select id="relationshipArcQuestTotal">'+Array.from({length:(character.relationship_chapters||[]).length*
        PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX+1},(_,count)=>'<option value="'+count+'"'+
          (summary.planned===count?' selected':'')+'>'+count+'</option>').join('')+'</select></div>'+
      '<p>The five relationship levels stay fixed. Quests are distributed across those levels, and you can fine-tune each level below. Shortening an arc never deletes quests already written.</p></div>'+
    '<div class="arc-overview">'+
      '<div><b>'+summary.quests+'/'+summary.planned+'</b><span>quests built</span></div>'+
      '<div><b>'+summary.ready+'</b><span>levels ready</span></div>'+
      '<div><b>'+summary.complete+'</b><span>levels complete</span></div>'+
      '<p>'+esc(character.name)+' prefers '+esc((character.social_preferences?.preferred_activities||[]).map(pretty).join(', ')||'no hangouts yet')+
        '. Relationship progression remains player-paced.</p></div>'+
    '<div class="arc-card-list">'+summary.rows.map((row,index)=>{
      const chapter=row.chapter,plan=chapter.story_plan,metrics=row.metrics;
      const statusLabel=pretty(row.status).replace('needs work','· needs work');
      const questRows=metrics.questRows.map((questMetric,questIndex)=>{
        const objectiveRows=questMetric.objectives.map(objective=>'<div class="arc-objective" draggable="true" data-arc-stage="'+index+':'+questIndex+':'+objective.index+'">'+
          '<span class="arc-drag" title="Drag to reorder">⋮⋮</span><span><b>'+esc(objective.stage.title||objective.stage.id)+'</b><small>'+relationshipArcLineCount(objective.stage.nodes)+' inline lines</small></span>'+
          '<button data-arc-up="'+index+':'+questIndex+':'+objective.index+'" title="Move objective up">↑</button>'+
          '<button data-arc-down="'+index+':'+questIndex+':'+objective.index+'" title="Move objective down">↓</button></div>').join('');
        const conversationRows=questMetric.conversations.map(conversation=>'<button class="arc-conversation" data-arc-conversation="'+esc(conversation.uid)+'">'+
          esc(conversation.title||conversation.id)+' · '+relationshipArcLineCount(conversation.nodes)+' lines</button>').join('');
        return '<div class="arc-quest-group"><div class="arc-quest-box"><div><b>'+esc(questMetric.slot.title)+'</b><small>'+esc(questMetric.slot.id)+'</small><span>'+questMetric.objectives.length+' objectives · '+questMetric.conversations.length+' linked conversations · '+questMetric.lineCount+' lines'+
            (questMetric.slot.after?' · follows '+esc(questMetric.slot.after):'')+'</span></div>'+
          '<button class="btn '+(questMetric.quest?'':'gold')+'" data-arc-quest="'+index+':'+questIndex+'">'+(questMetric.quest?'Edit quest':'Create quest')+'</button></div>'+
          (objectiveRows?'<div class="arc-objectives"><p>Quest objectives · drag or use arrows to reorder</p>'+objectiveRows+'</div>':'')+
          (conversationRows?'<div class="arc-conversations"><p>Linked conversations</p>'+conversationRows+'</div>':'')+'</div>';
      }).join('');
      return '<section class="arc-card '+row.status+'">'+
        '<header><span class="arc-level">'+esc(chapter.level||index+1)+'</span><span><b>'+esc(chapter.title||pretty(chapter.id))+'</b><small>'+esc(chapter.id||'missing_id')+'</small></span>'+
          '<span class="arc-status '+row.status+'">'+esc(statusLabel)+'</span></header>'+
        '<p class="arc-rule">'+esc(relationshipArcRuleText(chapter.level||index+1))+'</p>'+
        '<div class="arc-controls"><div class="field"><label>Route</label><select data-arc-route="'+index+'">'+
          PA_RELATIONSHIP_ROUTES.map(route=>'<option value="'+route.id+'"'+(chapter.route===route.id?' selected':'')+'>'+esc(route.name)+'</option>').join('')+
          '</select></div><div class="field"><label>Writing status</label><select data-arc-status="'+index+'">'+
          PA_STORY_STATUSES.map(status=>'<option value="'+status+'"'+(plan.status===status?' selected':'')+'>'+esc(pretty(status))+'</option>').join('')+
          '</select></div><div class="field"><label>Quests at this level</label><select data-arc-quest-count="'+index+'">'+
          Array.from({length:PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX+1},(_,count)=>'<option value="'+count+'"'+(plan.quest_count===count?' selected':'')+'>'+count+(count===0?' — none':'')+'</option>').join('')+
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
        (questRows||'<div class="arc-no-quests">No quest is planned at this relationship level.</div>')+
        (row.issues.length?'<ul class="arc-issues">'+row.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':
          (row.status==='skipped'?'<div class="arc-clean">This relationship level is intentionally story-light.</div>':
            '<div class="arc-clean">This milestone has a complete writing plan and playable content.</div>'))+
      '</section>';
    }).join('')+'</div>';
  wireRelationshipArcWorkshop(character);wireCharacterArcTabs(character);
}

function characterStoryArcMetrics(character,arc){
  const questRows=characterStoryArcQuestSlots(character,arc).map(slot=>{
    const quest=characterStoryArcQuest(character,slot);
    const objectives=(quest?.stages||[]).map((stage,index)=>({stage,index})).filter(row=>row.stage.id!=='branch');
    const conversations=relationshipArcConversations(quest);
    const stageLines=(quest?.stages||[]).reduce((total,stage)=>total+relationshipArcLineCount(stage.nodes),0);
    const conversationLines=conversations.reduce((total,item)=>total+relationshipArcLineCount(item.nodes),0);
    return {slot,quest,objectives,conversations,lineCount:stageLines+conversationLines};
  });
  return {questRows,planned:questRows.length,built:questRows.filter(row=>row.quest).length,
    objectiveCount:questRows.reduce((total,row)=>total+row.objectives.length,0),
    conversationCount:questRows.reduce((total,row)=>total+row.conversations.length,0),
    lineCount:questRows.reduce((total,row)=>total+row.lineCount,0)};
}

function characterStoryArcIssues(character,arc,metrics=characterStoryArcMetrics(character,arc)){
  const issues=[];
  metrics.questRows.forEach((row,index)=>{
    if(!row.quest)issues.push('Quest '+(index+1)+' has not been created yet.');
    else{
      if(!row.objectives.length)issues.push('Quest '+(index+1)+' has no objectives.');
      if(!row.lineCount)issues.push('Quest '+(index+1)+' has no quest scene or linked conversation dialogue yet.');
    }
  });
  if(!String(arc.summary||'').trim())issues.push('Add an arc summary.');
  if(!String(arc.conflict||'').trim())issues.push('Add the central conflict.');
  if(!String(arc.important_choice||'').trim())issues.push('Add the player’s important choice.');
  if(!String(arc.consequence||'').trim())issues.push('Add a lasting consequence.');
  if(!String(arc.callback||'').trim())issues.push('Add a future callback.');
  if(!String(arc.primary_location||'').trim())issues.push('Choose a primary location.');
  if(arc.entry_policy==='optional'&&!String(arc.decline_outcome||'').trim())
    issues.push('Explain what happens when the player declines or defers.');
  (arc.supporting_characters||[]).filter(id=>!chr(id)||isPlayer(chr(id))).forEach(id=>
    issues.push('Supporting character "'+id+'" has no NPC sheet.'));
  (arc.prerequisite_quests||[]).filter(id=>!P.content.some(item=>item.type==='quest'&&item.id===id)).forEach(id=>
    issues.push('Prerequisite quest "'+id+'" does not exist.'));
  return issues;
}

function characterStoryArcStatus(arc,metrics,issues){
  if(!metrics.built)return 'unwritten';
  if(arc.status==='complete')return issues.length?'complete_needs_work':'complete';
  if(arc.status==='ready')return issues.length?'ready_needs_work':'ready';
  return 'draft';
}

function renameCharacterStoryArc(character,arc,raw){
  const old=arc.id,next=slug(raw);
  if(next===old)return next;
  const linked=P.content.filter(item=>item.type==='quest'&&item.character===character.id&&(
    item.id===old||item.id.startsWith(old+'_part_')||item.questPlan?.characterArc?.arc_id===old));
  const duplicate=character.story_arcs.some(item=>item!==arc&&item.id===next)||
    (character.relationship_chapters||[]).some(chapter=>chapter.id===next);
  const partOf=quest=>+quest.questPlan?.characterArc?.part||
    (quest.id===old?1:(parseInt(quest.id.slice((old+'_part_').length),10)||1));
  const maxPart=Math.max(arc.quest_count,...linked.map(partOf));
  const targets=new Set(Array.from({length:maxPart},(_,index)=>index?next+'_part_'+(index+1):next));
  const collision=P.content.find(item=>item.type==='quest'&&!linked.includes(item)&&targets.has(item.id));
  if(duplicate||collision)throw new Error(duplicate?'Every character story needs a unique id.':
    'That id already belongs to another quest.');
  linked.sort((a,b)=>partOf(b)-partOf(a)).forEach(quest=>{
    const part=partOf(quest);renameContentId(quest,part>1?next+'_part_'+part:next);
    if(quest.questPlan?.characterArc)quest.questPlan.characterArc.arc_id=next;
  });
  arc.id=next;characterArcSelection=next;
  return next;
}

function paintCharacterStoryArcWorkshop(character,arc){
  normalizeCharacterStoryArc(character,arc,character.story_arcs.indexOf(arc));
  const metrics=characterStoryArcMetrics(character,arc),issues=characterStoryArcIssues(character,arc,metrics);
  const status=characterStoryArcStatus(arc,metrics,issues),optional=arc.entry_policy==='optional';
  const questRows=metrics.questRows.map((row,index)=>{
    const conversations=row.conversations.map(conversation=>'<button class="arc-conversation" data-character-arc-conversation="'+esc(conversation.uid)+'">'+
      esc(conversation.title||conversation.id)+' · '+relationshipArcLineCount(conversation.nodes)+' lines</button>').join('');
    return '<div class="arc-quest-group"><div class="arc-quest-box"><div><b>'+esc(row.slot.title)+'</b><small>'+esc(row.slot.id)+'</small><span>'+
      row.objectives.length+' objectives · '+row.conversations.length+' linked conversations · '+row.lineCount+' lines'+
      (row.slot.after?' · follows '+esc(row.slot.after):'')+'</span></div><button class="btn '+(row.quest?'':'gold')+
      '" data-character-arc-quest="'+index+'">'+(row.quest?'Edit quest':'Create quest')+'</button></div>'+
      (conversations?'<div class="arc-conversations"><p>Linked conversations</p>'+conversations+'</div>':'')+'</div>';
  }).join('');
  $('relationshipArcName').textContent=character.name+' — character stories';
  $('relationshipArcBody').innerHTML=characterArcTabsHtml(character)+
    '<div class="character-arc-intro"><b>Independent character story</b><span>This arc is not a love level. It can unlock from work, friendship, another meter, a world-state value, or earlier quests.</span></div>'+
    '<section class="arc-card '+status+' character-story-card"><header><span class="arc-level">◆</span><span><b>'+esc(arc.title||pretty(arc.id))+
      '</b><small>'+esc(arc.id)+'</small></span><span class="arc-status '+status+'">'+esc(pretty(status).replace('needs work','· needs work'))+'</span></header>'+
      '<div class="arc-controls character-story-identity"><div class="field"><label>Story title</label><input id="characterArcTitle" value="'+esc(arc.title)+'"></div>'+
      '<div class="field"><label>Story id</label><input id="characterArcId" value="'+esc(arc.id)+'"></div>'+
      '<div class="field"><label>Category</label><select id="characterArcCategory">'+PA_CHARACTER_ARC_CATEGORIES.map(category=>'<option value="'+category.id+'"'+
        (arc.category===category.id?' selected':'')+'>'+esc(category.name)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Writing status</label><select id="characterArcStatus">'+PA_STORY_STATUSES.map(value=>'<option value="'+value+'"'+
        (arc.status===value?' selected':'')+'>'+esc(pretty(value))+'</option>').join('')+'</select></div></div>'+
      '<div class="field"><label>Arc summary</label><textarea id="characterArcSummary" placeholder="What is this character story about?">'+esc(arc.summary)+'</textarea></div>'+
      '<div class="arc-controls"><div class="field"><label>Number of quests</label><select id="characterArcQuestCount">'+
        Array.from({length:PA_CHARACTER_ARC_QUEST_MAX},(_,index)=>index+1).map(count=>'<option value="'+count+'"'+(arc.quest_count===count?' selected':'')+'>'+count+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Entry</label><select id="characterArcEntry">'+PA_CHARACTER_ARC_ENTRY_POLICIES.map(value=>'<option value="'+value+'"'+
        (arc.entry_policy===value?' selected':'')+'>'+esc(pretty(value))+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>On decline</label><select id="characterArcDecline"'+(optional?'':' disabled')+'>'+PA_CHARACTER_ARC_DECLINE_POLICIES.map(value=>'<option value="'+value+'"'+
        (arc.decline_policy===value?' selected':'')+'>'+esc(pretty(value))+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Primary location</label><select id="characterArcLocation">'+placeOptions(arc.primary_location)+'</select></div></div>'+
      (optional?'<div class="character-arc-choice"><b>Player freedom is required</b><span>The opening quest should offer accept, defer, and decline paths. Declining this arc must not lock unrelated stories with '+esc(character.name)+'.</span></div>':'')+
      '<div class="arc-controls character-story-gates"><div class="field"><label>Relationship gate</label><select id="characterArcGateMeter"><option value=""'+(!arc.gate_meter?' selected':'')+'>No meter required</option>'+PA_CHARACTER_ARC_METERS.map(value=>'<option value="'+value+'"'+
        (arc.gate_meter===value?' selected':'')+'>'+esc(pretty(value))+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Minimum (0–100)</label><input type="number" min="0" max="100" id="characterArcGateValue" value="'+esc(arc.gate_value)+'"'+(!arc.gate_meter?' disabled':'')+'></div>'+
      '<div class="field"><label>Required flag or state value</label><input id="characterArcRequiredState" value="'+esc(arc.required_state)+'" placeholder="player.employment.job=restaurant_server"></div>'+
      '<div class="field"><label>Prerequisite quest ids</label><input id="characterArcPrerequisites" value="'+esc(arc.prerequisite_quests.join(', '))+'" placeholder="restaurant_orientation"></div></div>'+
      '<div class="arc-story-grid"><div class="field"><label>Central conflict</label><textarea data-character-arc-field="conflict">'+esc(arc.conflict)+'</textarea></div>'+
      '<div class="field"><label>Important player choice</label><textarea data-character-arc-field="important_choice">'+esc(arc.important_choice)+'</textarea></div>'+
      '<div class="field"><label>Lasting consequence</label><textarea data-character-arc-field="consequence">'+esc(arc.consequence)+'</textarea></div>'+
      '<div class="field"><label>Future callback</label><textarea data-character-arc-field="callback">'+esc(arc.callback)+'</textarea></div></div>'+
      '<div class="arc-detail-grid"><div class="field"><label>Supporting NPC ids</label><input id="characterArcSupporting" value="'+esc(arc.supporting_characters.join(', '))+'"></div>'+
      '<div class="field"><label>Required memories</label><input id="characterArcMemories" value="'+esc(arc.required_memories.join(', '))+'"></div>'+
      '<div class="field"><label>Decline / defer outcome</label><input id="characterArcDeclineOutcome" value="'+esc(arc.decline_outcome)+'"'+(optional?'':' disabled')+' placeholder="Arc stays available; other stories continue"></div></div>'+
      '<div class="field"><label>Writer notes</label><textarea data-character-arc-field="notes">'+esc(arc.notes)+'</textarea></div>'+questRows+
      (issues.length?'<ul class="arc-issues">'+issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':
        '<div class="arc-clean">This independent story has a complete plan and playable content.</div>')+'</section>';
  wireCharacterStoryArcWorkshop(character,arc);wireCharacterArcTabs(character);
}

function openCharacterStoryArcQuest(character,arc,index){
  const slot=characterStoryArcQuestSlots(character,arc)[index];if(!slot)return;
  try{
    const result=ensureCharacterStoryArcQuest(character,slot);
    sel=result.quest.uid;focusPath=[];stageIx=0;save();paintAll();
    $('relationshipArcWorkshop').close();openQuestBuilder();
    if(result.created)note('Created '+esc(slot.title)+'. Build its objectives, scenes, and player choices in the quest builder.');
  }catch(error){note(esc(error.message));}
}

function wireCharacterStoryArcWorkshop(character,arc){
  const body=$('relationshipArcBody'),saveField=(key,value)=>{arc[key]=value;save();};
  $('characterArcTitle').onchange=event=>{
    arc.title=event.target.value.trim()||pretty(arc.id);
    characterStoryArcQuestSlots(character,arc).forEach(slot=>{
      const quest=characterStoryArcQuest(character,slot);if(quest)quest.title=slot.title;
    });
    save();paintSetup();paintRelationshipArcWorkshop();
  };
  $('characterArcId').onchange=event=>{
    try{event.target.value=renameCharacterStoryArc(character,arc,event.target.value);save();paintSetup();paintRelationshipArcWorkshop();}
    catch(error){event.target.value=arc.id;note(esc(error.message));}
  };
  $('characterArcCategory').onchange=event=>{saveField('category',event.target.value);paintRelationshipArcWorkshop();};
  $('characterArcStatus').onchange=event=>{saveField('status',event.target.value);paintRelationshipArcWorkshop();};
  $('characterArcSummary').oninput=event=>saveField('summary',event.target.value);
  $('characterArcQuestCount').onchange=event=>{
    const before=arc.quest_count;arc.quest_count=Math.max(1,Math.min(PA_CHARACTER_ARC_QUEST_MAX,+event.target.value||1));
    save();paintRelationshipArcWorkshop();
    if(arc.quest_count<before)note('Arc shortened. Existing quest content was kept and can be restored by raising the count again.');
  };
  $('characterArcEntry').onchange=event=>{saveField('entry_policy',event.target.value);paintRelationshipArcWorkshop();};
  $('characterArcDecline').onchange=event=>saveField('decline_policy',event.target.value);
  $('characterArcLocation').onchange=event=>saveField('primary_location',event.target.value);
  $('characterArcGateMeter').onchange=event=>{saveField('gate_meter',event.target.value);paintRelationshipArcWorkshop();};
  $('characterArcGateValue').onchange=event=>{
    event.target.value=arc.gate_value=Math.max(0,Math.min(100,parseInt(event.target.value,10)||0));save();};
  $('characterArcRequiredState').onchange=event=>{event.target.value=arc.required_state=event.target.value.trim();save();};
  const listInput=(id,key)=>$(id).onchange=event=>{
    arc[key]=relationshipArcList(event.target.value);event.target.value=arc[key].join(', ');save();paintRelationshipArcWorkshop();};
  listInput('characterArcPrerequisites','prerequisite_quests');
  listInput('characterArcSupporting','supporting_characters');
  listInput('characterArcMemories','required_memories');
  $('characterArcDeclineOutcome').oninput=event=>saveField('decline_outcome',event.target.value);
  body.querySelectorAll('[data-character-arc-field]').forEach(field=>field.oninput=()=>
    saveField(field.dataset.characterArcField,field.value));
  body.querySelectorAll('[data-character-arc-quest]').forEach(button=>button.onclick=()=>
    openCharacterStoryArcQuest(character,arc,+button.dataset.characterArcQuest));
  body.querySelectorAll('[data-character-arc-conversation]').forEach(button=>button.onclick=()=>{
    sel=button.dataset.characterArcConversation;focusPath=[];stageIx=0;save();$('relationshipArcWorkshop').close();paintAll();
  });
}

function moveRelationshipArcStage(quest,stageIndex,direction){
  const indices=(quest.stages||[]).map((stage,index)=>({stage,index})).filter(row=>row.stage.id!=='branch').map(row=>row.index);
  const position=indices.indexOf(stageIndex),target=indices[position+direction];
  if(position<0||target===undefined)return;
  [quest.stages[stageIndex],quest.stages[target]]=[quest.stages[target],quest.stages[stageIndex]];
  save();paintRelationshipArcWorkshop();
}

function relationshipArcQuestSlot(character,chapterIndex,questIndex){
  const chapter=character.relationship_chapters[chapterIndex];if(!chapter)return null;
  return relationshipChapterQuestSlots(character,chapter)[questIndex]||null;
}

function openRelationshipArcQuest(character,index,questIndex=0){
  const chapter=character.relationship_chapters[index],slot=relationshipArcQuestSlot(character,index,questIndex);
  if(!chapter||!slot)return;
  try{
    const result=ensureRelationshipChapterQuest(character,slot);
    normalizeRelationshipChapterStory(character,chapter);
    sel=result.quest.uid;focusPath=[];stageIx=0;save();paintAll();
    $('relationshipArcWorkshop').close();openQuestBuilder();
    if(result.created)note('Created '+esc(slot.title)+'. Build its objectives and scenes in the quest builder.');
  }catch(error){note(esc(error.message));}
}

function wireRelationshipArcWorkshop(character){
  const body=$('relationshipArcBody');
  $('relationshipArcQuestTotal').onchange=event=>{
    const before=relationshipArcSummary(character).planned;
    setRelationshipArcQuestTotal(character,event.target.value);save();paintRelationshipArcWorkshop();
    if(relationshipArcSummary(character).planned<before)
      note('Arc shortened. Existing quest content was kept and can be restored by raising the count again.');
  };
  body.querySelectorAll('[data-arc-route]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcRoute].route=select.value;save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-status]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcStatus].story_plan.status=select.value;save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-quest-count]').forEach(select=>select.onchange=()=>{
    const chapter=character.relationship_chapters[+select.dataset.arcQuestCount];
    const before=chapter.story_plan.quest_count;chapter.story_plan.quest_count=+select.value;
    save();paintRelationshipArcWorkshop();
    if(chapter.story_plan.quest_count<before)
      note('Level shortened. Existing quest content was kept and can be restored by raising its quest count again.');
  });
  body.querySelectorAll('[data-arc-location]').forEach(select=>select.onchange=()=>{
    character.relationship_chapters[+select.dataset.arcLocation].story_plan.primary_location=select.value;save();});
  body.querySelectorAll('[data-arc-field]').forEach(field=>field.oninput=()=>{
    const [index,key]=field.dataset.arcField.split(':');character.relationship_chapters[+index].story_plan[key]=field.value;save();});
  body.querySelectorAll('[data-arc-list]').forEach(field=>field.onchange=()=>{
    const [index,key]=field.dataset.arcList.split(':');character.relationship_chapters[+index].story_plan[key]=relationshipArcList(field.value);
    field.value=character.relationship_chapters[+index].story_plan[key].join(', ');save();paintRelationshipArcWorkshop();});
  body.querySelectorAll('[data-arc-quest]').forEach(button=>button.onclick=()=>{
    const [chapterIndex,questIndex]=button.dataset.arcQuest.split(':').map(Number);
    openRelationshipArcQuest(character,chapterIndex,questIndex);
  });
  body.querySelectorAll('[data-arc-conversation]').forEach(button=>button.onclick=()=>{
    sel=button.dataset.arcConversation;focusPath=[];stageIx=0;save();$('relationshipArcWorkshop').close();paintAll();});
  body.querySelectorAll('[data-arc-up]').forEach(button=>button.onclick=()=>{
    const [chapterIndex,questIndex,stageIndex]=button.dataset.arcUp.split(':').map(Number);
    moveRelationshipArcStage(relationshipArcQuestMetrics(character,
      relationshipArcQuestSlot(character,chapterIndex,questIndex)).quest,stageIndex,-1);});
  body.querySelectorAll('[data-arc-down]').forEach(button=>button.onclick=()=>{
    const [chapterIndex,questIndex,stageIndex]=button.dataset.arcDown.split(':').map(Number);
    moveRelationshipArcStage(relationshipArcQuestMetrics(character,
      relationshipArcQuestSlot(character,chapterIndex,questIndex)).quest,stageIndex,1);});
  body.querySelectorAll('[data-arc-stage]').forEach(row=>{
    row.ondragstart=()=>{relationshipArcDraggedStage=row.dataset.arcStage;};
    row.ondragover=event=>event.preventDefault();
    row.ondrop=event=>{
      event.preventDefault();if(!relationshipArcDraggedStage)return;
      const [fromChapter,fromQuest,fromStage]=relationshipArcDraggedStage.split(':').map(Number);
      const [toChapter,toQuest,toStage]=row.dataset.arcStage.split(':').map(Number);
      relationshipArcDraggedStage=null;
      if(fromChapter!==toChapter||fromQuest!==toQuest||fromStage===toStage)return;
      const quest=relationshipArcQuestMetrics(character,
        relationshipArcQuestSlot(character,fromChapter,fromQuest)).quest;
      const item=quest.stages.splice(fromStage,1)[0],adjusted=fromStage<toStage?toStage-1:toStage;
      quest.stages.splice(adjusted,0,item);save();paintRelationshipArcWorkshop();
    };
  });
}

function scaffoldRelationshipArcQuests(){
  const character=P.characters[relationshipArcCharacterIndex];if(!character)return;
  let created=0;const errors=[];
  if(characterArcSelection==='relationship'){
    (character.relationship_chapters||[]).forEach(chapter=>{
      normalizeRelationshipChapterStory(character,chapter);
      relationshipChapterQuestSlots(character,chapter).forEach(slot=>{
        try{if(ensureRelationshipChapterQuest(character,slot).created)created++;}
        catch(error){errors.push(error.message);}
      });
    });
  }else{
    const arc=normalizeCharacterStoryArcs(character).find(item=>item.id===characterArcSelection);
    if(!arc){characterArcSelection='relationship';paintRelationshipArcWorkshop();return;}
    characterStoryArcQuestSlots(character,arc).forEach(slot=>{
      try{if(ensureCharacterStoryArcQuest(character,slot).created)created++;}
      catch(error){errors.push(error.message);}
    });
  }
  save();paintAll();paintRelationshipArcWorkshop();
  note(created+' story quest'+(created===1?'':'s')+' scaffolded.'+(errors.length?' '+esc(errors[0]):''));
}

if(typeof document!=='undefined'){
  $('closeRelationshipArc').onclick=()=>{$('relationshipArcWorkshop').close();paintAll();};
  $('scaffoldRelationshipArcs').onclick=scaffoldRelationshipArcQuests;
}
