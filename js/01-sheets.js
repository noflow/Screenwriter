/* ============ character sheet import ============ */
function characterHomeLocation(character){
  const id=character?.home?.location_id||character?.home?.residence_id||'';
  return P.locations.find(location=>location.id===id)||null;
}

// Hale Home predates the registry-driven city residences. Its directional map
// still lives in src/world/hale_home_navigation.gd, so mirror that read-only
// runtime layout here until the game moves it into all_locations.json.
const SPECIAL_RESIDENCE_LAYOUTS={
  hale_home:{outside_room:'front_yard',source:'Godot runtime layout',navigation:{
    player_bedroom:{down:'upstairs_landing'},
    upstairs_landing:{up:'player_bedroom',left:'upstairs_hall',down:'entryway'},
    upstairs_hall:{left:'lily_bedroom',up:'parents_bedroom',right:'upstairs_landing',down:'family_bathroom'},
    lily_bedroom:{right:'upstairs_hall'},parents_bedroom:{down:'upstairs_hall'},
    family_bathroom:{up:'upstairs_hall'},
    entryway:{left:'living_room',up:'upstairs_landing',right:'front_yard'},
    living_room:{right:'entryway',down:'dining_room'},
    dining_room:{up:'living_room',right:'kitchen'},
    kitchen:{left:'dining_room',right:'laundry_room',down:'backyard'},
    backyard:{up:'kitchen'},laundry_room:{left:'kitchen',right:'garage'},
    garage:{left:'laundry_room',down:'front_yard'},
    front_yard:{left:'garage',up:'alder_heights_residential_street.hale_block',down:'entryway'}
  }}
};

function residenceLayout(home){
  return SPECIAL_RESIDENCE_LAYOUTS[home?.id]||null;
}

function residenceEntranceId(home){
  return home?.outside_room||residenceLayout(home)?.outside_room||'';
}

function residenceRoomNavigation(home,room){
  return room?.navigation||residenceLayout(home)?.navigation?.[room?.id]||{};
}

/** Keeps the character sheet and the location registry's resident list in sync. */
function linkCharacterHome(character,previousHomeId=''){
  const home=characterHomeLocation(character),nextId=home?.id||'';
  if(previousHomeId&&previousHomeId!==nextId){
    const previous=P.locations.find(location=>location.id===previousHomeId);
    if(previous&&Array.isArray(previous.residents))
      previous.residents=previous.residents.filter(id=>id!==character.id);
  }
  if(!home)return null;
  if(!Array.isArray(home.residents))home.residents=[];
  if(!home.residents.includes(character.id))home.residents.push(character.id);
  character.home=character.home||{};
  character.home.location_id=home.id;
  if(character.home.residence_id!==undefined)character.home.residence_id=home.id;
  character.home.district=home.district||'';
  character.home.residence=home.name||pretty(home.id);
  if(!Array.isArray(character.home.household))character.home.household=[];
  return home;
}

function setCharacterHomeLocation(character,locationId){
  const home=P.locations.find(location=>location.id===locationId);
  if(!home)throw new Error('Choose a residence from the location registry.');
  const oldId=character?.home?.location_id||character?.home?.residence_id||'';
  character.home=character.home||{};character.home.location_id=home.id;
  linkCharacterHome(character,oldId);
  (character.schedule?.fixed_commitments||[]).forEach(commitment=>{
    if(commitment.home_placement&&String(commitment.location||'').split('.')[0]===oldId)
      commitment.location=home.id;
  });
  return home;
}

function importSheet(raw){
  const s=typeof raw==='string'?JSON.parse(raw):raw;
  const id=s.id||slug(s.display_name||'character');
  const at=P.characters.findIndex(c=>c.id===id);
  const previousHomeId=at>=0?(P.characters[at].home?.location_id||P.characters[at].home?.residence_id||''):'';
  const rec={...s,id,name:s.display_name||s.name||id,
    color:(P.characters[at]?.color)||PAL[P.characters.length%PAL.length]};
  at>=0?P.characters[at]=rec:P.characters.push(rec);
  if(Array.isArray(P.dismissedBundledCharacters))
    P.dismissedBundledCharacters=P.dismissedBundledCharacters.filter(characterId=>characterId!==id);
  derivePlaces(rec);
  linkCharacterHome(rec,previousHomeId);
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
