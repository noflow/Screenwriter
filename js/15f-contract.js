/* ============ the Godot contract ============
   Everything in here exists to make the export and dialogue_director.gd agree:
   one compiler for effect strings, one declared registry of flags and stats,
   the activity block the export used to omit, and a check for the seam itself. */

function knownMetricName(key){
  const built=[...(typeof STAT_KEYS==='undefined'?[]:STAT_KEYS),...(typeof STATS==='undefined'?[]:STATS)];
  const custom=typeof customStatDefs==='function'?customStatDefs().map(s=>s.id):[];
  return built.includes(key)||custom.includes(key);
}

/** "emma.trust +1; sandbox.active; player.life_path=college" -> typed effects.
    A dot alone means nothing: only an explicit numeric NPC-meter change is a meter. */
function compileEffects(raw){
  return String(raw||'').split(';').map(s=>s.trim()).filter(Boolean).map(piece=>{
    if(piece.startsWith('!'))return {operation:'set_flag',key:piece.slice(1).trim(),value:false};
    let match=piece.match(/^memory:([^:]+):(.+)$/i);
    if(match)return {operation:'create_memory',character:match[1].trim(),value:match[2].trim()};
    match=piece.match(/^chapter:([^:]+):(\d+)$/i);
    if(match)return {operation:'unlock_relationship_chapter',character:match[1].trim(),level:+match[2]};
    match=piece.match(/^stat:([^:]+):([^\s:]+)\s+([+-]?\d+)$/i);
    if(match)return {operation:'add_character_stat',character:match[1].trim(),key:match[2].trim(),value:+match[3]};
    match=piece.match(/^playerstat:(attributes|needs):([^\s:]+)\s+([+-]?\d+)$/i);
    if(match)return {operation:'add_player_value',section:match[1].toLowerCase(),key:match[2].trim(),value:+match[3]};
    const assignment=stateAssignment(piece);
    if(assignment)return {operation:'set_value',key:assignment.key,value:assignment.value};

    const parts=piece.split(/\s+/);
    const key=parts[0];
    const delta=parts.length>1?parseInt(parts[1],10):NaN;
    if(Number.isFinite(delta)&&key.includes('.')){
      const [character,meter]=key.split('.');
      if(authoredChr(character)||knownMetricName(meter))
        return {operation:'add_meter',character,meter,value:delta};
      return {operation:'add_value',key,value:delta};
    }
    if(Number.isFinite(delta))return {operation:'add_value',key,value:delta};
    return {operation:'set_flag',key,value:true};
  });
}

/** Every authored effect string in the project, with where it came from. */
function effectSources(){
  const out=[];
  P.content.forEach(c=>{
    const w=c.title||c.id;
    if(c.flag)out.push({raw:c.flag,where:w});
    (c.stages||[]).forEach(s=>{if(s.flag)out.push({raw:s.flag,where:w});});
  });
  walkAll((n,c,p,isOpt)=>{if(isOpt&&n.flag)out.push({raw:n.flag,where:c.title||c.id});});
  return out;
}

/** The declared state contract. Types are decided here rather than guessed at
    runtime, so a key written as a counter in one scene and a switch in another
    is a reportable conflict instead of a silent coercion. */
function stateRegistry(){
  const reg=flagRegistry();
  const flags=[],stats=[],counters=[],conflicts=[];
  const state={};
  const merge=(a,b)=>[...new Set([...(a||[]),...(b||[])])];
  const valueType=value=>typeof value==='number'?(Number.isInteger(value)?'int':'number'):
    typeof value==='boolean'?'bool':typeof value==='string'?'string':'variant';
  const addState=(key,r)=>{
    const row=state[key]=state[key]||{key,kinds:[],types:{},sets:[],reads:[]};
    row.kinds=merge(row.kinds,r.kinds);row.sets=merge(row.sets,r.sets);row.reads=merge(row.reads,r.reads);
    (r.kinds||[]).forEach(kind=>{
      if(kind==='flag')row.types.bool=merge(row.types.bool,r.sets.concat(r.reads));
      if(kind==='counter')row.types.int=merge(row.types.int,r.sets.concat(r.reads));
    });
    (r.values||[]).forEach(value=>{
      const type=valueType(value);row.types[type]=merge(row.types[type],r.sets.concat(r.reads));
    });
  };

  Object.keys(reg).sort().forEach(k=>{
    const r=reg[k],ref=(r.character_refs||[])[0];
    if(ref){
      const ch=authoredChr(ref.character),stat=ref.key;
      const def=typeof statDefinition==='function'?statDefinition(stat):null;
      const cap=ch?.stat_caps?.[stat];
      const initial=ch?.relationship_defaults?.[stat]??ch?.custom_stats?.[stat]??def?.default??0;
      stats.push({key:ref.character+'.'+stat,character:ref.character,stat,initial:+initial||0,
        min:Number.isFinite(+def?.minimum)?+def.minimum:0,
        max:Number.isFinite(+cap)?+cap:Number.isFinite(+def?.maximum)?+def.maximum:null,
        set_by:r.sets,read_by:r.reads,invalid:!ch||undefined});
      return;
    }
    if((r.kinds||[]).includes('player_value'))return;
    addState(r.state_key||k,r);
  });

  Object.values(state).sort((a,b)=>a.key.localeCompare(b.key)).forEach(row=>{
    if(/^activity\./.test(row.key)){
      counters.push({key:row.key,initial:0,set_by:row.sets,read_by:row.reads});return;
    }
    let types=Object.keys(row.types);
    if(types.includes('number')&&types.includes('int'))types=types.filter(t=>t!=='int');
    if(types.length>1)conflicts.push({key:row.key,types:types.map(type=>({type,where:row.types[type]}))});
    const type=types.includes('string')?'string':types.includes('number')?'number':
      types.includes('int')?'int':types.includes('variant')?'variant':'bool';
    const initial=type==='string'?'':type==='int'||type==='number'?0:type==='variant'?null:false;
    flags.push({key:row.key,type,initial,auto:/^met_/.test(row.key)||undefined,
      set_by:row.sets,read_by:row.reads});
  });

  // Stats that live on a sheet but no condition reads yet still need seeding.
  npcs().forEach(c=>{
    const seed=(values,custom)=>Object.keys(values||{}).forEach(stat=>{
      const key=c.id+'.'+stat;if(stats.some(s=>s.key===key))return;
      const def=custom&&typeof statDefinition==='function'?statDefinition(stat):null;
      const cap=c.stat_caps?.[stat];
      stats.push({key,character:c.id,stat,initial:+values[stat]||0,
        min:Number.isFinite(+def?.minimum)?+def.minimum:0,
        max:Number.isFinite(+cap)?+cap:Number.isFinite(+def?.maximum)?+def.maximum:null,
        set_by:[],read_by:[]});
    });
    seed(c.relationship_defaults,false);seed(c.custom_stats,true);
  });

  P.content.filter(c=>c.type==='activity').forEach(c=>{
    const key='activity.'+c.id+'.count';
    if(!counters.some(x=>x.key===key))counters.push({key,initial:0,activity:c.id});
  });

  return {flags,stats,counters,conflicts};
}

/** Activities, plus the internal conversations their beats play through.
    next_beat() hands back a conversation id, so every base and milestone needs
    one — minted here and marked internal so nothing offers them by place. */
function activityBlocks(){
  const activities=[],conversations=[];
  P.content.filter(c=>c.type==='activity').forEach(c=>{
    const stages=c.stages||[];
    const mint=(s,suffix)=>{
      const id='activity_'+slug(c.id)+'_'+suffix;
      conversations.push({id,title:(c.title||c.id)+' — '+(s.title||suffix),
        location:locPart(c.location),room:roomPart(c.location),
        day:'',block:'',cast:c.cast||[],chapter:0,requires:[],
        internal:true,replayable:true,start:false,sets_flag:'',
        nodes:clean(s.nodes||[])});
      return id;
    };
    const base=stages[0]||{nodes:[],flag:''};
    // Highest first: next_beat() takes the first match and assumes that order.
    const ms=stages.slice(1).slice().sort((a,b)=>(+b.at||0)-(+a.at||0));
    activities.push({id:c.id,title:c.title||c.id,character:c.character||'',
      location:locPart(c.location),room:roomPart(c.location),
      activation:{days:c.days||(c.day?[c.day]:[]),blocks:c.blocks||(c.block?[c.block]:[])},
      counter_key:'activity.'+c.id+'.count',
      requires:c.requires||[],
      base:{conversation:mint(base,'base'),effects:compileEffects(base.flag)},
      milestones:ms.map((s,i)=>({at:+s.at||1,once:s.once!==false,title:s.title||'',
        conversation:mint(s,'ms'+(+s.at||i+1)),
        requires:s.requires||[],effects:compileEffects(s.flag)}))});
  });
  return {activities,conversations};
}

/* ---- the seam check ---- *
   validate() checks the project against itself. This checks the project
   against what dialogue_director.gd will actually do with it. */
function godotCheck(){
  const out=[],add=(sev,msg,where)=>out.push({sev,msg,where});
  const R=stateRegistry();

  R.conflicts.forEach(c=>add('fatal','"'+c.key+'" is used with incompatible types: '+
    c.types.map(t=>t.type+' in '+t.where.join(', ')).join('; ')+'. Use one state type for this key.',
    'Flags'));

  P.content.filter(c=>c.type==='activity').forEach(c=>{
    const w=c.title||c.id;
    if(!c.character)add('fatal','Activity has no character, so nothing can offer it.',w);
    if(!countLines((c.stages||[])[0]?.nodes||[]))
      add('fatal','Activity has no "every time" dialogue, so ordinary repeats play nothing.',w);
    (c.stages||[]).slice(1).forEach(s=>{
      if(!countLines(s.nodes||[]))add('err','Milestone "'+s.title+'" has no lines and will play silence.',w);
    });
  });

  const placeCheck=(ref,w,what)=>{
    if(!ref)return;
    if(!loc(locPart(ref)))return add('fatal',what+' points at "'+locPart(ref)+
      '", which is not in the location registry, so the runtime cannot place it.',w);
    if(roomPart(ref)&&!roomOf(ref))add('fatal',what+' names room "'+roomPart(ref)+
      '", which does not exist in '+(loc(locPart(ref))?.name||'')+'.',w);
  };
  P.content.forEach(c=>{
    const w=c.title||c.id;
    placeCheck(c.location,w,'This item');
    (c.stages||[]).forEach((s,i)=>placeCheck(s.location,w,'Stage '+(i+1)));
  });

  R.stats.filter(s=>s.max===null).forEach(s=>{
    const gates=(s.read_by||[]).length;
    if(gates)add('warn','"'+s.key+'" has no ceiling, so choices can push it past every gate on it. '+
      'Set a cap in Edit sheet & limits.','Stats');
  });

  const chapterGates=[];
  const scanReqs=(reqs,w)=>(reqs||[]).forEach(r=>{
    if(r.type==='chapter'&&+r.value>1)chapterGates.push({who:r.character,level:+r.value,where:w});
  });
  P.content.forEach(c=>{scanReqs(c.requires,c.title||c.id);
    (c.stages||[]).forEach(s=>scanReqs(s.requires,c.title||c.id));
    if(+c.chapter>1&&(c.cast||[]).length)
      (c.cast||[]).forEach(id=>{if(!isPlayer(chr(id)))chapterGates.push({who:id,level:+c.chapter,where:c.title||c.id});});
  });
  [...new Set(chapterGates.map(g=>g.who))].forEach(who=>{
    const ch=chr(who);if(!ch)return;
    const ruled=(ch.relationship_chapters||[]).some(x=>(x.requires||[]).length);
    if(!ruled){
      const gs=chapterGates.filter(g=>g.who===who);
      add('err',ch.name+' has content gated at chapter '+Math.max(...gs.map(g=>g.level))+
        ' but no chapter has a threshold, so they stay at 1 forever and '+gs.length+
        ' item'+(gs.length===1?'':'s')+' can never play. Add requirements to their chapters.','Chapters');
    }
  });

  Object.keys(flagRegistry()).filter(k=>/^met_/.test(k)).forEach(k=>{
    const id=k.slice(4);
    if(!chr(id))return;      // validate() already reports this as an error
    const appears=P.content.some(c=>(c.cast||[]).includes(id));
    if(!appears)add('err','"'+k+'" is read by a gate but '+(chr(id).name)+
      ' is not in the cast of anything, so they are never met.','Flags');
  });

  const dull=P.content.filter(c=>c.type==='conversation'&&c.day==='monday'&&c.block==='evening');
  if(dull.length>2)add('warn',dull.length+' conversations sit on the default monday / evening, '+
    'so each is offerable one block a week. Widen the day or block, or clear them.','Schedule');

  const rank={fatal:0,err:1,warn:2};
  return {issues:out.sort((a,b)=>rank[a.sev]-rank[b.sev]),registry:R,
    fatal:out.filter(i=>i.sev==='fatal').length};
}
