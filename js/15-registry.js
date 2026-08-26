function walkAll(cb){
  const rec=(list,c,base)=>list.forEach((n,i)=>{
    const p=base.concat(i);cb(n,c,p);
    if(n.type==='choice'||n.type==='gate')n.options.forEach((o,j)=>{cb(o,c,p.concat(j),true);rec(o.nodes,c,p.concat(j));});
  });
  P.content.forEach(c=>{
    if(c.type==='quest')(c.stages||[]).forEach((s,i)=>rec(s.nodes||[],c,['s'+i]));
    else if(c.type!=='repeatable')rec(c.nodes||[],c,[]);
  });
}

/** Every flag in the project: where it's written, where it's read. */
function flagRegistry(){
  const reg={};
  const touch=(k,kind,where)=>{
    if(!k)return;
    reg[k]=reg[k]||{sets:[],reads:[]};
    if(!reg[k][kind].includes(where))reg[k][kind].push(where);
  };
  const readReqs=(reqs,where)=>(reqs||[]).forEach(r=>{
    if(r.type==='flag')touch(r.key,'reads',where);
    if(r.type==='stat')touch(r.character+'.'+r.key,'reads',where);
    if(r.type==='met')touch('met_'+r.character,'reads',where);
  });

  P.content.forEach(c=>{
    const w=c.title||c.id;
    readReqs(c.requires,w);
    (c.stages||[]).forEach(s=>{readReqs(s.requires,w);
      String(s.flag||'').split(';').forEach(f=>{const k=f.trim().split(/\s+/)[0];if(k)touch(k,'sets',w);});});
  });
  walkAll((n,c,p,isOpt)=>{
    const w=c.title||c.id;
    if(isOpt){
      String(n.flag||'').split(';').forEach(f=>{const k=f.trim().split(/\s+/)[0];if(k)touch(k,'sets',w);});
      readReqs(n.requires,w);}
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
  const bump=(id,k,n)=>{per[id]=per[id]||{conv:0,quest:0,rep:0,routes:0};per[id][k]+=n;};
  P.characters.forEach(c=>bump(c.id,'conv',0));
  walkAll((n,c)=>{if(n.type==='line')bump(n.speaker,c.type==='quest'?'quest':'conv',1);});
  P.content.forEach(c=>{
    if(c.type==='repeatable'&&c.character)bump(c.character,'rep',(c.lines||[]).length);
    if(c.type==='conversation')routes(c.nodes||[],[]).forEach(()=>
      (c.cast||[]).forEach(id=>bump(id,'routes',1)));
  });
  return per;
}

const REL_INVERSE={spouse:'spouse',daughter:'parent',son:'parent',mother:'child',father:'child',
  coworker:'coworker',trusted_friend:'trusted_friend',sibling:'sibling',roommate:'roommate'};

/** Character ids referenced by an imported sheet but never imported themselves. */
function missingRefs(){
  const known=new Set(P.characters.map(c=>c.id)),out={};
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
  if(ref.id==='player'||/^player/.test(ref.id))return {
    format_version:1,id:'player',display_name:'Player',
    profile:{is_player:true,age:null,role:'player_character',romance_eligible:false},
    home:{district:ref.district||'',residence:ref.residence||'',household:[]},
    personality:{archetype:'',traits:[],values:[],social_style:''},
    schedule:{days_off:[],fixed_commitments:[],preferred_social_blocks:[]},
    goals:[],connections:[],relationship_defaults:{},
    boundaries:{hard_limits:[]},relationship_chapters:[],
    quest_hooks:[],conversation_topics:[],text_style:{},_stub:true};
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
