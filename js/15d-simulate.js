/* ---- playthrough simulator ---- */
/** Runs the project forward, taking the most rewarding choice at each fork. */
function simulate(maxDays){
  const S={stats:{},flags:{},chapters:{}};
  P.characters.forEach(c=>{
    S.chapters[c.id]=1;
    Object.entries(c.relationship_defaults||{}).forEach(([k,v])=>S.stats[c.id+'.'+k]=+v||0);
  });
  const played=new Set(),log=[],counts={};
  const worth=flag=>String(flag||'').split(';').reduce((n,p)=>{
    const b=p.trim().split(/\s+/);
    return n+(b.length>1?(parseInt(b[1],10)||0):1);},0);

  const run=(list,depth)=>{
    (list||[]).forEach(n=>{
      if(n.type==='choice'){
        const open=n.options.filter(o=>allMet(o.requires,S));
        if(!open.length)return;
        const best=open.reduce((a,b)=>worth(b.flag)>worth(a.flag)?b:a);
        applyFlag(best.flag,S);
        if(depth<12)run(best.nodes,depth+1);
      }
    });
  };

  for(let day=1;day<=maxDays;day++){
    let didSomething=false;
    for(const block of BLOCKS){
      const dayName=DAYS[(day-1)%7];
      P.content.forEach(c=>{
        if(c.type==='repeatable')return;
        if(c.block&&c.block!==block)return;
        if(c.type!=='activity'&&played.has(c.id))return;
        if(!allMet(c.requires,S))return;
        if(c.type==='quest'&&c.after&&!played.has(c.after))return;

        if(c.type==='activity'){
          const k='activity.'+c.id+'.count';
          S.stats[k]=(S.stats[k]||0)+1;
          const n=S.stats[k];
          const ms=(c.stages||[]).slice(1).sort((a,b)=>(+b.at||0)-(+a.at||0))
            .find(s=>+s.at<=n&&allMet(s.requires,S)&&!played.has(c.id+'#'+s.id));
          const beat=ms||(c.stages||[])[0];
          if(ms)played.add(c.id+'#'+ms.id);
          applyFlag(beat.flag,S);run(beat.nodes,0);
          if(ms)log.push({day,block,what:c.title+' — '+ms.title,kind:'milestone',n});
          didSomething=true;return;
        }

        played.add(c.id);didSomething=true;
        if(c.type==='quest'){
          (c.stages||[]).forEach(s=>{applyFlag(s.flag,S);run(s.nodes,0);});
          log.push({day,block,what:c.title,kind:'quest'});
        }else{
          run(c.nodes,0);
          log.push({day,block,what:c.title,kind:'conversation'});
        }
      });
    }
    if(!didSomething&&day>3)break;
  }

  const {rows}=reachable();
  const stuck=P.content.filter(c=>c.type!=='repeatable'&&c.type!=='activity'&&!played.has(c.id))
    .map(c=>{
      const unmet=(c.requires||[]).filter(r=>!condMet(r,S));
      let why;
      if(unmet.length){
        // A grindable meter isn't impossible, it just needs more repeats than this run had.
        const grind=unmet.filter(r=>r.type==='stat'&&
          (rows.find(x=>x.key===r.character+'.'+r.key)||{}).perRun);
        why=grind.length
          ? 'needs more repeats than '+maxDays+' days allowed: '+grind.map(condLabel).join(' · ')+
            ' (reached '+grind.map(r=>Math.round(S.stats[r.character+'.'+r.key]||0)).join(', ')+')'
          : 'gate never satisfied: '+unmet.map(condLabel).join(' · ');
      }else if(c.after&&!played.has(c.after))why='waiting on "'+c.after+'", which never ran';
      else why='nothing scheduled it';
      return {item:c,why,grindable:unmet.some(r=>r.type==='stat'&&
        (rows.find(x=>x.key===r.character+'.'+r.key)||{}).perRun)};
    });
  return {log,stuck,S,days:log.length?log[log.length-1].day:0};
}
