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
