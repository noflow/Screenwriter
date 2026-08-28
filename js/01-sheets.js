/* ============ character sheet import ============ */
function importSheet(raw){
  const s=typeof raw==='string'?JSON.parse(raw):raw;
  const id=s.id||slug(s.display_name||'character');
  const at=P.characters.findIndex(c=>c.id===id);
  const rec={...s,id,name:s.display_name||s.name||id,
    color:(P.characters[at]?.color)||PAL[P.characters.length%PAL.length]};
  at>=0?P.characters[at]=rec:P.characters.push(rec);
  if(Array.isArray(P.dismissedBundledCharacters))
    P.dismissedBundledCharacters=P.dismissedBundledCharacters.filter(characterId=>characterId!==id);
  derivePlaces(rec);
  return rec.name;
}

const bundledCharacterIds=()=>typeof BUNDLED_CHARACTER_SHEETS==='undefined'?[]:
  BUNDLED_CHARACTER_SHEETS.map(sheet=>sheet.id).filter(Boolean);

/** Add game-owned NPCs that are missing from this authoring project. Existing
    characters and same-id story items always win, so startup never overwrites a
    writer's edits. A deliberately removed bundled NPC stays removed. */
function syncBundledCharacters(){
  if(typeof BUNDLED_CHARACTER_SHEETS==='undefined')return null;
  if(!Array.isArray(P.dismissedBundledCharacters))P.dismissedBundledCharacters=[];
  const signature=typeof BUNDLED_CHARACTER_SIGNATURE==='undefined'?'':BUNDLED_CHARACTER_SIGNATURE;
  const packageUpdated=P.characterPackage?.id!=='port_alder_characters'||
    P.characterPackage?.signature!==signature||P.characterPackage?.count!==BUNDLED_CHARACTER_SHEETS.length;
  const dismissed=new Set(P.dismissedBundledCharacters),added=[],replacedStubs=[],reports=[];
  BUNDLED_CHARACTER_SHEETS.forEach(source=>{
    const id=String(source?.id||'');if(!id||dismissed.has(id))return;
    const existing=P.characters.find(character=>character.id===id);
    if(existing&&!existing._stub)return;
    const preserved=new Map(P.content.map(item=>[item.type+'\u0000'+item.id,item]));
    const sheet=JSON.parse(JSON.stringify(source));
    importSheet(sheet);
    const report=typeof importAuthored==='function'?importAuthored(sheet):null;
    if(report)reports.push(report);
    // Importers replace same-type/same-id content by design. During automatic
    // startup sync, restore anything the writer already had under that identity.
    P.content=P.content.map(item=>preserved.get(item.type+'\u0000'+item.id)||item);
    (existing?replacedStubs:added).push(id);
  });
  P.characterPackage={id:'port_alder_characters',
    signature,
    source:'bundled',count:BUNDLED_CHARACTER_SHEETS.length};
  return {updated:!!(packageUpdated||added.length||replacedStubs.length),added,replacedStubs,
    count:P.characters.filter(character=>bundledCharacterIds().includes(character.id)).length,reports};
}

// Build locations from home + scheduled activities so scenes have somewhere to happen.
function derivePlaces(c){
  // Once the real game registry is present, unknown sheet references should be
  // reported by Validate—not turned into fake places named after activities.
  if(P.locations.some(l=>l.tags?.includes('package')))return;
  const add=(id,name,district,tags)=>{
    if(!id||loc(id))return;
    P.locations.push({id,name,district:district||'',background:'bg_'+id,tags:tags||[],notes:''});
  };
  const homeId=c.home?.location_id||c.home?.residence_id||slug(c.home?.residence||'');
  if(homeId)add(locPart(homeId),c.home?.residence||pretty(locPart(homeId)),c.home?.district,['home',c.id]);
  (c.schedule?.fixed_commitments||[]).forEach(f=>{
    const place=f.location?locPart(f.location):slug(f.activity||'');
    if(place)add(place,pretty(place).replace(/\b\w/g,m=>m.toUpperCase()),'',['activity']);
  });
}
