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
assert.equal(backlog.room_scope.completed_locations.length, 65);
assert.equal(backlog.audio_in_scope, false);
assert.equal(backlog.phases.length, 59);
assert.equal(backlog.phases[0].id, 'opening_morning');
assert.equal(backlog.phases[0].priority, 1);

const summary = JSON.parse(run('JSON.stringify(artworkBacklogSummary())'));
assert.deepEqual(summary, {
  total:371,
  backgrounds:371,
  portraits:0,
  statuses:{missing:0,placeholder:0,in_progress:335,review:0,ready:36}
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
    maple:artworkBacklogResolution(allArtwork.find(item=>item.id==='maple_hall_dorm.lobby')),
    studentApartment:artworkBacklogResolution(allArtwork.find(item=>item.id==='westshore_shared_student_apartment.entry')),
    bookshop:artworkBacklogResolution(allArtwork.find(item=>item.id==='westshore_bookshop.sales_floor')),
    gallery:artworkBacklogResolution(allArtwork.find(item=>item.id==='lantern_gallery.main_gallery')),
    lanternStreet:artworkBacklogResolution(allArtwork.find(item=>item.id==='lantern_district_street.cinema_block')),
    laBrisa:artworkBacklogResolution(allArtwork.find(item=>item.id==='la_brisa_kitchen.dining_room')),
    tideglass:artworkBacklogResolution(allArtwork.find(item=>item.id==='tideglass_club.entry')),
    cooperative:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_companion_cooperative.secure_reception')),
    rowan:artworkBacklogResolution(allArtwork.find(item=>item.id==='rowan_family_home.porch')),
    jadeCondo:artworkBacklogResolution(allArtwork.find(item=>item.id==='jade_downtown_condo.entry')),
    greyport:artworkBacklogResolution(allArtwork.find(item=>item.id==='greyport_street.bus_exchange')),
    leeApartment:artworkBacklogResolution(allArtwork.find(item=>item.id==='lee_family_apartment.front_door')),
    floresTownhouse:artworkBacklogResolution(allArtwork.find(item=>item.id==='flores_family_townhouse.front_door')),
    greyportApartment:artworkBacklogResolution(allArtwork.find(item=>item.id==='greyport_shared_apartment.entry')),
    donovanApartment:artworkBacklogResolution(allArtwork.find(item=>item.id==='donovan_family_apartment.front_door')),
    distribution:artworkBacklogResolution(allArtwork.find(item=>item.id==='greyport_distribution.security')),
    transitDepot:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_transit_depot.public_counter')),
    studios:artworkBacklogResolution(allArtwork.find(item=>item.id==='greyport_studios.lobby')),
    undertow:artworkBacklogResolution(allArtwork.find(item=>item.id==='undertow_nightclub.entry')),
    cedarVale:artworkBacklogResolution(allArtwork.find(item=>item.id==='cedar_vale_street.bus_stop')),
    rachelTownhouse:artworkBacklogResolution(allArtwork.find(item=>item.id==='rachel_cedar_vale_townhouse.front_door')),
    cedarTownhouses:artworkBacklogResolution(allArtwork.find(item=>item.id==='cedar_vale_townhouses.entry')),
    cedarDetached:artworkBacklogResolution(allArtwork.find(item=>item.id==='cedar_vale_detached_homes.foyer')),
    cedarCareHome:artworkBacklogResolution(allArtwork.find(item=>item.id==='cedar_vale_care_home.reception')),
    cedarFamilyCentre:artworkBacklogResolution(allArtwork.find(item=>item.id==='cedar_vale_family_centre.reception')),
    marinerStreet:artworkBacklogResolution(allArtwork.find(item=>item.id==='mariner_row_shopping_street.transit_stop')),
    marinerMarket:artworkBacklogResolution(allArtwork.find(item=>item.id==='mariner_market.grocery_floor')),
    northline:artworkBacklogResolution(allArtwork.find(item=>item.id==='northline_outfitters.sales_floor')),
    harborFormalwear:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_formalwear.showroom')),
    marinerHomeGoods:artworkBacklogResolution(allArtwork.find(item=>item.id==='mariner_home_goods.furniture_floor')),
    portAlderAuto:artworkBacklogResolution(allArtwork.find(item=>item.id==='port_alder_auto.showroom')),
    stMarenMedical:artworkBacklogResolution(allArtwork.find(item=>item.id==='st_maren_medical_center.campus_plaza')),
    stMarenClinic:artworkBacklogResolution(allArtwork.find(item=>item.id==='st_maren_community_clinic.reception')),
    stMarenDoctors:artworkBacklogResolution(allArtwork.find(item=>item.id==='st_maren_doctors_office.reception')),
    harborWellness:artworkBacklogResolution(allArtwork.find(item=>item.id==='harbor_wellness_therapy.reception')),
    stMarenSexual:artworkBacklogResolution(allArtwork.find(item=>item.id==='st_maren_sexual_health.private_reception')),
    bayPharmacy:artworkBacklogResolution(allArtwork.find(item=>item.id==='bay_pharmacy.sales_floor')),
    hannahApartment:artworkBacklogResolution(allArtwork.find(item=>item.id==='hannah_medical_district_apartment.entry')),
    crownPointBoulevard:artworkBacklogResolution(allArtwork.find(item=>item.id==='crown_point_boulevard.boulevard_entry')),
    priceCaldwell:artworkBacklogResolution(allArtwork.find(item=>item.id==='price_caldwell_law.reception')),
    oliviaPenthouse:artworkBacklogResolution(allArtwork.find(item=>item.id==='olivia_crown_point_penthouse.private_elevator')),
    crownPointCondos:artworkBacklogResolution(allArtwork.find(item=>item.id==='crown_point_condos.lobby')),
    crownPointPenthouses:artworkBacklogResolution(allArtwork.find(item=>item.id==='crown_point_penthouses.private_elevator')),
    crownPointHotel:artworkBacklogResolution(allArtwork.find(item=>item.id==='crown_point_hotel_spa.lobby'))
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
assert.equal(resolutions.studentApartment.state, 'registered');
assert.equal(resolutions.bookshop.state, 'registered');
assert.equal(resolutions.gallery.state, 'registered');
assert.equal(resolutions.lanternStreet.state, 'registered');
assert.equal(resolutions.laBrisa.state, 'registered');
assert.equal(resolutions.tideglass.state, 'registered');
assert.equal(resolutions.cooperative.state, 'registered');
assert.equal(resolutions.rowan.state, 'registered');
assert.equal(resolutions.jadeCondo.state, 'registered');
assert.equal(resolutions.greyport.state, 'registered');
assert.equal(resolutions.leeApartment.state, 'registered');
assert.equal(resolutions.floresTownhouse.state, 'registered');
assert.equal(resolutions.greyportApartment.state, 'registered');
assert.equal(resolutions.donovanApartment.state, 'registered');
assert.equal(resolutions.distribution.state, 'registered');
assert.equal(resolutions.transitDepot.state, 'registered');
assert.equal(resolutions.studios.state, 'registered');
assert.equal(resolutions.undertow.state, 'registered');
assert.equal(resolutions.cedarVale.state, 'registered');
assert.equal(resolutions.rachelTownhouse.state, 'registered');
assert.equal(resolutions.cedarTownhouses.state, 'registered');
assert.equal(resolutions.cedarDetached.state, 'registered');
assert.equal(resolutions.cedarCareHome.state, 'registered');
assert.equal(resolutions.cedarFamilyCentre.state, 'registered');
assert.equal(resolutions.marinerStreet.state, 'registered');
assert.equal(resolutions.marinerMarket.state, 'registered');
assert.equal(resolutions.northline.state, 'registered');
assert.equal(resolutions.harborFormalwear.state, 'registered');
assert.equal(resolutions.marinerHomeGoods.state, 'registered');
assert.equal(resolutions.portAlderAuto.state, 'registered');
assert.equal(resolutions.stMarenMedical.state, 'registered');
assert.equal(resolutions.stMarenClinic.state, 'registered');
assert.equal(resolutions.stMarenDoctors.state, 'registered');
assert.equal(resolutions.harborWellness.state, 'registered');
assert.equal(resolutions.stMarenSexual.state, 'registered');
assert.equal(resolutions.bayPharmacy.state, 'registered');
assert.equal(resolutions.hannahApartment.state, 'registered');
assert.equal(resolutions.crownPointBoulevard.state, 'registered');
assert.equal(resolutions.priceCaldwell.state, 'registered');
assert.equal(resolutions.oliviaPenthouse.state, 'registered');
assert.equal(resolutions.crownPointCondos.state, 'registered');
assert.equal(resolutions.crownPointPenthouses.state, 'registered');
assert.equal(resolutions.crownPointHotel.state, 'registered');
assert.match(context.ALL_MARKUP, /Opening Morning at Hale Home/);
assert.match(context.ALL_MARKUP, /371 prioritized assets/);
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
assert.match(context.ACTIVE_MARKUP, /Westshore Shared Student Apartment Housing/);
assert.match(context.ACTIVE_MARKUP, /Westshore Shared Student Apartment · Available Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Lantern Gallery Arts and Events Circuit/);
assert.match(context.ACTIVE_MARKUP, /Lantern Gallery · Office/);
assert.match(context.ACTIVE_MARKUP, /Lantern District Street Entertainment Route/);
assert.match(context.ACTIVE_MARKUP, /Lantern District Street · Gallery Walk/);
assert.match(context.ACTIVE_MARKUP, /La Brisa Kitchen Restaurant and Employment Route/);
assert.match(context.ACTIVE_MARKUP, /La Brisa Kitchen · Manager Office/);
assert.match(context.ACTIVE_MARKUP, /Tideglass Club Nightlife and Social Route/);
assert.match(context.ACTIVE_MARKUP, /Tideglass Club · Restrooms/);
assert.match(context.ACTIVE_MARKUP, /Harbor Companion Cooperative Licensed Workplace and Safety Route/);
assert.match(context.ACTIVE_MARKUP, /Harbor Companion Cooperative · Private Suite/);
assert.match(context.ACTIVE_MARKUP, /Rowan Family Home Invitation and Emma Relationship Route/);
assert.match(context.ACTIVE_MARKUP, /Rowan Family Home · Emma Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Jade's Downtown Condo Invitation and Private-Life Route/);
assert.match(context.ACTIVE_MARKUP, /Jade Downtown Condo · Office/);
assert.match(context.ACTIVE_MARKUP, /Greyport Main Street Housing, Work, Transit, and Nightlife Route/);
assert.match(context.ACTIVE_MARKUP, /Greyport Street · Nightlife Alley/);
assert.match(context.ACTIVE_MARKUP, /Lee Family Apartment Invitation and Marcus Story Route/);
assert.match(context.ACTIVE_MARKUP, /Lee Family Apartment · Marcus Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Flores Family Townhouse Invitation and Nadia Friendship Route/);
assert.match(context.ACTIVE_MARKUP, /Flores Family Townhouse · Nadia Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Greyport Shared Apartment Housing and Sofia Relationship Route/);
assert.match(context.ACTIVE_MARKUP, /Greyport Shared Apartment · Sofia Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Donovan Family Apartment Invitation and Claire Relationship Route/);
assert.match(context.ACTIVE_MARKUP, /Donovan Family Apartment · Claire Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Greyport Distribution Employment and Promotion Route/);
assert.match(context.ACTIVE_MARKUP, /Greyport Distribution · Warehouse Floor/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Transit Depot Public Service and Mechanics Route/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Transit Depot · Repair Bays/);
assert.match(context.ACTIVE_MARKUP, /Greyport Studios Affordable Housing and Independence Route/);
assert.match(context.ACTIVE_MARKUP, /Greyport Studios · Studio Unit/);
assert.match(context.ACTIVE_MARKUP, /Undertow Nightclub Nightlife, Safety, and Employment Route/);
assert.match(context.ACTIVE_MARKUP, /Undertow Nightclub · Quiet Room/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Residential Street Housing, Care, and Family Route/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Street · Family Block/);
assert.match(context.ACTIVE_MARKUP, /Rachel's Townhouse Invitation, Trust, and Recovery Route/);
assert.match(context.ACTIVE_MARKUP, /Rachel Cedar Vale Townhouse · Rachel Bedroom/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Townhouses Rental, Purchase, and Player-Home Route/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Townhouses · Kitchen/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Detached Homes Purchase, Rental, and Family-Life Route/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Detached Homes · Garage/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Care Home Work, Visits, and Resident-Life Route/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Care Home · Care Station/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Family Centre Childcare, Parenting, and Support Route/);
assert.match(context.ACTIVE_MARKUP, /Cedar Vale Family Centre · Parent Group Room/);
assert.match(context.ACTIVE_MARKUP, /Mariner Row Shopping Street Retail Discovery and Storefront Route/);
assert.match(context.ACTIVE_MARKUP, /Mariner Row Shopping Street · Fashion Block/);
assert.match(context.ACTIVE_MARKUP, /Mariner Market Grocery, Adult Retail, and Employment Route/);
assert.match(context.ACTIVE_MARKUP, /Mariner Market · Checkout/);
assert.match(context.ACTIVE_MARKUP, /Northline Outfitters Clothing, Wardrobe, and Employment Route/);
assert.match(context.ACTIVE_MARKUP, /Northline Outfitters · Fitting Rooms/);
assert.match(context.ACTIVE_MARKUP, /Harbor Formalwear Interview Clothing, Fitting, and Alterations Route/);
assert.match(context.ACTIVE_MARKUP, /Harbor Formalwear · Tailoring Desk/);
assert.match(context.ACTIVE_MARKUP, /Mariner Home Goods Furniture, Décor, Kitchen, and Household Route/);
assert.match(context.ACTIVE_MARKUP, /Mariner Home Goods · Kitchen Section/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Auto Vehicle Purchase, Finance, Used Lot, and Service Route/);
assert.match(context.ACTIVE_MARKUP, /Port Alder Auto · Service Desk/);
assert.match(context.ACTIVE_MARKUP, /St\. Maren Medical Center Campus, Hospital Care, Diagnostics, and Family Health Route/);
assert.match(context.ACTIVE_MARKUP, /St Maren Medical Center · Maternity/);
assert.match(context.ACTIVE_MARKUP, /St\. Maren Community Clinic Outpatient Care, Records, and Administration Route/);
assert.match(context.ACTIVE_MARKUP, /St Maren Community Clinic · Administrator Office/);
assert.match(context.ACTIVE_MARKUP, /St\. Maren Family Doctors Primary Care, Walk-In, and Referral Route/);
assert.match(context.ACTIVE_MARKUP, /St Maren Doctors Office · Exam Room 2/);
assert.match(context.ACTIVE_MARKUP, /Harbor Wellness Therapy Counseling, Relationships, and Group Support Route/);
assert.match(context.ACTIVE_MARKUP, /Harbor Wellness Therapy · Group Room/);
assert.match(context.ACTIVE_MARKUP, /St\. Maren Sexual Health Centre Private Consultation, Testing, and Treatment Route/);
assert.match(context.ACTIVE_MARKUP, /St Maren Sexual Health · Treatment Room/);
assert.match(context.ACTIVE_MARKUP, /Bay Pharmacy Retail, Prescription, and Private Consultation Route/);
assert.match(context.ACTIVE_MARKUP, /Bay Pharmacy · Consultation Room/);
assert.match(context.ACTIVE_MARKUP, /Hannah's Medical District Apartment Invitation, Recovery, and Relationship Route/);
assert.match(context.ACTIVE_MARKUP, /Hannah Medical District Apartment · Balcony/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Boulevard Corporate, Residential, Hotel, and Harbor Route/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Boulevard · Harbor Overlook/);
assert.match(context.ACTIVE_MARKUP, /Price (?:&amp;|&) Caldwell Law Reception, Associate, Conference, and Executive Route/);
assert.match(context.ACTIVE_MARKUP, /Price (?:&amp; )?Caldwell Law · Olivia Office/);
assert.match(context.ACTIVE_MARKUP, /Olivia's Crown Point Penthouse Invitation, Private Life, and Relationship Route/);
assert.match(context.ACTIVE_MARKUP, /Olivia Crown Point Penthouse · Terrace/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Condominiums Purchase, Viewing, and Resident Amenities Route/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Condos · Pool/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Penthouses Purchase, Viewing, and Private Residence Route/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Penthouses · Terrace/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Hotel &amp; Spa Guest, Wellness, Events, and Staff Route/);
assert.match(context.ACTIVE_MARKUP, /Crown Point Hotel Spa · Ballroom/);
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
assert.match(context.READY_MARKUP, /Westshore Bookshop Campus Retail/);
assert.match(context.READY_MARKUP, /Westshore Bookshop · Service Counter/);

console.log('Artwork backlog regression tests passed');
