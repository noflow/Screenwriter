/* ============ ensemble story arc studio ============ */
const ENSEMBLE_NODE_TYPES=Object.freeze([
  ['scene','Scene'],['choice','Player choice'],['gate','Stat / state gate'],['quest','Quest beat'],
  ['delay','Time delay'],['merge','Branch merge'],['ending','Ending'],['placeholder','Placeholder']
]);
const ENSEMBLE_ARC_STATUSES=Object.freeze(['draft','playtest','approved']);
const ENSEMBLE_NODE_STATUSES=Object.freeze(['draft','approved','implemented']);
const ENSEMBLE_CAST_ROLES=Object.freeze(['lead','supporting','optional','opposing']);

let ensembleArcId='',ensembleNodeId='',ensemblePlayArcId='',ensemblePlayNodeId='';
let ensemblePlayState=null,ensemblePlayHistory=[],ensemblePlayLastChanges=[];
let ensembleDragSuppress='';

function ensembleUid(prefix='node'){
  return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}
function ensembleUniqueId(items,base,except=null){
  const root=slug(base||'item');let id=root,n=2;
  while((items||[]).some(item=>item!==except&&item.id===id))id=root+'_'+n++;
  return id;
}
function defaultEnsembleNode(type='scene',index=0){
  const label=ENSEMBLE_NODE_TYPES.find(row=>row[0]===type)?.[1]||'Story beat';
  return {id:slug(label),type,title:label,summary:'',location:'',day:'',block:'',cast:[],
    lines:[],requires:[],effects:[],routes:type==='ending'?[]:[{id:'continue',label:'Continue',target:'',requires:[],effects:[]}],
    implementation_status:'draft',layout:{x:40+(index%4)*220,y:40+Math.floor(index/4)*126}};
}
function defaultEnsembleArc(index=0){
  const number=index+1,id='ensemble_arc_'+number;
  const opening=defaultEnsembleNode('scene',0),decision=defaultEnsembleNode('choice',1),
    accepted=defaultEnsembleNode('placeholder',2),declined=defaultEnsembleNode('ending',3);
  Object.assign(opening,{id:'opening',title:'Opening scene',summary:'Introduce the situation and the characters.',routes:[{id:'continue',label:'Continue',target:'decision',requires:[],effects:[]}]});
  Object.assign(decision,{id:'decision',title:'Important choice',summary:'Give the player meaningful directions.',routes:[
    {id:'accept',label:'Accept',target:'accepted_path',requires:[],effects:[]},
    {id:'decline',label:'Decline',target:'declined_ending',requires:[],effects:[]}
  ]});
  Object.assign(accepted,{id:'accepted_path',title:'Accepted path',summary:'Plan the next scene or quest on this branch.',routes:[]});
  Object.assign(declined,{id:'declined_ending',title:'Declined ending',summary:'Close this route without blocking unrelated stories.'});
  return {format_version:1,id,title:'New ensemble story',status:'draft',category:'character_story',
    summary:'',themes:[],notes:'',cast:[],variables:[],entry_requirements:[],start_node:'opening',
    nodes:[opening,decision,accepted,declined]};
}
function normalizeEnsembleRule(rule){
  if(!rule||typeof rule!=='object')rule={};
  const out={kind:String(rule.kind||rule.type||'flag'),key:String(rule.key||''),op:String(rule.op||'eq'),
    value:rule.value===undefined?true:rule.value};
  if(rule.character)out.character=String(rule.character);
  if(!['stat','variable','flag'].includes(out.kind))out.kind='flag';
  if(!['gte','lte','eq','neq','is_true','is_false'].includes(out.op))out.op='eq';
  return out;
}
function normalizeEnsembleEffect(effect){
  if(!effect||typeof effect!=='object')effect={};
  const out={kind:String(effect.kind||effect.type||'flag'),key:String(effect.key||''),
    op:String(effect.op||'set'),value:effect.value===undefined?true:effect.value};
  if(effect.character)out.character=String(effect.character);
  if(!['stat','variable','flag'].includes(out.kind))out.kind='flag';
  if(!['set','add'].includes(out.op))out.op='set';
  return out;
}
function normalizeEnsembleRoute(route,index=0){
  route=route&&typeof route==='object'?route:{};
  route.id=String(route.id||'route_'+(index+1));
  route.label=String(route.label||pretty(route.id)||'Continue');
  route.target=String(route.target||'');
  route.requires=Array.isArray(route.requires)?route.requires.map(normalizeEnsembleRule):[];
  route.effects=Array.isArray(route.effects)?route.effects.map(normalizeEnsembleEffect):[];
  return route;
}
function normalizeEnsembleArc(arc,index=0){
  const defaults=defaultEnsembleArc(index);
  if(!arc||typeof arc!=='object')arc=defaults;
  ['id','title','status','category','summary','notes','start_node'].forEach(key=>{
    if(arc[key]===undefined)arc[key]=defaults[key];
  });
  ['themes','cast','variables','entry_requirements','nodes'].forEach(key=>{
    if(!Array.isArray(arc[key]))arc[key]=[];
  });
  arc.id=String(arc.id||defaults.id);arc.title=String(arc.title||'');
  if(!ENSEMBLE_ARC_STATUSES.includes(arc.status))arc.status='draft';
  arc.themes=[...new Set(arc.themes.map(value=>slug(value)).filter(Boolean))];
  arc.cast=arc.cast.map(row=>typeof row==='string'?{character:row,role:'supporting'}:row)
    .filter(row=>row&&row.character).map(row=>({character:String(row.character),
      role:ENSEMBLE_CAST_ROLES.includes(row.role)?row.role:'supporting'}));
  arc.variables=arc.variables.map((row,i)=>({id:String(row?.id||'variable_'+(i+1)),
    label:String(row?.label||pretty(row?.id||'Variable '+(i+1))),type:['number','boolean','text'].includes(row?.type)?row.type:'number',
    default:row?.default===undefined?0:row.default}));
  arc.entry_requirements=arc.entry_requirements.map(normalizeEnsembleRule);
  arc.nodes=arc.nodes.map((node,nodeIndex)=>{
    const type=ENSEMBLE_NODE_TYPES.some(row=>row[0]===node?.type)?node.type:'scene';
    const base=defaultEnsembleNode(type,nodeIndex);node=Object.assign(base,node||{});node.type=type;
    node.id=String(node.id||base.id);node.title=String(node.title||pretty(node.id));node.summary=String(node.summary||'');
    ['location','day','block'].forEach(key=>node[key]=String(node[key]||''));
    node.cast=Array.isArray(node.cast)?[...new Set(node.cast.map(String))]:[];
    node.lines=Array.isArray(node.lines)?node.lines.map(line=>({speaker:String(line?.speaker||'__narrator__'),text:String(line?.text||'')})):[];
    node.requires=Array.isArray(node.requires)?node.requires.map(normalizeEnsembleRule):[];
    node.effects=Array.isArray(node.effects)?node.effects.map(normalizeEnsembleEffect):[];
    node.routes=Array.isArray(node.routes)?node.routes.map(normalizeEnsembleRoute):[];
    if(node.type==='ending')node.routes=[];
    if(!ENSEMBLE_NODE_STATUSES.includes(node.implementation_status))node.implementation_status='draft';
    if(!node.layout||!Number.isFinite(+node.layout.x)||!Number.isFinite(+node.layout.y))node.layout=base.layout;
    else node.layout={x:+node.layout.x,y:+node.layout.y};
    return node;
  });
  if(!arc.nodes.length)arc.nodes=defaults.nodes;
  if(!arc.nodes.some(node=>node.id===arc.start_node))arc.start_node=arc.nodes[0]?.id||'';
  return arc;
}
function normalizeEnsembleArcs(){
  if(!Array.isArray(P.ensemble_arcs))P.ensemble_arcs=[];
  P.ensemble_arcs=P.ensemble_arcs.map((arc,index)=>normalizeEnsembleArc(arc,index));
  return P.ensemble_arcs;
}
function activeEnsembleArc(){return normalizeEnsembleArcs().find(arc=>arc.id===ensembleArcId)||null;}
function activeEnsembleNode(arc=activeEnsembleArc()){return arc?.nodes.find(node=>node.id===ensembleNodeId)||null;}

function ensembleValue(raw){
  const value=String(raw??'').trim();
  if(value==='true')return true;if(value==='false')return false;if(value==='null')return null;
  if(/^-?(?:\d+|\d*\.\d+)$/.test(value))return Number(value);
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/,'$1$2');
}
function ensembleKeyKind(key,arc){
  const dot=String(key).indexOf('.'),character=dot>0?String(key).slice(0,dot):'';
  if(character&&(P.characters||[]).some(item=>item.id===character))
    return {kind:'stat',character,key:String(key).slice(dot+1)};
  if((arc.variables||[]).some(item=>item.id===key))return {kind:'variable',key};
  return {kind:'flag',key};
}
function parseEnsembleRequirements(text,arc){
  return String(text||'').split(/[;\n]+/).map(row=>row.trim()).filter(Boolean).map(row=>{
    if(row.startsWith('!'))return {kind:'flag',key:row.slice(1).trim(),op:'is_false',value:false};
    const match=row.match(/^(.+?)\s*(>=|<=|==|!=|=)\s*(.+)$/);
    if(!match)return Object.assign(ensembleKeyKind(row,arc),{op:'is_true',value:true});
    const key=match[1].trim(),op={'>=':'gte','<=':'lte','==':'eq','=':'eq','!=':'neq'}[match[2]];
    return Object.assign(ensembleKeyKind(key,arc),{op,value:ensembleValue(match[3])});
  });
}
function parseEnsembleEffects(text,arc){
  return String(text||'').split(/[;\n]+/).map(row=>row.trim()).filter(Boolean).map(row=>{
    if(row.startsWith('!'))return {kind:'flag',key:row.slice(1).trim(),op:'set',value:false};
    const match=row.match(/^(.+?)\s*(\+=|-=|=|\+|-)\s*(.+)$/);
    if(!match)return Object.assign(ensembleKeyKind(row,arc),{op:'set',value:true});
    const key=match[1].trim(),add=match[2]!=='=',raw=ensembleValue(match[3]);
    return Object.assign(ensembleKeyKind(key,arc),{op:add?'add':'set',value:match[2].startsWith('-')?-Math.abs(+raw||0):raw});
  });
}
function ensembleRuleKey(rule){return rule.kind==='stat'?rule.character+'.'+rule.key:rule.key;}
function ensembleRequirementsText(rules){
  return (rules||[]).map(rule=>{
    const key=ensembleRuleKey(rule);
    if(rule.op==='is_true')return key;if(rule.op==='is_false')return '!'+key;
    const op={gte:'>=',lte:'<=',eq:'=',neq:'!='}[rule.op]||'=';
    return key+' '+op+' '+stateValueText(rule.value);
  }).join('\n');
}
function ensembleEffectsText(effects){
  return (effects||[]).map(effect=>{
    const key=ensembleRuleKey(effect);
    if(effect.op==='set'&&effect.value===true)return key;
    if(effect.op==='set'&&effect.value===false)return '!'+key;
    return key+' '+(effect.op==='add'?(+effect.value<0?'- ':'+ '):'= ')+
      stateValueText(effect.op==='add'&&+effect.value<0?Math.abs(+effect.value):effect.value);
  }).join('\n');
}
function parseEnsembleLines(text){
  return String(text||'').split('\n').map(row=>row.trim()).filter(Boolean).map(row=>{
    const at=row.indexOf(':');if(at<1)return {speaker:'__narrator__',text:row};
    const raw=row.slice(0,at).trim(),needle=raw.toLowerCase();
    const character=(P.characters||[]).find(item=>item.id.toLowerCase()===needle||String(item.name||'').toLowerCase()===needle);
    const speaker=/^(player|you)$/i.test(raw)?'player':/^(narrator|direction|stage)$/i.test(raw)?'__narrator__':character?.id||slug(raw);
    return {speaker,text:row.slice(at+1).trim()};
  });
}
function ensembleLinesText(lines){
  return (lines||[]).map(line=>(line.speaker==='__narrator__'?'Narrator':line.speaker==='player'?'Player':
    (P.characters||[]).find(item=>item.id===line.speaker)?.name||line.speaker)+': '+line.text).join('\n');
}

function autoArrangeEnsembleArc(arc){
  normalizeEnsembleArc(arc);const byId=new Map(arc.nodes.map(node=>[node.id,node])),depth=new Map(),queue=[];
  if(byId.has(arc.start_node)){depth.set(arc.start_node,0);queue.push(arc.start_node);}
  while(queue.length){const id=queue.shift(),next=(byId.get(id)?.routes||[]).map(route=>route.target).filter(target=>byId.has(target));
    next.forEach(target=>{if(depth.has(target))return;depth.set(target,depth.get(id)+1);queue.push(target);});}
  let orphanDepth=Math.max(0,...depth.values())+1;
  arc.nodes.forEach(node=>{if(!depth.has(node.id))depth.set(node.id,orphanDepth);});
  const columns={};arc.nodes.forEach(node=>(columns[depth.get(node.id)]||(columns[depth.get(node.id)]=[])).push(node));
  Object.entries(columns).forEach(([column,nodes])=>nodes.forEach((node,index)=>{
    node.layout={x:36+(+column)*226,y:34+index*126};
  }));
  return arc;
}
function ensembleReachable(arc){
  const byId=new Map(arc.nodes.map(node=>[node.id,node])),seen=new Set(),stack=[arc.start_node];
  while(stack.length){const id=stack.pop();if(!byId.has(id)||seen.has(id))continue;seen.add(id);
    byId.get(id).routes.forEach(route=>{if(route.target)stack.push(route.target);});}
  return seen;
}
function ensembleCanReachEnding(arc){
  const ending=new Set(arc.nodes.filter(node=>node.type==='ending').map(node=>node.id));let changed=true;
  while(changed){changed=false;arc.nodes.forEach(node=>{if(ending.has(node.id))return;
    if(node.routes.some(route=>ending.has(route.target))){ending.add(node.id);changed=true;}});}
  return ending;
}
function ensembleScheduleConflict(node,character){
  if(!node.day||!node.block)return null;
  return (character.schedule?.fixed_commitments||[]).find(item=>item.unavailable!==false&&
    (item.days||[]).includes(node.day)&&(item.blocks||[]).includes(node.block));
}
function ensembleArcIssues(arc){
  normalizeEnsembleArc(arc);const issues=[],add=(severity,message,node='')=>issues.push({severity,message,node});
  if(!arc.title.trim())add('error','Arc needs a title.');
  if(!arc.summary.trim())add('warning','Add a short arc summary.');
  if(!arc.cast.length)add('warning','Add at least one character to the arc cast.');
  arc.cast.forEach(row=>{if(!(P.characters||[]).some(item=>item.id===row.character))add('error','Arc cast refers to missing character '+row.character+'.');});
  const ids=new Set(),byId=new Map();arc.nodes.forEach(node=>{
    if(!node.id)add('error','A story node has no id.');
    else if(ids.has(node.id))add('error','Two story nodes share id '+node.id+'.',node.id);
    ids.add(node.id);byId.set(node.id,node);
  });
  if(!byId.has(arc.start_node))add('error','Start node '+(arc.start_node||'(blank)')+' does not exist.');
  const reachable=ensembleReachable(arc),endingReach=ensembleCanReachEnding(arc);
  arc.nodes.forEach(node=>{
    if(!node.title.trim())add('error','Node '+node.id+' needs a title.',node.id);
    if(!reachable.has(node.id))add('warning',node.title+' is unreachable from the start.',node.id);
    if(node.type!=='ending'&&!endingReach.has(node.id))add('warning',node.title+' cannot reach an ending.',node.id);
    if(node.type==='choice'&&node.routes.length<2)add('warning',node.title+' is a choice with fewer than two branches.',node.id);
    if(node.type!=='ending'&&!node.routes.length)add('warning',node.title+' has no outgoing route.',node.id);
    if(node.type==='placeholder')add(node.implementation_status==='approved'?'error':'warning',node.title+' is still a placeholder.',node.id);
    if(['scene','choice','gate','ending'].includes(node.type)&&!node.lines.some(line=>line.text.trim()))
      add('warning',node.title+' has no draft dialogue yet.',node.id);
    if(node.location&&typeof loc==='function'&&!loc(locPart(node.location)))add('error',node.title+' uses missing location '+node.location+'.',node.id);
    node.cast.forEach(id=>{
      const character=(P.characters||[]).find(item=>item.id===id);
      if(!character)add('error',node.title+' uses missing character '+id+'.',node.id);
      else{const conflict=ensembleScheduleConflict(node,character);if(conflict)add('warning',character.name+' is busy with '+
        pretty(conflict.activity||conflict.label||'another commitment')+' at this time.',node.id);}
    });
    [...node.requires,...node.routes.flatMap(route=>route.requires)].filter(rule=>rule.kind==='stat').forEach(rule=>{
      if(!(P.characters||[]).some(item=>item.id===rule.character))add('error',node.title+' has a gate for missing character '+rule.character+'.',node.id);
    });
    [...node.effects,...node.routes.flatMap(route=>route.effects)].forEach(effect=>{
      if(!effect.key)add('error',node.title+' has an effect without a state key.',node.id);
    });
    node.routes.forEach(route=>{
      if(!route.label.trim())add('error',node.title+' has an unnamed route.',node.id);
      if(!route.target)add('error',node.title+' route “'+route.label+'” has no destination.',node.id);
      else if(!byId.has(route.target))add('error',node.title+' route “'+route.label+'” points to missing node '+route.target+'.',node.id);
    });
    if(node.implementation_status==='implemented'){
      const id=ensembleNodeContentId(arc,node),content=P.content.find(item=>item.id===id);
      if(!content)add('error',node.title+' is marked implemented but '+id+' is missing.',node.id);
    }
  });
  return issues;
}

function addEnsembleNode(arc,type='scene'){
  const node=defaultEnsembleNode(type,arc.nodes.length);node.id=ensembleUniqueId(arc.nodes,node.id);
  node.title=ENSEMBLE_NODE_TYPES.find(row=>row[0]===type)?.[1]||'Story beat';
  if(type==='choice')node.routes=[{id:'choice_1',label:'First choice',target:'',requires:[],effects:[]},
    {id:'choice_2',label:'Second choice',target:'',requires:[],effects:[]}];
  arc.nodes.push(node);ensembleNodeId=node.id;save();return node;
}
function duplicateEnsembleNode(arc,node){
  const copy=JSON.parse(JSON.stringify(node));copy.id=ensembleUniqueId(arc.nodes,node.id+'_copy');copy.title=node.title+' Copy';
  copy.implementation_status='draft';copy.layout={x:+node.layout.x+40,y:+node.layout.y+80};arc.nodes.push(copy);ensembleNodeId=copy.id;save();return copy;
}
function renameEnsembleNode(arc,node,raw){
  const old=node.id,next=ensembleUniqueId(arc.nodes,raw,node);if(old===next)return next;
  const content=P.content.find(item=>item.id===ensembleNodeContentId(arc,node));
  const nextContentId=arc.id+'__'+next,collision=P.content.find(item=>item!==content&&item.id===nextContentId);
  if(collision)throw new Error('Content id '+nextContentId+' already exists. Choose another node id.');
  if(arc.start_node===old)arc.start_node=next;
  arc.nodes.forEach(item=>item.routes.forEach(route=>{if(route.target===old)route.target=next;}));
  node.id=next;if(content){renameContentId(content,nextContentId);const marker=content.ensembleArc||content.questPlan?.ensembleArc;if(marker)marker.node_id=next;}
  ensembleNodeId=next;return next;
}
function renameEnsembleArc(arc,raw){
  const old=arc.id,next=ensembleUniqueId(P.ensemble_arcs,raw,arc);if(old===next)return next;
  const linked=arc.nodes.map(node=>({node,content:P.content.find(item=>item.id===old+'__'+node.id)})).filter(row=>row.content);
  const collision=linked.find(row=>P.content.some(item=>item!==row.content&&item.id===next+'__'+row.node.id));
  if(collision)throw new Error('Content id '+next+'__'+collision.node.id+' already exists. Choose another arc id.');
  linked.forEach(row=>renameContentId(row.content,next+'__'+row.node.id));
  arc.id=next;ensembleArcId=next;
  P.content.forEach(item=>{
    if(item.ensembleArc?.arc_id===old)item.ensembleArc.arc_id=next;
    if(item.questPlan?.ensembleArc?.arc_id===old)item.questPlan.ensembleArc.arc_id=next;
  });
  return next;
}
function renameEnsembleVariable(arc,variable,raw){
  const old=variable.id,next=ensembleUniqueId(arc.variables,raw,variable);if(old===next)return next;
  const rewrite=list=>(list||[]).forEach(rule=>{if(rule.kind==='variable'&&rule.key===old)rule.key=next;});
  rewrite(arc.entry_requirements);arc.nodes.forEach(node=>{rewrite(node.requires);rewrite(node.effects);
    node.routes.forEach(route=>{rewrite(route.requires);rewrite(route.effects);});});
  variable.id=next;return next;
}

function ensembleNodeContentId(arc,node){return arc.id+'__'+node.id;}
function ensembleRequirementsLegacy(rules){
  return (rules||[]).map(rule=>rule.kind==='stat'?{type:'stat',character:rule.character,key:rule.key,op:rule.op,value:rule.value}:
    {type:'flag',key:rule.op==='eq'&&rule.value!==true?rule.key+'='+stateValueText(rule.value):rule.key,
      op:rule.op==='is_false'||rule.op==='neq'?'is_false':'is_true',value:1});
}
function ensembleEffectsFlag(effects){
  return (effects||[]).map(effect=>{
    const key=ensembleRuleKey(effect);
    if(effect.op==='add')return key+' '+(+effect.value>=0?'+':'')+(+effect.value||0);
    return effect.value===false?'!'+key:effect.value===true?key:key+'='+stateValueText(effect.value);
  }).join('; ');
}
function ensembleNodeTree(arc,node){
  const lines=node.lines.map(line=>({type:'line',speaker:line.speaker,text:line.text,emotion:''}));
  const branches=node.routes.map(route=>{const target=arc.nodes.find(item=>item.id===route.target);
    return {text:route.label,requires:ensembleRequirementsLegacy([...route.requires,...(target?.requires||[])]),
    flag:ensembleEffectsFlag(route.effects),nodes:route.target?[{type:'jump',target:ensembleNodeContentId(arc,
      target||{id:route.target})}]:[]};});
  if(branches.length>1||node.type==='choice'||node.type==='gate')lines.push({type:node.type==='gate'?'gate':'choice',options:branches});
  else if(branches[0]?.nodes.length)lines.push(branches[0].nodes[0]);
  return lines;
}
function scaffoldEnsembleArc(arc){
  normalizeEnsembleArc(arc);const result={created:[],existing:[],skipped:[],collisions:[]};
  arc.nodes.filter(node=>['approved','implemented'].includes(node.implementation_status)).forEach(node=>{
    if(['placeholder','delay','merge'].includes(node.type)){result.skipped.push(node.id);return;}
    const id=ensembleNodeContentId(arc,node),wanted=node.type==='quest'?'quest':'conversation';
    const present=P.content.find(item=>item.id===id);
    if(present){
      const marker=present.ensembleArc||present.questPlan?.ensembleArc;
      if(marker?.arc_id===arc.id&&marker?.node_id===node.id){result.existing.push(id);node.implementation_status='implemented';}
      else result.collisions.push(id);
      return;
    }
    const cast=node.cast.length?node.cast:arc.cast.map(row=>row.character),location=node.location||P.locations[0]?.id||'';
    if(wanted==='quest'){
      const giver=cast[0]||arc.cast[0]?.character||'';
      P.content.push({uid:ensembleUid('q'),type:'quest',id,title:arc.title+' — '+node.title,character:giver,
        cast:cast.filter(character=>character!==giver),hook:node.summary,location,day:node.day,block:node.block,
        requires:ensembleRequirementsLegacy([...(node.id===arc.start_node?arc.entry_requirements:[]),...node.requires]),after:'',stages:[{id:'objective_1',title:node.title,
          location,nodes:ensembleNodeTree(arc,node),flag:ensembleEffectsFlag(node.effects),requires:[]}],
        questPlan:{category:arc.category,summary:node.summary,ensembleArc:{arc_id:arc.id,node_id:node.id},
          rewards:'',rewardRows:[],advancedRewards:'',participants:cast,deadline:'',branchIdeas:'',event:null,eventDraft:null}});
    }else P.content.push({uid:ensembleUid('c'),type:'conversation',id,title:arc.title+' — '+node.title,
      character:cast[0]||'',cast,location,day:node.day,days:node.day?[node.day]:[],block:node.block,
      chapter:0,premise:node.summary,requires:ensembleRequirementsLegacy([...(node.id===arc.start_node?arc.entry_requirements:[]),...node.requires]),nodes:ensembleNodeTree(arc,node),
      flag:ensembleEffectsFlag(node.effects),ensembleArc:{arc_id:arc.id,node_id:node.id}});
    node.implementation_status='implemented';result.created.push(id);
  });
  save();return result;
}

function ensembleGraphHtml(arc){
  const width=Math.max(760,...arc.nodes.map(node=>+node.layout.x+210)),height=Math.max(500,...arc.nodes.map(node=>+node.layout.y+120));
  const byId=new Map(arc.nodes.map(node=>[node.id,node]));
  const lines=arc.nodes.flatMap(node=>node.routes.map((route,index)=>{
    const target=byId.get(route.target);if(!target)return '';
    const x1=+node.layout.x+172,y1=+node.layout.y+42+index*7,x2=+target.layout.x,y2=+target.layout.y+42;
    return '<path d="M'+x1+' '+y1+' C'+(x1+55)+' '+y1+' '+(x2-55)+' '+y2+' '+x2+' '+y2+'" marker-end="url(#ensembleArrow)"/>';
  })).join('');
  const nodes=arc.nodes.map(node=>'<button type="button" class="ensemble-node '+esc(node.type)+
    (node.id===arc.start_node?' start':'')+(node.id===ensembleNodeId?' selected':'')+'" data-ensemble-node="'+esc(node.id)+
    '" style="left:'+node.layout.x+'px;top:'+node.layout.y+'px"><small>'+esc(pretty(node.type))+' · '+esc(pretty(node.implementation_status))+
    '</small><b>'+esc(node.title||pretty(node.id))+'</b><span>'+node.routes.length+' route'+(node.routes.length===1?'':'s')+
    (node.id===arc.start_node?' · start':'')+'</span></button>').join('');
  return '<div class="ensemble-canvas" id="ensembleCanvas" style="width:'+width+'px;height:'+height+'px">'+
    '<svg viewBox="0 0 '+width+' '+height+'" aria-hidden="true"><defs><marker id="ensembleArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>'+lines+'</svg>'+nodes+'</div>';
}
function ensembleArcListHtml(){
  const arcs=normalizeEnsembleArcs();return '<div class="ensemble-sidebar-head"><span>Story arcs</span><button class="btn gold" id="ensembleNewArc">+ New</button></div>'+(
    arcs.length?arcs.map(arc=>{const issues=ensembleArcIssues(arc),errors=issues.filter(issue=>issue.severity==='error').length;
      return '<button class="ensemble-arc-card'+(arc.id===ensembleArcId?' on':'')+'" data-ensemble-arc="'+esc(arc.id)+'"><b>'+esc(arc.title||pretty(arc.id))+
        '</b><span>'+arc.nodes.length+' nodes · '+arc.cast.length+' characters</span><small>'+esc(pretty(arc.status))+(errors?' · '+errors+' errors':'')+'</small></button>';
    }).join(''):'<div class="ensemble-empty">Create an arc to begin planning branches across multiple characters.</div>')+
    '<button class="btn wide" id="ensembleDuplicateArc"'+(activeEnsembleArc()?'':' disabled')+'>Duplicate selected arc</button>';
}
function ensembleCastHtml(arc){
  const selected=new Map(arc.cast.map(row=>[row.character,row.role]));
  return '<details class="ensemble-cast-panel"><summary>Arc cast · '+arc.cast.length+' characters</summary><div class="ensemble-cast-grid">'+
    (P.characters||[]).filter(character=>!isPlayer(character)).map(character=>'<div class="ensemble-cast-row"><label><input type="checkbox" data-ensemble-cast="'+esc(character.id)+'"'+
      (selected.has(character.id)?' checked':'')+'> '+esc(character.name)+'</label><select data-ensemble-role="'+esc(character.id)+'"'+(selected.has(character.id)?'':' disabled')+'>'+ENSEMBLE_CAST_ROLES.map(role=>'<option value="'+role+'"'+
      (selected.get(character.id)===role?' selected':'')+'>'+esc(pretty(role))+'</option>').join('')+'</select></div>').join('')+
    '</div></details>';
}
function ensembleVariablesHtml(arc){
  return '<details class="ensemble-variable-panel"><summary>Arc variables and entry gates · '+arc.variables.length+' variables</summary>'+
    '<div class="ensemble-variable-body"><div class="field"><label>Requirements to discover / begin this arc</label><textarea id="ensembleEntryRequirements" placeholder="emma_rowan.friendship >= 35\nplayer.employment.job = restaurant_kitchen">'+esc(ensembleRequirementsText(arc.entry_requirements))+'</textarea></div>'+
    '<div class="ensemble-variable-list">'+arc.variables.map((variable,index)=>'<div class="ensemble-variable-row"><div class="field"><label>Variable label</label><input data-ensemble-variable-label="'+index+'" value="'+esc(variable.label)+'"></div>'+
      '<div class="field"><label>Variable id</label><input data-ensemble-variable-id="'+index+'" value="'+esc(variable.id)+'"></div>'+
      '<div class="field"><label>Type</label><select data-ensemble-variable-type="'+index+'"><option value="number"'+(variable.type==='number'?' selected':'')+'>number</option><option value="boolean"'+(variable.type==='boolean'?' selected':'')+'>boolean</option><option value="text"'+(variable.type==='text'?' selected':'')+'>text</option></select></div>'+
      '<div class="field"><label>Starting value</label><input data-ensemble-variable-default="'+index+'" value="'+esc(stateValueText(variable.default))+'"></div><button class="x" title="Remove variable" data-ensemble-remove-variable="'+index+'">×</button></div>').join('')+
      '</div><button class="btn" id="ensembleAddVariable">+ Arc variable</button></div></details>';
}
function ensembleRouteHtml(arc,node,route,index){
  const options='<option value="">— choose destination —</option>'+arc.nodes.filter(item=>item!==node).map(item=>'<option value="'+esc(item.id)+'"'+
    (item.id===route.target?' selected':'')+'>'+esc(item.title||pretty(item.id))+'</option>').join('');
  return '<div class="ensemble-route-card" data-ensemble-route-card="'+index+'"><div class="ensemble-route-head"><b>Route '+(index+1)+'</b><button class="x" data-ensemble-remove-route="'+index+'">×</button></div>'+
    '<div class="two"><div class="field"><label>Choice / route label</label><input data-ensemble-route-label="'+index+'" value="'+esc(route.label)+'"></div>'+
    '<div class="field"><label>Destination</label><select data-ensemble-route-target="'+index+'">'+options+'</select></div></div>'+
    '<div class="two"><div class="field"><label>Requirements · one per line</label><textarea data-ensemble-route-requires="'+index+'" placeholder="emma_rowan.friendship >= 35">'+esc(ensembleRequirementsText(route.requires))+'</textarea></div>'+
    '<div class="field"><label>Effects · one per line</label><textarea data-ensemble-route-effects="'+index+'" placeholder="emma_rowan.trust + 5">'+esc(ensembleEffectsText(route.effects))+'</textarea></div></div></div>';
}
function ensembleNodeInspectorHtml(arc,node){
  if(!node)return '<div class="ensemble-empty inspector"><b>No story node selected</b><p>Add a node or select one on the graph.</p></div>';
  const castSet=new Set(node.cast);
  return '<div class="ensemble-inspector-head"><div><span>Selected node</span><h4>'+esc(node.title||pretty(node.id))+'</h4></div>'+
    '<button class="btn" id="ensembleDuplicateNode">Duplicate</button><button class="btn danger" id="ensembleRemoveNode">Remove</button></div>'+
    '<div class="two"><div class="field"><label>Node title</label><input id="ensembleNodeTitleInput" value="'+esc(node.title)+'"></div>'+
    '<div class="field"><label>Stable node id</label><input id="ensembleNodeIdInput" value="'+esc(node.id)+'"></div></div>'+
    '<div class="ensemble-node-meta"><div class="field"><label>Node type</label><select id="ensembleNodeType">'+ENSEMBLE_NODE_TYPES.map(row=>'<option value="'+row[0]+'"'+(node.type===row[0]?' selected':'')+'>'+row[1]+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Implementation</label><select id="ensembleNodeStatus">'+ENSEMBLE_NODE_STATUSES.map(status=>'<option value="'+status+'"'+(node.implementation_status===status?' selected':'')+'>'+pretty(status)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Location</label><select id="ensembleNodeLocation"><option value="">— flexible —</option>'+placeOptions(node.location)+'</select></div>'+
    '<div class="field"><label>Day</label><select id="ensembleNodeDay"><option value="">Any day</option>'+DAYS.map(day=>'<option value="'+day+'"'+(node.day===day?' selected':'')+'>'+pretty(day)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Time block</label><select id="ensembleNodeBlock"><option value="">Any block</option>'+BLOCKS.map(block=>'<option value="'+block+'"'+(node.block===block?' selected':'')+'>'+pretty(block)+'</option>').join('')+'</select></div></div>'+
    '<label class="ensemble-start"><input type="checkbox" id="ensembleNodeStart"'+(arc.start_node===node.id?' checked':'')+'> Start the arc here</label>'+
    '<div class="field"><label>Purpose / scene summary</label><textarea id="ensembleNodeSummary" placeholder="What changes in this story beat?">'+esc(node.summary)+'</textarea></div>'+
    '<div class="field"><label>Characters present</label><div class="ensemble-node-cast">'+arc.cast.map(row=>{
      const character=(P.characters||[]).find(item=>item.id===row.character);return '<label><input type="checkbox" data-ensemble-node-cast="'+esc(row.character)+'"'+(castSet.has(row.character)?' checked':'')+'> '+esc(character?.name||pretty(row.character))+'</label>';
    }).join('')+'</div></div>'+
    '<div class="field"><label>Draft dialogue · Speaker: line</label><textarea class="ensemble-dialogue-draft" id="ensembleNodeLines" placeholder="Emma Rowan: I have an idea.\nPlayer: I’m listening.">'+esc(ensembleLinesText(node.lines))+'</textarea></div>'+
    '<div class="two"><div class="field"><label>Node requirements</label><textarea id="ensembleNodeRequires" placeholder="player.employment.job = restaurant_kitchen">'+esc(ensembleRequirementsText(node.requires))+'</textarea></div>'+
    '<div class="field"><label>Effects on entry</label><textarea id="ensembleNodeEffects" placeholder="emma_rowan.trust + 2">'+esc(ensembleEffectsText(node.effects))+'</textarea></div></div>'+
    '<div class="ensemble-routes-title"><b>Outgoing routes</b><button class="btn" id="ensembleAddRoute">+ Route</button></div>'+node.routes.map((route,index)=>ensembleRouteHtml(arc,node,route,index)).join('')+
    (node.type==='ending'?'<p class="hint">Ending nodes intentionally have no outgoing route.</p>':'')+
    '<p class="hint">Use one requirement or effect per line. Examples: <code>emma_rowan.friendship &gt;= 35</code>, <code>waitress_path = true</code>, or <code>emma_rowan.trust + 5</code>.</p>';
}
function ensembleIssuesHtml(arc){
  const issues=ensembleArcIssues(arc);if(!issues.length)return '<div class="ensemble-issues clear"><b>Arc check passed</b><span>Every branch resolves and can reach an ending.</span></div>';
  return '<div class="ensemble-issues">'+issues.map(issue=>'<button class="'+issue.severity+'" data-ensemble-issue-node="'+esc(issue.node||'')+'"><b>'+issue.severity+'</b> '+esc(issue.message)+'</button>').join('')+'</div>';
}
function paintEnsembleArcStudio(){
  const arcs=normalizeEnsembleArcs();if(!arcs.some(arc=>arc.id===ensembleArcId))ensembleArcId=arcs[0]?.id||'';
  const arc=activeEnsembleArc();if(arc&&!arc.nodes.some(node=>node.id===ensembleNodeId))ensembleNodeId=arc.start_node||arc.nodes[0]?.id||'';
  $('ensembleArcTitle').textContent=arc?(arc.title||pretty(arc.id)):'Ensemble Story Arc Studio';
  const issues=arc?ensembleArcIssues(arc):[],errors=issues.filter(issue=>issue.severity==='error').length;
  $('ensembleArcHealth').textContent=arc?(errors?errors+' errors':issues.length?issues.length+' notes':'ready'):'';
  $('ensembleArcHealth').classList.toggle('bad',!!errors);
  ['ensembleArcDownload','ensembleArcScaffold','ensembleArcPlay'].forEach(id=>$(id).disabled=!arc);
  $('ensembleArcBody').innerHTML='<div class="ensemble-layout"><aside class="ensemble-sidebar">'+ensembleArcListHtml()+'</aside>'+(
    arc?'<main class="ensemble-main"><section class="ensemble-arc-overview"><div class="ensemble-arc-fields"><div class="field"><label>Arc title</label><input id="ensembleTitleInput" value="'+esc(arc.title)+'"></div>'+
      '<div class="field"><label>Arc id</label><input id="ensembleIdInput" value="'+esc(arc.id)+'"></div><div class="field"><label>Status</label><select id="ensembleStatus">'+ENSEMBLE_ARC_STATUSES.map(status=>'<option value="'+status+'"'+(arc.status===status?' selected':'')+'>'+pretty(status)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Category</label><input id="ensembleCategory" value="'+esc(arc.category)+'"></div></div>'+
      '<div class="field"><label>Arc summary</label><textarea id="ensembleSummary" placeholder="What is this story about, and why can the player choose different paths?">'+esc(arc.summary)+'</textarea></div>'+ensembleCastHtml(arc)+ensembleVariablesHtml(arc)+'</section>'+
      '<div class="ensemble-node-toolbar"><span>Story nodes</span>'+ENSEMBLE_NODE_TYPES.map(row=>'<button data-ensemble-add-node="'+row[0]+'">+ '+esc(row[1])+'</button>').join('')+'<button id="ensembleAutoArrange">Auto arrange</button></div>'+
      '<div class="ensemble-workspace"><section class="ensemble-graph-panel"><div class="ensemble-graph-scroll">'+ensembleGraphHtml(arc)+'</div>'+ensembleIssuesHtml(arc)+'</section>'+
      '<aside class="ensemble-inspector">'+ensembleNodeInspectorHtml(arc,activeEnsembleNode(arc))+'</aside></div></main>':
      '<main class="ensemble-main ensemble-welcome"><b>Plan branching stories before implementing them</b><p>Create an arc, add several characters, connect scenes and choices, then run it in the isolated VN playtester.</p><button class="btn gold" id="ensembleWelcomeNew">Create the first arc</button></main>')+'</div>';
  wireEnsembleArcStudio(arc);
}

function wireEnsembleGraph(arc){
  const canvas=$('ensembleCanvas');if(!canvas)return;
  canvas.querySelectorAll('[data-ensemble-node]').forEach(button=>{
    let origin=null;
    button.onclick=()=>{if(ensembleDragSuppress===button.dataset.ensembleNode){ensembleDragSuppress='';return;}
      ensembleNodeId=button.dataset.ensembleNode;paintEnsembleArcStudio();};
    button.onpointerdown=event=>{origin={x:event.clientX,y:event.clientY,left:parseFloat(button.style.left),top:parseFloat(button.style.top),moved:false};button.setPointerCapture(event.pointerId);};
    button.onpointermove=event=>{if(!origin)return;const dx=event.clientX-origin.x,dy=event.clientY-origin.y;if(Math.abs(dx)+Math.abs(dy)>6)origin.moved=true;
      if(origin.moved)button.style.transform='translate('+dx+'px,'+dy+'px)';};
    button.onpointerup=event=>{if(!origin)return;const state=origin;origin=null;button.releasePointerCapture(event.pointerId);
      if(!state.moved){button.style.transform='';return;}const node=arc.nodes.find(item=>item.id===button.dataset.ensembleNode);
      node.layout={x:Math.max(20,Math.round((state.left+event.clientX-state.x)/10)*10),y:Math.max(20,Math.round((state.top+event.clientY-state.y)/10)*10)};
      ensembleDragSuppress=node.id;save();paintEnsembleArcStudio();};
  });
}
function wireEnsembleArcStudio(arc){
  const body=$('ensembleArcBody');
  body.querySelectorAll('[data-ensemble-arc]').forEach(button=>button.onclick=()=>{ensembleArcId=button.dataset.ensembleArc;ensembleNodeId='';paintEnsembleArcStudio();});
  const create=()=>{const item=defaultEnsembleArc(P.ensemble_arcs.length);item.id=ensembleUniqueId(P.ensemble_arcs,item.id);P.ensemble_arcs.push(item);
    ensembleArcId=item.id;ensembleNodeId=item.start_node;save();paintEnsembleArcStudio();};
  if($('ensembleNewArc'))$('ensembleNewArc').onclick=create;if($('ensembleWelcomeNew'))$('ensembleWelcomeNew').onclick=create;
  if(!arc)return;
  $('ensembleDuplicateArc').onclick=()=>{const copy=JSON.parse(JSON.stringify(arc));copy.id=ensembleUniqueId(P.ensemble_arcs,arc.id+'_copy');copy.title=arc.title+' Copy';copy.status='draft';
    copy.nodes.forEach(node=>{node.implementation_status='draft';});P.ensemble_arcs.push(copy);ensembleArcId=copy.id;ensembleNodeId=copy.start_node;save();paintEnsembleArcStudio();};
  const arcField=(id,key,paint=false)=>$(id).onchange=event=>{arc[key]=event.target.value.trim();save();if(paint)paintEnsembleArcStudio();};
  $('ensembleTitleInput').oninput=event=>{arc.title=event.target.value;save();$('ensembleArcTitle').textContent=arc.title||pretty(arc.id);};
  $('ensembleTitleInput').onchange=()=>paintEnsembleArcStudio();
  $('ensembleIdInput').onchange=event=>{try{event.target.value=renameEnsembleArc(arc,event.target.value);save();paintEnsembleArcStudio();}
    catch(error){event.target.value=arc.id;note(esc(error.message));}};
  arcField('ensembleStatus','status',true);arcField('ensembleCategory','category');
  $('ensembleSummary').oninput=event=>{arc.summary=event.target.value;save();};
  body.querySelectorAll('[data-ensemble-cast]').forEach(input=>input.onchange=()=>{
    const id=input.dataset.ensembleCast;if(input.checked&&!arc.cast.some(row=>row.character===id))arc.cast.push({character:id,role:'supporting'});
    if(!input.checked){arc.cast=arc.cast.filter(row=>row.character!==id);arc.nodes.forEach(node=>node.cast=node.cast.filter(character=>character!==id));}
    save();paintEnsembleArcStudio();
  });
  body.querySelectorAll('[data-ensemble-role]').forEach(select=>select.onchange=()=>{const row=arc.cast.find(item=>item.character===select.dataset.ensembleRole);if(row)row.role=select.value;save();});
  $('ensembleEntryRequirements').oninput=event=>{arc.entry_requirements=parseEnsembleRequirements(event.target.value,arc);save();};
  $('ensembleEntryRequirements').onchange=event=>{event.target.value=ensembleRequirementsText(arc.entry_requirements);save();};
  $('ensembleAddVariable').onclick=()=>{const id=ensembleUniqueId(arc.variables,'arc_variable');arc.variables.push({id,label:'Arc variable',type:'number',default:0});save();paintEnsembleArcStudio();};
  body.querySelectorAll('[data-ensemble-variable-label]').forEach(input=>input.oninput=()=>{arc.variables[+input.dataset.ensembleVariableLabel].label=input.value;save();});
  body.querySelectorAll('[data-ensemble-variable-id]').forEach(input=>input.onchange=()=>{const variable=arc.variables[+input.dataset.ensembleVariableId];input.value=renameEnsembleVariable(arc,variable,input.value);save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-variable-type]').forEach(select=>select.onchange=()=>{const variable=arc.variables[+select.dataset.ensembleVariableType];variable.type=select.value;
    if(variable.type==='boolean')variable.default=!!variable.default;else if(variable.type==='number')variable.default=+variable.default||0;else variable.default=String(variable.default??'');save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-variable-default]').forEach(input=>input.onchange=()=>{const variable=arc.variables[+input.dataset.ensembleVariableDefault];variable.default=ensembleValue(input.value);save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-remove-variable]').forEach(button=>button.onclick=()=>{arc.variables.splice(+button.dataset.ensembleRemoveVariable,1);save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-add-node]').forEach(button=>button.onclick=()=>{addEnsembleNode(arc,button.dataset.ensembleAddNode);paintEnsembleArcStudio();});
  $('ensembleAutoArrange').onclick=()=>{autoArrangeEnsembleArc(arc);save();paintEnsembleArcStudio();};
  body.querySelectorAll('[data-ensemble-issue-node]').forEach(button=>button.onclick=()=>{if(button.dataset.ensembleIssueNode){ensembleNodeId=button.dataset.ensembleIssueNode;paintEnsembleArcStudio();}});
  wireEnsembleGraph(arc);const node=activeEnsembleNode(arc);if(!node)return;
  $('ensembleDuplicateNode').onclick=()=>{duplicateEnsembleNode(arc,node);paintEnsembleArcStudio();};
  $('ensembleRemoveNode').onclick=()=>{if(!confirm('Remove '+node.title+'? Routes pointing here will remain visible as errors until you reconnect them.'))return;
    arc.nodes=arc.nodes.filter(item=>item!==node);if(arc.start_node===node.id)arc.start_node=arc.nodes[0]?.id||'';ensembleNodeId=arc.start_node;save();paintEnsembleArcStudio();};
  $('ensembleNodeTitleInput').oninput=event=>{node.title=event.target.value;save();};$('ensembleNodeTitleInput').onchange=()=>paintEnsembleArcStudio();
  $('ensembleNodeIdInput').onchange=event=>{try{event.target.value=renameEnsembleNode(arc,node,event.target.value);save();paintEnsembleArcStudio();}
    catch(error){event.target.value=node.id;note(esc(error.message));}};
  $('ensembleNodeType').onchange=event=>{node.type=event.target.value;if(node.type==='ending')node.routes=[];save();paintEnsembleArcStudio();};
  $('ensembleNodeStatus').onchange=event=>{node.implementation_status=event.target.value;save();paintEnsembleArcStudio();};
  [['ensembleNodeLocation','location'],['ensembleNodeDay','day'],['ensembleNodeBlock','block']].forEach(([id,key])=>$(id).onchange=event=>{node[key]=event.target.value;save();paintEnsembleArcStudio();});
  $('ensembleNodeStart').onchange=event=>{if(event.target.checked)arc.start_node=node.id;else if(arc.start_node===node.id)arc.start_node='';save();paintEnsembleArcStudio();};
  $('ensembleNodeSummary').oninput=event=>{node.summary=event.target.value;save();};
  $('ensembleNodeLines').oninput=event=>{node.lines=parseEnsembleLines(event.target.value);save();};
  $('ensembleNodeLines').onchange=event=>{event.target.value=ensembleLinesText(node.lines);save();};
  $('ensembleNodeRequires').oninput=event=>{node.requires=parseEnsembleRequirements(event.target.value,arc);save();};
  $('ensembleNodeRequires').onchange=event=>{event.target.value=ensembleRequirementsText(node.requires);save();};
  $('ensembleNodeEffects').oninput=event=>{node.effects=parseEnsembleEffects(event.target.value,arc);save();};
  $('ensembleNodeEffects').onchange=event=>{event.target.value=ensembleEffectsText(node.effects);save();};
  body.querySelectorAll('[data-ensemble-node-cast]').forEach(input=>input.onchange=()=>{const id=input.dataset.ensembleNodeCast;
    if(input.checked&&!node.cast.includes(id))node.cast.push(id);else if(!input.checked)node.cast=node.cast.filter(item=>item!==id);save();paintEnsembleArcStudio();});
  $('ensembleAddRoute').onclick=()=>{if(node.type==='ending')node.type='scene';node.routes.push({id:ensembleUniqueId(node.routes,'route'),label:'New route',target:'',requires:[],effects:[]});save();paintEnsembleArcStudio();};
  body.querySelectorAll('[data-ensemble-remove-route]').forEach(button=>button.onclick=()=>{node.routes.splice(+button.dataset.ensembleRemoveRoute,1);save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-route-label]').forEach(input=>input.oninput=()=>{node.routes[+input.dataset.ensembleRouteLabel].label=input.value;save();});
  body.querySelectorAll('[data-ensemble-route-target]').forEach(select=>select.onchange=()=>{node.routes[+select.dataset.ensembleRouteTarget].target=select.value;save();paintEnsembleArcStudio();});
  body.querySelectorAll('[data-ensemble-route-requires]').forEach(input=>{input.oninput=()=>{const route=node.routes[+input.dataset.ensembleRouteRequires];route.requires=parseEnsembleRequirements(input.value,arc);save();};
    input.onchange=()=>{input.value=ensembleRequirementsText(node.routes[+input.dataset.ensembleRouteRequires].requires);save();};});
  body.querySelectorAll('[data-ensemble-route-effects]').forEach(input=>{input.oninput=()=>{const route=node.routes[+input.dataset.ensembleRouteEffects];route.effects=parseEnsembleEffects(input.value,arc);save();};
    input.onchange=()=>{input.value=ensembleEffectsText(node.routes[+input.dataset.ensembleRouteEffects].effects);save();};});
}

function ensembleStatePreset(arc,preset='fresh'){
  const state={variables:{},stats:{},flags:{},visited:[]};
  arc.variables.forEach(variable=>state.variables[variable.id]=variable.default);
  arc.cast.forEach(row=>{const character=(P.characters||[]).find(item=>item.id===row.character);
    Object.entries(character?.relationship_defaults||{}).forEach(([key,value])=>state.stats[row.character+'.'+key]=+value||0);});
  if(preset==='midgame')Object.keys(state.stats).forEach(key=>state.stats[key]=Math.max(50,state.stats[key]));
  if(preset==='open'){
    Object.keys(state.stats).forEach(key=>state.stats[key]=100);
    arc.variables.forEach(variable=>state.variables[variable.id]=variable.type==='boolean'?true:variable.type==='number'?100:variable.default);
    const rules=[...arc.entry_requirements,...arc.nodes.flatMap(node=>[...node.requires,...node.routes.flatMap(route=>route.requires)])];
    rules.forEach(rule=>{if(rule.kind==='stat')state.stats[rule.character+'.'+rule.key]=rule.op==='lte'?+rule.value:Math.max(100,+rule.value||0);
      else if(rule.kind==='variable')state.variables[rule.key]=rule.op==='is_false'?false:rule.value;
      else state.flags[rule.key]=rule.op==='is_false'?false:rule.value;});
  }
  return state;
}
function ensembleStateGet(rule,state){
  if(rule.kind==='stat')return state.stats[rule.character+'.'+rule.key]??0;
  if(rule.kind==='variable')return state.variables[rule.key];return state.flags[rule.key];
}
function ensembleRequirementMet(rule,state){
  const have=ensembleStateGet(rule,state),want=rule.value;
  if(rule.op==='is_true')return have===true||(+have||0)>0;
  if(rule.op==='is_false')return !(have===true||(+have||0)>0);
  if(rule.op==='gte')return (+have||0)>=(+want||0);if(rule.op==='lte')return (+have||0)<=(+want||0);
  if(rule.op==='neq')return have!==want;return have===want||String(have)===String(want);
}
function ensembleApplyEffects(effects,state){
  const changes=[];(effects||[]).forEach(effect=>{const key=ensembleRuleKey(effect),before=ensembleStateGet(effect,state);
    const value=effect.op==='add'?(+before||0)+(+effect.value||0):effect.value;
    if(effect.kind==='stat')state.stats[key]=value;else if(effect.kind==='variable')state.variables[effect.key]=value;else state.flags[effect.key]=value;
    changes.push({key,before,value});});return changes;
}
function ensemblePlayEnter(arc,nodeId,routeEffects=[]){
  const node=arc.nodes.find(item=>item.id===nodeId);if(!node)return false;ensemblePlayNodeId=node.id;
  ensemblePlayLastChanges=[...ensembleApplyEffects(routeEffects,ensemblePlayState),...ensembleApplyEffects(node.effects,ensemblePlayState)];
  ensemblePlayState.visited.push(node.id);return true;
}
function startEnsemblePlaytest(arc,preset='fresh'){
  ensemblePlayArcId=arc.id;ensemblePlayHistory=[];ensemblePlayState=ensembleStatePreset(arc,preset);
  ensemblePlayNodeId='';ensemblePlayLastChanges=[];ensemblePlayEnter(arc,arc.start_node);paintEnsemblePlaytest();
}
function ensemblePlayRoute(index){
  const arc=P.ensemble_arcs.find(item=>item.id===ensemblePlayArcId),node=arc?.nodes.find(item=>item.id===ensemblePlayNodeId),route=node?.routes[index];
  const target=arc?.nodes.find(item=>item.id===route?.target),requirements=[...(route?.requires||[]),...(target?.requires||[])];
  if(!arc||!route||!target||!requirements.every(rule=>ensembleRequirementMet(rule,ensemblePlayState)))return;
  ensemblePlayHistory.push({node:ensemblePlayNodeId,state:JSON.parse(JSON.stringify(ensemblePlayState)),changes:JSON.parse(JSON.stringify(ensemblePlayLastChanges))});
  ensemblePlayEnter(arc,route.target,route.effects);paintEnsemblePlaytest();
}
function ensemblePlayStateHtml(arc){
  const statKeys=['friendship','trust','respect','love'];
  return '<section class="ensemble-test-state"><h4>Test state</h4><p>Changes here affect this playtest only.</p>'+arc.variables.map(variable=>'<label>'+esc(variable.label)+'<input data-play-variable="'+esc(variable.id)+'" value="'+esc(stateValueText(ensemblePlayState.variables[variable.id]))+'"></label>').join('')+
    arc.cast.map(row=>{const character=(P.characters||[]).find(item=>item.id===row.character);return '<details><summary>'+esc(character?.name||pretty(row.character))+'</summary>'+statKeys.map(key=>'<label>'+pretty(key)+'<input type="number" data-play-stat="'+esc(row.character+'.'+key)+'" value="'+esc(ensemblePlayState.stats[row.character+'.'+key]??0)+'"></label>').join('')+'</details>';}).join('')+'</section>';
}
function paintEnsemblePlaytest(){
  const arc=P.ensemble_arcs.find(item=>item.id===ensemblePlayArcId),node=arc?.nodes.find(item=>item.id===ensemblePlayNodeId);if(!arc||!node)return;
  $('ensemblePlaytestTitle').textContent=arc.title+' · playtest';$('ensemblePlaytestBack').disabled=!ensemblePlayHistory.length;
  const entryUnmet=arc.entry_requirements.filter(rule=>!ensembleRequirementMet(rule,ensemblePlayState));
  const routeButtons=node.routes.map((route,index)=>{const target=arc.nodes.find(item=>item.id===route.target),unmet=[...route.requires,...(target?.requires||[])].filter(rule=>!ensembleRequirementMet(rule,ensemblePlayState));
    return '<button data-play-route="'+index+'"'+(unmet.length||!route.target?' disabled':'')+'><b>'+esc(route.label)+'</b><span>'+(
      !route.target?'No destination':unmet.length?'Locked: '+unmet.map(rule=>ensembleRequirementsText([rule])).join(', '):'Go to '+esc(arc.nodes.find(item=>item.id===route.target)?.title||pretty(route.target)))+'</span></button>';}).join('');
  const lines=node.lines.length?node.lines.map(line=>'<div class="ensemble-vn-line '+(line.speaker==='__narrator__'?'narrator':'')+'"><b>'+esc(line.speaker==='__narrator__'?'Narration':line.speaker==='player'?'Player':
    (P.characters||[]).find(item=>item.id===line.speaker)?.name||pretty(line.speaker))+'</b><p>'+esc(line.text)+'</p></div>').join(''):
    '<div class="ensemble-vn-placeholder">'+esc(node.summary||'No dialogue has been drafted for this node yet.')+'</div>';
  const changes=ensemblePlayLastChanges.length?'<div class="ensemble-test-changes"><b>State changes</b>'+ensemblePlayLastChanges.map(change=>'<span>'+esc(pretty(change.key))+': '+esc(stateValueText(change.before))+' → '+esc(stateValueText(change.value))+'</span>').join('')+'</div>':'';
  $('ensemblePlaytestBody').innerHTML='<div class="ensemble-play-layout"><aside class="ensemble-test-nav"><label>Jump to node<select id="ensemblePlayJump">'+arc.nodes.map(item=>'<option value="'+esc(item.id)+'"'+(item.id===node.id?' selected':'')+'>'+esc(item.title)+'</option>').join('')+'</select></label>'+
    '<div class="ensemble-play-history"><b>Visited</b>'+ensemblePlayState.visited.map((id,index)=>'<span>'+ (index+1)+'. '+esc(arc.nodes.find(item=>item.id===id)?.title||pretty(id))+'</span>').join('')+'</div>'+ensemblePlayStateHtml(arc)+'</aside>'+
    '<main class="ensemble-vn"><div class="ensemble-vn-slug"><span>'+esc(pretty(node.type))+'</span><b>'+esc(node.title)+'</b><small>'+esc(node.location?placeName(node.location):'Flexible location')+(node.day?' · '+pretty(node.day):'')+(node.block?' · '+pretty(node.block):'')+'</small></div>'+
    (entryUnmet.length?'<div class="ensemble-entry-warning"><b>Arc entry would currently be locked</b><span>'+esc(entryUnmet.map(rule=>ensembleRequirementsText([rule])).join(' · '))+'</span></div>':'')+
    '<div class="ensemble-vn-screen">'+lines+'</div>'+changes+'<div class="ensemble-vn-choices">'+(routeButtons||'<div class="ensemble-vn-ending">End of this route</div>')+'</div></main></div>';
  $('ensemblePlaytestBody').querySelectorAll('[data-play-route]').forEach(button=>button.onclick=()=>ensemblePlayRoute(+button.dataset.playRoute));
  $('ensemblePlayJump').onchange=event=>{ensemblePlayHistory.push({node:ensemblePlayNodeId,state:JSON.parse(JSON.stringify(ensemblePlayState)),changes:JSON.parse(JSON.stringify(ensemblePlayLastChanges))});ensemblePlayEnter(arc,event.target.value);paintEnsemblePlaytest();};
  $('ensemblePlaytestBody').querySelectorAll('[data-play-variable]').forEach(input=>input.onchange=()=>{ensemblePlayState.variables[input.dataset.playVariable]=ensembleValue(input.value);paintEnsemblePlaytest();});
  $('ensemblePlaytestBody').querySelectorAll('[data-play-stat]').forEach(input=>input.onchange=()=>{ensemblePlayState.stats[input.dataset.playStat]=+input.value||0;paintEnsemblePlaytest();});
}

function openEnsembleArcStudio(){
  normalizeEnsembleArcs();if(!P.ensemble_arcs.some(arc=>arc.id===ensembleArcId))ensembleArcId=P.ensemble_arcs[0]?.id||'';
  ensembleNodeId=activeEnsembleArc()?.start_node||'';paintEnsembleArcStudio();$('ensembleArcStudio').showModal();
}
function isEnsembleArcPackage(data){return !!data&&data.format==='scenewright.ensemble_arc.v1'&&data.arc&&typeof data.arc==='object';}
function importEnsembleArcPackage(data){
  const arc=normalizeEnsembleArc(JSON.parse(JSON.stringify(data.arc)),P.ensemble_arcs.length);
  arc.id=ensembleUniqueId(P.ensemble_arcs,arc.id);P.ensemble_arcs.push(arc);ensembleArcId=arc.id;ensembleNodeId=arc.start_node;save();return arc;
}
function downloadEnsembleArc(arc){
  const out={format:'scenewright.ensemble_arc.v1',arc:JSON.parse(JSON.stringify(arc))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:arc.id+'.ensemble-arc.json'}).click();URL.revokeObjectURL(url);
}

if(typeof document!=='undefined'){
  $('openEnsembleArcs').onclick=openEnsembleArcStudio;
  $('openEnsembleArcsFromCharacter').onclick=()=>{$('relationshipArcWorkshop').close();openEnsembleArcStudio();};
  $('ensembleArcClose').onclick=()=>$('ensembleArcStudio').close();
  $('ensemblePlaytestClose').onclick=()=>$('ensemblePlaytest').close();
  $('ensembleArcDownload').onclick=()=>{const arc=activeEnsembleArc();if(arc)downloadEnsembleArc(arc);};
  $('ensembleArcScaffold').onclick=()=>{const arc=activeEnsembleArc();if(!arc)return;const result=scaffoldEnsembleArc(arc);paintAll();paintEnsembleArcStudio();
    note(result.collisions.length?'Kept existing content with conflicting ids: '+result.collisions.map(esc).join(', ')+'.':
      'Created '+result.created.length+' scene'+(result.created.length===1?'':'s')+'; '+result.existing.length+' already existed; '+result.skipped.length+' planning-only nodes skipped.');};
  $('ensembleArcPlay').onclick=()=>{const arc=activeEnsembleArc();if(!arc)return;$('ensemblePlaytestPreset').value='fresh';startEnsemblePlaytest(arc,'fresh');$('ensemblePlaytest').showModal();};
  $('ensemblePlaytestPreset').onchange=event=>{const arc=P.ensemble_arcs.find(item=>item.id===ensemblePlayArcId);if(arc)startEnsemblePlaytest(arc,event.target.value);};
  $('ensemblePlaytestRestart').onclick=()=>{const arc=P.ensemble_arcs.find(item=>item.id===ensemblePlayArcId);if(arc)startEnsemblePlaytest(arc,$('ensemblePlaytestPreset').value);};
  $('ensemblePlaytestBack').onclick=()=>{const previous=ensemblePlayHistory.pop();if(!previous)return;ensemblePlayNodeId=previous.node;ensemblePlayState=previous.state;ensemblePlayLastChanges=previous.changes;paintEnsemblePlaytest();};
}
