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

/** Keeps the source activation intact, updating only fields it already had —
    so a quest triggered by an event doesn't sprout a spurious time block. */
function mergeActivation(orig,item,locRef){
  const out=Object.assign({},orig);
  const had=k=>orig&&Object.prototype.hasOwnProperty.call(orig,k);
  if(had('block')&&item.block)out.block=item.block;
  else if(!orig&&item.block)out.block=item.block;
  if(had('day')&&item.day)out.day=item.day;
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
    if(r.type==='stat')out.meter_at_least=[r.key,+r.value];
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
    return t.includes('__')?t.split('__').slice(1).join('__'):t;
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
          const c={id:o._oid||slug(o.text||('opt_'+(i+1))).slice(0,28),text:o.text};
          if(o._tone)c.tone=o._tone;
          const fx=flagToEffects(o.flag);
          if(fx.length)c.effects=fx;
          const cond=requiresToCondition(o.requires);
          if(cond)c.condition=cond;
          if(target)c.next=target;
          return c;
        });
        prev=null;              // choices terminate the chain
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
  const out={
    id:group.base,
    type:a.type||'standard_topic',
    start_node:start||Object.keys(nodes)[0]||'',
    activation:mergeActivation(a.activation,group.main,a.locRef),
    nodes
  };
  if(a.repetition)out.repetition=a.repetition;
  if(group.main.premise)out.summary=group.main.premise;
  const cond=requiresToCondition(group.main.requires);
  if(cond)out.condition=cond;
  return out;
}

function questOut(c){
  const a=c._authored||{};
  const stages=(c.stages||[]).filter(s=>s.id!=='branch');
  const branchStage=(c.stages||[]).find(s=>s.id==='branch');

  const objectives=stages.map((s,i)=>{
    const o={id:s.id||'obj_'+(i+1),text:s.title};
    const orig=(a.objectives||[])[i];
    o.completion=s.completion||(s._authored&&s._authored.completion)||(orig&&orig.completion)||
      {event:'conversation_completed',conversation:s.id};
    return o;
  });

  const branches=branchStage
    ? (branchStage.nodes[0]?.options||[]).map(o=>{
        const b={id:o._oid||slug(o.text)};
        const cond=requiresToCondition(o.requires);
        if(cond)b.condition=cond;
        const starts=String(o.flag||'').split(';').map(s=>s.trim())
          .filter(s=>/^quest_.+_started$/.test(s)).map(s=>s.slice(6,-8));
        if(starts.length)b.start_quests=starts;
        const orig=(a.branches||[]).find(x=>x.id===b.id);
        if(orig&&orig.set_rules)b.set_rules=orig.set_rules;
        return b;
      })
    : (a.branches||[]);

  const last=(c.stages||[])[(c.stages||[]).length-1];
  const fx=flagToEffects(last&&last.flag)
    .filter(e=>!(e.operation==='set_flag'&&e.key==='quest_'+c.id+'_done'));

  const out={
    id:c.id,
    category:a.category||'character_story',
    title:c.title,
    summary:c.hook||c.premise||'',
    activation:mergeActivation(a.activation,c,null),
    objectives,
    branches,
    completion_effects:fx.length?fx:(a.completion_effects||[])
  };
  if(a.failure)out.failure=a.failure;
  if(c.after){
    out.activation=Object.assign({},out.activation,
      {event:'quest_completed',quest:c.after});
    delete out.activation.date;
  }
  const cond=requiresToCondition(c.requires);
  if(cond&&!out.activation.event)Object.assign(out.activation,cond);
  return out;
}

/** An activity exports as a counter plus milestones, each pointing at a conversation. */
function activityOut(c){
  const base=(c.stages||[])[0]||{nodes:[]};
  const key='activity.'+c.id+'.count';
  const out={
    id:c.id,
    title:c.title,
    character:c.character||'',
    location:c.location||'',
    activation:{blocks:c.block?[c.block]:[],days:c.day?[c.day]:[]},
    counter_key:key,
    increments_on:'completed',
    base:{conversation:c.id+'__base'},
    milestones:(c.stages||[]).slice(1)
      .sort((a,b)=>(+b.at||0)-(+a.at||0))          // highest first: most specific wins
      .map(s=>{
        const m={at:+s.at||1,conversation:c.id+'__'+(s.id||'ms'),
          once:s.once!==false,
          condition:Object.assign({value_at_least:[key,+s.at||1]},requiresToCondition(s.requires)||{})};
        const fx=flagToEffects(s.flag);
        if(fx.length)m.effects=fx;
        return m;
      })
  };
  const fx=flagToEffects(base.flag);
  if(fx.length)out.base.effects=fx;
  return out;
}

/** Each activity stage also needs its dialogue exported as a conversation. */
function activityConversations(c){
  return (c.stages||[]).map((s,i)=>{
    const group={base:c.id+'__'+(i===0?'base':(s.id||'ms'+i)),main:{
      id:c.id+'__'+(i===0?'base':(s.id||'ms'+i)),
      nodes:s.nodes||[],block:c.block,location:c.location,
      premise:s.title,requires:[],_authored:{type:'activity_beat'}
    },parts:[]};
    return conversationOut(group);
  }).filter(x=>Object.keys(x.nodes).length);
}

/** Full .character file for one character, with authored blocks rebuilt from the editor. */
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

  // Repeatables have no home in the authored schema, so they ride alongside.
  const reps=P.content.filter(x=>x.type==='repeatable'&&x.character===c.id);
  if(reps.length)base.idle_lines=reps.map(r=>({
    id:r.id,location:r.location,blocks:r.block?[r.block]:[],
    lines:(r.lines||[]).map(l=>({text:l.text,expression:l.emotion||'',
      min_chapter:+l.min_chapter||0}))}));

  delete base._stub;
  return base;
}
