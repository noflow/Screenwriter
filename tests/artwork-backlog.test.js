const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {id, value:'', innerHTML:'', onclick:null, onchange:null});
  return elements.get(id);
};
const context = vm.createContext({console, document:{getElementById:element}});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

load('js/00-state.js');
load('js/01-sheets.js');
load('js/02-places.js');
load('js/02c-game-presentation-assets.js');
load('js/11d-scene-director.js');
load('js/11e-artwork-backlog.js');

const backlog = JSON.parse(run('JSON.stringify(artworkBacklogData())'));
assert.equal(backlog.mode, 'artwork_first');
assert.equal(backlog.audio_in_scope, false);
assert.equal(backlog.phases.length, 4);
assert.equal(backlog.phases[0].id, 'opening_morning');
assert.equal(backlog.phases[0].priority, 1);

const summary = JSON.parse(run('JSON.stringify(artworkBacklogSummary())'));
assert.deepEqual(summary, {
  total:33,
  backgrounds:24,
  portraits:9,
  statuses:{missing:13,placeholder:20,in_progress:0,review:0,ready:0}
});

run(`
  const allArtwork=artworkBacklogAssets().map(item=>item.asset);
  globalThis.ART_RESOLUTIONS=JSON.stringify({
    bedroom:artworkBacklogResolution(allArtwork.find(item=>item.id==='hale_home.player_bedroom')),
    street:artworkBacklogResolution(allArtwork.find(item=>item.id==='alder_heights_residential_street.hale_block')),
    elena:artworkBacklogResolution(allArtwork.find(item=>item.character_id==='elena_reyes_hale'))
  });
  globalThis.ALL_MARKUP=artworkBacklogMarkup('all');
  globalThis.BG_MARKUP=artworkBacklogMarkup('background');
  globalThis.ACTIVE_MARKUP=artworkBacklogMarkup('active');
`);
const resolutions = JSON.parse(context.ART_RESOLUTIONS);
assert.equal(resolutions.bedroom.state, 'placeholder');
assert.equal(resolutions.bedroom.text, 'Registered placeholder');
assert.equal(resolutions.street.state, 'missing');
assert.equal(resolutions.elena.state, 'placeholder');
assert.match(context.ALL_MARKUP, /Opening Morning at Hale Home/);
assert.match(context.ALL_MARKUP, /33 prioritized assets/);
assert.match(context.ALL_MARKUP, /Elena Reyes Hale portrait set/);
assert.match(context.ALL_MARKUP, /Audio is intentionally outside this production plan/);
assert.doesNotMatch(context.BG_MARKUP, /data-art-kind="portrait_set"/);
assert.match(context.ACTIVE_MARKUP, /No tasks match this view/);

console.log('Artwork backlog regression tests passed');
