import { esc, thaiDate, todayIso } from '../util.js';
import { icon } from '../icons.js';
import { loadYear, workloadSummary, membersOf, taskWarnings, isTeacherLike } from '../data.js';
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
    <div class="note-box"><b>ระยะถัดไป</b> — ติดตามความคืบหน้า 17 งาน · เช็กการส่งงานของครู · คลังผลงานและผลสอบระดับชาติ · รายงาน SAR และใบสรุปแนบ PA
      (เมนูแสดงไว้แล้วในแถบซ้าย จะเปิดใช้เมื่อสร้างเสร็จ)</div>`;
}
