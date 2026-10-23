import { esc, thaiDate, todayIso } from '../util.js';
import { icon } from '../icons.js';
import { loadYear, workloadSummary, membersOf, taskWarnings, isTeacherLike, loadProgress, progressOf, isTaskOverdue, itemsForTerm, subStatus, isSubOverdue } from '../data.js';
import { staffName } from '../thai.js';
import { BRAND } from '../brand.js';

export async function render(el, ctx) {
  const [year, orders, garuda] = await Promise.all([
    loadYear(ctx.db, ctx.year),
    ctx.db.select('ac_orders', { eq: { academic_year: ctx.year } }),
    ctx.db.select('ac_assets', { eq: { key: 'garuda' } }).catch(() => []),
  ]);
  const active = ctx.staff.filter((s) => s.active);
  const teachers = active.filter(isTeacherLike);
  const { rows } = workloadSummary(teachers, year.tasks, year.assignments);
  const withHead = year.tasks.filter((t) => !taskWarnings(t, membersOf(t.id, year.assignments, ctx.staffById)).length).length;
  const noWork = rows.filter((r) => r.total === 0).length;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const annual = orders.find((o) => o.kind === 'annual');
  const s = ctx.settings;
  // เฟส 2: งานเลยกำหนด + เอกสารค้างส่ง (ภาคเรียนปัจจุบัน)
  const today = todayIso();
  const [{ progress }, items] = await Promise.all([
    loadProgress(ctx.db, year.tasks.map((t) => t.id)),
    ctx.db.select('ac_checklist_items', { eq: { academic_year: ctx.year } }).catch(() => []),
  ]);
  const lateTasks = year.tasks.map((t, i) => ({ t, no: i + 1, p: progressOf(progress, t.id) })).filter((r) => isTaskOverdue(r.p, today));
  const term = String(ctx.terms.find((x) => x.is_current && x.academic_year === ctx.year)?.term || 1);
  const termItems = itemsForTerm(items, term);
  const subs = termItems.length ? await ctx.db.select('ac_submissions', { in: { item_id: termItems.map((i) => i.id) } }) : [];
  const pending = teachers.map((st) => ({ st, its: termItems.filter((i) => ['none', 'returned'].includes(subStatus(subs, i.id, st.id))) })).filter((x) => x.its.length);
  const lateCells = termItems.reduce((n, i) => n + teachers.filter((st) => isSubOverdue(i, subStatus(subs, i.id, st.id), today)).length, 0);

  const steps = [
    { done: !!(s.school_name && s.director_name), href: '#basics?tab=school', t: 'ข้อมูลโรงเรียนและผู้อำนวยการ', d: 'ใช้ชุดเดียวกับ WL Admin แก้ที่ใดก็เห็นทั้งสองแอป' },
    { done: garuda.length > 0, href: '#basics?tab=garuda', t: 'อัปโหลดตราครุฑ', d: 'ภาพตราครุฑสำหรับหัวคำสั่ง (PNG พื้นโปร่งใสดีที่สุด)' },
    { done: teachers.length > 0, href: '#basics?tab=staff', t: 'รายชื่อบุคลากร', d: `${active.length} คน · คำนำหน้า ตำแหน่ง วิทยฐานะ` },
    { done: year.tasks.length > 0, href: '#basics?tab=tasks', t: `คลังงานวิชาการ ปี ${ctx.year}`, d: year.tasks.length ? `${year.tasks.length} งาน` : 'เลือกชุดทางการ / ชุดปรับใช้จริง หรือคัดลอกจากปีก่อน' },
    { done: year.tasks.length > 0 && withHead === year.tasks.length, href: '#workload', t: 'จัดภาระงาน', d: year.tasks.length ? `มีหัวหน้างานครบ ${withHead}/${year.tasks.length} งาน` : 'รอคลังงานวิชาการ' },
    { done: annual?.status === 'issued', href: '#orders', t: 'ออกคำสั่งมอบหมายงานประจำปี', d: annual ? (annual.status === 'issued' ? `ออกแล้ว ที่ ${annual.number}` : `ฉบับร่าง ที่ ${annual.number || '-'}`) : 'ยังไม่ได้สร้าง' },
  ];

  el.innerHTML = `
    <div class="hero">
      <div class="title">ปีการศึกษา ${ctx.year}<small>${esc(ctx.schoolName ? `โรงเรียน${ctx.schoolName}` : BRAND.tagline)} · วันนี้ ${thaiDate(todayIso())}</small></div>
      ${ctx.canEdit ? `<a class="btn btn-primary" href="#workload">${icon('workload')} จัดภาระงาน</a>` : ''}
    </div>
    <div class="stats">
      <div class="card stat"><b>${active.length}</b><span>บุคลากร</span></div>
      <div class="card stat"><b>${year.tasks.length}</b><span>งานวิชาการ</span></div>
      <div class="card stat"><b>${withHead}<small class="muted" style="font-size:1rem">/${year.tasks.length}</small></b><span>งานที่จัดคนครบ</span></div>
      <div class="card stat"><b>${orders.length}</b><span>คำสั่งปีนี้</span></div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <div class="card"><h2>ขั้นตอนตั้งต้น</h2>
        <div class="steps">${steps.map((x, i) => `<a href="${x.href}" class="${x.done ? 'done' : ''}"><span class="n">${x.done ? '✓' : i + 1}</span>
          <span><b>${esc(x.t)}</b><small>${esc(x.d)}</small></span>${icon('back').replace('class="i"', 'class="i" style="transform:rotate(180deg);opacity:.5"')}</a>`).join('')}</div></div>
      <div class="card"><h2>ภาระงานครู</h2>
        ${year.tasks.length ? `<p class="hint">เฉลี่ยคนละ ${(rows.reduce((n, r) => n + r.total, 0) / Math.max(1, rows.length)).toFixed(1)} งาน
          ${noWork ? `· <b style="color:var(--amber)">ยังไม่มีงาน ${noWork} คน</b>` : ''}</p>
          <div class="bal">${rows.sort((a, b) => b.total - a.total).slice(0, 8).map((r) => `<div class="bal-row"><span class="nm">${esc(r.staff.first_name)} ${esc(r.staff.last_name)}</span>
            <span class="bar">${['head', 'member', 'secretary'].map((k, j) => (r[k] ? `<i class="${'hms'[j]}" style="width:${(r[k] / max) * 100}%"></i>` : '')).join('')}</span>
            <span class="tot">${r.total}</span></div>`).join('')}</div>
          <a href="#workload" class="small">ดูทั้งหมดและจัดงาน →</a>` : '<p class="hint">ยังไม่มีคลังงานวิชาการของปีนี้</p>'}
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <div class="card"><div class="toolbar"><h2 class="grow">งานเลยกำหนด</h2><a href="#track" class="small">ติดตามงาน →</a></div>
        ${lateTasks.length ? `<div class="todo">${lateTasks.map((r) => `<a href="#track?task=${r.t.id}"><span class="dot" style="background:var(--red)"></span>
          <span>${r.no}. ${esc(r.t.name)} <small class="muted">กำหนด ${thaiDate(r.p.due_date, true)} · ${r.p.percent}%</small></span></a>`).join('')}</div>` : '<p class="hint">ไม่มีงานที่เลยกำหนด</p>'}</div>
      <div class="card"><div class="toolbar"><h2 class="grow">เอกสารค้างส่ง ภาคเรียนที่ ${term}</h2><a href="#checklist" class="small">เช็กการส่งงาน →</a></div>
        ${!termItems.length ? '<p class="hint">ยังไม่ได้ตั้งรายการเอกสารของภาคเรียนนี้</p>'
          : pending.length ? `<p class="hint">ค้าง ${pending.length} คน${lateCells ? ` · <b style="color:var(--red)">เลยกำหนด ${lateCells} รายการ</b>` : ''}</p>
            <div class="todo">${pending.slice(0, 6).map((x) => `<a href="#checklist"><span class="dot" style="background:${x.its.some((i) => isSubOverdue(i, subStatus(subs, i.id, x.st.id), today)) ? 'var(--red)' : 'var(--amber)'}"></span>
              <span>${esc(staffName(x.st))} <small class="muted">${x.its.length} รายการ</small></span></a>`).join('')}</div>` : '<p class="hint">ส่งครบทุกคนแล้ว</p>'}</div>
    </div>
    <div class="note-box"><b>ระยะถัดไป</b> — คลังผลงานและผลสอบระดับชาติ · รายงาน SAR และใบสรุปแนบ PA
      (เมนูแสดงไว้แล้วในแถบซ้าย จะเปิดใช้เมื่อสร้างเสร็จ)</div>`;
}
