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
      case 'set_flag':    return v===false?'':e.key;
      case 'set_value':   return e.key+'='+e.value;
      case 'unlock_phone_app': return 'unlocked_'+v;
      case 'start_quest': return 'quest_'+v+'_started';
      default:            return e.key||e.operation;
    }
  }).filter(Boolean).join('; ');
}

/** Authored completion / activation conditions → Scenewright requires rows. */
function toRequires(cond,charId){
  if(!cond)return [];
  const out=[];
  if(cond.value_equals)out.push({type:'flag',
    key:String(cond.value_equals[0])+(cond.value_equals[1]===true?'':'='+cond.value_equals[1]),
    op:'is_true',value:1});
  if(cond.event==='quest_completed'&&cond.quest)
    out.push({type:'flag',key:'quest_'+cond.quest+'_done',op:'is_true',value:1});
  if(cond.event==='conversation_completed'&&cond.conversation)
    out.push({type:'flag',key:'conv_'+cond.conversation+'_done',op:'is_true',value:1});
  if(cond.meter_at_least&&charId)
    out.push({type:'stat',character:charId,key:cond.meter_at_least[0],op:'gte',value:cond.meter_at_least[1]});
  return out;
}

/** location "hale_home.player_bedroom" → a location id, registering it if new. */
/** Sheets already use "location_id.room_id" — keep it verbatim when the registry knows it. */
function locFromRef(ref){
  if(!ref)return '';
  const s=String(ref);
  if(loc(locPart(s)))return s;
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
function convertConversation(conv,sheet,report){
  const nodes=conv.nodes||{};
  const start=conv.start_node||Object.keys(nodes)[0];
  if(!start)return;

  // Count how many places reach each node. >1 means it has to become its own passage.
  const inbound={};
  const bump=id=>{if(id&&nodes[id])inbound[id]=(inbound[id]||0)+1;};
  Object.values(nodes).forEach(n=>{
    bump(n.next);
    (n.choices||[]).forEach(c=>bump(c.next));
  });
  const shared=new Set(Object.keys(inbound).filter(id=>inbound[id]>1&&id!==start));

  const cast=new Set();
  const made=[];
  const passageId=id=>id===start?conv.id:conv.id+'__'+id;

  /** Walks a linear run from `id`, stopping at a shared node (emitting a jump to it). */
  const walk=(id,seen)=>{
    const out=[];
    while(id&&nodes[id]){
      if(seen.has(id)){out.push({type:'jump',target:passageId(id)});break;}
      seen.add(id);
      const n=nodes[id];

      if(n.stage_direction)
        out.push({type:'line',speaker:'__narrator__',text:'*'+n.stage_direction+'*',
          emotion:'',_nid:n.line?id+'__sd':id,_orig:n.line?null:n});

      if(n.line){
        if(n.speaker)cast.add(n.speaker);
        out.push({type:'line',speaker:n.speaker||'__narrator__',text:n.line,
          emotion:(n.emotion||n.expression||'').toLowerCase(),_nid:id,_orig:n});
      }

      if(n.choices){
        out.push({type:'choice',_nid:id,options:n.choices.map(c=>{
          const branch=[];
          const t=c.next;
          if(t&&nodes[t]){
            if(shared.has(t))branch.push({type:'jump',target:passageId(t)});
            else branch.push(...walk(t,new Set(seen)));
          }
          return {text:c.text||c.id||'…',flag:effectsToFlag(c.effects),
            requires:toRequires(c.condition,sheet.id),nodes:branch,
            _oid:c.id,_tone:c.tone};
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
      day:act.day||'monday',
      block:act.block||'morning',
      chapter:1,
      cast:[],
      start:isMain&&(act.event==='new_game_started'),
      premise:conv.summary||'',
      requires:toRequires(conv.condition,sheet.id),
      nodes:body,
      _authored:{type:conv.type,repetition:conv.repetition,activation:act,locRef:act.location}
    });
  };

  mk(start,true);
  shared.forEach(id=>mk(id,false));

  const castList=[...cast].filter(id=>id!=='player'&&id!=='__narrator__');
  made.forEach(m=>m.cast=castList.length?castList:[sheet.id]);
  made.forEach(m=>{
    const at=P.content.findIndex(x=>x.id===m.id);
    at>=0?P.content[at]=m:P.content.push(m);
  });
  report.conversations.push(conv.id+(made.length>1?' (+'+(made.length-1)+' split)':''));
}

/** Converts one authored quest. Objectives become stages. */
function convertQuest(q,sheet,report){
  const act=q.activation||{};
  const stages=(q.objectives||[]).map((o,i)=>({
    id:o.id||'stage_'+(i+1),
    title:o.text||pretty(o.id||'stage '+(i+1)),
    location:locFromRef(act.location),
    nodes:[],
    flag:'',
    requires:toRequires(o.completion,sheet.id),
    _authored:{completion:o.completion}
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
        nodes:[]
      }))}],
      _authored:{branches:q.branches}
    });
  }

  const last=stages[stages.length-1];
  const done=['quest_'+q.id+'_done',effectsToFlag(q.completion_effects)].filter(Boolean).join('; ');
  if(last)last.flag=done; 

  const item={
    uid:'q_'+q.id,type:'quest',id:q.id,title:q.title||pretty(q.id),
    after:(act.event==='quest_completed'&&act.quest)||'',
    character:sheet.id,hook:q.summary||'',premise:q.summary||'',
    location:locFromRef(act.location),day:act.day||'monday',block:act.block||'morning',
    chapter:1,cast:[sheet.id],
    requires:toRequires(act.event==='quest_completed'?act:q.condition,sheet.id),
    stages:stages.length?stages:[{id:'stage_1',title:'Opening',location:'',nodes:[],flag:done,requires:[]}],
    _authored:{category:q.category,failure:q.failure,completion_effects:q.completion_effects,
      objectives:q.objectives,branches:q.branches,activation:act}
  };
  const at=P.content.findIndex(x=>x.id===item.id);
  at>=0?P.content[at]=item:P.content.push(item);
  report.quests.push(q.id+' ('+stages.length+' stages)');
}

/** Entry point — call after importSheet(). Returns a short report. */
function importAuthored(sheet){
  const report={quests:[],conversations:[],messages:0,skipped:[]};
  (sheet.quests||[]).forEach(q=>{
    try{convertQuest(q,sheet,report);}catch(e){report.skipped.push('quest '+(q.id||'?')+': '+e.message);}
  });
  (sheet.conversations||[]).forEach(c=>{
    try{convertConversation(c,sheet,report);}catch(e){report.skipped.push('conv '+(c.id||'?')+': '+e.message);}
  });
  report.messages=(sheet.text_messages||[]).length;
  return report;
}
