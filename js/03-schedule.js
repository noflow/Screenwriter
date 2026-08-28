/* ============ schedule ============ */
/** Expands fixed_commitments into a day|block grid so each cell can be edited directly. */
function scheduleGrid(c){
  const g={};
  (c.schedule?.fixed_commitments||[]).forEach(f=>{
    const meta={...f};
    ['activity','location','unavailable','days','blocks'].forEach(key=>delete meta[key]);
    const home=c.home?.location_id||c.home?.residence_id||'';
    const placedRoom=f.home_placement?.room;
    const shownLocation=placedRoom&&locPart(f.location)===locPart(home)
      ? locPart(f.location)+'.'+placedRoom:(f.location||'');
    (f.days||[]).forEach(d=>(f.blocks||[]).forEach(b=>{
      g[d+'|'+b]={activity:f.activity||'',location:shownLocation,
        unavailable:!!f.unavailable,_meta:meta};
    }));
  });
  return g;
}

const scheduleCopy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function knownHomePlacement(c,room,existing){
  if(existing?.room===room&&Array.isArray(existing.position))return scheduleCopy(existing);
  const candidates=[];
  (c.schedule?.fixed_commitments||[]).forEach(f=>candidates.push(f.home_placement));
  const routine=c.home_routine||{};
  Object.values(routine.default_by_block||{}).forEach(p=>candidates.push(p));
  (routine.overrides||[]).forEach(p=>candidates.push(p));
  const found=candidates.find(p=>p?.room===room&&Array.isArray(p.position)&&p.position.length===2);
  return found?scheduleCopy(found):{room};
}

/** Compresses the grid back into fixed_commitments, merging identical cells. */
function gridToCommitments(g,c={}){
  const byKey={};
  Object.entries(g).forEach(([k,v])=>{
    if(!v||(!v.activity&&!v.location))return;
    const [day,block]=k.split('|');
    const meta=scheduleCopy(v._meta||{}),home=c.home?.location_id||c.home?.residence_id||'';
    let location=v.location||'',room=roomPart(location);
    if(room&&locPart(location)===locPart(home)){
      meta.home_placement=knownHomePlacement(c,room,meta.home_placement);
      location=locPart(location);
    }else delete meta.home_placement;
    const id=[v.activity,location,v.unavailable?1:0,JSON.stringify(meta)].join('\u0001');
    const e=byKey[id]=byKey[id]||{activity:v.activity,location,
      unavailable:!!v.unavailable,meta,dayBlocks:new Map()};
    const dayBlocks=e.dayBlocks.get(day)||new Set();dayBlocks.add(block);e.dayBlocks.set(day,dayBlocks);
  });
  const ordered=(values,known)=>[...values].sort((a,b)=>{
    const ai=known.indexOf(a),bi=known.indexOf(b);
    if(ai>=0&&bi>=0)return ai-bi;
    if(ai>=0)return -1;if(bi>=0)return 1;
    return String(a).localeCompare(String(b));
  });
  const out=[];
  Object.values(byKey).forEach(e=>{
    const byBlocks=new Map();
    e.dayBlocks.forEach((blocks,day)=>{
      const list=ordered(blocks,BLOCKS),key=JSON.stringify(list);
      const group=byBlocks.get(key)||{blocks:list,days:new Set()};
      group.days.add(day);byBlocks.set(key,group);
    });
    byBlocks.forEach(group=>{
      const o=Object.assign({},e.meta,{activity:e.activity||e.location,
        days:ordered(group.days,DAYS),blocks:group.blocks,unavailable:e.unavailable});
      if(e.location)o.location=e.location;
      out.push(o);
    });
  });
  return out;
}

function setSchedule(c,g){
  c.schedule=c.schedule||{};
  c.schedule.fixed_commitments=gridToCommitments(g,c);
  save();
}

/* ============ schedule → availability ============ */
function availability(c,day,block){
  const sc=c.schedule||{};
  const cell=scheduleGrid(c)[day+'|'+block];
  if(cell)return {free:!cell.unavailable,
    why:pretty(cell.activity||cell.location),
    where:cell.location||slug(cell.activity||'')};
  const home=c.home?.location_id||c.home?.residence_id||(c.home?.residence?slug(c.home.residence):null);
  if((sc.days_off||[]).includes(day))return {free:true,why:'day off',where:home};
  const pref=(sc.preferred_social_blocks||[]).includes(block);
  return {free:true,why:pref?'free · prefers this time':'free',where:home};
}
function whereIs(c,day,block){
  return availability(c,day,block).where||null;
}

/** Availability for every day on which a conversation/activity can run.
    An empty day list means any day, so checks must cover the whole week. */
function contentAvailability(character,item){
  const multi=item?.type==='conversation'||item?.type==='activity';
  const chosen=multi?contentDays(item):[item?.day].filter(Boolean);
  const days=chosen.length?chosen:(multi?DAYS:[]);
  return days.map(day=>Object.assign({day},availability(character,day,item?.block)));
}
