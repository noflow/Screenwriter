const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {id, value:'', onclick:null, onchange:null});
  return elements.get(id);
};
const context = vm.createContext({
  console,
  document:{getElementById:element},
});
const load = file => vm.runInContext(
  fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

load('js/00-state.js');
load('js/01-sheets.js');
load('js/02-places.js');
load('js/03-schedule.js');
load('js/02c-game-presentation-assets.js');
load('js/11d-scene-director.js');
load('js/17-authored-in.js');
load('js/18-authored-out.js');

const bundledCatalog = JSON.parse(run('JSON.stringify(BUNDLED_PRESENTATION_ASSET_CATALOG)'));
assert.equal(bundledCatalog.source_package_id, 'port_alder_vn_art');
assert.ok(bundledCatalog.backgrounds.length >= 17);
assert.ok(bundledCatalog.portraits.length >= 15);

run(`
  function plannedSceneEffects(){ return []; }
  BUNDLED_PRESENTATION_ASSET_CATALOG.backgrounds.push({
    id:'test_cafe.window_table',path:'res://assets/art/backgrounds/test_cafe/window_table.webp',
    variants:{rain:'res://assets/art/backgrounds/test_cafe/window_table_rain.webp'}
  });
  BUNDLED_PRESENTATION_ASSET_CATALOG.audio.push(
    {id:'quiet_piano',path:'res://assets/audio/music/quiet_piano.ogg',bus:'Music',cue_type:'music'},
    {id:'window_rain',path:'res://assets/audio/ambience/window_rain.ogg',bus:'Ambience',cue_type:'ambience'},
    {id:'cup_down',path:'res://assets/audio/sfx/cup_down.ogg',bus:'UI',cue_type:'sfx'}
  );
  P={
    characters:[{id:'test_npc',name:'Test NPC',display_name:'Test NPC',color:'#98bda8',
      asset_refs:{portraits:[{id:'default'},{id:'smile'}],
        audio:[{id:'npc_chime',path:'res://assets/audio/sfx/npc_chime.ogg',bus:'UI'}]}}],
    locations:[{id:'test_cafe',name:'Test Café',district:'test',tags:['package'],
      rooms:[{id:'window_table',name:'Window Table'}]}],
    content:[],districts:[],travel:null,aliases:{},dismissedBundledCharacters:[],
    residence_overrides:{}
  };
  DISTRICTS=[{id:'test',name:'Test District'}];
  const authored={
    id:'directed_scene',title:'Directed Scene',type:'standard_topic',start_node:'opening',
    activation:{location:'test_cafe.window_table',block:'evening',day:'friday'},
    presentation:{transition:'fade',music:'quiet_piano',camera_language:'intimate'},
    nodes:{
      opening:{speaker:'test_npc',line:'You made it.',expression:'warm',portrait:'smile',
        background_variant:'rain',position:'left',transition:'dissolve',music:'meeting_theme',
        ambience:'window_rain',sfx:'cup_down',future_runtime_field:17,next:'reply'},
      reply:{speaker:'player',line:'I said I would.',next:null}
    }
  };
  const made=convertConversation(authored,P.characters[0],{conversations:[]},{append:false,report:false});
  globalThis.IMPORTED=JSON.stringify(made[0]);
  made[0].sceneDirection.music='new_theme';
  made[0].sceneDirection.ambience='late_cafe';
  made[0].nodes[0].emotion='amused';
  made[0].nodes[0].stage.position='right';
  made[0].nodes[0].stage.sfx='';
  globalThis.EXPORTED=JSON.stringify(conversationOut({base:'directed_scene',main:made[0],parts:[]}));
`);

const imported = JSON.parse(context.IMPORTED);
assert.equal(imported.sceneDirection.transition, 'fade');
assert.equal(imported.sceneDirection._orig.camera_language, 'intimate');
assert.deepEqual(imported.nodes[0].stage, {
  portrait:'smile',background_variant:'rain',position:'left',transition:'dissolve',
  music:'meeting_theme',ambience:'window_rain',sfx:'cup_down'
});

const exported = JSON.parse(context.EXPORTED);
assert.equal(exported.presentation.music, 'new_theme');
assert.equal(exported.presentation.ambience, 'late_cafe');
assert.equal(exported.presentation.camera_language, 'intimate',
  'unknown conversation presentation fields must survive a round trip');
assert.equal(exported.nodes.opening.expression, 'amused');
assert.equal(exported.nodes.opening.position, 'right');
assert.equal(exported.nodes.opening.portrait, 'smile');
assert.equal(exported.nodes.opening.background_variant, 'rain');
assert.equal(exported.nodes.opening.future_runtime_field, 17,
  'unknown dialogue-node fields must survive a round trip');
assert.equal(Object.hasOwn(exported.nodes.opening, 'sfx'), false,
  'clearing a modeled cue must remove the imported value');

run([
  "const cueEntry={node:{speaker:'test_npc'}};",
  "globalThis.CATALOG_RESULT=JSON.stringify({",
  "background:sceneDirectorBackgroundAsset('test_cafe.window_table')?.id,",
  "variants:sceneDirectorVariantAssets('test_cafe.window_table').map(item=>item.id),",
  "portraits:sceneDirectorPortraitAssets(cueEntry).map(item=>item.id),",
  "music:sceneDirectorAudioAssets('music',null).map(item=>item.id),",
  "ambience:sceneDirectorAudioAssets('ambience',null).map(item=>item.id),",
  "sfx:sceneDirectorAudioAssets('sfx',cueEntry).map(item=>item.id),",
  "known:sceneDirectorAssetControl('Music','quiet_piano','music','stage','music',cueEntry,'test_cafe.window_table','Inherit'),",
  "custom:sceneDirectorAssetControl('Music','typo_theme','music','stage','music',cueEntry,'test_cafe.window_table','Inherit')",
  "});"
].join('\n'));
const catalog = JSON.parse(context.CATALOG_RESULT);
assert.equal(catalog.background, 'test_cafe.window_table');
assert.deepEqual(catalog.variants, ['rain']);
assert.deepEqual(catalog.portraits, ['default','smile']);
assert.deepEqual(catalog.music, ['quiet_piano']);
assert.deepEqual(catalog.ambience, ['window_rain']);
assert.deepEqual(catalog.sfx, ['cup_down','npc_chime']);
assert.match(catalog.known, /quiet_piano[^]*selected/);
assert.match(catalog.known, /Registered music/);
assert.match(catalog.custom, /value="__custom__" selected/);
assert.match(catalog.custom, /verify it in the game asset catalog/);

run(`
  P.content=[{uid:'branching',type:'conversation',id:'branching',title:'Branching',cast:['test_npc'],
    location:'test_cafe.window_table',nodes:[
      {type:'line',speaker:'test_npc',text:'First',emotion:''},
      {type:'choice',options:[
        {text:'A',nodes:[{type:'line',speaker:'player',text:'A reply',emotion:''}]},
        {text:'B',nodes:[{type:'line',speaker:'test_npc',text:'B reply',emotion:''}]}
      ]}
    ]}];
  globalThis.LINE_PATHS=JSON.stringify(sceneDirectorLines(P.content[0]).map(entry=>entry.key));
`);
assert.deepEqual(JSON.parse(context.LINE_PATHS), ['0','1.0.0','1.1.0'],
  'the cue sheet must include lines inside every branch');

console.log('VN scene director regression tests passed');
