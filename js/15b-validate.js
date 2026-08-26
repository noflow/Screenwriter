/* ---- validator ---- */
const lev=(a,b)=>{
  const m=[];for(let i=0;i<=b.length;i++)m[i]=[i];
  for(let j=0;j<=a.length;j++)m[0][j]=j;
  for(let i=1;i<=b.length;i++)for(let j=1;j<=a.length;j++)
    m[i][j]=b[i-1]===a[j-1]?m[i-1][j-1]:Math.min(m[i-1][j-1],m[i][j-1],m[i-1][j])+1;
  return m[b.length][a.length];
};

function validate(){
  const out=[],add=(sev,msg,where,fix)=>out.push({sev,msg,where,fix});
  const ids=new Set(),cids=new Set();
  const impossibleStats=reqs=>{
    const limits={};
    (reqs||[]).filter(r=>r.type==='stat').forEach(r=>{
      const key=r.character+'.'+r.key,box=limits[key]||(limits[key]={min:-Infinity,max:Infinity});
      const v=+r.value;
      if(r.op==='gte')box.min=Math.max(box.min,v);
      if(r.op==='lte')box.max=Math.min(box.max,v);
      if(r.op==='eq'){box.min=Math.max(box.min,v);box.max=Math.min(box.max,v);}
    });
    return Object.entries(limits).find(([,box])=>box.min>box.max);
  };

  P.characters.forEach(c=>{
    if(cids.has(c.id))add('err','Two characters share the id "'+c.id+'".','Cast');
    cids.add(c.id);
  });
  const pcs=P.characters.filter(isPlayer);
  if(pcs.length>1)add('err','More than one sheet is flagged as the player character: '+
    pcs.map(c=>c.name).join(', ')+'.','Cast');
  if(!pcs.length&&P.characters.length)
    add('warn','No sheet is marked as the player character, so the model has no idea who the '+
      'person playing is. Flag one in Edit sheet & limits.','Cast');

  P.content.forEach(c=>{
    const w=c.title||c.id;
    if(!c.id)add('err','Content has no export id.',w);
    else if(ids.has(c.id))add('err','Two items export as "'+c.id+'". One will overwrite the other.',w);
    ids.add(c.id);

    if(c.location&&!loc(locPart(c.location)))
      add('err','Points at location "'+locPart(c.location)+'", which is not in the registry.',w);
    else if(c.location&&roomPart(c.location)&&!roomOf(c.location))
      add('err','Room "'+roomPart(c.location)+'" does not exist in '+
        (loc(locPart(c.location))?.name||'')+'.',w);
    else if(c.location&&roomOf(c.location)){
      const acc=roomOf(c.location).access;
      if(acc==='restricted')add('warn','This scene is set in a restricted room ('+
        roomOf(c.location).name+'). The player normally cannot go in there.',w);
      if(acc==='permission_required')add('info','Set in a room the player needs permission to enter ('+
        roomOf(c.location).name+').',w);
    }
    else if(!c.location)add('info','No location set, so it can never be triggered by place.',w);

    (c.cast||[]).forEach(id=>{
      if(!chr(id))return add('err','Cast includes "'+id+'", which has no sheet.',w);
      if(!c.location)return;
      const ch2=chr(id);
      if(isPlayer(ch2))return;          // the player is wherever the scene is
      const a=availability(ch2,c.day,c.block);
      if(a.where&&locPart(a.where)!==locPart(c.location))
        add('warn',ch2.name+' is at '+placeName(a.where)+' on '+pretty(c.day)+' '+pretty(c.block)+
          ', not '+placeName(c.location)+'.',w);
      else if(!a.free)
        add('warn',ch2.name+' is unavailable then ('+a.why+').',w);
    });
    if(c.type!=='repeatable'&&!(c.cast||[]).filter(id=>!isPlayer(chr(id))).length)
      add('warn','No NPC is marked present, so there is nobody for the player to talk to.',w);

    const checkReqs=(reqs,label)=>(reqs||[]).forEach(r=>{
      if((r.type==='stat'||r.type==='chapter'||r.type==='met')&&!chr(r.character))
        add('err','A '+label+' gate refers to "'+r.character+'", which has no sheet.',w);
      if(r.type==='chapter'){
        const n=(chr(r.character)?.relationship_chapters||[]).length;
        if(n&&+r.value>n)add('err','Gated on chapter '+r.value+' but that character only has '+n+'.',w);
      }
    });
    checkReqs(c.requires,'scene');

    if(c.type==='repeatable'){
      if(!(c.lines||[]).length)add('info','Repeatable has no variants yet.',w);
      else if(c.lines.length<4)add('info','Only '+c.lines.length+' variants — players will notice repeats.',w);
      if(!c.character)add('err','Repeatable has no character assigned.',w);
    }
    if(c.type==='quest')(c.stages||[]).forEach((s,i)=>{
      checkReqs(s.requires,'stage');
      if(!countLines(s.nodes||[]))add('warn','Stage '+(i+1)+' ("'+s.title+'") has no lines.',w);
      if(s.location&&!loc(locPart(s.location)))
        add('err','Stage '+(i+1)+' points at a location not in the registry.',w);
    });
    if(c.type==='conversation'&&!countLines(c.nodes||[]))add('info','Conversation is empty.',w);
  });

  walkAll((n,c,p,isOpt)=>{
    const w=c.title||c.id;
    if(isOpt){
      if(!countLines(n.nodes||[])&&!(n.nodes||[]).some(x=>x.type==='jump'))
        add('warn','Choice "'+(n.text||'').slice(0,34)+'" leads nowhere.',w);
      if(!String(n.text||'').trim())add('warn','A choice option has no text.',w);
      const impossible=impossibleStats(n.requires);
      if(impossible)add('warn','Branch "'+(n.text||'').slice(0,34)+'" can never run: '+
        impossible[0]+' must be both at least '+impossible[1].min+' and at most '+impossible[1].max+'.',w);
      return;
    }
    if(n.type==='jump'){
      if(!n.target)add('err','A jump node has no target.',w);
      else if(!P.content.some(x=>x.id===n.target))add('err','Jump points at "'+n.target+'", which does not exist.',w);
      else if(n.target===c.id)add('warn','A jump points back at its own scene.',w);
    }
    if(n.type==='line'&&!String(n.text||'').trim())add('warn','An empty line is in the tree.',w);
    if(n.type==='line'&&!chr(n.speaker))add('err','A line is spoken by "'+n.speaker+'", who has no sheet.',w);
    if(n.type==='line'&&isPlayer(chr(n.speaker))&&!$('writePlayer')?.checked)
      add('err','A dialogue line is attributed to the player, but drafting player lines is '+
        'switched off. Move it into a choice option or turn the setting back on.',w);
  });

  const reg=flagRegistry(),keys=Object.keys(reg);
  keys.forEach(k=>{
    const r=reg[k];
    const seeded=k.includes('.')&&chr(k.split('.')[0])?.relationship_defaults?.[k.split('.')[1]]!==undefined;
    const auto=k.startsWith('met_');
    if(!r.sets.length&&!seeded&&!auto)
      add('warn','"'+k+'" is required somewhere but nothing ever sets it.',r.reads.join(', '));
    if(!r.reads.length)
      add('info','"'+k+'" is set but no condition reads it.',r.sets.join(', '));
    if(auto&&!chr(k.slice(4))){
      const near=P.characters.find(c=>c.id.startsWith(k.slice(4))||k.slice(4).startsWith(c.id));
      add('err','"'+k+'" checks meeting "'+k.slice(4)+'", who has no sheet.'+
        (near?' Did you mean met_'+near.id+'?':''),r.reads.join(', ')||'Flags');
    }
    if(k.includes('.')&&!chr(k.split('.')[0]))
      add('err','"'+k+'" refers to character "'+k.split('.')[0]+'", who has no sheet.',
        (r.reads.concat(r.sets)).join(', '));
  });
  keys.forEach((a,i)=>keys.slice(i+1).forEach(b=>{
    if(a!==b&&lev(a,b)<=2&&Math.min(a.length,b.length)>4)
      add('warn','"'+a+'" and "'+b+'" differ by a character or two — likely a typo.','Flags');
  }));

  if(P.locations.some(l=>l.tags?.includes('package')))
    P.characters.filter(c=>!isPlayer(c)).forEach(c=>{
      (c.schedule?.fixed_commitments||[]).forEach(f=>{
        if(f.location&&loc(locPart(f.location)))return;
        add('warn',c.name+"'s \""+pretty(f.activity||'commitment')+
          '" has no real location, so the tool cannot say where they are. '+
          'Set it in Edit schedule.','Schedules');
      });
    });

  const lk=links(),inb={};
  lk.forEach(l=>inb[l.to]=(inb[l.to]||0)+1);
  const starts=P.content.filter(c=>c.start);
  if(P.content.length&&!starts.length)
    add('warn','No passage is marked as a start. Nothing has an obvious entry point.','Story map');
  P.content.forEach(c=>{
    if(c.type==='repeatable'||c.start)return;
    if(!inb[c.id]&&!(c.requires||[]).length&&!c.location)
      add('warn','"'+(c.title||c.id)+'" has no inbound link, no gate, and no location — nothing can reach it.','Story map');
  });

  P.content.filter(c=>c.type==='quest'&&c.after).forEach(c=>{
    if(!P.content.some(x=>x.id===c.after))
      add('err','"'+(c.title||c.id)+'" starts after "'+c.after+'", which does not exist.','Chains');
    const path=new Set([c.id]);let cur2=c.after;
    while(cur2){
      if(path.has(cur2)){add('err','Quest chain loops: '+[...path].join(' → ')+' → '+cur2+
        '. Nothing in that loop can ever start.','Chains');break;}
      path.add(cur2);
      cur2=P.content.find(x=>x.id===cur2)?.after;
    }
  });

  P.content.filter(c=>c.type==='activity').forEach(c=>{
    const w=c.title||c.id;
    if(!c.character)add('err','Activity has no character assigned.',w);
    const ms=(c.stages||[]).slice(1);
    if(!countLines((c.stages||[])[0]?.nodes||[]))
      add('warn','Activity has no "every time" dialogue, so ordinary repeats play nothing.',w);
    const seen2={};
    ms.forEach(s=>{
      if(!countLines(s.nodes||[]))add('warn','Milestone "'+s.title+'" has no lines.',w);
      const n=+s.at||0;
      if(seen2[n]&&!(s.requires||[]).length&&!(seen2[n].requires||[]).length)
        add('warn','Two milestones both fire on repeat '+n+' with no condition between them — '+
          'only one will ever run.',w);
      seen2[n]=s;
    });
  });

  const miss=missingRefs();
  if(miss.length)add('info',miss.length+' referenced character'+(miss.length===1?' has':'s have')+
    ' no sheet: '+miss.map(m=>m.id).join(', '),'Cast','stubs');

  const cov=coverage();
  P.characters.filter(c=>!isPlayer(c)).forEach(c=>{
    const v=cov[c.id];
    if(v&&!v.conv&&!v.quest&&!v.rep)add('info',c.name+' has no dialogue anywhere yet.','Coverage');
  });

  const rank={err:0,warn:1,info:2};
  return out.sort((a,b)=>rank[a.sev]-rank[b.sev]);
}
