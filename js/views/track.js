import { esc, $, $$, toast, confirmBox, todayIso, thaiDate } from '../util.js';
import { icon } from '../icons.js';
import { PROGRESS, PERIODS } from '../task-sets.js';
import { loadYear, loadProgress, progressOf, isTaskOverdue, membersOf } from '../data.js';
import { staffName } from '../thai.js';
import { hasThaiOfficialFont } from '../order-doc.js';

const taskFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('task');
const safeLink = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

export async function render(el, ctx) {
  let year = await loadYear(ctx.db, ctx.year);
  let { progress, logs } = await loadProgress(ctx.db, year.tasks.map((t) => t.id));
  let filter = 'all';
  const today = todayIso();
  const headOf = (t) => membersOf(t.id, year.assignments, ctx.staffById).find((m) => m.role === 'head');
  const lastLog = (taskId) => logs.find((l) => l.task_id === taskId);

  const draw = () => (taskFromHash() ? detail(taskFromHash()) : list());

  // ---------------------------------------------------------------- รายการ
  function list() {
    if (!year.tasks.length) {
      el.innerHTML = `<div class="page-head"><div><h1>ติดตามงานวิชาการ</h1><p>ปีการศึกษา ${ctx.year}</p></div></div>
        <div class="empty">ยังไม่มีคลังงานวิชาการของปีการศึกษา ${ctx.year}<br><br>${ctx.canEdit ? '<a class="btn btn-primary" href="#basics?tab=tasks">ไปที่ ข้อมูลพื้นฐาน › คลังงานวิชาการ</a>' : ''}</div>`;
      return;
    }
    const rows = year.tasks.map((t, i) => ({ t, no: i + 1, p: progressOf(progress, t.id) }));
    const count = (st) => rows.filter((r) => r.p.status === st).length;
    const overdue = rows.filter((r) => isTaskOverdue(r.p, today)).length;
    const shown = rows.filter((r) => filter === 'all' || (filter === 'overdue' ? isTaskOverdue(r.p, today) : r.p.status === filter));

    el.innerHTML = `<div class="no-print stack" style="gap:20px">
      <div class="page-head"><div><h1>ติดตามงานวิชาการ</h1><p>ปีการศึกษา ${ctx.year} · ${rows.length} งาน${ctx.canEdit ? ' · กดที่งานเพื่ออัปเดตความคืบหน้า' : ''}</p></div>
        <div class="toolbar"><button class="btn" id="t-print">${icon('print')} พิมพ์รายงาน A4</button></div></div>
      <div class="stats">
        ${Object.entries(PROGRESS).map(([k, v]) => `<button class="card stat stat-btn ${filter === k ? 'on' : ''}" data-f="${k}"><b>${count(k)}</b><span><i class="dot ${v.cls}"></i>${v.label}</span></button>`).join('')}
        <button class="card stat stat-btn ${filter === 'overdue' ? 'on' : ''}" data-f="overdue"><b style="color:${overdue ? 'var(--red)' : 'inherit'}">${overdue}</b><span>เลยกำหนด</span></button>
      </div>
      ${filter !== 'all' ? `<div class="toolbar"><span class="hint">แสดงเฉพาะ: ${esc(filter === 'overdue' ? 'เลยกำหนด' : PROGRESS[filter].label)} (${shown.length} งาน)</span><button class="btn btn-sm" data-f="all">แสดงทั้งหมด</button></div>` : ''}
      <div class="tbl-wrap"><table class="tbl track-tbl"><thead><tr><th class="c">ที่</th><th>งาน / หัวหน้างาน</th><th>สถานะ</th><th>ความคืบหน้า</th><th>ช่วงเวลา / กำหนด</th><th>ความเคลื่อนไหวล่าสุด</th></tr></thead>
        <tbody>${shown.map(({ t, no, p }) => { const h = headOf(t); const l = lastLog(t.id); const od = isTaskOverdue(p, today);
          return `<tr class="click" data-task="${t.id}"><td class="c">${no}</td>
            <td><b>${esc(t.name)}</b><span class="sub">${h ? esc(staffName(h.staff)) : '<i style="color:var(--amber)">ยังไม่มีหัวหน้างาน</i>'}</span></td>
            <td><span class="chip ${PROGRESS[p.status].cls}">${PROGRESS[p.status].label}</span></td>
            <td><span class="pbar"><i style="width:${p.percent}%"></i></span><span class="small"> ${p.percent}%</span></td>
            <td class="nowrap">${esc(PERIODS[p.period])}${p.due_date ? `<span class="sub" style="${od ? 'color:var(--red);font-weight:600' : ''}">กำหนด ${thaiDate(p.due_date, true)}${od ? ' · เลยกำหนด' : ''}</span>` : ''}</td>
            <td>${l ? `<span class="small">${thaiDate(l.log_date, true)}</span><span class="sub clip">${esc(l.note)}</span>` : '<span class="muted small">-</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      </div>
      <div class="print-only">${printSheet(rows)}</div>`;
    $$('[data-f]', el).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f === filter ? 'all' : b.dataset.f; list(); }));
    $$('[data-task]', el).forEach((r) => r.addEventListener('click', () => { location.hash = `track?task=${r.dataset.task}`; }));
    $('#t-print', el).addEventListener('click', () => window.print());
  }

  // ---------------------------------------------------------------- รายละเอียดงาน
  function detail(taskId) {
    const t = year.tasks.find((x) => x.id === taskId);
    if (!t) { el.innerHTML = '<div class="empty">ไม่พบงานนี้ในปีการศึกษาที่เลือก <a href="#track">กลับ</a></div>'; return; }
    const no = year.tasks.indexOf(t) + 1;
    const p = progressOf(progress, t.id);
    const mem = membersOf(t.id, year.assignments, ctx.staffById);
    const mine = logs.filter((l) => l.task_id === t.id);
    const dis = ctx.canEdit ? '' : 'disabled';
    el.innerHTML = `
      <div class="page-head"><div><a class="btn btn-sm" href="#track">${icon('back')} ติดตามงานวิชาการ</a>
        <h1 style="margin-top:10px">${no}. ${esc(t.name)}</h1>
        <p>${mem.length ? mem.map((m) => `${esc(staffName(m.staff))} <span class="muted">(${m.role === 'head' ? 'หัวหน้างาน' : m.role === 'secretary' ? 'เลขานุการ' : 'กรรมการ'})</span>`).join(' · ') : 'ยังไม่มีผู้รับผิดชอบ'}</p></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
        <form class="card" id="p-form"><h2>ความคืบหน้า</h2>
          <div class="field">สถานะ<span class="seg2 seg-wrap">${Object.entries(PROGRESS).map(([k, v]) => `<button type="button" data-st="${k}" class="${p.status === k ? 'on' : ''}" ${dis}>${v.label}</button>`).join('')}</span></div>
          <label class="field">ความคืบหน้า <b id="p-val">${p.percent}%</b><input type="range" name="percent" min="0" max="100" step="5" value="${p.percent}" ${dis}></label>
          <div class="cols-2">
            <label>ช่วงเวลา<select name="period" ${dis}>${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${String(p.period) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>กำหนดเสร็จ<input type="date" name="due_date" value="${esc(p.due_date || '')}" ${dis}></label>
          </div>
          <span class="small muted" id="p-saved">${progress[t.id]?.updated_at ? `อัปเดตล่าสุด ${thaiDate(progress[t.id].updated_at.slice(0, 10), true)}` : ''}</span>
        </form>
        <div class="card"><h2>บันทึกความเคลื่อนไหว</h2>
          ${ctx.canEdit ? `<form id="l-form" class="stack">
            <div class="cols-2"><label>วันที่<input type="date" name="log_date" value="${today}" required></label>
              <label>ลิงก์หลักฐาน (ถ้ามี)<input type="text" name="link" placeholder="https://drive.google.com/…"></label></div>
            <label>รายละเอียด<textarea name="note" rows="2" required placeholder="เช่น ประชุมทบทวนหลักสูตรครบ 3 ระดับแล้ว"></textarea></label>
            <div><button class="btn btn-primary" type="submit">${icon('plus')} บันทึก</button></div></form>` : ''}
          ${mine.length ? `<ul class="log">${mine.map((l) => `<li><span class="d">${thaiDate(l.log_date, true)}</span>
              <span class="n">${esc(l.note)}${safeLink(l.link) ? ` <a href="${esc(safeLink(l.link))}" target="_blank" rel="noopener">${icon('link')} หลักฐาน</a>` : ''}
              <small>${esc(ctx.profileById[l.created_by]?.full_name || '')}</small></span>
              ${ctx.canEdit ? `<button class="icon-btn danger" data-dl="${l.id}" title="ลบ">${icon('trash')}</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="hint">ยังไม่มีบันทึก</p>'}
        </div>
      </div>`;

    if (!ctx.canEdit) return;
    const form = $('#p-form', el);
    let cur = { ...p };
    let timer = null;
    const save = (now) => {
      clearTimeout(timer);
      $('#p-saved', el).textContent = 'กำลังบันทึก…';
      timer = setTimeout(async () => {
        try {
          const [row] = await ctx.db.upsert('ac_progress', [{ task_id: t.id, status: cur.status, percent: Number(cur.percent), period: cur.period, due_date: cur.due_date || null }], 'task_id');
          progress[t.id] = row || { ...cur, task_id: t.id };
          $('#p-saved', el).textContent = 'บันทึกแล้ว';
        } catch (err) { $('#p-saved', el).textContent = ''; toast(err.message, 'err'); }
      }, now ? 0 : 500);
    };
    $$('[data-st]', form).forEach((b) => b.addEventListener('click', () => {
      cur.status = b.dataset.st;
      if (cur.status === 'done') { cur.percent = 100; $('[name=percent]', form).value = 100; $('#p-val', el).textContent = '100%'; }
      $$('[data-st]', form).forEach((x) => x.classList.toggle('on', x === b));
      save(true);
    }));
    $('[name=percent]', form).addEventListener('input', (e) => {
      cur.percent = Number(e.target.value); $('#p-val', el).textContent = `${cur.percent}%`;
      if (cur.percent > 0 && cur.status === 'not_started') { cur.status = 'in_progress'; $$('[data-st]', form).forEach((x) => x.classList.toggle('on', x.dataset.st === 'in_progress')); }
      save();
    });
    $('[name=period]', form).addEventListener('change', (e) => { cur.period = e.target.value; save(true); });
    $('[name=due_date]', form).addEventListener('change', (e) => { cur.due_date = e.target.value; save(true); });

    $('#l-form', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      try {
        await ctx.db.insert('ac_progress_logs', [{ task_id: t.id, log_date: f.log_date, note: f.note.trim(), link: f.link.trim() }]);
        ({ progress, logs } = await loadProgress(ctx.db, year.tasks.map((x) => x.id))); detail(t.id); toast('บันทึกแล้ว');
      } catch (err) { toast(err.message, 'err'); }
    });
    $$('[data-dl]', el).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('ลบบันทึกนี้?', 'ลบ'))) return;
      await ctx.db.remove('ac_progress_logs', { id: b.dataset.dl });
      logs = logs.filter((l) => l.id !== b.dataset.dl); detail(t.id);
    }));
  }

  // ---------------------------------------------------------------- พิมพ์
  function printSheet(rows) {
    const s = ctx.settings;
    const count = (st) => rows.filter((r) => r.p.status === st).length;
    return `<div class="a4 flow${hasThaiOfficialFont() ? '' : ' fallback'}">
      <h2>รายงานความคืบหน้าการดำเนินงานวิชาการ ปีการศึกษา ${ctx.year}</h2>
      <div class="sub">โรงเรียน${esc(ctx.schoolName)} · ข้อมูล ณ วันที่ ${thaiDate(today)}</div>
      <p style="margin:0 0 4px">สรุป: ${Object.entries(PROGRESS).map(([k, v]) => `${v.label} ${count(k)} งาน`).join(' · ')} · เลยกำหนด ${rows.filter((r) => isTaskOverdue(r.p, today)).length} งาน</p>
      <table><thead><tr><th>ที่</th><th class="l">งาน</th><th class="l">หัวหน้างาน</th><th>สถานะ</th><th>ร้อยละ</th><th>กำหนด</th><th class="l">ความเคลื่อนไหวล่าสุด</th></tr></thead>
      <tbody>${rows.map(({ t, no, p }) => { const h = headOf(t); const l = lastLog(t.id);
        return `<tr><td>${no}</td><td class="l">${esc(t.name)}</td><td class="l">${h ? esc(staffName(h.staff)) : '-'}</td><td>${PROGRESS[p.status].label}</td><td>${p.percent}</td>
          <td>${p.due_date ? thaiDate(p.due_date, true) : esc(PERIODS[p.period])}</td><td class="l">${l ? `${thaiDate(l.log_date, true)} ${esc(l.note)}` : '-'}</td></tr>`; }).join('')}</tbody></table>
      <div class="sign"><div>ลงชื่อ ..............................................<br>(${esc(s.academic_head_name || '..............................................')})<br>หัวหน้าฝ่ายบริหารงานวิชาการ</div>
        <div>ลงชื่อ ..............................................<br>(${esc(s.director_name || '..............................................')})<br>${esc(s.director_title || 'ผู้อำนวยการโรงเรียน')}</div></div>
    </div>`;
  }

  draw();

  // เครื่องอื่นแก้ → โหลดใหม่ (ไม่วาดทับขณะอยู่หน้ารายละเอียดที่กำลังแก้)
  let rt = null;
  const reload = () => { clearTimeout(rt); rt = setTimeout(async () => {
    year = await loadYear(ctx.db, ctx.year);
    ({ progress, logs } = await loadProgress(ctx.db, year.tasks.map((t) => t.id)));
    if (!taskFromHash()) list();
  }, 600); };
  const offs = ['ac_progress', 'ac_progress_logs', 'ac_tasks', 'ac_assignments'].map((tb) => ctx.db.subscribe(tb, null, reload));
  return () => offs.forEach((f) => f());
}
