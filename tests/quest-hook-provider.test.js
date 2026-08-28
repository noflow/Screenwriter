const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/08d-hooks.js'), 'utf8');

assert.match(source, /await askModel\(prompt,undefined,true\)/,
  'quest-hook drafting must use the shared AI-provider router');
assert.doesNotMatch(source, /fetch\(HOST\s*\+\s*['"]\/api\/chat/,
  'quest-hook drafting must not call Ollama directly');

const elements = new Proxy({}, {get(target, id) {
  return target[id] || (target[id] = {id, value:'', disabled:false});
}});
let routedPrompt = '';
const context = vm.createContext({
  console,
  P:{characters:[],locations:[{id:'campus',name:'Campus'}],content:[]},
  selChar:0,sel:'',stageIx:0,focusPath:[],busy:false,
  $:id => elements[id],
  pretty:value => String(value||'').replaceAll('_',' '),
  esc:value => String(value??''),
  charBrief:character => character.name,
  slug:value => String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''),
  coerceArray:value => Array.isArray(value)?value:[],
  resolvePlaceRef:value => value==='campus'?'campus':null,
  askModel:async prompt => {
    routedPrompt=prompt;
    return JSON.stringify({title:'A New Direction',summary:'Help Lily change programs.',
      location:'campus',block:'afternoon',
      objectives:[{id:'meet_advisor',text:'Meet the academic advisor.'}],branches:[]});
  },
  note:()=>{},save:()=>{},paintAll:()=>{},
});
vm.runInContext(source, context, {filename:'js/08d-hooks.js'});

(async()=>{
  const character={id:'lily_hale',name:'Lily Hale',schedule:{fixed_commitments:[]}};
  await context.draftHook(character,'program_change');
  assert.match(routedPrompt, /program_change/);
  assert.equal(context.P.content.length, 1);
  assert.equal(context.P.content[0].title, 'A New Direction');
  assert.equal(context.P.content[0].id, 'program_change');
  console.log('quest-hook provider regression tests passed');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
