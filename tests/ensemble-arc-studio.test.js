const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const context=vm.createContext({console,URL,Blob});
const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=source=>vm.runInContext(source,context);

load('js/00-state.js');
load('js/02-places.js');
load('js/11c-ensemble-arc.js');

run(`
  const emma={id:'emma_rowan',name:'Emma Rowan',relationship_defaults:{friendship:32,trust:12,respect:8,love:3}};
  const sofia={id:'sofia_alvarez',name:'Sofia Alvarez',relationship_defaults:{friendship:8,trust:4,respect:14,love:0}};
  P={characters:[emma,sofia],locations:[{id:'la_brisa_kitchen',name:'La Brisa Kitchen'}],content:[],ensemble_arcs:[],
    districts:[],travel:null,aliases:{},dismissedBundledCharacters:[],residence_overrides:{}};
  const arc=defaultEnsembleArc(0);
  Object.assign(arc,{id:'different_uniform',title:'A Different Uniform',summary:'Emma and Sofia test a new restaurant career path.',
    cast:[{character:'emma_rowan',role:'lead'},{character:'sofia_alvarez',role:'supporting'}],
    variables:[{id:'waitress_path',label:'Waitress path',type:'boolean',default:false}]});
  const opening=arc.nodes.find(node=>node.id==='opening'),decision=arc.nodes.find(node=>node.id==='decision');
  const accepted=arc.nodes.find(node=>node.id==='accepted_path'),declined=arc.nodes.find(node=>node.id==='declined_ending');
  Object.assign(opening,{location:'la_brisa_kitchen',cast:['emma_rowan'],lines:[{speaker:'emma_rowan',text:'I have an idea.'}]});
  decision.cast=['emma_rowan'];decision.lines=[{speaker:'emma_rowan',text:'Do you want to try it?'}];
  decision.routes[0].requires=parseEnsembleRequirements('emma_rowan.friendship >= 30',arc);
  decision.routes[0].effects=parseEnsembleEffects('emma_rowan.trust + 5; waitress_path = true',arc);
  Object.assign(accepted,{type:'scene',location:'la_brisa_kitchen',cast:['emma_rowan','sofia_alvarez'],
    lines:parseEnsembleLines('Emma Rowan: Sofia can help us.\\nSofia Alvarez: Then let us make a plan.'),
    routes:[{id:'finish',label:'Continue',target:'success_ending',requires:[],effects:[]}],implementation_status:'approved'});
  const success=defaultEnsembleNode('ending',4);Object.assign(success,{id:'success_ending',title:'New opportunity',
    lines:[{speaker:'sofia_alvarez',text:'You earned the chance.'}],cast:['sofia_alvarez'],location:'la_brisa_kitchen',implementation_status:'approved'});
  opening.implementation_status='approved';decision.implementation_status='approved';declined.implementation_status='approved';
  declined.lines=[{speaker:'emma_rowan',text:'The offer stays open.'}];arc.nodes.push(success);P.ensemble_arcs.push(arc);
  normalizeEnsembleArcs();autoArrangeEnsembleArc(arc);
  const issues=ensembleArcIssues(arc);
  const reachable=[...ensembleReachable(arc)].sort(),endingReach=[...ensembleCanReachEnding(arc)].sort();
  const parsedRequirements=parseEnsembleRequirements('emma_rowan.friendship >= 35\\nplayer.job = restaurant_kitchen\\n!closed_path',arc);
  const parsedEffects=parseEnsembleEffects('emma_rowan.trust + 5\\nwaitress_path = true',arc);
  const fresh=ensembleStatePreset(arc,'fresh'),open=ensembleStatePreset(arc,'open');
  const accept=decision.routes[0];
  const before=fresh.stats['emma_rowan.trust'];const changes=ensembleApplyEffects(accept.effects,fresh);
  ensembleArcId=arc.id;ensembleNodeId=accepted.id;
  const renamed=renameEnsembleNode(arc,accepted,'restaurant_training');
  const rewrittenTarget=decision.routes[0].target;
  const firstBuild=scaffoldEnsembleArc(arc),secondBuild=scaffoldEnsembleArc(arc);
  const built=P.content.map(item=>({id:item.id,type:item.type,marker:item.ensembleArc||item.questPlan?.ensembleArc,
    jumps:item.type==='conversation'?item.nodes.filter(node=>node.type==='jump').map(node=>node.target):[]}));
  const packageData={format:'scenewright.ensemble_arc.v1',arc:JSON.parse(JSON.stringify(arc))};
  const imported=importEnsembleArcPackage(packageData);
  globalThis.ENSEMBLE_RESULT={arc,issues,reachable,endingReach,parsedRequirements,parsedEffects,fresh,open,before,changes,
    renamed,rewrittenTarget,firstBuild,secondBuild,built,importedId:imported.id,layout:arc.nodes.map(node=>node.layout)};
`);

const result=JSON.parse(JSON.stringify(context.ENSEMBLE_RESULT));
assert.equal(result.arc.cast.length,2);
assert.equal(result.arc.start_node,'opening');
assert.equal(result.reachable.length,5);
assert.equal(result.endingReach.includes('opening'),true);
assert.equal(result.issues.filter(issue=>issue.severity==='error').length,0);
assert.equal(result.parsedRequirements[0].kind,'stat');
assert.equal(result.parsedRequirements[0].character,'emma_rowan');
assert.equal(result.parsedRequirements[1].kind,'flag');
assert.equal(result.parsedRequirements[1].value,'restaurant_kitchen');
assert.equal(result.parsedRequirements[2].op,'is_false');
assert.equal(result.parsedEffects[0].op,'add');
assert.equal(result.parsedEffects[1].kind,'variable');
assert.equal(result.before,12);
assert.equal(result.fresh.stats['emma_rowan.trust'],17);
assert.equal(result.fresh.variables.waitress_path,true);
assert.equal(result.changes.length,2);
assert.equal(result.open.stats['emma_rowan.friendship']>=35,true);
assert.equal(result.renamed,'restaurant_training');
assert.equal(result.rewrittenTarget,'restaurant_training');
assert.equal(result.firstBuild.created.length,5);
assert.equal(result.secondBuild.created.length,0);
assert.equal(result.secondBuild.existing.length,5);
assert.equal(result.built.every(item=>item.marker.arc_id==='different_uniform'),true);
assert.equal(result.built.some(item=>item.jumps.includes('different_uniform__decision')),true);
assert.notEqual(result.importedId,'different_uniform','importing a duplicate arc must preserve both with unique ids');
assert.equal(result.layout.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)),true);

console.log('ensemble story arc studio regression tests passed');
