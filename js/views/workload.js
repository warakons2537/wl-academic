import { esc, $, $$, toast } from '../util.js';
import { icon } from '../icons.js';
import { ROLES, ROLE_CYCLE } from '../task-sets.js';
import { loadYear, workloadSummary, membersOf, taskWarnings, isTeacherLike } from '../data.js';
import { staffName } from '../thai.js';
import { hasThaiOfficialFont } from '../order-doc.js';

const SHOW_ALL_KEY = 'wl-academic-show-all-staff';

export async function render(el, ctx) {
  let data = await loadYear(ctx.db, ctx.year);
  let showAll = false; try { showAll = localStorage.getItem(SHOW_ALL_KEY) === '1'; } catch { /* */ }
  let busy = 0;

  const people = () => {
    const used = new Set(data.assignments.map((a) => a.staff_id));
    return ctx.staff.filter((s) => (showAll ? s.active || used.has(s.id) : isTeacherLike(s) || used.has(s.id)));
  };
  const roleOf = (taskId, staffId) => data.assignments.find((a) => a.task_id === taskId && a.staff_id === staffId);

  function draw() {
    const scroller = $('.mx-wrap', el); const keep = scroller ? [scroller.scrollLeft, scroller.scrollTop] : null;
    if (!data.tasks.length) {
      el.innerHTML = `<div class="page-head"><div><h1>จัดภาระงานวิชาการ</h1><p>ปีการศึกษา ${ctx.year}</p></div></div>
        <div class="empty">ยังไม่มีคลังงานวิชาการของปีการศึกษา ${ctx.year}<br><br>
        ${ctx.canEdit ? '<a class="btn btn-primary" href="#basics?tab=tasks">ไปที่ ข้อมูลพื้นฐาน › คลังงานวิชาการ</a>' : ''}</div>`;
      return;
    }
    const ppl = people();
    const { rows, avg } = workloadSummary(ppl, data.tasks, data.assignments);
    const max = Math.max(1, ...rows.map((r) => r.total));
    const totals = Object.fromEntries(rows.map((r) => [r.staff.id, r.total]));
    const warnCount = data.tasks.filter((t) => taskWarnings(t, membersOf(t.id, data.assignments, ctx.staffById)).length).length;
    let no = 0; let lastGroup = null;

    el.innerHTML = `
      <div class="page-head"><div><h1>จัดภาระงานวิชาการ</h1>
        <p>ปีการศึกษา ${ctx.year} · ${data.tasks.length} งาน · ${ppl.length} คน${ctx.canEdit ? ' · คลิกช่องเพื่อเปลี่ยนบทบาท' : ''}</p></div>
        <div class="toolbar no-print">
          <label class="inline small"><input type="checkbox" id="w-all" ${showAll ? 'checked' : ''}> แสดงผู้บริหาร/ธุรการด้วย</label>
          <button class="btn" id="w-print">${icon('print')} พิมพ์ตารางสรุป</button>
          <a class="btn btn-primary" href="#orders">${icon('orders')} ออกคำสั่ง</a></div></div>

      <div class="card no-print"><div class="toolbar"><h2 class="grow">สมดุลภาระงานรายบุคคล</h2>
        <span class="legend-row"><span><i class="sw r-head" style="background:var(--pen)"></i>หัวหน้างาน</span>
          <span><i class="sw" style="background:color-mix(in srgb,var(--pen) 35%,var(--sheet))"></i>กรรมการ</span>
          <span><i class="sw" style="background:var(--gold)"></i>เลขานุการ</span><span>┆ เส้นประ = ค่าเฉลี่ย ${avg.toFixed(1)} งาน</span></span></div>
        <div class="bal">${[...rows].sort((a, b) => b.total - a.total || a.staff.sort_order - b.staff.sort_order).map((r) => {
          const pct = (n) => (n / max) * 100;
          const over = avg > 0 && r.total > avg * 1.5 && r.total - avg >= 2;
          return `<div class="bal-row ${over ? 'over' : ''} ${r.total ? '' : 'none'}" title="หัวหน้า ${r.head} · กรรมการ ${r.member} · เลขานุการ ${r.secretary}">
            <span class="nm">${esc(staffName(r.staff))}</span>
            <span class="bar">${r.head ? `<i class="h" style="width:${pct(r.head)}%"></i>` : ''}${r.member ? `<i class="m" style="width:${pct(r.member)}%"></i>` : ''}${r.secretary ? `<i class="s" style="width:${pct(r.secretary)}%"></i>` : ''}
              <span class="avg" style="left:${pct(avg)}%"></span></span>
            <span class="tot">${r.total}</span></div>`;
        }).join('')}</div>
        <p class="hint">${rows.filter((r) => !r.total).length ? `ยังไม่มีงาน: ${rows.filter((r) => !r.total).map((r) => esc(r.staff.first_name)).join(', ')} · ` : ''}ตัวเลขสีแดง = มากกว่าค่าเฉลี่ยมาก ควรพิจารณากระจายงาน</p>
      </div>

      ${warnCount ? `<div class="warn-box no-print">${icon('warn')} มี ${warnCount} งานที่ควรแก้ก่อนออกคำสั่ง (ดูข้อความสีส้มใต้ชื่องาน)</div>` : ''}

      <div class="legend-row no-print"><span><span class="sw r-head">ห</span>หัวหน้างาน</span><span><span class="sw r-member">ก</span>กรรมการ</span>
        <span><span class="sw r-secretary">ล</span>กรรมการและเลขานุการ</span>${ctx.canEdit ? '<span>คลิกซ้ำเพื่อเปลี่ยน: ว่าง → ห → ก → ล → ว่าง</span>' : ''}</div>

      <div class="mx-wrap no-print"><table class="mx">
        <thead><tr><th class="task">งานวิชาการ</th>${ppl.map((s) => `<th class="person" title="${esc(staffName(s))}">${esc(s.first_name)} <small>${esc(s.last_name)}</small></th>`).join('')}<th>คน</th></tr></thead>
        <tbody>${data.tasks.map((t) => {
          const grp = t.group_name !== lastGroup && t.group_name ? `<tr class="grp"><td colspan="${ppl.length + 2}">${esc(t.group_name)}</td></tr>` : '';
          lastGroup = t.group_name; no++;
          const mem = membersOf(t.id, data.assignments, ctx.staffById);
          const w = taskWarnings(t, mem);
          return `${grp}<tr><td class="task"><span class="no">${no}</span>${esc(t.name)}${w.length ? `<span class="w">⚠ ${esc(w.join(' · '))}</span>` : ''}</td>
            ${ppl.map((s) => { const a = roleOf(t.id, s.id);
              return `<td class="${a ? `r-${a.role}` : ''}"><button class="rc" data-t="${t.id}" data-s="${s.id}" ${ctx.canEdit ? '' : 'disabled'}
                aria-label="${esc(`${t.name} — ${staffName(s)}: ${a ? ROLES[a.role].label : 'ไม่มี'}`)}">${a ? ROLES[a.role].short : ''}</button></td>`; }).join('')}
            <td class="n">${mem.length}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td class="task">รวมงานต่อคน</td>${ppl.map((s) => `<td class="${avg > 0 && totals[s.id] > avg * 1.5 && totals[s.id] - avg >= 2 ? 'hot' : ''}">${totals[s.id]}</td>`).join('')}<td></td></tr></tfoot>
      </table></div>

      <div class="print-area print-only">${printSheet(ctx, data, ppl, totals)}</div>`;

    if (keep) { const sc = $('.mx-wrap', el); if (sc) [sc.scrollLeft, sc.scrollTop] = keep; }

    $('#w-all', el).addEventListener('change', (e) => { showAll = e.target.checked; try { localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0'); } catch { /* */ } draw(); });
    $('#w-print', el).addEventListener('click', () => window.print());
    $$('button.rc', el).forEach((b) => b.addEventListener('click', () => cycle(b.dataset.t, b.dataset.s)));
  }

  async function cycle(taskId, staffId) {
    const cur = roleOf(taskId, staffId);
    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(cur?.role ?? null) + 1) % ROLE_CYCLE.length];
    const before = data.assignments;
    // อัปเดตหน้าจอทันที แล้วค่อยบันทึก
    if (!next) data.assignments = before.filter((a) => a !== cur);
    else if (cur) data.assignments = before.map((a) => (a === cur ? { ...a, role: next } : a));
    else data.assignments = [...before, { id: `tmp-${Date.now()}`, task_id: taskId, staff_id: staffId, role: next, sort_order: 0 }];
    draw();
    busy++;
    try {
      if (!next) await ctx.db.remove('ac_assignments', { id: cur.id });
      else if (cur) await ctx.db.update('ac_assignments', { id: cur.id }, { role: next });
      else {
        const [row] = await ctx.db.insert('ac_assignments', [{ task_id: taskId, staff_id: staffId, role: next, sort_order: 0 }]);
        data.assignments = data.assignments.map((a) => (a.task_id === taskId && a.staff_id === staffId ? row : a));
      }
    } catch (err) { data.assignments = before; draw(); toast(err.message, 'err'); }
    finally { busy--; }
  }

  draw();

  // เครื่องอื่นแก้ → โหลดใหม่ (ข้ามถ้ากำลังบันทึกของเครื่องนี้)
  let t = null;
  const reload = () => { clearTimeout(t); t = setTimeout(async () => {
    if (busy) return reload();
    const fresh = await loadYear(ctx.db, ctx.year);
    const key = (d) => JSON.stringify([d.tasks.map((x) => [x.id, x.name, x.sort_order, x.group_name]), d.assignments.map((a) => [a.task_id, a.staff_id, a.role]).sort()]);
    if (key(fresh) !== key(data)) { data = fresh; draw(); }
  }, 500); };
  const offs = [ctx.db.subscribe('ac_assignments', null, reload), ctx.db.subscribe('ac_tasks', null, reload)];
  return () => offs.forEach((f) => f());
}

// ตารางสรุปสำหรับพิมพ์ A4 แนวนอน
function printSheet(ctx, data, ppl, totals) {
  let no = 0;
  return `<div class="a4 land wl-sheet${hasThaiOfficialFont() ? '' : ' fallback'}">
    <h2>ตารางสรุปการมอบหมายงานวิชาการ ปีการศึกษา ${ctx.year}</h2>
    <div class="sub">โรงเรียน${esc(ctx.schoolName)} · ห = หัวหน้างาน ก = กรรมการ ล = กรรมการและเลขานุการ</div>
    <table><thead><tr><th>ที่</th><th class="l">งานวิชาการ</th>${ppl.map((s) => `<th class="v"><span>${esc(s.first_name)}</span></th>`).join('')}</tr></thead>
    <tbody>${data.tasks.map((t) => { no++; return `<tr><td>${no}</td><td class="l">${esc(t.name)}</td>${ppl.map((s) => {
      const a = data.assignments.find((x) => x.task_id === t.id && x.staff_id === s.id); return `<td>${a ? ROLES[a.role].short : ''}</td>`; }).join('')}</tr>`; }).join('')}
    <tr class="sum"><td></td><td class="l"><b>รวม (งาน)</b></td>${ppl.map((s) => `<td><b>${totals[s.id]}</b></td>`).join('')}</tr></tbody></table>
    <div class="sign"><div>ลงชื่อ ..............................................<br>(${esc(ctx.settings.academic_head_name || '..............................................')})<br>หัวหน้าฝ่ายบริหารงานวิชาการ</div>
      <div>ลงชื่อ ..............................................<br>(${esc(ctx.settings.director_name || '..............................................')})<br>${esc(ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน')}</div></div>
  </div>`;
}
