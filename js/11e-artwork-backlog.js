/* ============ Artwork production backlog ============ */
const ARTWORK_BACKLOG_STATUSES=['missing','placeholder','in_progress','review','ready'];

function artworkBacklogData(){
  const catalog=sceneDirectorPresentationCatalog();
  const backlog=catalog.backlog;
  return backlog&&typeof backlog==='object'&&!Array.isArray(backlog)
    ?backlog:{mode:'artwork_first',audio_in_scope:false,allowed_statuses:ARTWORK_BACKLOG_STATUSES,phases:[]};
}

function artworkBacklogAssets(){
  return (artworkBacklogData().phases||[]).flatMap(phase=>(phase.assets||[]).map(asset=>({phase,asset})));
}

function artworkBacklogTitle(value){
  return pretty(value).replace(/\b\w/g,character=>character.toUpperCase());
}

function artworkBacklogCharacterName(characterId){
  const character=typeof chr==='function'?chr(characterId):null;
  return character?.display_name||character?.name||artworkBacklogTitle(characterId);
}

function artworkBacklogAssetLabel(asset){
  return asset.kind==='portrait_set'
    ?artworkBacklogCharacterName(asset.character_id)+' portrait set'
    :String(asset.id||'').split('.').map(artworkBacklogTitle).join(' · ');
}

/** Reports whether the planned task has no registration, a temporary asset, or production art. */
function artworkBacklogResolution(asset){
  const catalog=sceneDirectorPresentationCatalog();
  if(asset.kind==='background'){
    const registered=(catalog.backgrounds||[]).find(item=>item.id===asset.id);
    if(!registered)return {state:'missing',text:'No background registered'};
    const placeholder=registered.asset_status==='placeholder'||
      String(registered.credit||'').toLowerCase().includes('placeholder')||
      String(registered.path||'').includes('/_shared/');
    return placeholder
      ?{state:'placeholder',text:'Registered placeholder',path:registered.path||''}
      :{state:'registered',text:'Production background registered',path:registered.path||''};
  }
  const portraits=(catalog.portraits||[]).filter(item=>item.character_id===asset.character_id);
  const production=portraits.filter(item=>item.asset_status!=='placeholder'&&
    !String(item.path||'').includes('_fallback_portrait'));
  if(production.length)return {state:'registered',text:production.length+' production portrait'+(production.length===1?'':'s')+' registered'};
  if(portraits.length)return {state:'placeholder',text:'Fallback portrait only'};
  return {state:'missing',text:'No portrait registered'};
}

function artworkBacklogMatches(asset,filter){
  const status=asset.status||'missing';
  if(filter==='needs_art')return status==='missing'||status==='placeholder';
  if(filter==='active')return status==='in_progress'||status==='review';
  if(filter==='ready')return status==='ready';
  if(filter==='background'||filter==='portrait_set')return asset.kind===filter;
  return true;
}

function artworkBacklogSummary(){
  const assets=artworkBacklogAssets().map(item=>item.asset);
  const statuses=Object.fromEntries(ARTWORK_BACKLOG_STATUSES.map(status=>[
    status,assets.filter(asset=>(asset.status||'missing')===status).length
  ]));
  return {
    total:assets.length,
    backgrounds:assets.filter(asset=>asset.kind==='background').length,
    portraits:assets.filter(asset=>asset.kind==='portrait_set').length,
    statuses
  };
}

function artworkBacklogStatusLabel(status){
  return status==='in_progress'?'In Progress':artworkBacklogTitle(status||'missing');
}

function artworkBacklogAssetMarkup(asset,index){
  const status=asset.status||'missing',resolution=artworkBacklogResolution(asset);
  const looks=asset.kind==='background'?asset.required_variants:asset.required_expressions;
  const noun=asset.kind==='background'?'Background':'Portrait set';
  return '<article class="artwork-task" data-art-kind="'+esc(asset.kind)+'" data-art-status="'+esc(status)+'">'+
    '<div class="artwork-task-number">'+String(index+1).padStart(2,'0')+'</div><div class="artwork-task-copy">'+
    '<div class="artwork-task-title"><span>'+noun+'</span><h5>'+esc(artworkBacklogAssetLabel(asset))+'</h5></div>'+
    '<p>'+esc(asset.reason||'')+'</p><div class="artwork-looks">'+(looks||[]).map(look=>'<span>'+esc(artworkBacklogTitle(look))+'</span>').join('')+'</div>'+
    (resolution.path?'<code title="'+esc(resolution.path)+'">'+esc(resolution.path)+'</code>':'')+'</div>'+
    '<div class="artwork-task-state"><span class="artwork-status '+esc(status)+'">'+esc(artworkBacklogStatusLabel(status))+'</span>'+
    '<small class="'+esc(resolution.state)+'">'+esc(resolution.text)+'</small></div></article>';
}

function artworkBacklogMarkup(filter='all'){
  const backlog=artworkBacklogData(),summary=artworkBacklogSummary();
  const phaseMarkup=(backlog.phases||[]).map(phase=>{
    const assets=(phase.assets||[]).filter(asset=>artworkBacklogMatches(asset,filter));
    if(!assets.length)return '';
    return '<section class="artwork-phase"><header><span>Priority '+esc(phase.priority)+'</span><div><h4>'+esc(phase.title||artworkBacklogTitle(phase.id))+'</h4><p>'+esc(phase.goal||'')+'</p></div><b>'+assets.length+' task'+(assets.length===1?'':'s')+'</b></header>'+
      '<div class="artwork-task-list">'+assets.map(artworkBacklogAssetMarkup).join('')+'</div></section>';
  }).join('');
  const filteredCount=artworkBacklogAssets().filter(({asset})=>artworkBacklogMatches(asset,filter)).length;
  return '<div class="artwork-backlog-intro"><div><span>Artwork-first milestone plan</span><h4>'+summary.total+' prioritized assets</h4><p>Work from Priority 1 downward. Status lives in the game’s <code>vn_art.json</code>; rebuild Screenwriter after changing it.</p></div>'+
    '<div class="artwork-summary"><span><b>'+summary.backgrounds+'</b> backgrounds</span><span><b>'+summary.portraits+'</b> portrait sets</span><span class="missing"><b>'+summary.statuses.missing+'</b> missing</span><span class="placeholder"><b>'+summary.statuses.placeholder+'</b> placeholders</span><span class="active"><b>'+(summary.statuses.in_progress+summary.statuses.review)+'</b> active</span><span class="ready"><b>'+summary.statuses.ready+'</b> ready</span></div></div>'+
    (phaseMarkup||'<div class="artwork-backlog-empty"><b>No tasks match this view.</b><span>'+filteredCount+' artwork tasks shown</span></div>')+
    '<footer class="artwork-backlog-note">Audio is intentionally outside this production plan. Director remains ready for visual staging while the game is artwork-first.</footer>';
}

function paintArtworkBacklog(){
  const body=$('artworkBacklogBody');if(!body)return;
  body.innerHTML=artworkBacklogMarkup($('artworkBacklogFilter')?.value||'all');
}

function openArtworkBacklog(){
  paintArtworkBacklog();$('artworkBacklog').showModal();
}

$('openArtworkBacklog').onclick=openArtworkBacklog;
$('artworkBacklogFilter').onchange=paintArtworkBacklog;
$('artworkBacklogClose').onclick=()=>$('artworkBacklog').close();
