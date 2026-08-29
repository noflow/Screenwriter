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
assert.equal(backlog.mode, 'room_art_first');
assert.deepEqual(backlog.active_kinds, ['background']);
assert.equal(backlog.room_scope.policy, 'all_mapped_rooms');
assert.equal(backlog.audio_in_scope, false);
assert.equal(backlog.phases.length, 4);
assert.equal(backlog.phases[0].id, 'opening_morning');
assert.equal(backlog.phases[0].priority, 1);

const summary = JSON.parse(run('JSON.stringify(artworkBacklogSummary())'));
assert.deepEqual(summary, {
  total:30,
  backgrounds:30,
  portraits:0,
  statuses:{missing:13,placeholder:3,in_progress:14,review:0,ready:0}
});

run(`
  const allArtwork=artworkBacklogAssets().map(item=>item.asset);
  globalThis.ART_RESOLUTIONS=JSON.stringify({
    bedroom:artworkBacklogResolution(allArtwork.find(item=>item.id==='hale_home.player_bedroom')),
    backyard:artworkBacklogResolution(allArtwork.find(item=>item.id==='hale_home.backyard')),
    street:artworkBacklogResolution(allArtwork.find(item=>item.id==='alder_heights_residential_street.hale_block'))
  });
  globalThis.ALL_MARKUP=artworkBacklogMarkup('all');
  globalThis.BG_MARKUP=artworkBacklogMarkup('background');
  globalThis.ACTIVE_MARKUP=artworkBacklogMarkup('active');
  globalThis.READY_MARKUP=artworkBacklogMarkup('ready');
`);
const resolutions = JSON.parse(context.ART_RESOLUTIONS);
assert.equal(resolutions.bedroom.state, 'registered');
assert.equal(resolutions.bedroom.text, 'Production background registered');
assert.equal(resolutions.backyard.state, 'registered');
assert.equal(resolutions.street.state, 'missing');
assert.match(context.ALL_MARKUP, /Opening Morning at Hale Home/);
assert.match(context.ALL_MARKUP, /30 prioritized assets/);
assert.match(context.ALL_MARKUP, /Room-first milestone plan/);
assert.doesNotMatch(context.ALL_MARKUP, /portrait set/);
assert.match(context.ALL_MARKUP, /Character portraits and audio are intentionally outside the active room-art plan/);
assert.doesNotMatch(context.BG_MARKUP, /data-art-kind="portrait_set"/);
assert.match(context.ACTIVE_MARKUP, /14 tasks/);
assert.match(context.ACTIVE_MARKUP, /Hale Home · Backyard/);
assert.match(context.READY_MARKUP, /No tasks match this view/);

console.log('Artwork backlog regression tests passed');
