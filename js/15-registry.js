function walkAll(cb){
  const rec=(list,c,base)=>list.forEach((n,i)=>{
    const p=base.concat(i);cb(n,c,p);
    if(n.type==='choice'||n.type==='gate')n.options.forEach((o,j)=>{cb(o,c,p.concat(j),true);rec(o.nodes,c,p.concat(j));});
  });
  P.content.forEach(c=>{
    if(c.type==='quest'||c.type==='activity')(c.stages||[]).forEach((s,i)=>rec(s.nodes||[],c,['s'+i]));
    else if(c.type!=='repeatable')rec(c.nodes||[],c,[]);
  });
}

/** Every flag in the project: where it's written, where it's read. */
function flagRegistry(){
  const reg={};
  const touch=(k,access,where,meta)=>{
    if(!k)return;
    const row=reg[k]=reg[k]||{sets:[],reads:[],kinds:[],character_refs:[],values:[]};
    if(!row[access].includes(where))row[access].push(where);
    if(!meta)return;
    if(meta.kind&&!row.kinds.includes(meta.kind))row.kinds.push(meta.kind);
    if(meta.state_key)row.state_key=meta.state_key;
    if(Object.prototype.hasOwnProperty.call(meta,'value')&&
       !row.values.some(v=>JSON.stringify(v)===JSON.stringify(meta.value)))row.values.push(meta.value);
    if(meta.character){
      const ref={character:meta.character,key:meta.key||'',kind:meta.kind||'meter'};
      if(!row.character_refs.some(x=>x.character===ref.character&&x.key===ref.key&&x.kind===ref.kind))
        row.character_refs.push(ref);
    }
  };
  const readReqs=(reqs,where)=>(reqs||[]).forEach(r=>{
    if(r.type==='flag'){
      const value=stateAssignment(r.key);
      touch(r.key,'reads',where,value
        ?{kind:'value',state_key:value.key,value:value.value}
        :{kind:'flag',state_key:r.key});
    }
    if(r.type==='stat'||r.type==='custom_stat')touch(r.character+'.'+r.key,'reads',where,
      {kind:r.type==='custom_stat'?'character_stat':'meter',character:r.character,key:r.key});
    if(r.type==='met')touch('met_'+r.character,'reads',where,{kind:'flag',state_key:'met_'+r.character});
  });
  const writeEffect=(e,where)=>{
    if(e.operation==='add_meter')
      touch(e.character+'.'+e.meter,'sets',where,{kind:'meter',character:e.character,key:e.meter});
    else if(e.operation==='add_character_stat')
      touch(e.character+'.'+e.key,'sets',where,{kind:'character_stat',character:e.character,key:e.key});
    else if(e.operation==='add_player_value')
      touch('player.'+e.section+'.'+e.key,'sets',where,{kind:'player_value',state_key:'player.'+e.section+'.'+e.key});
    else if(e.operation==='set_value')
      touch(e.key+'='+stateValueText(e.value),'sets',where,{kind:'value',state_key:e.key,value:e.value});
    else if(e.operation==='add_value')
      touch(e.key,'sets',where,{kind:'counter',state_key:e.key,value:+e.value||0});
    else if(e.operation==='set_flag')
      touch(e.key,'sets',where,{kind:'flag',state_key:e.key,value:e.value!==false});
  };
  const writeEffects=(raw,where)=>compileEffects(raw).forEach(e=>writeEffect(e,where));
  const readPhoneState=(raw,where,negated=false)=>{
    if(Array.isArray(raw))touch(raw[0],'reads',where,
      {kind:raw.length>1?'value':'flag',state_key:raw[0],value:raw.length>1?raw[1]:!negated});
    else if(raw)touch(raw,'reads',where,{kind:'flag',state_key:raw,value:!negated});
  };
  const readPhoneMeter=(raw,owner,where)=>{
    if(!Array.isArray(raw))return;
    const character=raw.length===2?owner?.id:raw[0];
    const key=raw.length===2?raw[0]:raw[1];
    if(character&&key)touch(character+'.'+key,'reads',where,{kind:'meter',character,key});
  };
  const readPhoneRules=(rules,where,owner)=>{
    if(!Array.isArray(rules))return;
    rules.forEach(rule=>{
      if(rule?.flag)readPhoneState(rule.flag,where);
      if(rule?.flag_not)readPhoneState(rule.flag_not,where,true);
      if(Array.isArray(rule?.value_equals))touch(rule.value_equals[0],'reads',where,
        {kind:'value',state_key:rule.value_equals[0],value:rule.value_equals[1]});
      readPhoneMeter(rule?.meter_at_least||rule?.meter_at_most,owner,where);
    });
  };
  const readPhoneTrigger=(trigger,where,owner)=>{
    if(!trigger)return;
    readPhoneState(trigger.flag,where);
    readPhoneState(trigger.flag_not,where,true);
    readPhoneMeter(trigger.meter_at_least,owner,where);
    readPhoneMeter(trigger.meter_at_most,owner,where);
  };

  P.content.forEach(c=>{
    const w=c.title||c.id;
    readReqs(c.requires,w);
    writeEffects(c.flag,w);
    (c.stages||[]).forEach(s=>{readReqs(s.requires,w);
      writeEffects(s.flag,w);
      const completion=s.completion||(s._authored&&s._authored.completion);
      if(completion?.event==='activity_count_at_least'&&completion.activity)
        touch('activity.'+completion.activity+'.count','reads',w+' · '+(s.title||s.id),
          {kind:'counter',state_key:'activity.'+completion.activity+'.count',value:+completion.value||0});
    });
  });
  walkAll((n,c,p,isOpt)=>{
    const w=c.title||c.id;
    if(isOpt){
      writeEffects(n.flag,w);
      readReqs(n.requires,w);}
  });
  allTextMessages().forEach(({owner,message})=>{
    const w='Text · '+owner.name+' · '+(message.id||'untitled');
    readPhoneTrigger(message.trigger,w,owner);readPhoneRules(message.conditions,w,owner);
    (message.effects||[]).forEach(effect=>writeEffect(effect,w));
    (message.quick_replies||[]).forEach((reply,index)=>{
      const rw=w+' · reply '+(index+1);readPhoneRules(reply.conditions,rw,owner);
      (reply.effects||[]).forEach(effect=>writeEffect(effect,rw));
    });
  });
  return reg;
}

function emotionRegistry(){
  const reg={};
  P.content.forEach(c=>(c.lines||[]).forEach(l=>{
    if(!l.emotion)return;
    (reg[c.character]=reg[c.character]||{})[l.emotion]=(reg[c.character]?.[l.emotion]||0)+1;}));
  walkAll(n=>{
    if(n.type!=='line'||!n.emotion)return;
    (reg[n.speaker]=reg[n.speaker]||{})[n.emotion]=(reg[n.speaker]?.[n.emotion]||0)+1;});
  return reg;
}

function coverage(){
  const per={};
  const bump=(id,k,n)=>{per[id]=per[id]||{conv:0,quest:0,rep:0,routes:0,texts:0};per[id][k]+=n;};
  npcs().forEach(c=>bump(c.id,'conv',0));
  walkAll((n,c)=>{if(n.type==='line')bump(n.speaker,c.type==='quest'?'quest':'conv',1);});
  P.content.forEach(c=>{
    if(c.type==='repeatable'&&c.character)bump(c.character,'rep',(c.lines||[]).length);
    if(c.type==='conversation')routes(c.nodes||[],[]).forEach(()=>
      (c.cast||[]).forEach(id=>bump(id,'routes',1)));
  });
  allTextMessages().forEach(({owner})=>bump(owner.id,'texts',1));
  return per;
}

const REL_INVERSE={spouse:'spouse',daughter:'parent',son:'parent',mother:'child',father:'child',
  coworker:'coworker',trusted_friend:'trusted_friend',sibling:'sibling',roommate:'roommate'};

/** Character ids referenced by an imported sheet but never imported themselves. */
function missingRefs(){
  const known=new Set(['player','__player__',...P.characters.map(c=>c.id)]),out={};
  const note=(id,from,relation,household)=>{
    if(!id||known.has(id))return;
    out[id]=out[id]||{id,from:[],relation:'',district:'',residence:''};
    if(!out[id].from.includes(from.name))out[id].from.push(from.name);
    if(relation&&!out[id].relation)out[id].relation=REL_INVERSE[relation]||relation;
    if(household){out[id].district=from.home?.district||'';out[id].residence=from.home?.residence||'';}
  };
  P.characters.forEach(c=>{
    (c.connections||[]).forEach(x=>note(x.character,c,x.relation,false));
    (c.home?.household||[]).forEach(h=>note(h,c,'',true));
  });
  return Object.values(out);
}

function stubSheet(ref){
  const stats={};STAT_KEYS.forEach(k=>stats[k]=0);
  return {format_version:1,id:ref.id,
    display_name:ref.id.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),
    profile:{age:null,gender_identity:'',role:ref.relation||'',occupation:'',romance_eligible:false},
    home:{district:ref.district||'',residence:ref.residence||'',household:[]},
    personality:{archetype:'',traits:[],values:[],social_style:''},
    schedule:{days_off:[],fixed_commitments:[],preferred_social_blocks:[]},
    skills:{},goals:[],connections:[],relationship_defaults:stats,
    boundaries:{hard_limits:['romance_with_player','sexual_content_with_player']},
    relationship_chapters:[1,2,3,4,5].map(l=>({level:l,id:'chapter_'+l,title:'Chapter '+l})),
    quest_hooks:[],conversation_topics:[],text_style:{tone:'',emoji_rate:''},
    _stub:true};
}
