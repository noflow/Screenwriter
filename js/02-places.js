/* ============ location package ============ */
/* The game ships a real location registry — districts, 61 locations, rooms with access
   levels and actions. Scenewright's derived placeholders are guesses; this replaces them
   and remaps anything already written to point at the real ids. */

let DISTRICTS=[],TRAVEL=null,ALIASES={};

function isLocationPackage(d){
  return !!d&&Array.isArray(d.locations)&&(Array.isArray(d.districts)||d.reference_format);
}

/** Best guess at which real location an old placeholder id meant. */
function remapId(old,byId,byName){
  if(!old)return '';
  if(byId[old])return old;
  if(ALIASES[old]&&byId[ALIASES[old]])return ALIASES[old];
  if(byName[old])return byName[old];
  // A derived id may name a room rather than a place — find its parent.
  for(const l of P.locations){
    if((l.rooms||[]).some(r=>r.id===old||slug(r.name)===old))return l.id+'.'+old;
  }
  return '';
}

function importLocations(pkg){
  DISTRICTS=pkg.districts||[];
  TRAVEL=pkg.travel_rules||null;
  ALIASES=pkg.legacy_aliases||{};

  const kept=P.locations.filter(l=>l.tags?.includes('custom'));
  P.locations=pkg.locations.map(l=>({
    id:l.id,
    name:l.name,
    district:l.district||'',
    type:l.type||'',
    background:'bg_'+l.id,
    rooms:(l.rooms||[]).map(r=>({id:r.id,name:r.name,access:r.access||'',
      actions:r.actions||[]})),
    residents:l.residents||[],
    services:l.services||[],
    access:l.access||{},
    travel_node:l.travel_node!==false,
    tags:['package'],
    notes:''
  })).concat(kept);

  // Point existing content at the real ids instead of the guesses.
  const byId={},byName={};
  P.locations.forEach(l=>{byId[l.id]=l;byName[slug(l.name)]=l.id;});
  let moved=0,lost=[];
  const fix=o=>{
    if(!o||!o.location)return;
    const to=remapId(o.location,byId,byName);
    if(to&&to!==o.location){o.location=to;moved++;}
    else if(!to){lost.push(o.location);o.location='';}
  };
  P.content.forEach(c=>{fix(c);(c.stages||[]).forEach(fix);});

  // Schedules point at places too — a commitment still naming a placeholder would
  // keep reporting characters as being somewhere that no longer exists.
  let sched=0;const unplaced=[];
  P.characters.forEach(c=>{
    (c.schedule?.fixed_commitments||[]).forEach(f=>{
      const from=f.location||slug(f.activity||'');
      const to=remapId(from,byId,byName);
      if(to&&to!==f.location){f.location=to;sched++;}
      else if(!to){f.location='';unplaced.push(c.name+': '+pretty(from));}
    });
    // Home ids come from the sheet's own wording, so remap those as well.
    if(c.home?.residence){
      const to=remapId(slug(c.home.residence),byId,byName);
      if(to)c.home.residence_id=to;
    }
  });

  return {count:P.locations.length,districts:DISTRICTS.length,moved,sched,
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

/** Location dropdown grouped by district, with every room as its own option. */
function placeOptions(current){
  const groups={};
  P.locations.forEach(l=>{
    const d=l.district||'other';
    (groups[d]=groups[d]||[]).push(l);
  });
  const label=id=>(DISTRICTS.find(x=>x.id===id)||{}).name||pretty(id);
  return '<option value="">— nowhere —</option>'+
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
