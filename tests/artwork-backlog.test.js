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
assert.equal(backlog.room_scope.completed_locations.length, 22);
assert.equal(backlog.audio_in_scope, false);
assert.equal(backlog.phases.length, 16);
assert.equal(backlog.phases[0].id, 'opening_morning');
assert.equal(backlog.phases[0].priority, 1);

const summary = JSON.parse(run('JSON.stringify(artworkBacklogSummary())'));
assert.deepEqual(summary, {
  total:124,
  backgrounds:124,
  portraits:0,
  statuses:{missing:0,placeholder:0,in_progress:90,review:0,ready:34}
});

run(`
  const allArtwork=artworkBacklogAssets().map(item=>item.asset);
  globalThis.ART_RESOLUTIONS=JSON.stringify({
    bedroom:artworkBacklogResolution(allArtwork.find(item=>item.id==='hale_home.player_bedroom')),
    backyard:artworkBacklogResolution(allArtwork.find(item=>item.id==='hale_home.backyard')),
    street:artworkBacklogResolution(allArtwork.find(item=>item.id==='alder_heights_residential_street.hale_block')),
    lookout:artworkBacklogResolution(allArtwork.find(item=>item.id==='alder_bay_park.lookout')),
    campus:artworkBacklogResolution(allArtwork.find(item=>item.id==='westshore_campus.courtyard')),
    bayview:artworkBacklogResolution(allArtwork.find(item=>item.id==='bayview_cafe.patio')),
    marina:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_marina.promenade')),
    beach:artworkBacklogResolution(allArtwork.find(item=>item.id==='alder_bay_beach.boardwalk')),
    galleria:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_galleria.main_atrium')),
    downtown:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_centre_downtown.transit_plaza')),
    apartments:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_centre_apartments.lobby')),
    condos:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_view_condos.living_room')),
    creditUnion:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_credit_union.atm_lobby')),
    cityHall:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_city_hall.public_lobby')),
    realty:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_realty.listing_gallery')),
    business:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_business_services.lobby')),
    cypress:artworkBacklogResolution(allArtwork.find(item=>item.id==='cypress_hall_dorm.lobby')),
    maple:artworkBacklogResolution(allArtwork.find(item=>item.id==='maple_hall_dorm.lobby'))
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
assert.equal(resolutions.street.state, 'registered');
assert.equal(resolutions.lookout.state, 'registered');
assert.equal(resolutions.campus.state, 'registered');
assert.equal(resolutions.bayview.state, 'registered');
assert.equal(resolutions.marina.state, 'registered');
assert.equal(resolutions.beach.state, 'registered');
assert.equal(resolutions.galleria.state, 'registered');
assert.equal(resolutions.downtown.state, 'registered');
assert.equal(resolutions.apartments.state, 'registered');
assert.equal(resolutions.condos.state, 'registered');
assert.equal(resolutions.creditUnion.state, 'registered');
assert.equal(resolutions.cityHall.state, 'registered');
assert.equal(resolutions.realty.state, 'registered');
assert.equal(resolutions.business.state, 'registered');
assert.equal(resolutions.cypress.state, 'registered');
assert.equal(resolutions.maple.state, 'registered');
assert.match(context.ALL_MARKUP, /Opening Morning at Hale Home/);
assert.match(context.ALL_MARKUP, /124 prioritized assets/);
assert.match(context.ALL_MARKUP, /Room-first milestone plan/);
assert.doesNotMatch(context.ALL_MARKUP, /portrait set/);
assert.match(context.ALL_MARKUP, /Character portraits and audio are intentionally outside the active room-art plan/);
assert.doesNotMatch(context.BG_MARKUP, /data-art-kind="portrait_set"/);
assert.match(context.ACTIVE_MARKUP, /14 tasks/);
assert.match(context.ACTIVE_MARKUP, /Hale Home · Backyard/);
assert.match(context.ACTIVE_MARKUP, /Alder Heights Residential Street · Neighborhood Corner/);
assert.match(context.ACTIVE_MARKUP, /16 tasks/);
assert.match(context.ACTIVE_MARKUP, /Forge Fitness · Trainer Office/);
assert.match(context.ACTIVE_MARKUP, /7 tasks/);
assert.match(context.ACTIVE_MARKUP, /Westshore Campus · Student Lounge/);
assert.match(context.ACTIVE_MARKUP, /Bayview Cafe · Patio/);
assert.match(context.ACTIVE_MARKUP, /3 tasks/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Marina · Marina Office/);
assert.match(context.ACTIVE_MARKUP, /Alder Bay Beach · Changing Room/);
assert.match(context.ACTIVE_MARKUP, /5 tasks/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Galleria · Food Court/);
assert.match(context.ACTIVE_MARKUP, /6 tasks/);
assert.match(context.ACTIVE_MARKUP, /Harbor Centre Downtown · Residential Block/);
assert.match(context.ACTIVE_MARKUP, /Harbor Centre Apartments Housing/);
assert.match(context.ACTIVE_MARKUP, /Harbor Centre Apartments · Roof Deck/);
assert.match(context.ACTIVE_MARKUP, /9 tasks/);
assert.match(context.ACTIVE_MARKUP, /Harbor View Condominiums Home/);
assert.match(context.ACTIVE_MARKUP, /Harbor View Condos · Balcony/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Credit Union Banking/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Credit Union · Atm Lobby/);
assert.match(context.ACTIVE_MARKUP, /Port Alder City Hall Civic Services/);
assert.match(context.ACTIVE_MARKUP, /Port Alder City Hall · Public Lobby/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Realty Housing Services/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Realty · Listing Gallery/);
assert.match(context.ACTIVE_MARKUP, /Harbor Centre Business Services Workplace/);
assert.match(context.ACTIVE_MARKUP, /Harbor Business Services · Lobby/);
assert.match(context.ACTIVE_MARKUP, /Cypress Hall Dorm Student Housing/);
assert.match(context.ACTIVE_MARKUP, /Cypress Hall Dorm · Available Room/);
assert.match(context.ACTIVE_MARKUP, /Maple Hall Dorm Student Housing/);
assert.match(context.ACTIVE_MARKUP, /Maple Hall Dorm · Available Room/);
assert.match(context.READY_MARKUP, /8 tasks/);
assert.match(context.READY_MARKUP, /Harbor Employment Centre · Interview Room/);
assert.match(context.READY_MARKUP, /6 tasks/);
assert.match(context.READY_MARKUP, /Westshore Campus · Career Board/);
assert.match(context.READY_MARKUP, /9 tasks/);
assert.match(context.READY_MARKUP, /Port Alder Galleria · East Expansion/);
assert.match(context.READY_MARKUP, /Port Alder Credit Union · Loan Office/);
assert.match(context.READY_MARKUP, /Port Alder City Hall · Hearing Room/);
assert.match(context.READY_MARKUP, /Port Alder Realty · Closing Room/);
assert.match(context.READY_MARKUP, /Harbor Business Services · Break Room/);

console.log('Artwork backlog regression tests passed');
