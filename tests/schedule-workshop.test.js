const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

load('js/00-state.js');
load('js/02-places.js');
run(`
  const TEST_LOCATIONS=[
    {id:'home',name:'Home',rooms:[{id:'living_room',name:'Living Room'},{id:'bedroom',name:'Bedroom'}]},
    {id:'college',name:'College',rooms:[{id:'classroom',name:'Classroom'}]},
    {id:'office',name:'Office',rooms:[{id:'desk',name:'Desk'}]},
    {id:'cafe',name:'Cafe',rooms:[{id:'patio',name:'Patio'}]}
  ];
  P={characters:[],locations:TEST_LOCATIONS,content:[],ensemble_arcs:[],districts:[],travel:null,aliases:{}};
`);
load('js/03-schedule.js');
load('js/08ca-schedule-workshop.js');

run(`
  globalThis.WEEKLY={id:'weekly',name:'Weekly',home:{location_id:'home'},schedule:{
    days_off:['sunday'],preferred_social_blocks:['evening'],
    fixed_commitments:[{days:['monday','tuesday','wednesday','thursday','friday'],
      blocks:['morning','lunch','afternoon'],activity:'office_work',label:'Working',
      location:'office.desk',unavailable:true}],
    public_presence:[{days:['sunday'],blocks:['afternoon'],activity:'coffee',label:'At the cafe',
      location:'cafe.patio',unavailable:false}]}};
  globalThis.ROTATING={id:'rotating',name:'Rotating',home:{location_id:'home'},schedule:{
    days_off:['variable'],rotation:'four_on_three_off',preferred_social_blocks:['third_day_off_evening'],
    fixed_commitments:[{days:['rotation_day_1','rotation_day_2','rotation_day_3','rotation_day_4'],
      blocks:['early_morning','morning','lunch','afternoon'],activity:'hospital_shift',label:'Working rotation',
      location:'office.desk',unavailable:true}],public_presence:[]}};
`);

assert.deepEqual(Array.from(run('scheduleWorkshopDays(WEEKLY)')),
  ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
assert.deepEqual(Array.from(run('scheduleWorkshopDays(ROTATING)')),
  ['rotation_day_1','rotation_day_2','rotation_day_3','rotation_day_4','first_day_off','second_day_off','third_day_off']);

run(`
  setSchedulePreferenceCells(WEEKLY,['monday|evening'],false);
  globalThis.PREF_AFTER_REMOVE=JSON.stringify(WEEKLY.schedule.preferred_social_blocks);
  setSchedulePreferenceCells(WEEKLY,['monday|morning','tuesday|morning'],true);
  globalThis.PREF_AFTER_ADD=JSON.stringify(WEEKLY.schedule.preferred_social_blocks);
`);
const afterRemove = JSON.parse(context.PREF_AFTER_REMOVE);
assert.equal(afterRemove.includes('evening'), false);
assert.equal(afterRemove.includes('monday_evening'), false);
assert.equal(afterRemove.includes('tuesday_evening'), true);
const afterAdd = JSON.parse(context.PREF_AFTER_ADD);
assert.equal(afterAdd.includes('monday_morning'), true);
assert.equal(afterAdd.includes('tuesday_morning'), true);

const summary = JSON.parse(run('JSON.stringify(scheduleWorkshopSummary(WEEKLY))'));
assert.equal(summary.busy, 15);
assert.equal(summary.public, 1);
assert.ok(summary.preferred >= 8);

run(`
  globalThis.TEMPLATE_CHARACTER={id:'student',name:'Student',home:{location_id:'home'},schedule:{
    days_off:['saturday','sunday'],fixed_commitments:[],public_presence:[],preferred_social_blocks:[]}};
  globalThis.TEMPLATE_COUNT=applyScheduleTemplate(TEMPLATE_CHARACTER,'college_week','college.classroom');
  globalThis.TEMPLATE_GRID=JSON.stringify(scheduleGrid(TEMPLATE_CHARACTER));
`);
assert.equal(context.TEMPLATE_COUNT, 15);
const templateGrid = JSON.parse(context.TEMPLATE_GRID);
assert.equal(Object.keys(templateGrid).length, 15);
assert.equal(templateGrid['monday|morning'].activity, 'classes');
assert.equal(templateGrid['friday|afternoon'].location, 'college.classroom');
assert.equal(templateGrid['friday|afternoon']._meta.category, 'school');

run(`
  globalThis.ROTATION_TEMPLATE={id:'nurse',name:'Nurse',home:{location_id:'home'},schedule:{
    days_off:[],fixed_commitments:[],public_presence:[],preferred_social_blocks:[]}};
  globalThis.ROTATION_COUNT=applyScheduleTemplate(ROTATION_TEMPLATE,'four_on_three_off','office.desk');
`);
assert.equal(context.ROTATION_COUNT, 16);
assert.equal(run('ROTATION_TEMPLATE.schedule.rotation'), 'four_on_three_off');
assert.deepEqual(Array.from(run('ROTATION_TEMPLATE.schedule.days_off')), ['variable']);

run(`
  globalThis.BROKEN={id:'broken',name:'Broken',home:{location_id:'home'},schedule:{days_off:[],
    preferred_social_blocks:['monday_morning'],public_presence:[
      {days:['monday'],blocks:['morning'],activity:'public',location:'cafe.patio',unavailable:false}],
    fixed_commitments:[
      {days:['monday'],blocks:['morning'],activity:'first',location:'office.desk',unavailable:true},
      {days:['monday'],blocks:['morning'],activity:'second',location:'missing.room',unavailable:true}
    ]}};
  globalThis.BROKEN_ISSUES=JSON.stringify(scheduleWorkshopIssues(BROKEN));
`);
const issues = JSON.parse(context.BROKEN_ISSUES);
assert.ok(issues.some(issue=>issue.message.includes('overlaps')));
assert.ok(issues.some(issue=>issue.message.includes('missing location')));
assert.ok(issues.some(issue=>issue.message.includes('hidden by')));
assert.ok(issues.some(issue=>issue.message.includes('conflicts with a busy commitment')));

const ranked = JSON.parse(run('JSON.stringify(scheduleGroupAvailability([WEEKLY,TEMPLATE_CHARACTER]))'));
assert.equal(ranked.length, 49);
assert.equal(ranked[0].busy, 0);
assert.ok(ranked[0].preferred >= 1);
assert.ok(ranked.at(-1).busy >= ranked[0].busy);

console.log('schedule workshop regression tests passed');
