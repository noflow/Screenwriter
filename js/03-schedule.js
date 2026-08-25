/* ============ schedule ============ */
/** Expands fixed_commitments into a day|block grid so each cell can be edited directly. */
function scheduleGrid(c){
  const g={};
  (c.schedule?.fixed_commitments||[]).forEach(f=>{
    (f.days||[]).forEach(d=>(f.blocks||[]).forEach(b=>{
      g[d+'|'+b]={activity:f.activity||'',location:f.location||slug(f.activity||''),
        unavailable:!!f.unavailable};
    }));
  });
  return g;
}

/** Compresses the grid back into fixed_commitments, merging identical cells. */
function gridToCommitments(g){
  const byKey={};
  Object.entries(g).forEach(([k,v])=>{
    if(!v||(!v.activity&&!v.location))return;
    const [day,block]=k.split('|');
    const id=[v.activity,v.location,v.unavailable?1:0].join('\u0001');
    const e=byKey[id]=byKey[id]||{activity:v.activity,location:v.location,
      unavailable:!!v.unavailable,days:new Set(),blocks:new Set()};
    e.days.add(day);e.blocks.add(block);
  });
  return Object.values(byKey).map(e=>{
    const o={activity:e.activity||e.location,
      days:DAYS.filter(d=>e.days.has(d)),
      blocks:BLOCKS.filter(b=>e.blocks.has(b)),
      unavailable:e.unavailable};
    if(e.location)o.location=e.location;
    return o;
  });
}

function setSchedule(c,g){
  c.schedule=c.schedule||{};
  c.schedule.fixed_commitments=gridToCommitments(g);
  save();
}

/* ============ schedule → availability ============ */
function availability(c,day,block){
  const sc=c.schedule||{};
  const cell=scheduleGrid(c)[day+'|'+block];
  if(cell)return {free:!cell.unavailable,
    why:pretty(cell.activity||cell.location),
    where:cell.location||slug(cell.activity||'')};
  const home=c.home?.residence_id||(c.home?.residence?slug(c.home.residence):null);
  if((sc.days_off||[]).includes(day))return {free:true,why:'day off',where:home};
  const pref=(sc.preferred_social_blocks||[]).includes(block);
  return {free:true,why:pref?'free · prefers this time':'free',where:home};
}
function whereIs(c,day,block){
  return availability(c,day,block).where||null;
}
