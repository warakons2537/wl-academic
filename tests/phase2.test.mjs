// node tests/phase2.test.mjs — ติดตามงาน + เช็กการส่งงาน
import assert from 'node:assert/strict';
import { progressOf, isTaskOverdue, itemsForTerm, subStatus, isSubOverdue, checklistSummary, pct, isTeacherLike } from '../js/data.js';
import { CHECKLIST_DEFAULTS, SUBMIT_CYCLE } from '../js/task-sets.js';
import { seedDemo } from '../js/demo-data.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const today = '2026-10-23';

t('ค่าเริ่มต้นและเลยกำหนดของงาน', () => {
  assert.deepEqual(progressOf({}, 'x'), { status: 'not_started', percent: 0, period: 'year', due_date: null });
  assert.equal(isTaskOverdue({ status: 'in_progress', due_date: '2026-10-01' }, today), true);
  assert.equal(isTaskOverdue({ status: 'done', due_date: '2026-10-01' }, today), false);
  assert.equal(isTaskOverdue({ status: 'in_progress', due_date: null }, today), false);
});

const items = [{ id: 'a', period: '1', sort_order: 2 }, { id: 'b', period: 'year', sort_order: 1 }, { id: 'c', period: '2', sort_order: 3 }, { id: 'd', period: '1', sort_order: 1, due_date: '2026-10-01' }];
t('รายการตามภาคเรียน (ทั้งปีอยู่ท้าย ใช้ทั้ง 2 ภาค)', () => {
  assert.deepEqual(itemsForTerm(items, '1').map((i) => i.id), ['d', 'a', 'b']);
  assert.deepEqual(itemsForTerm(items, 2).map((i) => i.id), ['c', 'b']);
});

t('สรุปการส่งงาน', () => {
  const people = [{ id: 's1' }, { id: 's2' }];
  const subs = [{ item_id: 'd', staff_id: 's1', status: 'passed' }, { item_id: 'd', staff_id: 's2', status: 'returned' },
    { item_id: 'a', staff_id: 's1', status: 'submitted' }, { item_id: 'a', staff_id: 's2', status: 'na' }];
  const its = itemsForTerm(items, '1');
  assert.equal(subStatus(subs, 'b', 's1'), 'none');
  const sum = checklistSummary(its, people, subs, today);
  assert.deepEqual(sum.all, { applicable: 5, sent: 2, passed: 1, pending: 3, overdue: 1 });
  assert.deepEqual(sum.byItem.a, { applicable: 1, sent: 1, passed: 0, pending: 0, overdue: 0 });
  assert.equal(pct(sum.byStaff.s1.sent, sum.byStaff.s1.applicable), 67);
  assert.equal(isSubOverdue(items[3], 'returned', today), true);
  assert.equal(isSubOverdue(items[3], 'submitted', today), false);
});

t('รายการตั้งต้น 7 รายการ / วงจรคลิก', () => {
  assert.equal(CHECKLIST_DEFAULTS.length, 7);
  assert.equal(CHECKLIST_DEFAULTS.filter((d) => d.period === 'year').length, 1);
  assert.deepEqual(SUBMIT_CYCLE, ['none', 'submitted', 'passed', 'na']);
});

t('ข้อมูลทดลองสอดคล้องกัน', () => {
  const d = seedDemo();
  const ids = new Set(d.ac_checklist_items.map((i) => i.id));
  const staff = new Set(d.staff.filter(isTeacherLike).map((s) => s.id));
  for (const s of d.ac_submissions) { assert.ok(ids.has(s.item_id)); assert.ok(staff.has(s.staff_id)); }
  assert.equal(new Set(d.ac_submissions.map((s) => `${s.item_id}|${s.staff_id}`)).size, d.ac_submissions.length);
  assert.equal(d.ac_progress.length, d.ac_tasks.length);
});

console.log(`\nผ่านทั้งหมด ${n} ชุด`);
