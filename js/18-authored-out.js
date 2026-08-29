/* ============ write back to the game's schema ============ */
/* The inverse of importAuthored. Scenewright edits a nested tree; the game reads a
   named-node graph. Going back out means:
     - passages split on import (conv__node) fold back into their parent conversation
     - each line becomes a node with a "next" pointer
     - a jump resolves to the target's node id rather than a separate conversation
     - flag strings become effect objects again
   Original node ids are reused wherever the content came from an import, so a
   round trip doesn't rename anything the game already references. */

/** "elena_reyes_hale.respect +1; unlocked_quests" → the game's effects array. */
function flagToEffects(flag){
  return String(flag||'').split(';').map(s=>s.trim()).filter(Boolean).map(piece=>{
    if(piece.startsWith('!'))return {operation:'set_flag',key:piece.slice(1).trim(),value:false};
    const memory=piece.match(/^memory:([^:]+):(.+)$/i);
    if(memory)return {operation:'create_memory',character:memory[1].trim(),value:memory[2].trim()};
    const chapter=piece.match(/^chapter:([^:]+):(\d+)$/i);
    if(chapter)return {operation:'unlock_relationship_chapter',character:chapter[1].trim(),level:+chapter[2]};
    const custom=piece.match(/^stat:([^:]+):([^\s:]+)\s+([+-]?\d+)$/i);
    if(custom)return {operation:'add_character_stat',character:custom[1].trim(),key:custom[2].trim(),value:+custom[3]};
    const playerValue=piece.match(/^playerstat:(attributes|needs):([^\s:]+)\s+([+-]?\d+)$/i);
    if(playerValue)return {operation:'add_player_value',section:playerValue[1].toLowerCase(),
      key:playerValue[2].trim(),value:+playerValue[3]};
    if(piece.includes('=')){
      const [k,v]=piece.split('=');
      const val=v.trim();
      return {operation:'set_value',key:k.trim(),
        value:/^-?\d+$/.test(val)?parseInt(val,10):val==='true'?true:val==='false'?false:val};
    }
    const bits=piece.split(/\s+/), key=bits[0];
    if(bits.length>1&&key.includes('.')){
      const [character,meter]=key.split('.');
      return {operation:'add_meter',character,meter,value:parseInt(bits[1],10)||0};
    }
    if(bits.length>1)return {operation:'set_value',key,value:parseInt(bits[1],10)||0};
    if(key.startsWith('unlocked_'))return {operation:'unlock_phone_app',value:key.slice(9)};
    if(/^quest_.+_started$/.test(key))return {operation:'start_quest',value:key.slice(6,-8)};
    return {operation:'set_flag',key,value:true};
  });
}

function conditionValue(value){
  const v=String(value).trim();
  if(v==='true')return true;
  if(v==='false')return false;
  if(/^-?(?:\d+|\d*\.\d+)$/.test(v))return Number(v);
  return v;
}

/** Scenewright requirement rows → Port Alder dialogue conditions.
    Dialogue conditions are an array, so multiple requirements stay ANDed instead
    of being collapsed into one lossy object. */
function requiresToConditions(reqs){
  const out=[];
  (reqs||[]).forEach(r=>{
    if(r.type==='stat'){
      const meter=[r.character,r.key,+r.value];
      if(r.op==='lte')out.push({meter_at_most:meter});
      else if(r.op==='eq')out.push({meter_at_least:meter},{meter_at_most:meter});
      else out.push({meter_at_least:meter});
    }else if(r.type==='custom_stat'){
      const stat=[r.character,r.key,+r.value];
      if(r.op==='lte')out.push({character_stat_at_most:stat});
      else if(r.op==='eq')out.push({character_stat_at_least:stat},{character_stat_at_most:stat});
      else out.push({character_stat_at_least:stat});
    }else if(r.type==='chapter')out.push({chapter_at_least:[r.character,+r.value]});
    else if(r.type==='memory')out.push(r.op==='is_false'
      ?{memory_missing:[r.character,r.key]}:{memory_exists:[r.character,r.key]});
    else if(r.type==='met')out.push({flag:'met_'+r.character});
    else if(String(r.key).includes('=')){
      const [k,v]=String(r.key).split(/=(.*)/s);
      out.push({value_equals:[k,conditionValue(v)]});
    }else if(r.op==='is_false')out.push({flag_not:r.key});
    else out.push({flag:r.key});
  });
  return out;
}

/** Keeps the source activation intact, updating only fields it already had —
    so a quest triggered by an event doesn't sprout a spurious time block. */
function mergeActivation(orig,item,locRef){
  const out=Object.assign({},orig);
  const had=k=>orig&&Object.prototype.hasOwnProperty.call(orig,k);
  if(had('block')&&item.block)out.block=item.block;
  else if(!orig&&item.block)out.block=item.block;
  const days=contentDays(item);
  if(Array.isArray(item.days)){
    out.days=days;delete out.day;
  }else if(had('days'))out.days=days;
  else if(had('day')&&item.day)out.day=item.day;
  else if(!orig&&item.day)out.day=item.day;
  // item.location is already "location_id" or "location_id.room_id" — the game's format.
  if(had('location'))out.location=item.location||orig.location;
  else if(!orig&&item.location)out.location=item.location;
  if(item.start&&!out.event)out.event='new_game_started';
  return out;
}

/** Scenewright requires rows → the game's condition object. */
function requiresToCondition(reqs){
  if(!(reqs||[]).length)return undefined;
  const out={};
  reqs.forEach(r=>{
    if(r.type==='stat'){
      const meter=[r.character,r.key,+r.value];
      if(r.op==='lte')out.meter_at_most=meter;
      else if(r.op==='eq')out.meter_equals=meter;
      else out.meter_at_least=meter;
    }
    else if(r.type==='chapter')out.chapter_at_least=+r.value;
    else if(r.type==='met')out.event='character_met',out.character=r.character;
    else if(/^quest_.+_done$/.test(r.key))out.event='quest_completed',out.quest=r.key.slice(6,-5);
    else if(/^conv_.+_done$/.test(r.key))out.event='conversation_completed',out.conversation=r.key.slice(5,-5);
    else if(String(r.key).includes('=')){const [k,v]=String(r.key).split('=');out.value_equals=[k,v];}
    else out.value_equals=[r.key,true];
  });
  return Object.keys(out).length?out:undefined;
}

/** Groups passages back under the conversation they were split from. */
function passageGroups(charId){
  const mine=P.content.filter(c=>c.type==='conversation'&&
    (c.character===charId||(c.cast||[]).includes(charId)));
  const groups={};
  mine.forEach(c=>{
    const base=c.id.includes('__')?c.id.split('__')[0]:c.id;
    groups[base]=groups[base]||{base,main:null,parts:[]};
    if(c.id===base)groups[base].main=c;
    else groups[base].parts.push(c);
  });
  // A split part with no parent still deserves to be exported on its own.
  Object.values(groups).forEach(g=>{
    if(!g.main&&g.parts.length){g.main=g.parts.shift();g.base=g.main.id;}
  });
  return Object.values(groups).filter(g=>g.main);
}

function sameAuthoredRequirements(source,current,charId){
  return JSON.stringify(toRequires(source,charId))===JSON.stringify(current||[]);
}

/** Builds the game's flat node dict from a passage group. */
function buildNodes(group){
  const nodes={};
  let counter=0;
  const used=new Set();
  const idFor=(n,hint)=>{
    let id=n&&n._nid;
    if(!id||used.has(id)){
      do{ id=(hint||'n')+'_'+(++counter); }while(used.has(id));
    }
    used.add(id);
    return id;
  };
  // A jump to passage "conv__x" resolves to node "x" inside the merged graph.
  const resolve=t=>{
    if(!t)return undefined;
    return t.startsWith(group.base+'__')?t.slice(group.base.length+2):
      (t.includes('__')?t.split('__').slice(1).join('__'):t);
  };

  /** Emits a chain and returns the id of its first node, or a passthrough target. */
  const emit=(list,tail)=>{
    let first=null,prev=null;
    const link=id=>{
      if(prev&&nodes[prev]&&nodes[prev].next===undefined&&!nodes[prev].choices)nodes[prev].next=id;
      else if(prev&&nodes[prev]&&nodes[prev].next===null&&!nodes[prev].choices)nodes[prev].next=null;
      if(!first)first=id;
      prev=id;
    };

    for(const n of list||[]){
      if(n.type==='jump'){
        const t=resolve(n.target);
        if(prev&&nodes[prev]&&!nodes[prev].choices)nodes[prev].next=t;
        else if(!first)first=t;
        prev=null;
        return first;
      }

      if(n.type==='line'){
        const narr=n.speaker==='__narrator__';
        const id=idFor(n,narr?'sd':slug(n.speaker||'line'));
        // Start from the imported node so effects, next:null and any field this
        // tool doesn't model survive the round trip untouched.
        const body=Object.assign({},n._orig);
        delete body.choices;
        if(narr){delete body.speaker;delete body.line;
          body.stage_direction=String(n.text||'').replace(/^\*|\*$/g,'');}
        else{delete body.stage_direction;body.speaker=n.speaker;body.line=n.text;
          if(n.emotion)body.expression=n.emotion; else delete body.expression;}
        if(n._orig&&Object.prototype.hasOwnProperty.call(n._orig,'next'))body.next=n._orig.next;
        else delete body.next;
        if(group.activityId){
          const effects=syncActivityEffects(body.effects,group.activityId,n.activitySuccess);
          if(effects.length)body.effects=effects;else delete body.effects;
        }
        nodes[id]=body;
        link(id);
        continue;
      }

      if(n.type==='choice'){
        const id=idFor(n,'choice');
        nodes[id]={speaker:'player',choices:[]};
        link(id);
        nodes[id].choices=n.options.map((o,i)=>{
          const target=emit(o.nodes,null);
          const c=Object.assign({},o._orig,{id:o._oid||slug(o.text||('opt_'+(i+1))).slice(0,28),text:o.text});
          if(o._tone)c.tone=o._tone;
          let fx=flagToEffects(o.flag);
          if(group.activityId)fx=syncActivityEffects(fx,group.activityId,o.activitySuccess);
          if(fx.length)c.effects=fx;else if(group.activityId)delete c.effects;
          delete c.condition;delete c.conditions;
          const conditions=requiresToConditions(o.requires);
          if(conditions.length)c.conditions=conditions;
          if(target)c.next=target;
          return c;
        });
        prev=null;              // choices terminate the chain
        return first;
      }

      if(n.type==='gate'){
        const id=idFor(n,'gate');
        nodes[id]={branches:[]};
        link(id);
        nodes[id].branches=(n.options||[]).map((o,i)=>{
          const target=emit(o.nodes,null);
          const branch=Object.assign({},o._orig,{id:o._oid||('branch_'+(i+1)),text:o.text});
          let fx=flagToEffects(o.flag);
          if(group.activityId)fx=syncActivityEffects(fx,group.activityId,o.activitySuccess);
          if(fx.length)branch.effects=fx;else if(group.activityId)delete branch.effects;
          delete branch.condition;delete branch.conditions;
          const conditions=requiresToConditions(o.requires);
          if(conditions.length)branch.conditions=conditions;
          if(target)branch.next=target;
          return branch;
        });
        prev=null;
        return first;
      }
    }
    if(tail&&prev&&nodes[prev])nodes[prev].next=tail;
    return first;
  };

  const start=emit(group.main.nodes||[],null);
  group.parts.forEach(p=>emit(p.nodes||[],null));
  return {nodes,start};
}

function conversationOut(group){
  const {nodes,start}=buildNodes(group);
  const a=group.main._authored||{};
  const source=a.source||{};
  const out=Object.assign({},source,{
    id:group.base,
    type:a.type||'standard_topic',
    start_node:start||Object.keys(nodes)[0]||'',
    activation:mergeActivation(a.activation,group.main,a.locRef),
    nodes
  });
  if(a.repetition)out.repetition=a.repetition;
  if(Object.prototype.hasOwnProperty.call(source,'title')||group.main.title!==pretty(group.base))
    out.title=group.main.title;
  else delete out.title;
  if(a.internal!==undefined)out.internal=!!a.internal;
  if(a.replayable!==undefined)out.replayable=!!a.replayable;
  if(group.activityId)out.activity_id=group.activityId;
  if(group.main.premise)out.summary=group.main.premise;
  const planned=plannedSceneEffects(group.main.scenePlan);
  const completion=(a.completion_effects||[]).concat(planned);
  if(completion.length)out.completion_effects=completion;
  const sourceCondition=source.conditions||source.condition;
  if(!sameAuthoredRequirements(sourceCondition,group.main.requires,(group.main.cast||[])[0])){
    delete out.condition;delete out.conditions;
    const cond=requiresToCondition(group.main.requires);
    if(cond)out.condition=cond;
  }
  return out;
}

function questOut(c){
  const a=c._authored||{};
  const source=a.source||{};
  const plan=c.questPlan||{};
  const stages=(c.stages||[]).filter(s=>s.id!=='branch');
  const branchStage=(c.stages||[]).find(s=>s.id==='branch');

  const objectives=stages.map((s,i)=>{
    const o={id:s.id||'obj_'+(i+1),text:s.title};
    const orig=(a.objectives||[])[i];
    o.completion=s.completion||(s._authored&&s._authored.completion)||(orig&&orig.completion)||
      {event:'conversation_completed',conversation:s.id};
    const hidden=s.hiddenUntil||(s._authored&&s._authored.hidden_until)||(orig&&orig.hidden_until);
    if(hidden)o.hidden_until=hidden;
    return o;
  });

  const branches=branchStage
    ? (branchStage.nodes[0]?.options||[]).map(o=>{
        const original=o._orig||(a.branches||[]).find(x=>x.id===(o._oid||slug(o.text)))||{};
        const b=Object.assign({},original,{id:o._oid||slug(o.text)});
        if(!sameAuthoredRequirements(original.conditions||original.condition,o.requires,c.character)){
          delete b.condition;delete b.conditions;
          const cond=requiresToCondition(o.requires);
          if(cond)b.condition=cond;
        }
        const starts=String(o.flag||'').split(';').map(s=>s.trim())
          .filter(s=>/^quest_.+_started$/.test(s)).map(s=>s.slice(6,-8));
        if(starts.length)b.start_quests=starts;else delete b.start_quests;
        return b;
      })
    : (a.branches||[]);

  const last=(c.stages||[])[(c.stages||[]).length-1];
  const fx=flagToEffects(last&&last.flag)
    .filter(e=>!(e.operation==='set_flag'&&e.key==='quest_'+c.id+'_done'));
  const plannedEffects=flagToEffects(plan.rewards||'');
  if(plan.event)plannedEffects.push({operation:'schedule_event',value:plan.event});
  const completionUnchanged=String(last?.flag||'')===String(a.imported_completion_flag||'')&&
    !String(plan.rewards||'').trim()&&
    JSON.stringify(plan.event||null)===JSON.stringify(a.imported_event||null);
  const completionEffects=completionUnchanged
    ?JSON.parse(JSON.stringify(a.completion_effects||[]))
    :(fx.length?fx:(a.completion_effects||[])).concat(plannedEffects);

  const out=Object.assign({},source,{
    id:c.id,
    category:plan.category||a.category||'character_story',
    title:c.title,
    summary:plan.summary||c.hook||c.premise||'',
    activation:mergeActivation(a.activation,c,null),
    objectives,
    branches,
    completion_effects:completionEffects
  });
  if(a.failure)out.failure=a.failure;
  if(c.after){
    out.activation=Object.assign({},out.activation,
      {event:'quest_completed',quest:c.after});
    delete out.activation.date;
    if(plan.earliestBlock)out.activation.earliest_block=plan.earliestBlock;
  }
  if(plan.deadline)out.deadline_note=plan.deadline;
  const participants=(Array.isArray(plan.participants)?plan.participants:[]).filter(Boolean);
  if(participants.length||Object.prototype.hasOwnProperty.call(source,'participants'))
    out.participants=[...new Set(participants)];
  else delete out.participants;
  if(!sameAuthoredRequirements(source.conditions||source.condition,c.requires,c.character)){
    delete out.condition;delete out.conditions;
    const cond=requiresToCondition(c.requires);
    if(cond&&!out.activation.event)Object.assign(out.activation,cond);
  }
  return out;
}

/** An activity exports as a counter plus milestones, each pointing at a conversation. */
function activityOut(c){
  const base=(c.stages||[])[0]||{nodes:[]};
  const a=c._authored||{};
  const source=a.source||{};
  const baseOut=Object.assign({},base._activitySource||source.base||{},
    {conversation:base._conversationId||c.id+'__base',title:base.title||'Every time'});
  delete baseOut.effects;
  const baseEffects=flagToEffects(base.flag).concat(plannedSceneEffects(base.scenePlan));
  if(baseEffects.length)baseOut.effects=baseEffects;
  const out=Object.assign({},source,{
    id:c.id,
    kind:c.kind||a.kind||'social_activity',
    title:c.title,
    character:c.character||'',
    location:c.location||'',
    activation:activityActivation(c),
    counter_key:activityCounterKey(c),
    repeat_limit:activityRepeatLimit(c),
    increments_on:c.incrementsOn||a.increments_on||'explicit_success',
    milestone_semantics:c.milestoneSemantics||a.milestone_semantics||
      ((c.incrementsOn||a.increments_on)==='explicit_success'?'after_successes':'projected_attempt'),
    base:baseOut,
    milestones:(c.stages||[]).slice(1)
      .slice().sort((x,y)=>(+y.at||0)-(+x.at||0))  // highest first: most specific wins
      .map(s=>{
        const m=Object.assign({},s._activitySource||{},
          {id:s.id||'ms',title:s.title||'',at:+s.at||1,
            conversation:s._conversationId||c.id+'__'+(s.id||'ms'),once:s.once!==false});
        delete m.condition;delete m.conditions;delete m.effects;
        const conditions=requiresToConditions(s.requires);
        if(conditions.length)m.conditions=conditions;
        const fx=flagToEffects(s.flag).concat(plannedSceneEffects(s.scenePlan));
        if(fx.length)m.effects=fx;
        return m;
      })
  });
  if(activityName(c))out.name=activityName(c);else delete out.name;
  if(c.category)out.category=c.category;else delete out.category;
  if(Object.prototype.hasOwnProperty.call(source,'summary')||c.premise)out.summary=c.premise||'';
  delete out.condition;delete out.conditions;
  const conditions=requiresToConditions(c.requires);
  if(conditions.length)out.conditions=conditions;
  if(a.success_flag)out.success_flag=a.success_flag;
  delete out.once_per_block;delete out.repeat_period;delete out.once_per_period;delete out.period_lock;
  if(!out.repeat_limit)delete out.repeat_limit;
  return out;
}

/** Each activity stage also needs its dialogue exported as a conversation. */
function activityConversations(c){
  return (c.stages||[]).map((s,i)=>{
    const id=s._conversationId||c.id+'__'+(i===0?'base':(s.id||'ms'+i));
    const group={base:id,activityId:c.id,main:{
      id,title:s.title,
      nodes:s.nodes||[],block:c.block,location:c.location,
      premise:s.premise||s.title,requires:[],
      _authored:{type:'activity_beat',internal:true,replayable:true}
    },parts:s._parts||[]};
    return conversationOut(group);
  }).filter(x=>Object.keys(x.nodes).length);
}

/** Full .character file for one character, with authored blocks rebuilt from the editor. */
function phoneMessageOut(message){
  const clean=value=>{
    if(Array.isArray(value))return value.map(clean);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
      .filter(([key])=>!key.startsWith('_')).map(([key,item])=>[key,clean(item)]));
    return value;
  };
  return clean(message);
}

function sheetOut(c){
  const base=gameReady(c);
  const quests=P.content.filter(x=>x.type==='quest'&&
    (x.character===c.id||(x.cast||[]).includes(c.id))).map(questOut);
  const acts=P.content.filter(x=>x.type==='activity'&&x.character===c.id);
  const convs=passageGroups(c.id).map(conversationOut)
    .concat(...acts.map(activityConversations));
  if(acts.length)base.activities=acts.map(activityOut);

  if(quests.length)base.quests=quests;
  if(convs.length)base.conversations=convs;
  base.text_messages=ensureTextMessages(c).map(phoneMessageOut);

  // Repeatables have no home in the authored schema, so they ride alongside.
  const reps=P.content.filter(x=>x.type==='repeatable'&&x.character===c.id);
  if(reps.length)base.idle_lines=reps.map(r=>({
    id:r.id,location:r.location,blocks:r.block?[r.block]:[],
    lines:(r.lines||[]).map(l=>({text:l.text,expression:l.emotion||'',
      min_chapter:+l.min_chapter||0}))}));

  delete base._stub;
  return base;
}
