/* ============ deployable Port Alder game packages ============ */
const GAME_PACKAGE_FORMAT='scenewright.game_package';
const GAME_PACKAGE_TARGET='port_alder_godot';

const packageClone=value=>JSON.parse(JSON.stringify(value));
const packageStable=value=>JSON.stringify(orderedJson(value));
const packageText=value=>JSON.stringify(value,null,2)+'\n';

function gameLocationPackageOut(){
  const source=typeof BUNDLED_LOCATION_PACKAGE==='undefined'?{}:BUNDLED_LOCATION_PACKAGE;
  return {
    format_version:source.format_version||1,
    package_id:source.package_id||'port_alder_all_locations',
    reference_format:source.reference_format||'location_id.room_id',
    districts:packageClone(typeof DISTRICTS==='undefined'?(P.districts||[]):DISTRICTS),
    travel_rules:packageClone(typeof TRAVEL==='undefined'?(P.travel||{}):(TRAVEL||{})),
    legacy_aliases:packageClone(typeof ALIASES==='undefined'?(P.aliases||{}):ALIASES),
    locations:P.locations.filter(location=>location.tags?.includes('package')).map(location=>{
      const out=packageClone(location);
      ['background','tags','notes','editor_layout'].forEach(key=>delete out[key]);
      out.rooms=(location.rooms||[]).map(room=>{
        const clean=packageClone(room);
        delete clean.editor_layout;
        if(!clean.navigation||!Object.keys(clean.navigation).length)delete clean.navigation;
        return clean;
      });
      return out;
    })
  };
}

function gamePackageCandidates(options={}){
  const includeCharacters=options.characters!==false,includeWorld=options.world!==false;
  const rows=[];
  if(includeCharacters){
    const canonical=new Map((typeof BUNDLED_CHARACTER_SHEETS==='undefined'?[]:
      BUNDLED_CHARACTER_SHEETS).map(sheet=>[sheet.id,sheet]));
    npcs().slice().sort((a,b)=>a.id.localeCompare(b.id)).forEach(character=>{
      const content=sheetOut(character),before=canonical.get(character.id);
      rows.push({path:'characters/'+character.id+'.character',kind:'character',id:character.id,
        status:before?(packageStable(content)===packageStable(before)?'unchanged':'updated'):'added',content});
    });
  }
  if(includeWorld){
    const content=gameLocationPackageOut(),before=typeof BUNDLED_LOCATION_PACKAGE==='undefined'?null:
      BUNDLED_LOCATION_PACKAGE;
    rows.push({path:'content/world/all_locations.json',kind:'world',id:content.package_id,
      status:before?(packageStable(content)===packageStable(before)?'unchanged':'updated'):'added',content});
    const custom=customLocationsOut();
    if(custom.locations.length)rows.push({path:'content/world/scenewright_custom_locations.json',
      kind:'location_extension',id:custom.package_id,status:'added',content:custom});
  }
  return rows;
}

function gamePackageRemovedPaths(options={}){
  if(options.scope!=='full'||options.characters===false||
     typeof BUNDLED_CHARACTER_SHEETS==='undefined')return [];
  const current=new Set(npcs().map(character=>character.id));
  return BUNDLED_CHARACTER_SHEETS.filter(sheet=>!current.has(sheet.id))
    .map(sheet=>'characters/'+sheet.id+'.character').sort();
}

function gamePackagePlan(options={}){
  const scope=options.scope==='full'?'full':'changed',all=gamePackageCandidates(options);
  return {scope,all,files:scope==='full'?all:all.filter(file=>file.status!=='unchanged'),
    removed_paths:gamePackageRemovedPaths({...options,scope}),
    expected_paths:all.map(file=>file.path).sort()};
}

async function gamePackageHash(text){
  const bytes=new TextEncoder().encode(text);
  if(globalThis.crypto?.subtle){
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  }
  // Old local browsers can still build packages. The importer recognises this
  // integrity fallback, while current browsers always produce SHA-256.
  let hash=2166136261;
  bytes.forEach(value=>{hash^=value;hash=Math.imul(hash,16777619);});
  return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');
}

async function finalizeGamePackage(plan,options={},validation={blockers:[],warnings:[]}){
  const files=[];
  for(const candidate of plan.files){
    const content_text=packageText(candidate.content);
    files.push({path:candidate.path,kind:candidate.kind,id:candidate.id,
      operation:candidate.status==='added'?'add':'replace',status:candidate.status,
      checksum:await gamePackageHash(content_text),content_text});
  }
  const packageId=slug(options.package_id||'port_alder_story_content');
  const version=Math.max(1,parseInt(options.version,10)||1);
  const manifest={file_count:files.length,
    expected_paths:plan.expected_paths,removed_paths:plan.removed_paths,
    removal_policy:'report_only',files:files.map(file=>({path:file.path,kind:file.kind,id:file.id,
      operation:file.operation,status:file.status,checksum:file.checksum}))};
  manifest.checksum=await gamePackageHash(JSON.stringify(manifest.files));
  return {format:GAME_PACKAGE_FORMAT,format_version:1,target:GAME_PACKAGE_TARGET,
    package_id:packageId,version,scope:plan.scope,created_at:new Date().toISOString(),
    notes:String(options.notes||'').trim(),source:{tool:'Scenewright',
      character_signature:typeof BUNDLED_CHARACTER_SIGNATURE==='undefined'?'':BUNDLED_CHARACTER_SIGNATURE,
      location_signature:typeof BUNDLED_LOCATION_SIGNATURE==='undefined'?'':BUNDLED_LOCATION_SIGNATURE},
    validation:{blockers:validation.blockers.length,warnings:validation.warnings.length},
    manifest,files};
}

function gamePackageValidation(){
  const blockers=[],warnings=[],seen=new Set();
  const add=(severity,message,where)=>{
    const key=severity+'\u0000'+message+'\u0000'+where;if(seen.has(key))return;seen.add(key);
    (severity==='blocker'?blockers:warnings).push({message,where});
  };
  if(typeof validate==='function')validate().forEach(issue=>{
    if(issue.sev==='err')add('blocker',issue.msg,issue.where||'Validate');
    else if(issue.sev==='warn')add('warning',issue.msg,issue.where||'Validate');
  });
  if(typeof godotCheck==='function')godotCheck().issues.forEach(issue=>{
    if(issue.sev==='fatal')add('blocker',issue.msg,issue.where||'Godot');
    else if(issue.sev==='err'||issue.sev==='warn')add('warning',issue.msg,issue.where||'Godot');
  });
  if(typeof portAlderCheck==='function')portAlderCheck().forEach(issue=>{
    if(issue.sev==='err')add('blocker',issue.msg,issue.where||'Port Alder');
    else if(issue.sev==='warn')add('warning',issue.msg,issue.where||'Port Alder');
  });
  (P.ensemble_arcs||[]).forEach(arc=>{
    const remaining=(arc.nodes||[]).filter(node=>node.implementation_status!=='implemented').length;
    if(remaining)add('warning',remaining+' planning node'+(remaining===1?' is':'s are')+
      ' not scaffolded into playable content.',arc.title||arc.id);
  });
  return {blockers,warnings};
}

function gamePackageOptionsFromUI(){
  return {package_id:$('gamePackageId').value,version:$('gamePackageVersion').value,
    scope:$('gamePackageScope').value,notes:$('gamePackageNotes').value,
    characters:$('gamePackageCharacters').checked,world:$('gamePackageWorld').checked};
}

function gamePackageStatusLabel(status){
  return status==='added'?'new':status;
}

function paintGamePackageBuilder(){
  const options=gamePackageOptionsFromUI(),validation=gamePackageValidation(),plan=gamePackagePlan(options);
  const counts=plan.all.reduce((out,file)=>{out[file.status]=(out[file.status]||0)+1;return out;},{});
  const invalidId=!slug(options.package_id)||slug(options.package_id)!==String(options.package_id||'').trim();
  const noKinds=!options.characters&&!options.world,blocked=validation.blockers.length||invalidId||noKinds||!plan.files.length;
  $('gamePackageSummary').innerHTML='<div><b>'+plan.files.length+'</b><span>files in build</span></div>'+
    '<div><b>'+String(counts.added||0)+'</b><span>new</span></div><div><b>'+String(counts.updated||0)+'</b><span>updated</span></div>'+
    '<div><b>'+String(counts.unchanged||0)+'</b><span>unchanged</span></div><div><b>'+plan.removed_paths.length+'</b><span>removals reported</span></div>'+
    '<div class="'+(validation.blockers.length?'bad':'good')+'"><b>'+validation.blockers.length+'</b><span>blocking issues</span></div>';
  const fileRows=plan.all.map(file=>'<div class="package-file '+file.status+'"><span class="package-file-status">'+
    esc(gamePackageStatusLabel(file.status))+'</span><b>'+esc(file.path)+'</b><small>'+esc(pretty(file.kind))+
    (options.scope==='changed'&&file.status==='unchanged'?' · omitted from changed-only build':'')+'</small></div>').join('');
  const removed=plan.removed_paths.map(path=>'<div class="package-file removed"><span class="package-file-status">removed</span><b>'+esc(path)+
    '</b><small>reported only · importer will not delete it</small></div>').join('');
  const issueRows=validation.blockers.concat(validation.warnings).map((issue,index)=>{
    const severity=index<validation.blockers.length?'blocker':'warning';
    return '<div class="package-issue '+severity+'"><b>'+severity+'</b><span>'+esc(issue.message)+
      '<small>'+esc(issue.where||'Project')+'</small></span></div>';
  }).join('');
  $('gamePackageReport').innerHTML='<section><h4>Deployment preview</h4><div class="package-file-list">'+
    (fileRows+removed||'<p class="empty">No files match this build.</p>')+'</div></section><section><h4>Preflight report</h4><div class="package-issue-list">'+
    (invalidId?'<div class="package-issue blocker"><b>blocker</b><span>Package id must use lowercase words joined by underscores.</span></div>':'')+
    (noKinds?'<div class="package-issue blocker"><b>blocker</b><span>Choose at least one content group.</span></div>':'')+
    (issueRows||'<div class="package-clean">All deployment checks passed.</div>')+'</div></section>';
  $('gamePackageDownload').disabled=!!blocked;
  $('gamePackageMessage').textContent=validation.blockers.length?
    'Fix the blocking issues before building.':!plan.files.length?
      'No new or changed files were found. Choose Complete game content package to make a full build.':
      'Ready. Godot will preview and back up these files before import.';
  return {options,validation,plan,blocked};
}

function openGamePackageBuilder(){paintGamePackageBuilder();$('gamePackageBuilder').showModal();}

async function downloadGamePackage(){
  const state=paintGamePackageBuilder();if(state.blocked)return;
  const button=$('gamePackageDownload');button.disabled=true;button.textContent='Building…';
  try{
    const data=await finalizeGamePackage(state.plan,state.options,state.validation);
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
    Object.assign(document.createElement('a'),{href:url,
      download:data.package_id+'-v'+data.version+'.screenwriter-package'}).click();
    URL.revokeObjectURL(url);$('gamePackageMessage').textContent='Package built with '+data.files.length+
      ' verified file'+(data.files.length===1?'':'s')+'.';
  }catch(error){$('gamePackageMessage').textContent='Could not build package: '+error.message;}
  finally{button.textContent='Download game package';paintGamePackageBuilder();}
}

if(typeof document!=='undefined'){
  $('openGamePackage').onclick=openGamePackageBuilder;
  $('gamePackageClose').onclick=()=>$('gamePackageBuilder').close();
  $('gamePackageRefresh').onclick=paintGamePackageBuilder;
  ['gamePackageScope','gamePackageCharacters','gamePackageWorld']
    .forEach(id=>$(id).onchange=paintGamePackageBuilder);
  ['gamePackageId','gamePackageVersion'].forEach(id=>$(id).oninput=paintGamePackageBuilder);
  $('gamePackageDownload').onclick=downloadGamePackage;
}
