/* ---- stat reachability ---- */
/** Every point of every meter the whole project can award, per character. */
function reachable(){
  const gain={},spend={},perRun={};
  // repeat=true means the source can fire again, so it sets no ceiling at all.
  const take=(flag,repeat)=>String(flag||'').split(';').forEach(p=>{
    const bits=p.trim().split(/\s+/);
    if(bits.length<2||!bits[0].includes('.'))return;
    const n=parseInt(bits[1],10)||0;
    if(repeat&&n>0){perRun[bits[0]]=(perRun[bits[0]]||0)+n;return;}
    (n>=0?gain:spend)[bits[0]]=((n>=0?gain:spend)[bits[0]]||0)+Math.abs(n);
  });
  P.content.forEach(c=>{
    const rep=c.type==='activity';
    (c.stages||[]).forEach((s,i)=>take(s.flag,rep&&(i===0||s.once===false)));
  });
  walkAll((n,c,p,isOpt)=>{
    if(isOpt)take(n.flag,c.type==='activity');
  });

  const start={};
  P.characters.forEach(c=>Object.entries(c.relationship_defaults||{})
    .forEach(([k,v])=>start[c.id+'.'+k]=+v||0));

  const keys=new Set([...Object.keys(gain),...Object.keys(spend),
    ...Object.keys(perRun),...Object.keys(start)]);
  const rows=[...keys].sort().map(k=>({
    key:k,start:start[k]||0,gain:gain[k]||0,spend:spend[k]||0,
    perRun:perRun[k]||0,
    max:perRun[k]?Infinity:(start[k]||0)+(gain[k]||0)
  }));

  // Gates that ask for more than the project can ever award.
  const gates=[];
  const check=(reqs,where)=>(reqs||[]).forEach(r=>{
    if(r.type!=='stat'||r.op!=='gte')return;
    const k=r.character+'.'+r.key;
    const row=rows.find(x=>x.key===k)||{max:start[k]||0,start:start[k]||0,gain:0,perRun:0};
    if(+r.value>row.max)gates.push({key:k,need:+r.value,max:row.max,where,short:+r.value-row.max});
  });
  P.content.forEach(c=>{
    check(c.requires,c.title||c.id);
    (c.stages||[]).forEach(s=>check(s.requires,(c.title||c.id)+' · '+s.title));
  });
  walkAll((n,c,p,isOpt)=>{if(isOpt)check(n.requires,(c.title||c.id)+' · "'+
    String(n.text||'').slice(0,26)+'"');});
  return {rows,gates};
}

/* ---- week calendar ---- */
function weekGrid(){
  const cells={};
  P.content.forEach(c=>{
    if(c.type==='repeatable')return;
    const days=c.type==='activity'?(c.day?[c.day]:DAYS):[c.day||'monday'];
    days.forEach(d=>{
      const k=d+'|'+(c.block||'evening');
      (cells[k]=cells[k]||[]).push(c);
    });
  });
  return cells;
}
