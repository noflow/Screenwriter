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
    const out={...l};delete out.background;delete out.tags;delete out.notes;
    Object.assign(out,{id:l.id||'',name:l.name||'',district:l.district||'',type:l.type||'',
      travel_node:l.travel_node!==false,access:l.access||{},privacy:l.privacy||null,
      residents:l.residents||[],services:l.services||[],housing:l.housing||null,
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
  P=Object.assign({characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[]},source);
  if(!Array.isArray(P.characters))P.characters=[];
  if(!Array.isArray(P.locations))P.locations=[];
  if(!Array.isArray(P.content))P.content=[];
  if(!Array.isArray(P.dismissedBundledCharacters))P.dismissedBundledCharacters=[];
  DISTRICTS=Array.isArray(P.districts)?P.districts:[];
  TRAVEL=P.travel||null;ALIASES=P.aliases||{};
  return refreshLocations?syncBundledLocations():null;
}

/** Bring saved/browser state up to the exact registry bundled from the game. */
function syncBundledLocations(){
  if(typeof BUNDLED_LOCATION_PACKAGE==='undefined')return null;
  if(sameLocationPackage(BUNDLED_LOCATION_PACKAGE)){
    P.locationPackage={id:BUNDLED_LOCATION_PACKAGE.package_id||'',
      signature:typeof BUNDLED_LOCATION_SIGNATURE==='undefined'?'':BUNDLED_LOCATION_SIGNATURE,
      source:'bundled'};
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
