/* ============ location package ============ */
/* The game ships a real location registry — districts, locations, and rooms with access
   levels and actions. Scenewright's derived placeholders are guesses; this replaces them
   and remaps anything already written to point at the real ids. */

let DISTRICTS=[],TRAVEL=null,ALIASES={};

function isLocationPackage(d){
  return !!d&&Array.isArray(d.locations)&&(Array.isArray(d.districts)||d.reference_format);
}
const isLocationExtensionPackage=d=>!!d&&Array.isArray(d.locations)&&
  (d.package_id==='scenewright_custom_locations'||d.package_kind==='location_extension');

const orderedJson=value=>{
  if(Array.isArray(value))return value.map(orderedJson);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,key)=>{
    out[key]=orderedJson(value[key]);return out;
  },{});
  return value;
};
const locationPackageView=pkg=>({
  districts:pkg.districts||[],travel_rules:pkg.travel_rules||null,
  legacy_aliases:pkg.legacy_aliases||{},
  locations:(pkg.locations||[]).map(l=>{
    const out={...l};delete out.background;delete out.tags;delete out.notes;delete out.editor_layout;
    Object.assign(out,{id:l.id||'',name:l.name||'',district:l.district||'',type:l.type||'',
      travel_node:l.travel_node!==false,access:l.access||{},privacy:l.privacy||null,
      // Authored character sheets own their current home link, so their resident
      // entries are intentionally excluded from canonical-registry equality.
      residents:(l.residents||[]).filter(id=>!(P.characters||[]).some(character=>character.id===id)),
      services:l.services||[],housing:l.housing||null,
      named_npcs:l.named_npcs||[],content_rules:l.content_rules||[]});
    out.rooms=(l.rooms||[]).map(r=>Object.assign({},r,{id:r.id||'',name:r.name||'',
      access:r.access||'',actions:r.actions||[]}));
    return out;
  })
});
const currentLocationPackage=()=>({districts:DISTRICTS,travel_rules:TRAVEL,
  legacy_aliases:ALIASES,locations:P.locations.filter(l=>l.tags?.includes('package'))});
const sameLocationPackage=pkg=>JSON.stringify(orderedJson(locationPackageView(pkg)))===
  JSON.stringify(orderedJson(locationPackageView(currentLocationPackage())));

/** Restore one saved authoring project without leaking registry globals from the
    project that happened to be open before it. */
function restoreProject(project,{refreshLocations=true}={}){
  const source=project&&typeof project==='object'?project:{};
  P=Object.assign({characters:[],locations:[],content:[],ensemble_arcs:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[],residence_overrides:{}},source);
  if(!Array.isArray(P.characters))P.characters=[];
  if(!Array.isArray(P.locations))P.locations=[];
  if(!Array.isArray(P.content))P.content=[];
  if(!Array.isArray(P.ensemble_arcs))P.ensemble_arcs=[];
  if(!Array.isArray(P.dismissedBundledCharacters))P.dismissedBundledCharacters=[];
  if(!P.residence_overrides||typeof P.residence_overrides!=='object'||Array.isArray(P.residence_overrides))
    P.residence_overrides={};
  DISTRICTS=Array.isArray(P.districts)?P.districts:[];
  TRAVEL=P.travel||null;ALIASES=P.aliases||{};
  return refreshLocations?syncBundledLocations():null;
}

/** Per-project discovery/access decisions survive a refresh of the game-owned
    location registry without copying the whole registry into the project. */
function rememberResidenceOverride(location,fields=['discovery','access','outside_room']){
  if(!location?.id||!location.tags?.includes('package'))return;
  if(!P.residence_overrides||typeof P.residence_overrides!=='object')P.residence_overrides={};
  const override=P.residence_overrides[location.id]||{};
  fields.forEach(field=>{
    if(field==='outside_room')override.outside_room=location.outside_room||'';
    else if(field==='editor_layout')override.editor_layout=JSON.parse(JSON.stringify(location.editor_layout||{}));
    else override[field]=JSON.parse(JSON.stringify(location[field]||(/^(rooms|residents)$/.test(field)?[]:{})));
  });
  P.residence_overrides[location.id]=override;
}

function applyResidenceOverrides(){
  Object.entries(P.residence_overrides||{}).forEach(([id,override])=>{
    const location=P.locations.find(item=>item.id===id);if(!location||!override)return;
    if(override.discovery&&typeof override.discovery==='object')
      location.discovery=JSON.parse(JSON.stringify(override.discovery));
    if(override.access&&typeof override.access==='object')
      location.access=JSON.parse(JSON.stringify(override.access));
    if(Object.prototype.hasOwnProperty.call(override,'outside_room'))
      location.outside_room=override.outside_room||'';
    if(Array.isArray(override.rooms))location.rooms=JSON.parse(JSON.stringify(override.rooms));
    if(override.editor_layout&&typeof override.editor_layout==='object')
      location.editor_layout=JSON.parse(JSON.stringify(override.editor_layout));
  });
}

/** Character sheets own authored home assignments. Rebuild resident links after
    a canonical registry refresh so moving an NPC remains stable across reloads. */
function reconcileCharacterHomeResidents(){
  (P.characters||[]).forEach(character=>{
    P.locations.forEach(location=>{
      if(Array.isArray(location.residents))location.residents=location.residents.filter(id=>id!==character.id);
    });
    const homeId=character?.home?.location_id||character?.home?.residence_id||'';
    const home=P.locations.find(location=>location.id===homeId);if(!home)return;
    if(!Array.isArray(home.residents))home.residents=[];
    if(!home.residents.includes(character.id))home.residents.push(character.id);
    character.home.location_id=home.id;character.home.district=home.district||'';
    character.home.residence=home.name||pretty(home.id);
  });
}

/** Bring saved/browser state up to the exact registry bundled from the game. */
function syncBundledLocations(){
  if(typeof BUNDLED_LOCATION_PACKAGE==='undefined')return null;
  if(sameLocationPackage(BUNDLED_LOCATION_PACKAGE)){
    P.locationPackage={id:BUNDLED_LOCATION_PACKAGE.package_id||'',
      signature:typeof BUNDLED_LOCATION_SIGNATURE==='undefined'?'':BUNDLED_LOCATION_SIGNATURE,
      source:'bundled'};
    applyResidenceOverrides();reconcileCharacterHomeResidents();
    return {updated:false,count:P.locations.length,districts:DISTRICTS.length,
      rooms:P.locations.reduce((n,l)=>n+(l.rooms||[]).length,0),moved:0,sched:0,
      deduped:0,unplaced:[],lost:[]};
  }
  // A writer may deliberately import a newer registry while using Scenewright
  // away from the game checkout. Keep that explicit choice across reloads.
  if(P.locationPackage?.source==='imported'&&
     P.locationPackage.id===BUNDLED_LOCATION_PACKAGE.package_id&&DISTRICTS.length)
    return {updated:false,manual:true,
    count:P.locations.length,districts:DISTRICTS.length,
    rooms:P.locations.reduce((n,l)=>n+(l.rooms||[]).length,0),moved:0,sched:0,
    deduped:0,unplaced:[],lost:[]};
  // Repair projects saved by older builds that mistakenly treated a custom
  // extension as the full registry. Reclassify its places before restoring Port Alder.
  if(P.locationPackage?.source==='imported'&&P.locationPackage.id!==BUNDLED_LOCATION_PACKAGE.package_id&&
     !DISTRICTS.length)P.locations.forEach(l=>l.tags=['custom']);
  const result=importLocations(BUNDLED_LOCATION_PACKAGE,{source:'bundled',
    signature:typeof BUNDLED_LOCATION_SIGNATURE==='undefined'?'':BUNDLED_LOCATION_SIGNATURE});
  result.updated=true;return result;
}

/** Best guess at which real location an old placeholder id meant. */
function remapId(old,byId,byName){
  if(!old)return '';
  old=String(old);
  const parts=old.split('.'),base=parts.shift(),room=parts.join('.');
  if(room){
    const parent=byId[base]?base:(ALIASES[base]&&byId[ALIASES[base]]?ALIASES[base]:'');
    if(parent&&(byId[parent].rooms||[]).some(r=>r.id===room))return parent+'.'+room;
  }
  if(byId[old])return old;
  if(ALIASES[old]&&byId[ALIASES[old]])return ALIASES[old];
  if(byName[old]||byName[slug(old)])return byName[old]||byName[slug(old)];
  // Bare room ids are safe only when the room name is unique city-wide.
  const matches=[];
  for(const l of P.locations){
    (l.rooms||[]).forEach(r=>{
      if(r.id===old||slug(r.name)===slug(old))matches.push(l.id+'.'+r.id);
    });
  }
  return [...new Set(matches)].length===1?matches[0]:'';
}

/** Custom World Builder downloads extend the city; they never replace its
    districts, aliases, or official locations. */
function importLocationExtension(pkg){
  const officialIds=new Set(P.locations.filter(l=>l.tags?.includes('package')).map(l=>l.id));
  const previous=new Map(P.locations.filter(l=>l.tags?.includes('custom')).map(l=>[l.id,l]));
  const incoming=new Map(),collisions=[],duplicates=[];
  (pkg.locations||[]).forEach(l=>{
    const id=String(l?.id||'').trim();if(!id)return;
    if(officialIds.has(id)){collisions.push(id);return;}
    if(incoming.has(id))duplicates.push(id);
    incoming.set(id,l);
  });
  const incomingIds=new Set(incoming.keys());
  const merged=[...incoming.values()].map(l=>({...l,id:l.id,name:l.name||pretty(l.id),
    district:l.district||'',type:l.type||'place',travel_node:l.travel_node!==false,
    background:previous.get(l.id)?.background||'bg_'+l.id,
    access:l.access||{always_open:true},residents:l.residents||[],services:l.services||[],
    rooms:(l.rooms||[]).map(r=>({...r,id:r.id,name:r.name||pretty(r.id),
      access:r.access||'shared',actions:r.actions||[]})),
    tags:['custom'],notes:l.notes||previous.get(l.id)?.notes||''}));
  P.locations=P.locations.filter(l=>!(l.tags?.includes('custom')&&incomingIds.has(l.id))).concat(merged);
  return {custom:true,added:merged.length,collisions:[...new Set(collisions)],
    duplicates:[...new Set(duplicates)],count:P.locations.length,districts:DISTRICTS.length,
    rooms:P.locations.reduce((n,l)=>n+(l.rooms||[]).length,0),moved:0,sched:0,
    deduped:0,unplaced:[],lost:[]};
}

function importLocations(pkg,{source='imported',signature=''}={}){
  if(isLocationExtensionPackage(pkg))return importLocationExtension(pkg);
  DISTRICTS=pkg.districts||[];
  TRAVEL=pkg.travel_rules||null;
  ALIASES=pkg.legacy_aliases||{};

  const officialIds=new Set(pkg.locations.map(l=>l.id));
  const prior=new Map(P.locations.filter(l=>l.tags?.includes('package')).map(l=>[l.id,l]));
  const custom=P.locations.filter(l=>l.tags?.includes('custom'));
  const kept=custom.filter(l=>!officialIds.has(l.id));
  const deduped=custom.length-kept.length;
  P.locations=pkg.locations.map(l=>({...l,
    id:l.id,
    name:l.name,
    district:l.district||'',
    type:l.type||'',
    background:prior.get(l.id)?.background||'bg_'+l.id,
    rooms:(l.rooms||[]).map(r=>({...r,id:r.id,name:r.name,access:r.access||'',
      actions:r.actions||[]})),
    residents:l.residents||[],
    services:l.services||[],
    access:l.access||{},
    privacy:l.privacy||null,
    housing:l.housing||null,
    named_npcs:l.named_npcs||[],
    content_rules:l.content_rules||[],
    travel_node:l.travel_node!==false,
    tags:['package'],
    notes:prior.get(l.id)?.notes||''
  })).concat(kept);
  P.districts=DISTRICTS;P.travel=TRAVEL;P.aliases=ALIASES;
  P.locationPackage={id:pkg.package_id||'',signature,source};

  // Point existing content at the real ids instead of the guesses.
  const byId={},byName={};
  P.locations.forEach(l=>{byId[l.id]=l;byName[slug(l.name)]=l.id;});
  let moved=0,lost=[];
  const fix=o=>{
    if(!o||!o.location)return;
    const to=remapId(o.location,byId,byName);
    if(to&&to!==o.location){o.location=to;moved++;}
    else if(!to)lost.push(o.location);
  };
  P.content.forEach(c=>{fix(c);(c.stages||[]).forEach(fix);
    fix(c.questPlan?.event);fix(c.questPlan?.eventDraft);});

  // Schedules point at places too — a commitment still naming a placeholder would
  // keep reporting characters as being somewhere that no longer exists.
  let sched=0;const unplaced=[];
  P.characters.forEach(c=>{
    (c.schedule?.fixed_commitments||[]).forEach(f=>{
      const from=f.location||slug(f.activity||'');
      const to=remapId(from,byId,byName);
      if(to&&to!==f.location){f.location=to;sched++;}
      else if(!to)unplaced.push(c.name+': '+pretty(from));
    });
    // Prefer canonical home ids, with old residence wording as a fallback.
    if(c.home){
      const from=c.home.location_id||c.home.residence_id||slug(c.home.residence||'');
      const to=remapId(from,byId,byName);
      if(to){c.home.location_id=locPart(to);c.home.residence_id=locPart(to);}
    }
  });

  applyResidenceOverrides();
  reconcileCharacterHomeResidents();

  return {count:P.locations.length,districts:DISTRICTS.length,moved,sched,
    deduped,
    unplaced:[...new Set(unplaced)],
    lost:[...new Set(lost)],rooms:P.locations.reduce((n,l)=>n+(l.rooms||[]).length,0)};
}

/* ---- room-aware references ---- */
const locPart=ref=>String(ref||'').split('.')[0];
const roomPart=ref=>String(ref||'').split('.')[1]||'';
function roomOf(ref){
  const l=loc(locPart(ref));
  return l?(l.rooms||[]).find(r=>r.id===roomPart(ref))||null:null;
}

const ROOM_DIRECTIONS=['up','right','down','left'];
const ROOM_DIRECTION_DELTA={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
const ROOM_DIRECTION_OPPOSITE={up:'down',right:'left',down:'up',left:'right'};

function effectiveRoomNavigation(location,room){
  return room?.navigation||(
    typeof residenceRoomNavigation==='function'?residenceRoomNavigation(location,room):{});
}

function roomMapLayout(location){
  return location?.editor_layout&&typeof location.editor_layout==='object'?
    location.editor_layout:{};
}

/** Derive a stable authoring layout from navigation. It is presentation data,
    not travel logic, and can be rearranged without changing exits. */
function autoRoomMapLayout(location){
  const rooms=location?.rooms||[],ids=new Set(rooms.map(room=>room.id));
  const positions={},occupied=new Set();let componentX=0;
  const freePosition=(x,y)=>{
    let px=x,py=y;
    while(occupied.has(px+','+py)){px++;if(px-x>4){px=x;py++;}}
    occupied.add(px+','+py);return {x:px,y:py};
  };
  const walk=root=>{
    const start=freePosition(componentX,0);positions[root.id]=start;
    const queue=[root];
    while(queue.length){
      const room=queue.shift(),from=positions[room.id];
      ROOM_DIRECTIONS.forEach(direction=>{
        const target=effectiveRoomNavigation(location,room)[direction];
        if(!ids.has(target)||positions[target])return;
        const delta=ROOM_DIRECTION_DELTA[direction],next=freePosition(from.x+delta[0],from.y+delta[1]);
        positions[target]=next;queue.push(rooms.find(item=>item.id===target));
      });
    }
    componentX=Math.max(componentX,...Object.values(positions).map(point=>point.x))+2;
  };
  const entrance=rooms.find(room=>room.id===(location.outside_room||
    (typeof residenceEntranceId==='function'?residenceEntranceId(location):'')));
  if(entrance)walk(entrance);
  rooms.filter(room=>!positions[room.id]).forEach(walk);
  location.editor_layout=positions;return positions;
}

function ensureRoomMapLayout(location){
  const rooms=location?.rooms||[],current=roomMapLayout(location);
  if(!rooms.length){location.editor_layout={};return location.editor_layout;}
  const complete=rooms.every(room=>Number.isFinite(+current[room.id]?.x)&&Number.isFinite(+current[room.id]?.y));
  return complete?current:autoRoomMapLayout(location);
}

function materializeSpecialResidenceLayout(location){
  const special=typeof residenceLayout==='function'?residenceLayout(location):null;
  if(!special)return false;
  (location.rooms||[]).forEach(room=>{
    room.navigation=JSON.parse(JSON.stringify(special.navigation?.[room.id]||room.navigation||{}));
  });
  if(!location.outside_room)location.outside_room=special.outside_room||'';
  rememberResidenceOverride(location,['rooms','outside_room']);return true;
}

function roomMapIssues(location){
  const rooms=location?.rooms||[],ids=new Set(rooms.map(room=>room.id)),issues=[];
  const entrance=location?.outside_room||(
    typeof residenceEntranceId==='function'?residenceEntranceId(location):'');
  if(rooms.length&&!entrance)issues.push({severity:'error',message:'Choose an entrance room.'});
  else if(entrance&&!ids.has(entrance))issues.push({severity:'error',message:'Entrance room "'+entrance+'" does not exist.'});
  rooms.forEach(room=>Object.entries(effectiveRoomNavigation(location,room)).forEach(([direction,target])=>{
    if(!ROOM_DIRECTIONS.includes(direction))
      issues.push({severity:'error',room:room.id,message:pretty(direction)+' is not a supported direction.'});
    if(!target)return;
    if(!String(target).includes('.')&&!ids.has(target))
      issues.push({severity:'error',room:room.id,message:pretty(direction)+' points to missing room "'+target+'".'});
    if(ids.has(target)){
      const reverse=effectiveRoomNavigation(location,rooms.find(item=>item.id===target))[ROOM_DIRECTION_OPPOSITE[direction]];
      if(reverse!==room.id)issues.push({severity:'warning',room:room.id,
        message:pretty(room.id)+' → '+pretty(target)+' has no matching return arrow.'});
    }else if(String(target).includes('.')&&typeof roomOf==='function'&&!roomOf(target))
      issues.push({severity:'error',room:room.id,message:pretty(direction)+' points to unknown destination "'+target+'".'});
  }));
  if(entrance&&ids.has(entrance)){
    const visited=new Set([entrance]),queue=[entrance];
    while(queue.length){
      const current=queue.shift(),room=rooms.find(item=>item.id===current);
      Object.values(effectiveRoomNavigation(location,room)).forEach(target=>{
        if(ids.has(target)&&!visited.has(target)){visited.add(target);queue.push(target);}
      });
      rooms.forEach(candidate=>{
        if(!visited.has(candidate.id)&&Object.values(effectiveRoomNavigation(location,candidate)).includes(current)){
          visited.add(candidate.id);queue.push(candidate.id);
        }
      });
    }
    rooms.filter(room=>!visited.has(room.id)).forEach(room=>issues.push({severity:'warning',room:room.id,
      message:pretty(room.id)+' is disconnected from the entrance.'}));
  }
  return issues;
}

function rewriteRoomReferences(location,oldId,newId){
  const locationId=location.id,oldRef=locationId+'.'+oldId,newRef=locationId+'.'+newId;
  const rewrite=value=>value===oldRef?newRef:value;
  const fixPlace=object=>{if(object?.location)object.location=rewrite(object.location);};
  (P.content||[]).forEach(item=>{fixPlace(item);(item.stages||[]).forEach(fixPlace);
    fixPlace(item.questPlan?.event);fixPlace(item.questPlan?.eventDraft);});
  (P.characters||[]).forEach(character=>{
    (character.schedule?.fixed_commitments||[]).forEach(commitment=>{
      fixPlace(commitment);
      if(locPart(character.home?.location_id||character.home?.residence_id)===locationId&&
         commitment.home_placement?.room===oldId)commitment.home_placement.room=newId;
    });
    if(locPart(character.home?.location_id||character.home?.residence_id)===locationId){
      Object.values(character.home_routine?.default_by_block||{}).forEach(placement=>{
        if(placement?.room===oldId)placement.room=newId;
      });
      (character.home_routine?.overrides||[]).forEach(placement=>{
        if(placement?.room===oldId)placement.room=newId;
      });
    }
  });
  P.locations.forEach(place=>(place.rooms||[]).forEach(room=>{
    Object.keys(room.navigation||{}).forEach(direction=>{
      const target=room.navigation[direction];
      if(place===location&&target===oldId)room.navigation[direction]=newId;
      else if(target===oldRef)room.navigation[direction]=newRef;
    });
  }));
}

function renameRoomId(location,room,raw){
  if(!location||!room)return '';
  if(location.tags?.includes('package'))return room.id;
  const oldId=room.id,next=slug(raw);
  if(!next||next===oldId)return oldId;
  if((location.rooms||[]).some(item=>item!==room&&item.id===next))return oldId;
  rewriteRoomReferences(location,oldId,next);
  if(location.outside_room===oldId)location.outside_room=next;
  const layout=roomMapLayout(location);if(layout[oldId]){layout[next]=layout[oldId];delete layout[oldId];}
  room.id=next;return next;
}

function uniqueRoomId(location,base='new_room'){
  const used=new Set((location?.rooms||[]).map(room=>room.id));let id=slug(base),number=2;
  while(used.has(id))id=slug(base)+'_'+number++;
  return id;
}

function addLocationRoom(location,name='New Room'){
  location.rooms=Array.isArray(location.rooms)?location.rooms:[];
  const priorLayout=roomMapLayout(location),priorComplete=location.rooms.every(existing=>
    Number.isFinite(+priorLayout[existing.id]?.x)&&Number.isFinite(+priorLayout[existing.id]?.y));
  const id=uniqueRoomId(location,name),room={id,name,access:'shared',navigation:{},actions:[]};
  location.rooms.push(room);
  if(priorComplete){
    const points=Object.values(priorLayout);priorLayout[id]={
      x:points.length?Math.max(...points.map(point=>+point.x||0))+1:0,y:0};
  }else ensureRoomMapLayout(location);
  return room;
}

function removeLocationRoom(location,roomId){
  const room=(location?.rooms||[]).find(item=>item.id===roomId);if(!room)return false;
  location.rooms=location.rooms.filter(item=>item!==room);
  location.rooms.forEach(item=>Object.keys(item.navigation||{}).forEach(direction=>{
    if(item.navigation[direction]===roomId)delete item.navigation[direction];
  }));
  if(location.outside_room===roomId)location.outside_room='';
  delete roomMapLayout(location)[roomId];return true;
}

function setRoomExit(location,room,direction,target,{addReturn=true}={}){
  if(!ROOM_DIRECTIONS.includes(direction)||!room)return false;
  if(typeof residenceLayout==='function'&&residenceLayout(location)&&
     !(location.rooms||[]).some(item=>item.navigation))materializeSpecialResidenceLayout(location);
  room.navigation=room.navigation||{};const previous=room.navigation[direction];
  if(!target)delete room.navigation[direction];else room.navigation[direction]=target;
  const opposite=ROOM_DIRECTION_OPPOSITE[direction],previousRoom=(location.rooms||[]).find(item=>item.id===previous);
  if(previousRoom?.navigation?.[opposite]===room.id)delete previousRoom.navigation[opposite];
  const targetRoom=(location.rooms||[]).find(item=>item.id===target);
  if(addReturn&&targetRoom){targetRoom.navigation=targetRoom.navigation||{};
    if(!targetRoom.navigation[opposite])targetRoom.navigation[opposite]=room.id;}
  return true;
}

function locationExportRecord(location){
  return {id:location.id,name:location.name,district:location.district,type:location.type||'place',
    travel_node:location.travel_node!==false,outside_room:location.outside_room||residenceEntranceId(location)||'',
    discovery:location.discovery||{},access:location.access||{},residents:location.residents||[],
    services:location.services||[],rooms:(location.rooms||[]).map(room=>({id:room.id,name:room.name,
      access:room.access||'shared',navigation:effectiveRoomNavigation(location,room),actions:room.actions||[]})),notes:location.notes||''};
}
function placeName(ref){
  const l=loc(locPart(ref));
  if(!l)return ref||'nowhere';
  const r=roomOf(ref);
  return r?l.name+' — '+r.name:l.name;
}

/** Resolve an id, display name, or fully qualified room name without guessing
    between same-named rooms in different locations. */
function resolvePlaceRef(value){
  const raw=String(value||'').trim();if(!raw)return null;
  const byId={},byName={};
  P.locations.forEach(l=>{byId[l.id]=l;byName[slug(l.name)]=l.id;});
  const direct=remapId(raw,byId,byName);if(direct)return direct;
  const wanted=slug(raw.replace(/[—–>-]+/g,' ')),matches=[];
  P.locations.forEach(l=>{
    const placeAliases=[l.id,l.name].map(slug);
    if(placeAliases.includes(wanted))matches.push(l.id);
    (l.rooms||[]).forEach(r=>{
      const ref=l.id+'.'+r.id;
      const aliases=[ref,r.id,r.name,l.id+' '+r.id,l.name+' '+r.name].map(slug);
      if(aliases.includes(wanted))matches.push(ref);
    });
  });
  const unique=[...new Set(matches)];return unique.length===1?unique[0]:null;
}

/** Custom ids remain editable, but every modeled reference must follow a rename. */
function renameLocationId(place,raw){
  if(!place||place.tags?.includes('package'))return place?.id||'';
  const old=place.id,next=slug(raw);
  if(!next||next===old)return old;
  if(P.locations.some(l=>l!==place&&l.id===next))return old;
  const rewrite=ref=>{
    const value=String(ref||'');
    if(value===old)return next;
    return value.startsWith(old+'.')?next+value.slice(old.length):value;
  };
  const fix=o=>{if(o?.location)o.location=rewrite(o.location);};
  P.content.forEach(c=>{fix(c);(c.stages||[]).forEach(fix);
    fix(c.questPlan?.event);fix(c.questPlan?.eventDraft);});
  P.characters.forEach(c=>{
    if(c.home?.location_id)c.home.location_id=rewrite(c.home.location_id);
    if(c.home?.residence_id)c.home.residence_id=rewrite(c.home.residence_id);
    (c.schedule?.fixed_commitments||[]).forEach(fix);
  });
  if(place.background==='bg_'+old)place.background='bg_'+next;
  place.id=next;return next;
}

/** Location dropdown grouped by district, with every room as its own option. */
function placeOptions(current){
  const groups={};
  P.locations.forEach(l=>{
    const d=l.district||'other';
    (groups[d]=groups[d]||[]).push(l);
  });
  const label=id=>(DISTRICTS.find(x=>x.id===id)||{}).name||pretty(id);
  const invalid=current&&(!loc(locPart(current))||(roomPart(current)&&!roomOf(current)))
    ? '<option value="'+esc(current)+'" selected>⚠ Unknown — '+esc(current)+'</option>':'';
  return '<option value="">— nowhere —</option>'+invalid+
    Object.keys(groups).sort((a,b)=>label(a).localeCompare(label(b))).map(d=>
      '<optgroup label="'+esc(label(d))+'">'+
      groups[d].map(l=>{
        const own='<option value="'+esc(l.id)+'"'+(current===l.id?' selected':'')+'>'+
          esc(l.name)+'</option>';
        const rooms=(l.rooms||[]).map(r=>{
          const ref=l.id+'.'+r.id;
          return '<option value="'+esc(ref)+'"'+(current===ref?' selected':'')+'>'+
            '  '+esc(l.name)+' — '+esc(r.name)+'</option>';
        }).join('');
        return own+rooms;
      }).join('')+'</optgroup>').join('');
}

/** What the model should know about where the scene is happening. */
function placeBrief(ref){
  const l=loc(locPart(ref));
  if(!l)return '';
  const r=roomOf(ref);
  const bits=[l.name+(r?' — '+r.name:'')];
  const d=DISTRICTS.find(x=>x.id===l.district);
  if(d)bits.push(d.name+': '+d.character);
  if(r&&r.actions?.length)bits.push('What happens in this room: '+r.actions.map(pretty).join(', '));
  else if(l.services?.length)bits.push('Services here: '+l.services.map(pretty).join(', '));
  if(l.residents?.length)bits.push('Lives here: '+l.residents.map(id=>chr(id)?.name||pretty(id)).join(', '));
  if(r&&r.access&&r.access!=='shared')bits.push('Access: '+pretty(r.access));
  if(l.notes)bits.push(l.notes);
  return bits.join('. ');
}
