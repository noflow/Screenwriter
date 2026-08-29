/* ============ project-wide NPC Schedule Workshop ============ */
const SCHEDULE_ROTATION_DAYS=Object.freeze([
  'rotation_day_1','rotation_day_2','rotation_day_3','rotation_day_4',
  'first_day_off','second_day_off','third_day_off'
]);
const SCHEDULE_CATEGORIES=Object.freeze([
  'work','school','home','health','errands','social','hobby','personal','travel','other'
]);
const SCHEDULE_TEMPLATES=Object.freeze({
  college_week:{name:'College weekdays',days:['monday','tuesday','wednesday','thursday','friday'],
    blocks:['morning','lunch','afternoon'],activity:'classes',label:'Attending classes',category:'school',unavailable:true},
  office_week:{name:'Weekday job',days:['monday','tuesday','wednesday','thursday','friday'],
    blocks:['morning','lunch','afternoon'],activity:'work_shift',label:'Working',category:'work',unavailable:true},
  restaurant_week:{name:'Restaurant evenings',days:['wednesday','thursday','friday','saturday','sunday'],
    blocks:['afternoon','evening','late_evening'],activity:'restaurant_shift',label:'Working a restaurant shift',category:'work',unavailable:true},
  weekend_shift:{name:'Weekend job',days:['saturday','sunday'],blocks:['morning','lunch','afternoon','evening'],
    activity:'weekend_shift',label:'Working a weekend shift',category:'work',unavailable:true},
  four_on_three_off:{name:'Four on, three off',days:['rotation_day_1','rotation_day_2','rotation_day_3','rotation_day_4'],
    blocks:['early_morning','morning','lunch','afternoon'],activity:'rotating_shift',label:'Working a rotating shift',
    category:'work',unavailable:true,rotation:'four_on_three_off'}
});

let swCharacterId='',swTab='week',swLayer='fixed',swSelected=new Set(),swLast='',swGroup=new Set();

const scheduleWorkshopCharacter=()=>npcs().find(character=>character.id===swCharacterId)||null;
const scheduleDayLabel=day=>({first_day_off:'First day off',second_day_off:'Second day off',
  third_day_off:'Third day off'}[day]||pretty(day));

function scheduleWorkshopDays(character){
  const found=[];
  ['fixed_commitments','public_presence'].forEach(key=>(character?.schedule?.[key]||[])
    .forEach(entry=>(entry.days||[]).forEach(day=>{if(!found.includes(day))found.push(day);})));
  const rotating=found.some(day=>SCHEDULE_ROTATION_DAYS.includes(day))||!!character?.schedule?.rotation;
  const weekly=found.some(day=>DAYS.includes(day));
  if(rotating&&!weekly)return SCHEDULE_ROTATION_DAYS.slice();
  if(rotating)return DAYS.concat(SCHEDULE_ROTATION_DAYS.filter(day=>found.includes(day)));
  return DAYS.slice();
}

function schedulePublicGrid(character){
  return scheduleGrid({home:character.home,schedule:{fixed_commitments:
    character.schedule?.public_presence||[]}});
}

function schedulePreferenceMatches(character,day,block){
  const preferences=character?.schedule?.preferred_social_blocks||[];
  return preferences.includes(block)||preferences.includes(day+'_'+block);
}

function setSchedulePreferenceCells(character,keys,enabled){
  character.schedule=character.schedule||{};
  const days=scheduleWorkshopDays(character),preferences=new Set(character.schedule.preferred_social_blocks||[]);
  // Expand a broad block preference before changing one cell, so the remaining
  // days keep their previous meaning.
  [...new Set(keys.map(key=>key.split('|')[1]))].forEach(block=>{
    if(!preferences.has(block))return;
    preferences.delete(block);days.forEach(day=>preferences.add(day+'_'+block));
  });
  keys.forEach(key=>{
    const [day,block]=key.split('|'),token=day+'_'+block;
    enabled?preferences.add(token):preferences.delete(token);
  });
  // Weekly all-day columns compress back to the runtime's supported broad form.
  if(days.length===DAYS.length)BLOCKS.forEach(block=>{
    if(DAYS.every(day=>preferences.has(day+'_'+block))){
      DAYS.forEach(day=>preferences.delete(day+'_'+block));preferences.add(block);
    }
  });
  character.schedule.preferred_social_blocks=[...preferences];
}

function scheduleEntryIssues(character,entries,source){
  const issues=[],occupied=new Map();
  (entries||[]).forEach((entry,index)=>{
    const where=(source==='public'?'Public presence ':'Commitment ')+(index+1);
    if(!(entry.days||[]).length)issues.push({severity:'error',message:where+' has no days.'});
    if(!(entry.blocks||[]).length)issues.push({severity:'error',message:where+' has no activity blocks.'});
    (entry.blocks||[]).filter(block=>!BLOCKS.includes(block)).forEach(block=>
      issues.push({severity:'error',message:where+' uses unknown block '+pretty(block)+'.'}));
    if(!String(entry.activity||'').trim())issues.push({severity:'warning',message:where+' has no activity id.'});
    const location=String(entry.location||'');
    if(!location)issues.push({severity:'error',message:where+' has no location.'});
    else if(!loc(locPart(location)))issues.push({severity:'error',message:where+' uses missing location '+location+'.'});
    else if(!roomPart(location)&&!entry.home_placement)
      issues.push({severity:'warning',message:where+' should point to an exact room.'});
    else if(roomPart(location)&&!roomOf(location))
      issues.push({severity:'error',message:where+' uses missing room '+location+'.'});
    (entry.days||[]).forEach(day=>(entry.blocks||[]).forEach(block=>{
      const key=day+'|'+block;
      if(occupied.has(key))issues.push({severity:'error',message:where+' overlaps '+occupied.get(key)+' at '+
        scheduleDayLabel(day)+' · '+pretty(block)+'.'});
      else occupied.set(key,where);
    }));
  });
  return {issues,occupied};
}

function scheduleWorkshopIssues(character){
  const fixed=scheduleEntryIssues(character,character.schedule?.fixed_commitments||[],'fixed');
  const publicRows=scheduleEntryIssues(character,character.schedule?.public_presence||[],'public');
  const issues=fixed.issues.concat(publicRows.issues),days=scheduleWorkshopDays(character);
  publicRows.occupied.forEach((where,key)=>{
    if(fixed.occupied.has(key))issues.push({severity:'warning',message:where+' is hidden by '+fixed.occupied.get(key)+
      ' at '+scheduleDayLabel(key.split('|')[0])+' · '+pretty(key.split('|')[1])+'.'});
  });
  (character.schedule?.preferred_social_blocks||[]).forEach(token=>{
    const broad=BLOCKS.includes(token),matches=broad?days.map(day=>day+'|'+token):days.flatMap(day=>
      BLOCKS.filter(block=>token===day+'_'+block).map(block=>day+'|'+block));
    if(!matches.length)issues.push({severity:'warning',message:'Preferred social time "'+pretty(token)+'" is not a valid slot for this schedule.'});
    matches.filter(key=>fixed.occupied.has(key)&&scheduleGrid(character)[key]?.unavailable).forEach(key=>
      issues.push({severity:'warning',message:'Preferred social time '+scheduleDayLabel(key.split('|')[0])+' · '+
        pretty(key.split('|')[1])+' conflicts with a busy commitment.'}));
  });
  const busy=Object.values(scheduleGrid(character)).filter(cell=>cell.unavailable).length;
  if(!busy)issues.push({severity:'warning',message:'No unavailable work, school, or personal commitments are defined.'});
  if(!(character.schedule?.preferred_social_blocks||[]).length)
    issues.push({severity:'info',message:'No preferred date or hangout times are defined.'});
  if(!(character.schedule?.public_presence||[]).length)
    issues.push({severity:'info',message:'No public-presence windows are defined for organic encounters.'});
  return issues;
}

function scheduleGroupAvailability(characters){
  const rows=[];
  DAYS.forEach((day,dayIndex)=>BLOCKS.forEach((block,blockIndex)=>{
    let busy=0,preferred=0,variable=0;const details=[];
    characters.forEach(character=>{
      const rotating=scheduleWorkshopDays(character).some(value=>SCHEDULE_ROTATION_DAYS.includes(value));
      const slot=availability(character,day,block);
      if(rotating&&!scheduleGrid(character)[day+'|'+block])variable++;
      else if(!slot.free)busy++;
      if(schedulePreferenceMatches(character,day,block))preferred++;
      details.push({character:character.id,free:slot.free,variable:rotating&&!scheduleGrid(character)[day+'|'+block],
        preferred:schedulePreferenceMatches(character,day,block),why:slot.why});
    });
    rows.push({day,block,busy,preferred,variable,details,
      score:busy*100+variable*20-preferred*5+dayIndex+blockIndex/10});
  }));
  return rows.sort((left,right)=>left.score-right.score);
}

function applyScheduleTemplate(character,templateId,location){
  const template=SCHEDULE_TEMPLATES[templateId];if(!template)return 0;
  const grid=scheduleGrid(character);
  template.days.forEach(day=>template.blocks.forEach(block=>{
    const key=day+'|'+block,prior=grid[key]||{};
    grid[key]={activity:template.activity,location,unavailable:template.unavailable,
      _meta:Object.assign({},prior._meta||{},{label:template.label,category:template.category})};
  }));
  character.schedule=character.schedule||{};
  character.schedule.fixed_commitments=gridToCommitments(grid,character);
  if(template.rotation){character.schedule.rotation=template.rotation;character.schedule.days_off=['variable'];}
  return template.days.length*template.blocks.length;
}

function scheduleWorkshopSummary(character){
  const fixed=scheduleGrid(character),publicGrid=schedulePublicGrid(character),days=scheduleWorkshopDays(character);
  let preferred=0;days.forEach(day=>BLOCKS.forEach(block=>{
    if(schedulePreferenceMatches(character,day,block))preferred++;
  }));
  return {busy:Object.values(fixed).filter(cell=>cell.unavailable).length,
    flexible:Object.values(fixed).filter(cell=>!cell.unavailable).length,
    public:Object.keys(publicGrid).length,preferred,issues:scheduleWorkshopIssues(character).length};
}

function scheduleWorkshopSidebarHtml(){
  return '<aside class="schedule-workshop-sidebar"><div class="schedule-sidebar-title"><span>Characters</span><small>check to compare</small></div>'+npcs().map(character=>{
    const summary=scheduleWorkshopSummary(character),active=character.id===swCharacterId;
    return '<div class="schedule-character-row'+(active?' active':'')+'"><label><input type="checkbox" data-sw-group="'+
      esc(character.id)+'"'+(swGroup.has(character.id)?' checked':'')+' title="Include in group availability"></label><button data-sw-character="'+
      esc(character.id)+'"><b>'+esc(character.name)+'</b><span>'+summary.busy+' busy · '+summary.public+' public · '+summary.preferred+
      ' preferred</span><small>'+summary.issues+' note'+(summary.issues===1?'':'s')+'</small></button></div>';
  }).join('')+'</aside>';
}

function scheduleGridCellHtml(character,day,block,fixed,publicGrid){
  const key=day+'|'+block,commitment=fixed[key],presence=publicGrid[key],preferred=schedulePreferenceMatches(character,day,block),
    dayOff=(character.schedule?.days_off||[]).includes(day),selected=swSelected.has(key);
  const classes=['schedule-workshop-cell',selected?'selected':'',commitment?'committed':'',
    commitment?.unavailable?'busy':'',presence?'public':'',preferred?'preferred':'',dayOff?'day-off':''].filter(Boolean).join(' ');
  return '<td><button class="'+classes+'" data-sw-slot="'+key+'" title="'+esc(scheduleDayLabel(day)+' · '+pretty(block))+'">'+
    (commitment?'<b>'+esc(commitment._meta?.label||pretty(commitment.activity||'commitment'))+'</b><small>'+esc(commitment.location?placeName(commitment.location):'No location')+'</small>':'')+
    (presence?'<em>'+esc(presence._meta?.label||pretty(presence.activity||'public presence'))+'</em>':'')+
    (preferred?'<i>preferred</i>':'')+(!commitment&&!presence&&!preferred?'<span>free</span>':'')+'</button></td>';
}

function scheduleWorkshopGridHtml(character){
  const fixed=scheduleGrid(character),publicGrid=schedulePublicGrid(character),days=scheduleWorkshopDays(character);
  return '<div class="schedule-workshop-grid-scroll"><table class="schedule-workshop-grid"><thead><tr><th></th>'+BLOCKS.map(block=>
    '<th><button data-sw-col="'+block+'">'+esc(pretty(block))+'</button></th>').join('')+'</tr></thead><tbody>'+days.map(day=>
      '<tr><th><button data-sw-row="'+day+'">'+esc(scheduleDayLabel(day))+'</button></th>'+BLOCKS.map(block=>
        scheduleGridCellHtml(character,day,block,fixed,publicGrid)).join('')+'</tr>').join('')+'</tbody></table></div>';
}

function scheduleSelectedValue(character){
  if(swSelected.size!==1)return null;
  const key=[...swSelected][0];
  if(swLayer==='fixed')return scheduleGrid(character)[key]||null;
  if(swLayer==='public')return schedulePublicGrid(character)[key]||null;
  return null;
}

function scheduleWorkshopInspectorHtml(character){
  const value=scheduleSelectedValue(character),days=scheduleWorkshopDays(character),rotation=days.some(day=>SCHEDULE_ROTATION_DAYS.includes(day));
  return '<aside class="schedule-workshop-inspector"><div class="schedule-layer-tabs">'+[
    ['fixed','Commitment'],['public','Public presence'],['preferred','Preferred time']].map(([id,label])=>
      '<button data-sw-layer="'+id+'" class="'+(swLayer===id?'active':'')+'">'+label+'</button>').join('')+'</div>'+(
    swLayer==='preferred'?'<div class="schedule-preferred-editor"><b>Preferred dates and hangouts</b><p>Selected slots become times this character prefers. Selecting an existing preferred slot and applying removes it.</p></div>':
    '<div class="field"><label>Activity id</label><input id="swActivity" value="'+esc(value?.activity||'')+'" placeholder="work_shift"></div>'+
    '<div class="field"><label>Player-facing label</label><input id="swLabel" value="'+esc(value?._meta?.label||'')+'" placeholder="Working at the restaurant"></div>'+
    '<div class="field"><label>Category</label><select id="swCategory">'+SCHEDULE_CATEGORIES.map(category=>
      '<option value="'+category+'"'+((value?._meta?.category||'other')===category?' selected':'')+'>'+pretty(category)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Exact location and room</label><select id="swLocation">'+placeOptions(value?.location||'')+'</select></div>'+
    '<label class="schedule-busy-check"><input type="checkbox" id="swUnavailable"'+(swLayer==='fixed'&&(value?.unavailable??true)?' checked':'')+
      (swLayer==='public'?' disabled':'')+'> Cannot accept dates or stop to socialize</label>')+
    '<div class="schedule-selection-actions"><button class="btn gold" id="swApply"'+(!swSelected.size?' disabled':'')+'>'+
      (swLayer==='preferred'?'Toggle preferred':'Apply to '+swSelected.size+' slot'+(swSelected.size===1?'':'s'))+'</button><button class="btn" id="swClear"'+
      (!swSelected.size?' disabled':'')+'>Clear selected</button></div><div id="swMessage" class="hint"></div>'+
    '<details class="schedule-template-panel"><summary>Fill from a schedule template</summary><p>Templates add or update their normal slots and preserve everything else. Choose an exact room first.</p>'+
      '<div class="schedule-template-list">'+Object.entries(SCHEDULE_TEMPLATES).map(([id,template])=>
        '<button data-sw-template="'+id+'"><b>'+esc(template.name)+'</b><span>'+template.days.length+' days · '+template.blocks.length+' blocks</span></button>').join('')+'</div></details>'+
    '<details class="schedule-days-off" open><summary>Days off</summary><div>'+days.map(day=>'<label><input type="checkbox" data-sw-day-off="'+day+'"'+
      ((character.schedule?.days_off||[]).includes(day)?' checked':'')+'>'+esc(scheduleDayLabel(day))+'</label>').join('')+'</div>'+
      (rotation?'<p>This character uses a seven-day rotation. Runtime dates resolve rotation days automatically.</p>':'')+'</details></aside>';
}

function scheduleWeekHtml(character){
  const summary=scheduleWorkshopSummary(character);
  return '<div class="schedule-character-summary"><div><span>Character</span><b>'+esc(character.name)+'</b><small>'+esc(character.profile?.occupation||pretty(character.profile?.role||''))+'</small></div>'+
    '<div><span>Busy</span><b>'+summary.busy+'</b></div><div><span>Flexible commitments</span><b>'+summary.flexible+'</b></div><div><span>Public windows</span><b>'+summary.public+'</b></div><div><span>Preferred slots</span><b>'+summary.preferred+'</b></div></div>'+
    '<div class="schedule-week-layout"><main>'+scheduleWorkshopGridHtml(character)+'<div class="schedule-grid-legend"><span class="busy">Busy commitment</span><span class="flex">Flexible commitment</span><span class="public">Public encounter</span><span class="preferred">Preferred social time</span><span class="day-off">Day off</span></div></main>'+scheduleWorkshopInspectorHtml(character)+'</div>';
}

function scheduleGroupHtml(){
  const characters=npcs().filter(character=>swGroup.has(character.id));
  if(!characters.length)return '<div class="schedule-empty"><b>Choose characters to compare</b><p>Use the checkboxes in the left column, then the best shared times will be ranked here.</p></div>';
  const rows=scheduleGroupAvailability(characters);
  return '<div class="schedule-group-head"><div><span>Comparing</span><b>'+characters.length+' characters</b><small>'+characters.map(character=>character.name).join(' · ')+'</small></div>'+
    '<p>Times are ranked by fewest busy or rotating schedules, then by how many characters prefer the slot.</p></div><div class="schedule-group-grid">'+rows.map((row,index)=>
      '<div class="schedule-group-slot'+(row.busy?' blocked':'')+(row.variable?' variable':'')+'"><span>#'+(index+1)+'</span><b>'+esc(pretty(row.day))+' · '+esc(pretty(row.block))+'</b>'+
      '<div><em>'+row.busy+' busy</em><em>'+row.variable+' rotating</em><em>'+row.preferred+' prefer it</em></div><details><summary>Everyone</summary>'+row.details.map(detail=>{
        const character=characters.find(item=>item.id===detail.character);
        return '<p><b>'+esc(character?.name||pretty(detail.character))+'</b><span>'+esc(detail.variable?'rotating schedule':detail.free?detail.preferred?'free · preferred':'free':detail.why)+'</span></p>';
      }).join('')+'</details></div>').join('')+'</div>';
}

function scheduleIssuesHtml(){
  const rows=npcs().flatMap(character=>scheduleWorkshopIssues(character).map(issue=>({...issue,character})));
  if(!rows.length)return '<div class="schedule-empty clear"><b>All schedules pass</b><p>No conflicts or missing references were found.</p></div>';
  const rank={error:0,warning:1,info:2};rows.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.character.name.localeCompare(b.character.name));
  return '<div class="schedule-issue-report"><div class="schedule-issue-summary"><b>'+rows.filter(row=>row.severity==='error').length+' errors</b><span>'+rows.filter(row=>row.severity==='warning').length+' warnings</span><span>'+rows.filter(row=>row.severity==='info').length+' notes</span></div>'+rows.map(row=>
    '<button data-sw-issue-character="'+esc(row.character.id)+'" class="'+row.severity+'"><b>'+esc(row.severity)+'</b><span>'+esc(row.message)+'<small>'+esc(row.character.name)+'</small></span></button>').join('')+'</div>';
}

function paintScheduleWorkshop(){
  const body=$('scheduleWorkshopBody'),character=scheduleWorkshopCharacter()||npcs()[0];
  if(!character){body.innerHTML='<div class="schedule-empty"><b>No NPC sheets loaded</b></div>';return;}
  swCharacterId=character.id;if(!swGroup.size)swGroup.add(character.id);
  body.innerHTML='<div class="schedule-workshop-layout">'+scheduleWorkshopSidebarHtml()+'<section class="schedule-workshop-main"><nav class="schedule-workshop-tabs">'+[
    ['week','Character schedule'],['group','Group availability'],['issues','Conflict report']].map(([id,label])=>
      '<button data-sw-tab="'+id+'" class="'+(swTab===id?'active':'')+'">'+label+'</button>').join('')+'</nav><div class="schedule-workshop-content">'+
    (swTab==='week'?scheduleWeekHtml(character):swTab==='group'?scheduleGroupHtml():scheduleIssuesHtml())+'</div></section></div>';
  wireScheduleWorkshop();
}

function scheduleSelectSlot(key,shift){
  if(shift&&swLast){
    const character=scheduleWorkshopCharacter(),days=scheduleWorkshopDays(character),[d1,b1]=swLast.split('|'),[d2,b2]=key.split('|');
    const dr=[days.indexOf(d1),days.indexOf(d2)].sort((a,b)=>a-b),br=[BLOCKS.indexOf(b1),BLOCKS.indexOf(b2)].sort((a,b)=>a-b);
    if(dr[0]>=0&&br[0]>=0)for(let day=dr[0];day<=dr[1];day++)for(let block=br[0];block<=br[1];block++)swSelected.add(days[day]+'|'+BLOCKS[block]);
  }else{swSelected.has(key)?swSelected.delete(key):swSelected.add(key);swLast=key;}
  paintScheduleWorkshop();
}

function applyScheduleWorkshopSelection(clear=false){
  const character=scheduleWorkshopCharacter();if(!character||!swSelected.size)return;
  const keys=[...swSelected];character.schedule=character.schedule||{};
  if(swLayer==='preferred'){
    const enabled=!clear&&!keys.every(key=>schedulePreferenceMatches(character,...key.split('|')));
    setSchedulePreferenceCells(character,keys,enabled);
  }else{
    const publicLayer=swLayer==='public',grid=publicLayer?schedulePublicGrid(character):scheduleGrid(character);
    if(!clear){
      const location=$('swLocation').value,activity=slug($('swActivity').value||'')||slug(location);
      if(!location||!activity){
        $('swMessage').textContent='Choose an exact location and enter an activity before applying these slots.';
        return;
      }
    }
    keys.forEach(key=>{
      if(clear){delete grid[key];return;}
      const previous=grid[key]||{},location=$('swLocation').value,activity=slug($('swActivity').value||'')||slug(location);
      grid[key]={activity,location,unavailable:publicLayer?false:$('swUnavailable').checked,
        _meta:Object.assign({},previous._meta||{},{label:$('swLabel').value.trim()||pretty(activity),category:$('swCategory').value})};
    });
    const entries=gridToCommitments(grid,character);
    if(publicLayer)character.schedule.public_presence=entries.map(entry=>Object.assign(entry,{unavailable:false}));
    else character.schedule.fixed_commitments=entries;
  }
  save();paintScheduleWorkshop();
}

function wireScheduleWorkshop(){
  const character=scheduleWorkshopCharacter();
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-character]').forEach(button=>button.onclick=()=>{
    swCharacterId=button.dataset.swCharacter;swSelected.clear();swLast='';swTab='week';paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-group]').forEach(input=>input.onchange=()=>{
    input.checked?swGroup.add(input.dataset.swGroup):swGroup.delete(input.dataset.swGroup);paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-tab]').forEach(button=>button.onclick=()=>{
    swTab=button.dataset.swTab;paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-issue-character]').forEach(button=>button.onclick=()=>{
    swCharacterId=button.dataset.swIssueCharacter;swTab='week';swSelected.clear();paintScheduleWorkshop();
  });
  if(swTab!=='week')return;
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-slot]').forEach(button=>button.onclick=event=>
    scheduleSelectSlot(button.dataset.swSlot,event.shiftKey));
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-row]').forEach(button=>button.onclick=()=>{
    const keys=BLOCKS.map(block=>button.dataset.swRow+'|'+block),all=keys.every(key=>swSelected.has(key));
    keys.forEach(key=>all?swSelected.delete(key):swSelected.add(key));paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-col]').forEach(button=>button.onclick=()=>{
    const keys=scheduleWorkshopDays(character).map(day=>day+'|'+button.dataset.swCol),all=keys.every(key=>swSelected.has(key));
    keys.forEach(key=>all?swSelected.delete(key):swSelected.add(key));paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-layer]').forEach(button=>button.onclick=()=>{
    swLayer=button.dataset.swLayer;paintScheduleWorkshop();
  });
  $('swApply').onclick=()=>applyScheduleWorkshopSelection(false);
  $('swClear').onclick=()=>applyScheduleWorkshopSelection(true);
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-day-off]').forEach(input=>input.onchange=()=>{
    const values=new Set(character.schedule.days_off||[]);input.checked?values.add(input.dataset.swDayOff):values.delete(input.dataset.swDayOff);
    character.schedule.days_off=[...values];save();paintScheduleWorkshop();
  });
  $('scheduleWorkshopBody').querySelectorAll('[data-sw-template]').forEach(button=>button.onclick=()=>{
    const location=$('swLocation')?.value||'';
    if(!location){$('swMessage').textContent='Choose an exact location and room before filling a template.';return;}
    const count=applyScheduleTemplate(character,button.dataset.swTemplate,location);save();swSelected.clear();paintScheduleWorkshop();note('Filled '+count+' schedule slots for '+esc(character.name)+'.');
  });
}

function openScheduleWorkshop(characterId=''){
  const character=npcs().find(item=>item.id===characterId)||npcs()[0];if(!character)return raise('Import an NPC character sheet first.');
  swCharacterId=character.id;swSelected.clear();swLast='';if(!swGroup.size)swGroup.add(character.id);
  paintScheduleWorkshop();$('scheduleWorkshop').showModal();
}

if(typeof document!=='undefined'){
  $('openScheduleWorkshop').onclick=()=>openScheduleWorkshop();
  $('scheduleWorkshopClose').onclick=()=>{$('scheduleWorkshop').close();paintAll();};
}
