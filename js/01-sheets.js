/* ============ character sheet import ============ */
function importSheet(raw){
  const s=typeof raw==='string'?JSON.parse(raw):raw;
  const id=s.id||slug(s.display_name||'character');
  const at=P.characters.findIndex(c=>c.id===id);
  const rec={...s,id,name:s.display_name||s.name||id,
    color:(P.characters[at]?.color)||PAL[P.characters.length%PAL.length]};
  at>=0?P.characters[at]=rec:P.characters.push(rec);
  derivePlaces(rec);
  return rec.name;
}

// Build locations from home + scheduled activities so scenes have somewhere to happen.
function derivePlaces(c){
  const add=(id,name,district,tags)=>{
    if(!id||loc(id))return;
    P.locations.push({id,name,district:district||'',background:'bg_'+id,tags:tags||[],notes:''});
  };
  if(c.home?.residence) add(slug(c.home.residence),c.home.residence,c.home.district,['home',c.id]);
  if(c.home?.district)  add(slug(c.home.district),c.home.district,c.home.district,['district']);
  (c.schedule?.fixed_commitments||[]).forEach(f=>{
    if(f.activity) add(slug(f.activity),pretty(f.activity).replace(/\b\w/g,m=>m.toUpperCase()),'',['activity']);
  });
}
