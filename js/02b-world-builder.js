/* ============ world builder: optional stats and authored places ============ */
function customStatDefs(){
  return Array.isArray(P.custom_stats)?P.custom_stats:[];
}

function statDefinition(key){return customStatDefs().find(s=>s.id===key)||null;}

function paintWorldBuilder(){
  const box=$('worldStatsList');
  const stats=customStatDefs();
  box.innerHTML=stats.length?stats.map((s,i)=>
    '<div class="chip"><span class="swatch" style="background:var(--sage)"></span>'+esc(s.label)+
    '<span class="tag">'+s.id+' · '+s.minimum+'–'+s.maximum+' · starts '+s.default+'</span>'+
    '<button class="x" data-wsx="'+i+'">×</button></div>').join(''):
    '<p class="empty">No custom stats yet. Relationship meters are still available everywhere.</p>';
  box.querySelectorAll('[data-wsx]').forEach(b=>b.onclick=()=>{
    const removed=customStatDefs()[+b.dataset.wsx];
    P.custom_stats.splice(+b.dataset.wsx,1);
    P.characters.forEach(c=>{if(c.custom_stats)delete c.custom_stats[removed.id];});
    save();paintWorldBuilder();paintAll();
  });
}

function openWorldBuilder(){paintWorldBuilder();$('worldMessage').textContent='';$('worldBuilder').showModal();}

function customLocationsOut(){
  return {format_version:1,package_id:'scenewright_custom_locations',reference_format:'location_id.room_id',
    locations:P.locations.filter(l=>l.tags?.includes('custom')).map(l=>({id:l.id,name:l.name,
      district:l.district,type:l.type||'place',travel_node:l.travel_node!==false,
      access:l.access||{always_open:true},residents:l.residents||[],services:l.services||[],
      rooms:(l.rooms||[]).map(r=>({id:r.id,name:r.name,access:r.access||'shared',actions:r.actions||[]})),
      notes:l.notes||''}))};
}

function worldNumber(id,fallback){
  const value=Number($(id).value);
  return Number.isFinite(value)?value:fallback;
}

$('openWorld').onclick=openWorldBuilder;
$('closeWorld').onclick=()=>$('worldBuilder').close();
$('addWorldStat').onclick=()=>{
  const label=String($('wsLabel').value||'').trim();
  const id=slug(label);
  if(!id){$('worldMessage').textContent='Give the stat a name first.';return;}
  if(statDefinition(id)){ $('worldMessage').textContent='That stat already exists.';return;}
  const minimum=worldNumber('wsMin',0),maximum=worldNumber('wsMax',100);
  if(maximum<minimum){$('worldMessage').textContent='The maximum needs to be at least the minimum.';return;}
  const def={id,label,minimum,maximum,default:Math.max(minimum,Math.min(maximum,worldNumber('wsDefault',minimum)))};
  P.custom_stats=P.custom_stats||[];P.custom_stats.push(def);
  P.characters.forEach(c=>{c.custom_stats=c.custom_stats||{};c.custom_stats[id]=def.default;});
  $('wsLabel').value='';save();paintWorldBuilder();paintAll();
};
$('addWorldLocation').onclick=()=>{
  const name=String($('wlName').value||'').trim(),id=slug(name);
  if(!id){$('worldMessage').textContent='Give the location a name first.';return;}
  if(loc(id)){ $('worldMessage').textContent='A location with that id already exists.';return;}
	const roomNames=String($('wlRooms').value||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
	const roomIds=new Set(),rooms=[];let skippedRooms=0;
	roomNames.forEach(room=>{const roomId=slug(room);if(roomIds.has(roomId)){skippedRooms++;return;}
	  roomIds.add(roomId);rooms.push({id:roomId,name:room,access:'shared',actions:[]});});
	const district=slug($('wlDistrict').value||'')||(DISTRICTS[0]?.id||'');
	if(!district){$('worldMessage').textContent='Import the Port Alder locations first, then choose a district.';return;}
	P.locations.push({id,name,district,type:slug($('wlType').value||'place'),
    background:'',rooms,
    residents:[],services:[],tags:['custom'],notes:String($('wlNotes').value||'').trim()});
  selPlace=P.locations.length-1;
  ['wlName','wlDistrict','wlType','wlRooms','wlNotes'].forEach(x=>$(x).value='');
  $('worldMessage').textContent='Created '+name+' with '+rooms.length+' room'+(rooms.length===1?'':'s')+
    (skippedRooms?' ('+skippedRooms+' duplicate '+(skippedRooms===1?'name':'names')+' skipped)':'')+'.';
	save();paintAll();
};
$('downloadWorldLocations').onclick=()=>{
  const locations=customLocationsOut();
  if(!locations.locations.length){$('worldMessage').textContent='Create at least one custom location first.';return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(locations,null,2)],{type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:'scenewright_custom_locations.json'}).click();
  URL.revokeObjectURL(url);
  $('worldMessage').textContent='Downloaded the game package. Put it in the game content/world folder.';
};
