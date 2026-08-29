/* ============ authored content import ============ */
/* Reads the quests / conversations / text_messages blocks that already exist in a
   .character sheet and turns them into Scenewright content.

   The hard part is shape. Authored conversations are a NAMED-NODE GRAPH — a dict of
   node ids, each pointing at the next by name — while Scenewright edits a nested tree.
   A graph converges (several paths land on one node); a tree cannot express that
   without duplicating the shared tail.

   So: any node reached from more than one place becomes its own passage, and the
   paths that reach it emit a jump. Linear runs stay inlined. Nothing is duplicated
   and nothing is lost. */

/** add_meter / set_flag / unlock_phone_app → Scenewright's flag string syntax. */
function effectsToFlag(effects){
  return (effects||[]).map(e=>{
    const v=e.value;
    switch(e.operation){
      case 'add_meter':   return e.character+'.'+e.meter+' '+(v>=0?'+':'')+v;
      case 'set_flag':    return v===false?'!'+e.key:e.key;
      case 'set_value':   return e.key+'='+e.value;
      case 'unlock_phone_app': return 'unlocked_'+v;
      case 'start_quest': return 'quest_'+v+'_started';
      case 'create_memory': return 'memory:'+e.character+':'+v;
      case 'unlock_relationship_chapter': return 'chapter:'+e.character+':'+e.level;
      case 'add_character_stat': return 'stat:'+e.character+':'+e.key+' '+(v>=0?'+':'')+v;
      case 'add_player_value': return 'playerstat:'+e.section+':'+e.key+' '+(v>=0?'+':'')+v;
      case 'complete_activity': return '';
      default:            return e.key||e.operation;
    }
  }).filter(Boolean).join('; ');
}

/** Authored completion / activation conditions → Scenewright requires rows. */
function toRequires(cond,charId){
  if(!cond)return [];
  const out=[];
  const list=Array.isArray(cond)?cond:[cond];
  list.forEach(rule=>{
    if(!rule||typeof rule!=='object')return;
    if(rule.value_equals)out.push({type:'flag',
      key:String(rule.value_equals[0])+(rule.value_equals[1]===true?'':'='+rule.value_equals[1]),
      op:'is_true',value:1});
    if(rule.flag)out.push({type:'flag',key:String(rule.flag),op:'is_true',value:1});
    if(rule.flag_not)out.push({type:'flag',key:String(rule.flag_not),op:'is_false',value:1});
    if(rule.event==='quest_completed'&&rule.quest)
      out.push({type:'flag',key:'quest_'+rule.quest+'_done',op:'is_true',value:1});
    if(rule.event==='conversation_completed'&&rule.conversation)
      out.push({type:'flag',key:'conv_'+rule.conversation+'_done',op:'is_true',value:1});
    if(rule.meter_at_least){
      const m=rule.meter_at_least,full=m.length>=3;
      out.push({type:'stat',character:full?m[0]:charId,key:full?m[1]:m[0],op:'gte',value:full?m[2]:m[1]});
    }
    if(rule.meter_at_most){
      const m=rule.meter_at_most,full=m.length>=3;
      out.push({type:'stat',character:full?m[0]:charId,key:full?m[1]:m[0],op:'lte',value:full?m[2]:m[1]});
    }
    if(rule.chapter_at_least&&rule.chapter_at_least.length===2)
      out.push({type:'chapter',character:rule.chapter_at_least[0],op:'gte',value:rule.chapter_at_least[1]});
    if(rule.memory_exists&&rule.memory_exists.length===2)
      out.push({type:'memory',character:rule.memory_exists[0],key:rule.memory_exists[1],op:'is_true',value:1});
    if(rule.memory_missing&&rule.memory_missing.length===2)
      out.push({type:'memory',character:rule.memory_missing[0],key:rule.memory_missing[1],op:'is_false',value:1});
    if(rule.character_stat_at_least&&rule.character_stat_at_least.length===3)
      out.push({type:'custom_stat',character:rule.character_stat_at_least[0],key:rule.character_stat_at_least[1],op:'gte',value:rule.character_stat_at_least[2]});
    if(rule.character_stat_at_most&&rule.character_stat_at_most.length===3)
      out.push({type:'custom_stat',character:rule.character_stat_at_most[0],key:rule.character_stat_at_most[1],op:'lte',value:rule.character_stat_at_most[2]});
  });
  return out;
}

/** location "hale_home.player_bedroom" → a location id, registering it if new. */
/** Sheets already use "location_id.room_id" — keep it verbatim when the registry knows it. */
function locFromRef(ref){
  if(!ref)return '';
  const s=String(ref);
  const resolved=typeof resolvePlaceRef==='function'?resolvePlaceRef(s):null;
  if(resolved)return resolved;
  if(loc(locPart(s)))return s;
  // With the canonical registry loaded, keep an unresolved authored reference
  // intact for Validate. Never invent a top-level place from its room suffix.
  if(P.locations.some(l=>l.tags?.includes('package')))return s;
  // Before the registry arrives, a qualified ref still tells us its parent.
  // Preserve the whole ref so a later registry import can resolve it safely.
  if(s.includes('.')){
    const parent=slug(s.split('.')[0]);
    if(parent&&!loc(parent))P.locations.push({id:parent,
      name:pretty(parent).replace(/\b\w/g,m=>m.toUpperCase()),district:'',
      background:'bg_'+parent,rooms:[],residents:[],services:[],tags:['derived'],notes:''});
    return s;
  }
  const base=slug(s.split('.')[0]);
  if(loc(base))return roomPart(s)?base+'.'+roomPart(s):base;
  const id=slug(s.split('.').pop());
  if(!loc(id)){
    P.locations.push({id,name:pretty(id).replace(/\b\w/g,m=>m.toUpperCase()),
      district:'',background:'bg_'+id,rooms:[],residents:[],services:[],
      tags:['derived'],notes:''});
  }
  return id;
}

/** Converts one authored conversation into 1..n Scenewright passages. */
function convertConversation(conv,sheet,report,options={}){
  const nodes=conv.nodes||{};
  const start=conv.start_node||Object.keys(nodes)[0];
  if(!start)return;

  // Count how many places reach each node. >1 means it has to become its own passage.
  const inbound={};
  const bump=id=>{if(id&&nodes[id])inbound[id]=(inbound[id]||0)+1;};
  Object.values(nodes).forEach(n=>{
    bump(n.next);
    (n.choices||[]).forEach(c=>bump(c.next));
    (n.branches||[]).forEach(c=>bump(c.next));
  });
  const shared=new Set(Object.keys(inbound).filter(id=>inbound[id]>1&&id!==start));

  const cast=new Set();
  const made=[];
  const passageId=id=>id===start?conv.id:conv.id+'__'+id;
  const completesActivity=n=>(n?.effects||[]).some(e=>e?.operation==='complete_activity'&&
    (!options.activityId||e.value===options.activityId));

  /** Walks a linear run from `id`, stopping at a shared node (emitting a jump to it). */
  const walk=(id,seen)=>{
    const out=[];
    while(id&&nodes[id]){
      if(seen.has(id)){out.push({type:'jump',target:passageId(id)});break;}
      seen.add(id);
      const n=nodes[id];

      if(n.stage_direction)
        out.push({type:'line',speaker:'__narrator__',text:'*'+n.stage_direction+'*',
          emotion:'',activitySuccess:!n.line&&completesActivity(n),
          stage:n.line?undefined:(typeof lineStageFromAuthored==='function'?lineStageFromAuthored(n):undefined),
          _nid:n.line?id+'__sd':id,_orig:n.line?null:n});

      if(n.line){
        if(n.speaker)cast.add(n.speaker);
        out.push({type:'line',speaker:n.speaker||'__narrator__',text:n.line,
          emotion:(n.emotion||n.expression||'').toLowerCase(),
          stage:typeof lineStageFromAuthored==='function'?lineStageFromAuthored(n):undefined,
          activitySuccess:completesActivity(n),_nid:id,_orig:n});
      }

      const branchDefs=n.choices||n.branches;
      if(branchDefs){
        out.push({type:n.branches?'gate':'choice',_nid:id,options:branchDefs.map(c=>{
          const branch=[];
          const t=c.next;
          if(t&&nodes[t]){
            if(shared.has(t))branch.push({type:'jump',target:passageId(t)});
            else branch.push(...walk(t,new Set(seen)));
          }
          return {text:c.text||c.id||'…',flag:effectsToFlag(c.effects),
            activitySuccess:!!c.activity_success||completesActivity(c),
            requires:toRequires(c.conditions||c.condition,sheet.id),nodes:branch,
            _oid:c.id,_tone:c.tone,_orig:c};
        })});
        break;                       // choices terminate the linear run
      }

      const nx=n.next;
      if(nx&&shared.has(nx)){out.push({type:'jump',target:passageId(nx)});break;}
      id=nx;
    }
    return out;
  };

  const act=conv.activation||{};
  const mk=(nodeId,isMain)=>{
    const body=walk(nodeId,new Set());
    made.push({
      uid:'c_'+conv.id+(isMain?'':'__'+nodeId),
      type:'conversation',
      id:passageId(nodeId),
      title:isMain?(conv.title||pretty(conv.id)):pretty(nodeId),
      location:locFromRef(act.location),
      day:(act.days||[])[0]||act.day||'monday',
      days:Array.isArray(act.days)?act.days.slice():undefined,
      block:act.block||'morning',
      chapter:1,
      cast:[],
      start:isMain&&(act.event==='new_game_started'),
      premise:conv.summary||'',
      sceneDirection:typeof sceneDirectionFromAuthored==='function'
        ?sceneDirectionFromAuthored(conv.presentation):undefined,
      requires:toRequires(conv.conditions||conv.condition,sheet.id),
      nodes:body,
      _authored:{source:conv,type:conv.type,repetition:conv.repetition,activation:act,locRef:act.location,
        completion_effects:conv.completion_effects,internal:conv.internal,replayable:conv.replayable}
    });
  };

  mk(start,true);
  shared.forEach(id=>mk(id,false));

  const castList=[...cast].filter(id=>id!=='player'&&id!=='__narrator__');
  made.forEach(m=>m.cast=castList.length?castList:[sheet.id]);
  if(options.append!==false)made.forEach(m=>{
    const at=P.content.findIndex(x=>x.type==='conversation'&&x.id===m.id);
    at>=0?P.content[at]=m:P.content.push(m);
  });
  if(options.report!==false)report.conversations.push(conv.id+(made.length>1?' (+'+(made.length-1)+' split)':''));
  return made;
}

/** Converts one authored quest. Objectives become stages. */
function convertQuest(q,sheet,report){
  const act=q.activation||{};
  const scheduled=(q.completion_effects||[]).find(e=>e?.operation==='schedule_event')?.value||null;
  const stages=(q.objectives||[]).map((o,i)=>({
    id:o.id||'stage_'+(i+1),
    title:o.text||pretty(o.id||'stage '+(i+1)),
    location:locFromRef(act.location),
    nodes:[],
    flag:'',
    requires:toRequires(o.completion,sheet.id),
    completion:o.completion,
    hiddenUntil:o.hidden_until,
    _authored:{completion:o.completion,hidden_until:o.hidden_until}
  }));

  // Branches become a final stage whose choices set each branch's rules.
  if((q.branches||[]).length){
    stages.push({
      id:'branch',title:'Branch — outcome',location:locFromRef(act.location),
      requires:[],flag:'',
      nodes:[{type:'choice',options:q.branches.map(b=>({
        text:pretty(b.id),
        flag:[b.id,...(b.start_quests||[]).map(x=>'quest_'+x+'_started')].join('; '),
        requires:toRequires(b.condition,sheet.id),
        nodes:[],_orig:b
      }))}],
      _authored:{branches:q.branches}
    });
  }

  const last=stages[stages.length-1];
  const done=['quest_'+q.id+'_done',effectsToFlag((q.completion_effects||[]).filter(e=>e?.operation!=='schedule_event'))].filter(Boolean).join('; ');
  if(last)last.flag=done; 

  const item={
    uid:'q_'+q.id,type:'quest',id:q.id,title:q.title||pretty(q.id),
    after:(act.event==='quest_completed'&&act.quest)||'',
    character:sheet.id,hook:q.summary||'',premise:q.summary||'',
    location:locFromRef(act.location),day:act.day||'monday',block:act.block||'morning',
    chapter:1,cast:[sheet.id],
    requires:toRequires(act.event==='quest_completed'?act:q.condition,sheet.id),
    stages:stages.length?stages:[{id:'stage_1',title:'Opening',location:'',nodes:[],flag:done,requires:[]}],
    questPlan:{category:q.category||'character_story',summary:q.summary||'',earliestBlock:act.earliest_block||'',
      rewards:'',participants:Array.isArray(q.participants)?q.participants:[],deadline:q.deadline_note||'',event:scheduled},
    _authored:{source:q,category:q.category,failure:q.failure,completion_effects:q.completion_effects,
      imported_completion_flag:done,imported_event:scheduled,
      objectives:q.objectives,branches:q.branches,activation:act}
  };
  const at=P.content.findIndex(x=>x.type==='quest'&&x.id===item.id);
  at>=0?P.content[at]=item:P.content.push(item);
  report.quests.push(q.id+' ('+stages.length+' stages)');
}

/** Rebuilds a social activity from its counter definition and internal beat
    conversations. Referenced beats are not also imported as ordinary Talk topics. */
function convertActivity(a,sheet,report,conversations){
  const act=a.activation||{},byId=new Map((conversations||[]).map(c=>[c.id,c]));
  const beat=(ref,title,activityId)=>{
    const conv=byId.get(ref);
    if(!conv)return {nodes:[],parts:[],cast:[]};
    const made=convertConversation(conv,sheet,report,{append:false,report:false,activityId})||[];
    return {nodes:made[0]?.nodes||[],parts:made.slice(1),cast:made[0]?.cast||[],
      premise:made[0]?.premise||title,title:conv.title||''};
  };
  const baseRef=a.base?.conversation||a.conversation||'';
  const baseBeat=beat(baseRef,'Every time',a.id);
  const base={id:'base',title:a.base?.title||'Every time',at:0,nodes:baseBeat.nodes,
    flag:effectsToFlag(a.base?.effects),requires:[],once:false,_parts:baseBeat.parts,
    premise:baseBeat.premise,_conversationId:baseRef,_activitySource:a.base};
  const stages=[base];
  (a.milestones||[]).slice().sort((x,y)=>(+x.at||0)-(+y.at||0)).forEach((m,i)=>{
    const b=beat(m.conversation,m.title||'Milestone '+(i+1),a.id);
    stages.push({id:m.id||'ms_'+(i+1),title:m.title||b.title||'Milestone '+(i+1),at:+m.at||1,
      nodes:b.nodes,flag:effectsToFlag(m.effects),requires:toRequires(m.conditions||m.condition,sheet.id),
      once:m.once!==false,_parts:b.parts,premise:b.premise,_conversationId:m.conversation,
      _activitySource:m});
  });
  const days=Array.isArray(act.days)?act.days.slice():(act.day?[act.day]:[]);
  const blocks=Array.isArray(act.blocks)?act.blocks.slice():(act.block?[act.block]:[]);
  const item={uid:'a_'+a.id,type:'activity',id:a.id,title:a.title||a.name||pretty(a.id),
    name:a.name||a.title||pretty(a.id),kind:a.kind||'social_activity',character:a.character||sheet.id,
    location:locFromRef(a.location||act.location),day:days[0]||'monday',days,
    block:blocks[0]||'evening',blocks,chapter:1,
    cast:[...new Set([a.character||sheet.id,...baseBeat.cast].filter(Boolean))],
    premise:a.summary||'',category:a.category||'',
    requires:toRequires(a.conditions||a.condition,sheet.id),stages,
    counterKey:a.counter_key||'activity.'+a.id+'.count',
    repeatLimit:a.repeat_limit||(a.once_per_block?'once_per_block':''),
    incrementsOn:a.increments_on||'completed',
    milestoneSemantics:a.milestone_semantics||
      (a.increments_on==='explicit_success'?'after_successes':'projected_attempt'),
    _authored:{source:a,kind:a.kind,name:a.name,category:a.category,summary:a.summary,
      increments_on:a.increments_on,repeat_limit:a.repeat_limit,success_flag:a.success_flag,
      activation:act,counter_key:a.counter_key,condition:a.condition,
      milestone_semantics:a.milestone_semantics,base:a.base,milestones:a.milestones}
  };
  const at=P.content.findIndex(x=>x.type==='activity'&&x.id===item.id);
  at>=0?P.content[at]=item:P.content.push(item);
  report.activities.push(a.id+' ('+(stages.length-1)+' milestones)');
}

/** Entry point — call after importSheet(). Returns a short report. */
function importAuthored(sheet){
  const report={quests:[],activities:[],conversations:[],messages:0,skipped:[]};
  const claimed=new Set();
  (sheet.activities||[]).forEach(a=>{
    if(a.base?.conversation)claimed.add(a.base.conversation);
    (a.milestones||[]).forEach(m=>{if(m.conversation)claimed.add(m.conversation);});
    try{convertActivity(a,sheet,report,sheet.conversations||[]);}
    catch(e){report.skipped.push('activity '+(a.id||'?')+': '+e.message);}
  });
  (sheet.quests||[]).forEach(q=>{
    try{convertQuest(q,sheet,report);}catch(e){report.skipped.push('quest '+(q.id||'?')+': '+e.message);}
  });
  (sheet.conversations||[]).filter(c=>!claimed.has(c.id)).forEach(c=>{
    try{convertConversation(c,sheet,report);}catch(e){report.skipped.push('conv '+(c.id||'?')+': '+e.message);}
  });
  report.messages=(sheet.text_messages||[]).length;
  return report;
}
