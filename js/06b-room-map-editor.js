/* ============ visual room-map editor ============ */
let roomMapLocationId='',roomMapSelectedId='',roomMapAutoReturn=true,roomMapSuppressClick='';

const activeRoomMapLocation=()=>loc(roomMapLocationId);
const activeRoomMapRoom=()=>activeRoomMapLocation()?.rooms?.find(room=>room.id===roomMapSelectedId)||null;

function saveRoomMap(location,fields=['rooms','outside_room','editor_layout']){
  rememberResidenceOverride(location,fields);save();paintPlaces();paintPlaceForm();
}

function roomMapRenderGeometry(location){
  const layout=ensureRoomMapLayout(location),rooms=location.rooms||[];
  const xs=rooms.map(room=>+layout[room.id]?.x||0),ys=rooms.map(room=>+layout[room.id]?.y||0);
  const minX=Math.min(0,...xs),minY=Math.min(0,...ys),unitX=176,unitY=104,pad=28;
  const points={};
  rooms.forEach(room=>{const point=layout[room.id]||{x:0,y:0};points[room.id]={
    x:(+point.x-minX)*unitX+pad,y:(+point.y-minY)*unitY+pad};});
  return {layout,points,minX,minY,unitX,unitY,pad,
    width:Math.max(620,(Math.max(0,...xs)-minX+1)*unitX+pad*2),
    height:Math.max(390,(Math.max(0,...ys)-minY+1)*unitY+pad*2)};
}

function roomMapCanvasHtml(location){
  const geometry=roomMapRenderGeometry(location),rooms=location.rooms||[],byId=new Map(rooms.map(room=>[room.id,room]));
  const seen=new Set(),lines=[];
  rooms.forEach(room=>ROOM_DIRECTIONS.forEach(direction=>{
    const target=effectiveRoomNavigation(location,room)[direction];if(!byId.has(target))return;
    const key=[room.id,target].sort().join('\u0000');if(seen.has(key))return;seen.add(key);
    const from=geometry.points[room.id],to=geometry.points[target],other=byId.get(target);
    const reciprocal=effectiveRoomNavigation(location,other)[ROOM_DIRECTION_OPPOSITE[direction]]===room.id;
    lines.push('<line x1="'+(from.x+70)+'" y1="'+(from.y+32)+'" x2="'+(to.x+70)+'" y2="'+(to.y+32)+'"'+
      ' marker-end="url(#room-map-arrow)"'+(reciprocal?' marker-start="url(#room-map-arrow-start)"':'')+
      ' class="'+(reciprocal?'two-way':'one-way')+'"/>');
  }));
  const entrance=location.outside_room||residenceEntranceId(location);
  const nodes=rooms.map(room=>{
    const point=geometry.points[room.id],navigation=effectiveRoomNavigation(location,room);
    const exits=ROOM_DIRECTIONS.filter(direction=>navigation[direction]).map(direction=>
      '<span title="'+esc(residenceRoomTarget(location,navigation[direction]))+'">'+
      (direction==='up'?'↑':direction==='right'?'→':direction==='down'?'↓':'←')+'</span>').join('');
    return '<button type="button" class="room-map-node'+(room.id===roomMapSelectedId?' selected':'')+
      (room.id===entrance?' entrance':'')+'" data-map-room="'+esc(room.id)+'" style="left:'+point.x+'px;top:'+point.y+'px">'+
      '<b>'+esc(room.name||pretty(room.id))+'</b><small>'+esc(room.id)+'</small><span class="room-map-node-meta">'+
      (room.id===entrance?'<i>entrance</i>':'')+'<em>'+esc(pretty(room.access||'shared'))+'</em></span>'+
      '<span class="room-map-node-exits">'+exits+'</span></button>';
  }).join('');
  return '<div class="room-map-canvas" id="roomMapCanvas" data-min-x="'+geometry.minX+'" data-min-y="'+geometry.minY+
    '" style="width:'+geometry.width+'px;height:'+geometry.height+'px">'+
    '<svg viewBox="0 0 '+geometry.width+' '+geometry.height+'" aria-hidden="true"><defs>'+
    '<marker id="room-map-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z"/></marker>'+
    '<marker id="room-map-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M8,0 L0,4 L8,8 z"/></marker>'+
    '</defs>'+lines.join('')+'</svg>'+nodes+'</div>';
}

function roomMapExitOptions(location,current){
  const local=(location.rooms||[]).map(room=>'<option value="'+esc(room.id)+'"'+(current===room.id?' selected':'')+'>'+esc(room.name)+'</option>').join('');
  const external=current&&String(current).includes('.')?'<option value="'+esc(current)+'" selected>External: '+esc(placeName(current))+'</option>':'';
  return '<option value="">— no arrow —</option>'+local+external;
}

function roomMapInspectorHtml(location,room){
  if(!room)return '<div class="room-map-empty"><b>No room selected</b><p>Add a room or choose one on the map.</p></div>';
  const packaged=location.tags?.includes('package'),navigation=effectiveRoomNavigation(location,room),
    entrance=location.outside_room||residenceEntranceId(location);
  return '<div class="room-map-inspector-head"><div><span>Selected room</span><h4>'+esc(room.name||pretty(room.id))+'</h4></div>'+
    '<button class="btn quiet" id="roomMapDuplicate">Duplicate</button><button class="btn danger" id="roomMapRemove">Remove</button></div>'+
    '<div class="field"><label>Room name</label><input id="roomMapRoomName" value="'+esc(room.name||'')+'"></div>'+
    '<div class="two"><div class="field"><label>Stable room id</label><input id="roomMapRoomId" value="'+esc(room.id)+'"'+
      (packaged?' readonly':'')+'></div><div class="field"><label>Access rule</label><input id="roomMapRoomAccess" list="roomAccessRules" value="'+esc(room.access||'shared')+'"></div></div>'+
    '<datalist id="roomAccessRules"><option value="shared"><option value="public"><option value="restricted"><option value="permission_required"><option value="relationship_permission"><option value="employee"><option value="appointment"><option value="occupied_lock"></datalist>'+
    '<div class="field"><label>Room actions</label><input id="roomMapRoomActions" value="'+esc((room.actions||[]).join(', '))+'" placeholder="talk, relax, cook"></div>'+
    '<label class="room-map-entrance-choice"><input type="checkbox" id="roomMapRoomEntrance"'+
      (entrance===room.id?' checked':'')+'> This is the location entrance</label>'+
    '<div class="room-map-exit-head"><b>Directional arrows</b><label><input type="checkbox" id="roomMapAutoReturn"'+
      (roomMapAutoReturn?' checked':'')+'> automatically add a return arrow</label></div>'+
    '<div class="room-map-exits">'+ROOM_DIRECTIONS.map(direction=>{
      const target=navigation[direction]||'',external=String(target).includes('.')?target:'';
      return '<div class="room-map-exit-row"><span class="direction">'+
        (direction==='up'?'↑':direction==='right'?'→':direction==='down'?'↓':'←')+' '+esc(pretty(direction))+'</span>'+
        '<select data-room-exit="'+direction+'">'+roomMapExitOptions(location,target)+'</select>'+
        '<input data-room-external="'+direction+'" value="'+esc(external)+'" placeholder="or location.room"></div>';
    }).join('')+'</div>'+
    '<p class="hint">Drag rooms on the map to arrange the authoring view. Moving a box does not change travel; directional arrows do.</p>';
}

function roomMapIssuesHtml(location){
  const issues=roomMapIssues(location);
  if(!issues.length)return '<div class="room-map-issues clear"><b>Map check passed</b><span>Every room and arrow resolves.</span></div>';
  return '<div class="room-map-issues">'+issues.map(issue=>'<button type="button" data-map-issue-room="'+esc(issue.room||'')+'" class="'+issue.severity+'"><b>'+esc(issue.severity)+'</b> '+esc(issue.message)+'</button>').join('')+'</div>';
}

function paintRoomMapEditor(){
  const location=activeRoomMapLocation();if(!location)return;
  location.rooms=Array.isArray(location.rooms)?location.rooms:[];ensureRoomMapLayout(location);
  if(!location.rooms.some(room=>room.id===roomMapSelectedId))roomMapSelectedId=location.rooms[0]?.id||'';
  const district=DISTRICTS.find(item=>item.id===location.district),special=residenceLayout(location);
  const entrance=location.outside_room||residenceEntranceId(location);
  const errors=roomMapIssues(location).filter(issue=>issue.severity==='error').length;
  $('roomMapTitle').textContent=location.name+' · room map';
  $('roomMapHealth').textContent=errors?errors+' error'+(errors===1?'':'s'):'map ready';
  $('roomMapHealth').classList.toggle('bad',!!errors);
  $('roomMapBody').innerHTML='<div class="room-map-location-bar"><span><b>'+esc(location.name)+'</b>'+esc(pretty(location.type||'location'))+'</span>'+
    '<span><b>District</b>'+esc(district?.name||pretty(location.district||'unassigned'))+'</span>'+
    '<span><b>Rooms</b>'+location.rooms.length+'</span><label>Entrance <select id="roomMapEntrance"><option value="">— choose —</option>'+
    location.rooms.map(room=>'<option value="'+esc(room.id)+'"'+(entrance===room.id?' selected':'')+'>'+esc(room.name)+'</option>').join('')+'</select></label></div>'+
    (special?'<div class="room-map-runtime-note">This location has a legacy Godot runtime layout. It is visible here; editing an arrow copies that layout into this project’s location data. <button class="btn quiet" id="roomMapMaterialize">Copy runtime arrows now</button></div>':'')+
    '<div class="room-map-workspace"><section class="room-map-stage"><div class="room-map-scroll">'+roomMapCanvasHtml(location)+'</div>'+roomMapIssuesHtml(location)+'</section>'+
    '<aside class="room-map-inspector">'+roomMapInspectorHtml(location,activeRoomMapRoom())+'</aside></div>';
  wireRoomMapEditor(location);
}

function roomMapCommit(location,{repaint=true}={}){
  saveRoomMap(location);if(repaint)paintRoomMapEditor();
}

function wireRoomMapDrag(location){
  const canvas=$('roomMapCanvas');if(!canvas)return;
  canvas.querySelectorAll('[data-map-room]').forEach(node=>{
    let origin=null;
    node.onclick=()=>{if(roomMapSuppressClick===node.dataset.mapRoom){roomMapSuppressClick='';return;}
      roomMapSelectedId=node.dataset.mapRoom;paintRoomMapEditor();};
    node.onpointerdown=event=>{origin={x:event.clientX,y:event.clientY,left:parseFloat(node.style.left),top:parseFloat(node.style.top),moved:false};
      node.setPointerCapture(event.pointerId);};
    node.onpointermove=event=>{if(!origin)return;const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
      if(Math.abs(dx)+Math.abs(dy)>6)origin.moved=true;
      if(origin.moved)node.style.transform='translate('+dx+'px,'+dy+'px)';};
    node.onpointerup=event=>{if(!origin)return;const state=origin;origin=null;node.releasePointerCapture(event.pointerId);
      if(!state.moved){node.style.transform='';return;}
      const layout=roomMapLayout(location),minX=+canvas.dataset.minX||0,minY=+canvas.dataset.minY||0;
      layout[node.dataset.mapRoom]={x:Math.round((state.left+event.clientX-state.x-28)/176)+minX,
        y:Math.round((state.top+event.clientY-state.y-28)/104)+minY};
      roomMapSuppressClick=node.dataset.mapRoom;roomMapCommit(location);
    };
  });
}

function wireRoomMapEditor(location){
  const room=activeRoomMapRoom();wireRoomMapDrag(location);
  $('roomMapEntrance').onchange=event=>{location.outside_room=event.target.value;roomMapCommit(location);};
  $('roomMapBody').querySelectorAll('[data-map-issue-room]').forEach(button=>button.onclick=()=>{
    if(button.dataset.mapIssueRoom){roomMapSelectedId=button.dataset.mapIssueRoom;paintRoomMapEditor();}
  });
  if($('roomMapMaterialize'))$('roomMapMaterialize').onclick=()=>{materializeSpecialResidenceLayout(location);
    autoRoomMapLayout(location);roomMapCommit(location);};
  if(!room)return;
  $('roomMapRoomName').onchange=event=>{const value=event.target.value.trim();if(value)room.name=value;
    roomMapCommit(location);};
  $('roomMapRoomId').onchange=event=>{const actual=renameRoomId(location,room,event.target.value);
    if(actual!==slug(event.target.value))note('That room id is already in use. The old id was kept.');
    roomMapSelectedId=actual;roomMapCommit(location);};
  $('roomMapRoomAccess').onchange=event=>{room.access=slug(event.target.value||'shared');roomMapCommit(location);};
  $('roomMapRoomActions').onchange=event=>{room.actions=[...new Set(String(event.target.value||'').split(',').map(value=>value.trim()).filter(Boolean).map(slug))];roomMapCommit(location);};
  $('roomMapRoomEntrance').onchange=event=>{location.outside_room=event.target.checked?room.id:'';roomMapCommit(location);};
  $('roomMapAutoReturn').onchange=event=>{roomMapAutoReturn=event.target.checked;};
  $('roomMapDuplicate').onclick=()=>{const copy=addLocationRoom(location,(room.name||pretty(room.id))+' Copy');
    copy.access=room.access||'shared';copy.actions=JSON.parse(JSON.stringify(room.actions||[]));
    roomMapSelectedId=copy.id;roomMapCommit(location);};
  $('roomMapRemove').onclick=()=>{
    if(!confirm('Remove '+(room.name||room.id)+' from this location? Existing story references will remain visible as validation errors.'))return;
    removeLocationRoom(location,room.id);roomMapSelectedId=location.rooms[0]?.id||'';roomMapCommit(location);
  };
  $('roomMapBody').querySelectorAll('[data-room-exit]').forEach(select=>select.onchange=()=>{
    setRoomExit(location,room,select.dataset.roomExit,select.value,{addReturn:roomMapAutoReturn});roomMapCommit(location);
  });
  $('roomMapBody').querySelectorAll('[data-room-external]').forEach(input=>input.onchange=()=>{
    const value=input.value.trim(),resolved=value?resolvePlaceRef(value):'';
    if(value&&!resolved){note('That external room is not in the location registry.');input.value=effectiveRoomNavigation(location,room)[input.dataset.roomExternal]||'';return;}
    setRoomExit(location,room,input.dataset.roomExternal,resolved||'',{addReturn:false});roomMapCommit(location);
  });
}

function openRoomMapEditor(location){
  if(!location)return;roomMapLocationId=location.id;roomMapSelectedId=location.outside_room||
    residenceEntranceId(location)||location.rooms?.[0]?.id||'';
  ensureRoomMapLayout(location);rememberResidenceOverride(location,['editor_layout']);save();
  paintRoomMapEditor();$('roomMapEditor').showModal();
}

$('roomMapClose').onclick=()=>$('roomMapEditor').close();
$('roomMapAuto').onclick=()=>{const location=activeRoomMapLocation();if(!location)return;
  autoRoomMapLayout(location);roomMapCommit(location);};
$('roomMapAdd').onclick=()=>{const location=activeRoomMapLocation();if(!location)return;
  const room=addLocationRoom(location);roomMapSelectedId=room.id;roomMapCommit(location);};
$('roomMapDownload').onclick=()=>{
  const location=activeRoomMapLocation();if(!location)return;
  const packageData={format_version:1,package_kind:'location_patch',reference_format:'location_id.room_id',
    locations:[locationExportRecord(location)]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(packageData,null,2)],{type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:location.id+'.location.json'}).click();URL.revokeObjectURL(url);
};
