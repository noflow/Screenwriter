/* ---- continuity and dependency analysis ---- */
let continuityCharacterFilter='all';
let continuityImpactTarget='';

function continuityProjectSheets(){
  const seen=new Set(),out=[];
  (typeof npcs==='function'?npcs():P.characters||[]).forEach(character=>{
    if(!character?.id||seen.has(character.id))return;
    seen.add(character.id);
    out.push(typeof gameReady==='function'?gameReady(character):character);
  });
  return out;
}

function continuityIndex(){
  const nodes={},links=[],states={},issues=[],linkKeys=new Set(),issueKeys=new Set();
  const addIssue=(sev,msg,where,characters=[])=>{
    const key=[sev,msg,where].join('|');
    if(issueKeys.has(key))return;
    issueKeys.add(key);issues.push({sev,msg,where,characters:[...new Set(characters.filter(Boolean))]});
  };
  const addNode=(type,id,label,character='',meta={})=>{
    id=String(id||'').trim();if(!id)return '';
    const key=type+':'+id;
    if(!nodes[key])nodes[key]={key,type,id,label:label||pretty(id),character,...meta};
    else{
      if(label)nodes[key].label=label;
      if(character&&!nodes[key].character)nodes[key].character=character;
      Object.assign(nodes[key],meta);
    }
    return key;
  };
  const addLink=(from,to,kind,where,options={})=>{
    if(!from||!to)return;
    const key=[from,to,kind,where].join('|');
    if(linkKeys.has(key))return;
    linkKeys.add(key);links.push({from,to,kind,where,expected:!!options.expected,
      hard:!!options.hard,characters:[...new Set((options.characters||[]).filter(Boolean))]});
  };
  const recordState=(key,access,source,where,value,character='')=>{
    key=String(key||'').trim();if(!key)return;
    const row=states[key]=states[key]||{key,reads:[],writes:[],values:[]};
    if(!row[access].some(item=>item.source===source&&item.where===where))
      row[access].push({source,where,character});
    if(value!==undefined&&!row.values.some(item=>JSON.stringify(item)===JSON.stringify(value)))
      row.values.push(value);
  };
  const questKey=id=>'quest:'+String(id||'');
  const conversationKey=id=>'conversation:'+String(id||'');
  const messageKey=id=>'message:'+String(id||'');
  const locationKey=ref=>'location:'+locPart(String(ref||''));
  const characterKey=id=>'character:'+String(id||'');
  const calendarKey=id=>'calendar:'+String(id||'');
  const refQuest=(id,consumer,kind,where,character,hard=false)=>
    addLink(questKey(id),consumer,kind,where,{expected:true,hard,characters:[character]});
  const refConversation=(id,consumer,kind,where,character,hard=true)=>
    addLink(conversationKey(id),consumer,kind,where,{expected:true,hard,characters:[character]});
  const refMessage=(id,consumer,kind,where,character,hard=true)=>
    addLink(messageKey(id),consumer,kind,where,{expected:true,hard,characters:[character]});
  const refLocation=(ref,consumer,where,character)=>{
    if(ref)addLink(locationKey(ref),consumer,'uses location',where,
      {expected:true,hard:true,characters:[character]});
  };
  const refCharacter=(id,consumer,kind,where,owner)=>{
    if(id)addLink(characterKey(id),consumer,kind,where,
      {expected:true,hard:true,characters:[owner,id]});
  };
  const meterState=(raw,owner)=>{
    if(!Array.isArray(raw))return null;
    const character=raw.length===2?owner:raw[0],meter=raw.length===2?raw[0]:raw[1];
    return character&&meter?'relationships.'+character+'.'+meter:null;
  };
  const readRules=(raw,consumer,where,owner)=>{
    const rows=Array.isArray(raw)?raw:[raw];
    rows.filter(rule=>rule&&typeof rule==='object').forEach(rule=>{
      if(rule.flag)recordState(Array.isArray(rule.flag)?rule.flag[0]:rule.flag,'reads',consumer,where,undefined,owner);
      if(rule.flag_not)recordState(Array.isArray(rule.flag_not)?rule.flag_not[0]:rule.flag_not,'reads',consumer,where,undefined,owner);
      for(const key of ['value_equals','value_below','value_in'])
        if(Array.isArray(rule[key]))recordState(rule[key][0],'reads',consumer,where,rule[key][1],owner);
      for(const key of ['meter_at_least','meter_at_most','meter_equals']){
        const state=meterState(rule[key],owner);if(state)recordState(state,'reads',consumer,where,rule[key].at(-1),owner);
      }
      for(const key of ['character_stat_at_least','character_stat_at_most'])
        if(Array.isArray(rule[key]))recordState('characters.'+rule[key][0]+'.stats.'+rule[key][1],
          'reads',consumer,where,rule[key][2],owner);
      if(Array.isArray(rule.memory_exists))recordState('memory.'+rule.memory_exists[0]+'.'+rule.memory_exists[1],
        'reads',consumer,where,true,owner);
      if(Array.isArray(rule.memory_missing))recordState('memory.'+rule.memory_missing[0]+'.'+rule.memory_missing[1],
        'reads',consumer,where,false,owner);
      if(Array.isArray(rule.chapter_at_least))recordState('relationships.'+rule.chapter_at_least[0]+'.chapter',
        'reads',consumer,where,rule.chapter_at_least[1],owner);
      if(rule.type==='relationship')recordState('relationships.'+rule.character_id+'.'+rule.meter,
        'reads',consumer,where,rule.minimum,owner);
      if(rule.type==='world_state'&&rule.path)recordState(rule.path,'reads',consumer,where,rule.equals,owner);
      if(rule.type==='skill'&&rule.id)recordState('player.skills.'+rule.id,'reads',consumer,where,rule.minimum,owner);
      if(rule.type==='attribute'&&rule.id)recordState('player.attributes.'+rule.id,'reads',consumer,where,rule.minimum,owner);
      if(rule.type==='memory'&&rule.character_id&&rule.id)recordState('memory.'+rule.character_id+'.'+rule.id,
        'reads',consumer,where,true,owner);
      if(rule.event==='quest_completed'&&rule.quest)refQuest(rule.quest,consumer,'quest prerequisite',where,owner);
      if(rule.quest_active)refQuest(rule.quest_active,consumer,'requires active quest',where,owner);
      if(rule.quest_completed)refQuest(rule.quest_completed,consumer,'requires completed quest',where,owner);
      if(rule.event==='conversation_completed'&&rule.conversation)
        refConversation(rule.conversation,consumer,'requires completed conversation',where,owner);
      if(rule.location)refLocation(rule.location,consumer,where,owner);
      if(rule.calendar_participant)refCharacter(rule.calendar_participant,consumer,'calendar participant',where,owner);
      if(rule.npc_available)refCharacter(rule.npc_available,consumer,'requires available character',where,owner);
    });
  };
  const effectTargetQuest=effect=>String(effect?.quest||
    (['start_quest','complete_quest'].includes(effect?.operation)?effect.value||'':'')||'');
  const scanEffect=(effect,source,where,owner)=>{
    if(!effect||typeof effect!=='object')return;
    const op=String(effect.operation||''),value=effect.value;
    if(op==='start_quest')addLink(source,questKey(effectTargetQuest(effect)),'starts follow-up',where,
      {expected:true,hard:true,characters:[owner]});
    else if(op==='complete_quest')addLink(source,questKey(effectTargetQuest(effect)),'completes quest',where,
      {expected:true,hard:true,characters:[owner]});
    else if(op==='complete_objective'||op==='complete_objective_if_active')
      addLink(source,questKey(effect.quest),'advances quest',where,{expected:true,hard:true,characters:[owner]});
    else if(op==='complete_conversation')addLink(source,conversationKey(effect.conversation||value),
      'completes conversation',where,{expected:true,hard:true,characters:[owner]});
    else if(op==='set_flag')recordState(effect.key,'writes',source,where,effect.value!==false,owner);
    else if(op==='set_value')recordState(effect.key,'writes',source,where,effect.value,owner);
    else if(op==='add_meter')recordState('relationships.'+effect.character+'.'+effect.meter,
      'writes',source,where,effect.value,owner);
    else if(op==='add_character_stat')recordState('characters.'+effect.character+'.stats.'+effect.key,
      'writes',source,where,effect.value,owner);
    else if(op==='add_player_value'||op==='add_attribute')recordState('player.'+(effect.section||'attributes')+'.'+
      (effect.key||effect.attribute),'writes',source,where,effect.value,owner);
    else if(op==='create_memory')recordState('memory.'+effect.character+'.'+(effect.memory_id||value),
      'writes',source,where,true,owner);
    else if(op==='unlock_relationship_chapter')recordState('relationships.'+effect.character+'.chapter',
      'writes',source,where,effect.level,owner);
    else if(op==='unlock_activity')recordState('unlocked.activity.'+value,'writes',source,where,true,owner);
    else if(op==='unlock_topic')recordState('relationships.'+effect.character+'.topic.'+value,
      'writes',source,where,true,owner);
    else if(op==='add_status')recordState('status.'+value,'writes',source,where,true,owner);
    else if(op==='show_tutorial')recordState('tutorial.shown.'+value,'writes',source,where,true,owner);
    else if(op==='schedule_event'){
      const event=addNode('calendar',value,pretty(value),owner,{created:true});
      addLink(source,event,'schedules event',where,{characters:[owner]});
    }else if(op==='discover_location'){
      const target=locationKey(effect.location_id||value);
      addLink(source,target,'discovers location',where,{expected:true,hard:true,characters:[owner]});
    }else if(op==='open_calendar_scheduler'){
      refCharacter(effect.participant,source,'opens scheduler for',where,owner);
      if(effect.valid_quest)refQuest(effect.valid_quest,source,'scheduler belongs to quest',where,owner,true);
    }else if(op==='open_calendar_rescheduler'){
      const event=calendarKey(effect.event||value);
      addLink(event,source,'reschedules event',where,{characters:[owner]});
    }
  };
  const scanEffects=(effects,source,where,owner)=>(Array.isArray(effects)?effects:[])
    .forEach(effect=>scanEffect(effect,source,where,owner));
  const walkConversationNodes=(nodeMap,source,owner,conversationId)=>{
    Object.entries(nodeMap||{}).forEach(([nodeId,node])=>{
      const where='Conversation · '+conversationId+' · '+nodeId;
      scanEffects(node.effects,source,where,owner);
      for(const listName of ['choices','branches'])
        (node[listName]||[]).forEach((branch,index)=>{
          const branchWhere=where+' · '+listName.slice(0,-1)+' '+(branch.id||index+1);
          readRules(branch.conditions||branch.condition,source,branchWhere,owner);
          scanEffects(branch.effects,source,branchWhere,owner);
        });
    });
  };

  (P.characters||[]).forEach(character=>addNode('character',character.id,
    character.name||character.display_name||pretty(character.id),character.id));
  (P.locations||[]).forEach(location=>addNode('location',location.id,location.name||pretty(location.id)));
  const globalIndex=typeof BUNDLED_GAME_CONTENT_INDEX==='undefined'?{quests:[],conversations:[]}:
    BUNDLED_GAME_CONTENT_INDEX;
  (globalIndex.quests||[]).forEach(item=>addNode('quest',item.id,item.title||pretty(item.id),'',
    {external:true,source:item.source}));
  (globalIndex.conversations||[]).forEach(item=>addNode('conversation',item.id,item.title||pretty(item.id),'',
    {external:true,source:item.source}));
  (P.content||[]).filter(item=>item.type==='activity'||item.type==='repeatable').forEach(item=>
    addNode(item.type,item.id,item.title||item.name||pretty(item.id),item.character||'',{item}));

  const sheets=continuityProjectSheets();
  sheets.forEach(sheet=>{
    (sheet.quests||[]).forEach(quest=>addNode('quest',quest.id,quest.title||pretty(quest.id),sheet.id,{item:quest}));
    (sheet.conversations||[]).forEach(conversation=>addNode('conversation',conversation.id,
      conversation.title||pretty(conversation.id),sheet.id,{item:conversation}));
    (sheet.text_messages||[]).forEach(message=>addNode('message',message.id,
      (message.text||pretty(message.id)).slice(0,72),sheet.id,{item:message}));
  });

  sheets.forEach(sheet=>{
    const owner=sheet.id;
    if(sheet.home?.location_id)addLink(locationKey(sheet.home.location_id),characterKey(owner),'home of',
      'Character · '+owner,{expected:true,hard:true,characters:[owner]});
    (sheet.quests||[]).forEach(quest=>{
      const source=questKey(quest.id),where='Quest · '+(quest.title||quest.id);
      readRules(quest.activation,source,where+' · activation',owner);
      readRules(quest.requirements,source,where+' · requirements',owner);
      if(quest.availability?.location)refLocation(quest.availability.location,source,where+' · availability',owner);
      if(quest.availability?.requires_npc_free)refCharacter(quest.availability.requires_npc_free,source,
        'requires available character',where+' · availability',owner);
      (quest.objectives||[]).forEach(objective=>{
        const completion=objective.completion||{},objectiveWhere=where+' · '+(objective.text||objective.id);
        readRules(completion,source,objectiveWhere,owner);
        if(completion.event==='conversation_completed')refConversation(completion.conversation,source,
          'conversation advances quest',objectiveWhere,owner);
        if(completion.event==='text_replied')refMessage(completion.thread,source,
          'reply advances quest',objectiveWhere,owner);
        if(completion.event==='text_thread_completed')refMessage(completion.thread,source,
          'thread advances quest',objectiveWhere,owner,false);
        if(completion.character)refCharacter(completion.character,source,'objective character',objectiveWhere,owner);
        if(completion.participant)refCharacter(completion.participant,source,'calendar participant',objectiveWhere,owner);
      });
      (quest.branches||[]).forEach(branch=>{
        const branchWhere=where+' · branch '+branch.id;
        readRules(branch.condition,source,branchWhere,owner);
        scanEffects(branch.effects,source,branchWhere,owner);
        (branch.start_quests||[]).forEach(id=>addLink(source,questKey(id),'starts follow-up',branchWhere,
          {expected:true,hard:true,characters:[owner]}));
      });
      scanEffects(quest.completion_effects,source,where+' · completion',owner);
      Object.entries(quest.failure||{}).forEach(([key,value])=>{
        if(Array.isArray(value))scanEffects(value,source,where+' · failure '+key,owner);
      });
    });
    (sheet.conversations||[]).forEach(conversation=>{
      const source=conversationKey(conversation.id),where='Conversation · '+(conversation.title||conversation.id);
      readRules(conversation.activation,source,where+' · activation',owner);
      readRules(conversation.conditions||conversation.condition,source,where+' · conditions',owner);
      scanEffects(conversation.completion_effects,source,where+' · completion',owner);
      walkConversationNodes(conversation.nodes,source,owner,conversation.id);
    });
    (sheet.text_messages||[]).forEach(message=>{
      const source=messageKey(message.id),where='Text · '+(message.id||'untitled'),trigger=message.trigger||{};
      if(trigger.quest_started)refQuest(trigger.quest_started,source,'quest triggers message',where,owner);
      if(Array.isArray(trigger.objective_completed))refQuest(trigger.objective_completed[0],source,
        'objective triggers message',where,owner);
      if(Array.isArray(trigger.hours_after_quest))refQuest(trigger.hours_after_quest[0],source,
        'delayed quest message',where,owner);
      if(Array.isArray(trigger.hours_before_calendar_event))addLink(calendarKey(trigger.hours_before_calendar_event[0]),
        source,'event reminder',where,{characters:[owner]});
      for(const key of ['message_sent','message_replied'])if(trigger[key]){
        const ref=Array.isArray(trigger[key])?trigger[key].at(-1):trigger[key];
        refMessage(ref,source,key==='message_sent'?'sent message triggers':'reply triggers',where,owner);
      }
      if(Array.isArray(trigger.reply_selected))refMessage(trigger.reply_selected[0],source,
        'specific reply triggers',where,owner);
      readRules(trigger,source,where+' · trigger',owner);
      readRules(message.conditions,source,where+' · conditions',owner);
      scanEffects(message.effects,source,where+' · effects',owner);
      (message.quick_replies||[]).forEach((reply,index)=>{
        const replyWhere=where+' · reply '+(reply.id||index+1);
        readRules(reply.conditions,source,replyWhere,owner);scanEffects(reply.effects,source,replyWhere,owner);
      });
    });
  });

  links.filter(link=>link.expected&&!nodes[link.from]).forEach(link=>{
    const [type,id]=link.from.split(/:(.*)/s);
    addIssue(link.hard?'err':'warn','Missing '+type+' "'+id+'" is required by this content.',
      link.where,link.characters);
  });
  links.filter(link=>link.expected&&!nodes[link.to]).forEach(link=>{
    const [type,id]=link.to.split(/:(.*)/s);
    addIssue(link.hard?'err':'warn','Missing '+type+' "'+id+'" is targeted by this content.',
      link.where,link.characters);
  });

  const cyclesFor=(type,kinds)=>{
    const graph={};
    links.filter(link=>link.from.startsWith(type+':')&&link.to.startsWith(type+':')&&kinds.includes(link.kind))
      .forEach(link=>(graph[link.from]=graph[link.from]||[]).push(link.to));
    const visiting=new Set(),visited=new Set(),cycles=[],cycleKeys=new Set();
    const walk=(id,path)=>{
      if(visiting.has(id)){
        const at=path.indexOf(id),cycle=path.slice(at).concat(id),key=[...new Set(cycle)].sort().join('|');
        if(!cycleKeys.has(key)){cycleKeys.add(key);cycles.push(cycle);}return;
      }
      if(visited.has(id))return;
      visiting.add(id);(graph[id]||[]).forEach(next=>walk(next,path.concat(id)));
      visiting.delete(id);visited.add(id);
    };
    Object.keys(graph).forEach(id=>walk(id,[]));return cycles;
  };
  cyclesFor('quest',['quest prerequisite','starts follow-up']).forEach(cycle=>addIssue('err',
    'Circular quest progression: '+cycle.map(id=>nodes[id]?.label||id.slice(6)).join(' → ')+'.',
    'Quest dependencies',cycle.map(id=>nodes[id]?.character)));
  cyclesFor('message',['sent message triggers','reply triggers','specific reply triggers']).forEach(cycle=>addIssue('err',
    'Circular phone-message trigger: '+cycle.map(id=>nodes[id]?.label||id.slice(8)).join(' → ')+'.',
    'Phone dependencies',cycle.map(id=>nodes[id]?.character)));

  Object.values(states).forEach(row=>{
    const characters=[...row.reads,...row.writes].map(item=>item.character);
    if(row.reads.length&&!row.writes.length)addIssue('info','State "'+row.key+
      '" is read but never written inside this Screenwriter project. Confirm that the game seeds it.',
      row.reads.map(item=>item.where).slice(0,3).join(' · '),characters);
    if(row.writes.length&&!row.reads.length)addIssue('info','State "'+row.key+
      '" is written but has no later reader inside this Screenwriter project.',
      row.writes.map(item=>item.where).slice(0,3).join(' · '),characters);
  });

  const nodeList=Object.values(nodes);
  return {nodes:nodeList,nodeById:nodes,links,states,issues,summary:{
    storyItems:nodeList.filter(node=>['quest','conversation','message'].includes(node.type)).length,
    links:links.length,stateKeys:Object.keys(states).length,
    errors:issues.filter(issue=>issue.sev==='err').length,
    warnings:issues.filter(issue=>issue.sev==='warn').length,
    notes:issues.filter(issue=>issue.sev==='info').length
  }};
}

function continuityImpact(index,target){
  const inbound=index.links.filter(link=>link.to===target);
  const outbound=index.links.filter(link=>link.from===target);
  const stateReads=[],stateWrites=[];
  Object.values(index.states).forEach(row=>{
    if(row.reads.some(item=>item.source===target))stateReads.push(row.key);
    if(row.writes.some(item=>item.source===target))stateWrites.push(row.key);
  });
  return {target,node:index.nodeById[target],inbound,outbound,stateReads,stateWrites,
    affected:[...new Set([...inbound.map(link=>link.from),...outbound.map(link=>link.to)])]};
}

function continuityVisibleForCharacter(index,character){
  if(!character||character==='all')return {nodes:index.nodes,links:index.links,issues:index.issues,
    states:Object.values(index.states)};
  const direct=new Set(index.nodes.filter(node=>node.character===character).map(node=>node.key));
  const links=index.links.filter(link=>direct.has(link.from)||direct.has(link.to)||link.characters.includes(character));
  links.forEach(link=>{direct.add(link.from);direct.add(link.to);});
  return {nodes:index.nodes.filter(node=>direct.has(node.key)),links,
    issues:index.issues.filter(issue=>issue.characters.includes(character)),
    states:Object.values(index.states).filter(row=>[...row.reads,...row.writes]
      .some(item=>item.character===character||direct.has(item.source)))};
}

function continuityNodeName(index,key){
  const node=index.nodeById[key];
  return node?(pretty(node.type)+' · '+node.label):key;
}

function paintContinuityDashboard(container){
  const index=continuityIndex(),view=continuityVisibleForCharacter(index,continuityCharacterFilter);
  const storyNodes=view.nodes.filter(node=>['quest','conversation','message'].includes(node.type));
  const targetOptions=index.nodes.filter(node=>['quest','conversation','message','activity','repeatable','character','location'].includes(node.type))
    .sort((a,b)=>(a.type+a.label).localeCompare(b.type+b.label));
  if(!index.nodeById[continuityImpactTarget])continuityImpactTarget=storyNodes[0]?.key||targetOptions[0]?.key||'';
  const impact=continuityImpact(index,continuityImpactTarget);
  const nodeRows=storyNodes.map(node=>{
    const incoming=view.links.filter(link=>link.to===node.key),outgoing=view.links.filter(link=>link.from===node.key);
    const state=Object.values(index.states).filter(row=>[...row.reads,...row.writes].some(item=>item.source===node.key));
    return '<tr><td class="k"><span class="continuity-kind '+esc(node.type)+'">'+esc(node.type)+'</span> '+
      esc(node.label)+'</td><td class="w">'+esc(incoming.map(link=>link.kind+' · '+continuityNodeName(index,link.from)).join('\n')||'—')+
      '</td><td class="w">'+esc(outgoing.map(link=>link.kind+' · '+continuityNodeName(index,link.to)).join('\n')||'—')+
      '</td><td class="w">'+esc(state.map(row=>row.key).join('\n')||'—')+'</td></tr>';
  }).join('');
  const impactList=(rows,other)=>rows.length?rows.map(link=>'<li><b>'+esc(link.kind)+'</b> — '+
    esc(continuityNodeName(index,link[other]))+'<small>'+esc(link.where)+'</small></li>').join(''):
    '<li class="empty-impact">No direct references.</li>';
  container.innerHTML='<div class="continuity-toolbar"><label>Character focus<select id="continuityCharacter"><option value="all">Whole project</option>'+
    (P.characters||[]).filter(character=>!isPlayer(character)).map(character=>'<option value="'+esc(character.id)+'" '+
      (continuityCharacterFilter===character.id?'selected':'')+'>'+esc(character.name||character.display_name||pretty(character.id))+'</option>').join('')+
    '</select></label><span class="hint">Read-only analysis—nothing here changes authored content.</span></div>'+
    '<div class="continuity-summary"><div><b>'+storyNodes.length+'</b><span>story items</span></div><div><b>'+view.links.length+
    '</b><span>dependencies</span></div><div><b>'+view.states.length+'</b><span>state keys</span></div><div class="bad"><b>'+
    view.issues.filter(issue=>issue.sev==='err').length+'</b><span>blocking</span></div><div class="warn"><b>'+
    view.issues.filter(issue=>issue.sev==='warn').length+'</b><span>warnings</span></div></div>'+
    '<p class="rubric later">Continuity findings</p>'+(view.issues.length?view.issues.slice(0,120).map(issue=>
      '<div class="issue '+issue.sev+'"><span class="sev">'+issue.sev+'</span><span class="msg">'+esc(issue.msg)+
      '<span class="where">'+esc(issue.where)+'</span></span></div>').join(''):
      '<div class="clean continuity-clean">No broken references, circular chains, or continuity gaps were found.</div>')+
    '<p class="rubric later">Rename or removal impact</p><div class="continuity-impact-controls"><select id="continuityImpact">'+
    targetOptions.map(node=>'<option value="'+esc(node.key)+'" '+(node.key===continuityImpactTarget?'selected':'')+'>'+esc(pretty(node.type)+' · '+node.label)+'</option>').join('')+
    '</select><span>'+(impact.affected.length)+' directly connected item'+(impact.affected.length===1?'':'s')+'</span></div>'+
    '<div class="continuity-impact"><section><h4>Depends on this item</h4><ul>'+impactList(impact.inbound,'from')+
    '</ul></section><section><h4>This item affects</h4><ul>'+impactList(impact.outbound,'to')+'</ul></section><section><h4>State contract</h4><p><b>Reads</b> '+
    esc(impact.stateReads.join(', ')||'none')+'</p><p><b>Writes</b> '+esc(impact.stateWrites.join(', ')||'none')+
    '</p></section></div><p class="hint">Before renaming or deleting the selected item, review every direct connection above. Stable internal ids remain safer than display-name changes.</p>'+
    '<p class="rubric later">Story dependency ledger</p><table class="regtable continuity-table"><tr><th>Item</th><th>Requires</th><th>Leads to</th><th>State</th></tr>'+
    (nodeRows||'<tr><td class="w" colspan="4">No story items match this character.</td></tr>')+'</table>';
  const characterSelect=$('continuityCharacter'),impactSelect=$('continuityImpact');
  if(characterSelect)characterSelect.onchange=()=>{continuityCharacterFilter=characterSelect.value;continuityImpactTarget='';paintInspect();};
  if(impactSelect)impactSelect.onchange=()=>{continuityImpactTarget=impactSelect.value;paintInspect();};
}
