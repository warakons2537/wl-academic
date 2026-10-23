// ---------- ข้อมูลรายปีการศึกษา: งาน + การมอบหมาย ----------
import { indexBy } from './util.js';
import { ROLES } from './task-sets.js';

export async function loadYear(db, year) {
  const tasks = (await db.select('ac_tasks', { eq: { academic_year: year } })).sort((a, b) => a.sort_order - b.sort_order);
  const ids = tasks.map((t) => t.id);
  const assignments = ids.length ? await db.select('ac_assignments', { in: { task_id: ids } }) : [];
  return { tasks, assignments };
}

// ผู้รับผิดชอบของงานหนึ่ง เรียง: หัวหน้า → กรรมการ (ตามลำดับบุคลากร) → เลขานุการ
export function membersOf(taskId, assignments, staffById) {
  return assignments.filter((a) => a.task_id === taskId && staffById[a.staff_id])
    .map((a) => ({ ...a, staff: staffById[a.staff_id] }))
    .sort((a, b) => ROLES[a.role].order - ROLES[b.role].order
      || (a.staff.sort_order ?? 0) - (b.staff.sort_order ?? 0) || a.sort_order - b.sort_order);
}

// สรุปภาระงานรายคน
export function workloadSummary(staff, tasks, assignments) {
  const taskIds = new Set(tasks.map((t) => t.id));
  const rows = staff.map((s) => {
    const mine = assignments.filter((a) => a.staff_id === s.id && taskIds.has(a.task_id));
    const c = (r) => mine.filter((a) => a.role === r).length;
    return { staff: s, head: c('head'), member: c('member'), secretary: c('secretary'), total: mine.length };
  });
  const counted = rows.filter((r) => r.total > 0 || isTeacherLike(r.staff));
  const avg = counted.length ? counted.reduce((n, r) => n + r.total, 0) / counted.length : 0;
  return { rows, avg };
}

// ปัญหาที่ควรแก้ก่อนออกคำสั่ง
export function taskWarnings(task, members) {
  const heads = members.filter((m) => m.role === 'head').length;
  const w = [];
  if (!members.length) w.push('ยังไม่มีผู้รับผิดชอบ');
  else if (!heads) w.push('ยังไม่มีหัวหน้างาน');
  if (heads > 1) w.push(`มีหัวหน้างาน ${heads} คน`);
  if (members.filter((m) => m.role === 'secretary').length > 1) w.push('มีเลขานุการมากกว่า 1 คน');
  return w;
}

// บุคลากรที่ควรรับภาระงานวิชาการ (ไม่รวมผู้บริหาร ธุรการ นักการ)
export const isTeacherLike = (s) => s.active && !/^(ผู้อำนวยการ|รองผู้อำนวยการ|เจ้าหน้าที่|นักการ|ลูกจ้าง)/.test(s.position || '');

export const staffIndex = (staff) => indexBy(staff);

// ---------- เฟส 2: ติดตามงาน ----------
export const DEFAULT_PROGRESS = { status: 'not_started', percent: 0, period: 'year', due_date: null };
export async function loadProgress(db, taskIds) {
  if (!taskIds.length) return { progress: {}, logs: [] };
  const [rows, logs] = await Promise.all([
    db.select('ac_progress', { in: { task_id: taskIds } }),
    db.select('ac_progress_logs', { in: { task_id: taskIds } }),
  ]);
  logs.sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)) || String(b.updated_at).localeCompare(String(a.updated_at)));
  return { progress: Object.fromEntries(rows.map((r) => [r.task_id, r])), logs };
}
export const progressOf = (progress, taskId) => ({ ...DEFAULT_PROGRESS, ...(progress[taskId] || {}) });
export const isTaskOverdue = (p, today) => !!p.due_date && p.due_date < today && p.status !== 'done';

// ---------- เฟส 2: การส่งงาน ----------
// รายการที่ใช้ในภาคเรียน term ('1'|'2'): ของภาคเรียนนั้น + รายการทั้งปี
export const itemsForTerm = (items, term) => items.filter((i) => i.period === String(term) || i.period === 'year')
  .sort((a, b) => (a.period === 'year') - (b.period === 'year') || a.sort_order - b.sort_order);

export const subStatus = (subs, itemId, staffId) => subs.find((s) => s.item_id === itemId && s.staff_id === staffId)?.status || 'none';
export const isSubOverdue = (item, status, today) => !!item.due_date && item.due_date < today && (status === 'none' || status === 'returned');

// สรุปตาราง: ทั้งหมด / รายครู / รายเอกสาร
export function checklistSummary(items, people, subs, today) {
  const c = () => ({ applicable: 0, sent: 0, passed: 0, pending: 0, overdue: 0 });
  const all = c(); const byStaff = {}; const byItem = {};
  for (const s of people) byStaff[s.id] = c();
  for (const i of items) byItem[i.id] = c();
  for (const i of items) for (const s of people) {
    const st = subStatus(subs, i.id, s.id);
    if (st === 'na') continue;
    for (const k of [all, byStaff[s.id], byItem[i.id]]) {
      k.applicable++;
      if (st === 'submitted' || st === 'passed') k.sent++;
      if (st === 'passed') k.passed++;
      if (st === 'none' || st === 'returned') k.pending++;
      if (isSubOverdue(i, st, today)) k.overdue++;
    }
  }
  return { all, byStaff, byItem };
}
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
