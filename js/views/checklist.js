import { esc, $, $$, toast, modal, confirmBox, todayIso, thaiDate } from '../util.js';
import { icon } from '../icons.js';
import { SUBMIT, SUBMIT_CYCLE, PERIODS, CHECKLIST_DEFAULTS } from '../task-sets.js';
import { isTeacherLike, itemsForTerm, subStatus, isSubOverdue, checklistSummary, pct } from '../data.js';
import { staffName } from '../thai.js';
import { hasThaiOfficialFont } from '../order-doc.js';

const TERM_KEY = 'wl-academic-term';
const safeLink = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

export async function render(el, ctx) {
  const today = todayIso();
  const curTerm = ctx.terms.find((t) => t.is_current && t.academic_year === ctx.year)?.term;
  let term = '1';
  try { term = localStorage.getItem(`${TERM_KEY}-${ctx.year}`) || String(curTerm || 1); } catch { term = String(curTerm || 1); }
  let mode = 'cycle';
  let manage = false;
  let printKind = 'summary';
  let allItems = []; let subs = []; let busy = 0;

  const load = async () => {
    allItems = await ctx.db.select('ac_checklist_items', { eq: { academic_year: ctx.year } });
    const ids = allItems.map((i) => i.id);
    subs = ids.length ? await ctx.db.select('ac_submissions', { in: { item_id: ids } }) : [];
  };
  await load();

  const people = () => ctx.staff.filter(isTeacherLike);
  const hasTermItems = () => allItems.some((i) => i.period === term);
  const hasYearItem = (name) => allItems.some((x) => x.period === 'year' && x.name === name);
  const subOf = (itemId, staffId) => subs.find((s) => s.item_id === itemId && s.staff_id === staffId);
  const canSubmit = !ctx.isAdmin && ctx.ac.teachers_enabled && !!ctx.myStaff;

  function draw() {
    const scroller = $('.mx-wrap', el); const keep = scroller ? [scroller.scrollLeft, scroller.scrollTop] : null;
    const items = itemsForTerm(allItems, term);
    const ppl = people();
    const sum = checklistSummary(items, ppl, subs, today);

    el.innerHTML = `<div class="no-print stack" style="gap:20px">
      <div class="page-head"><div><h1>เช็กการส่งงานครู</h1><p>ปีการศึกษา ${ctx.year} · ${items.length} รายการ · ครู ${ppl.length} คน</p></div>
        <div class="toolbar">
          <span class="seg2">${['1', '2'].map((t) => `<button data-term="${t}" class="${term === t ? 'on' : ''}">ภาคเรียนที่ ${t}</button>`).join('')}</span>
          ${ctx.canEdit ? `<button class="btn ${manage ? 'btn-primary' : ''}" id="c-manage">${icon('edit')} จัดการรายการ</button>` : ''}
          ${items.length ? `<button class="btn" id="c-print-sum">${icon('print')} พิมพ์ตารางสรุป</button><button class="btn" id="c-print-slip">${icon('print')} ใบแจ้งงานค้าง</button>` : ''}
        </div></div>
      ${manage || !hasTermItems() ? manageCard(items) : ''}
      ${items.length ? `
        <div class="stats">
          <div class="card stat"><b>${pct(sum.all.sent, sum.all.applicable)}%</b><span>ส่งแล้ว (${sum.all.sent}/${sum.all.applicable})</span></div>
          <div class="card stat"><b>${pct(sum.all.passed, sum.all.applicable)}%</b><span>ผ่านการตรวจ</span></div>
          <div class="card stat"><b>${sum.all.pending}</b><span>ค้างส่ง / ต้องแก้ไข</span></div>
          <div class="card stat"><b style="color:${sum.all.overdue ? 'var(--red)' : 'inherit'}">${sum.all.overdue}</b><span>เลยกำหนด</span></div>
        </div>
        ${canSubmit ? myCard(items) : ''}
        <div class="toolbar">
          <span class="legend-row grow">${Object.values(SUBMIT).map((s) => `<span><span class="sw ${s.cls}">${s.mark}</span>${s.label}</span>`).join('')}<span><span class="sw sb-none od">✕</span>เลยกำหนด</span></span>
          ${ctx.canEdit ? `<span class="small muted">คลิกช่อง =</span><span class="seg2"><button data-mode="cycle" class="${mode === 'cycle' ? 'on' : ''}">เปลี่ยนสถานะ</button><button data-mode="detail" class="${mode === 'detail' ? 'on' : ''}">ดู/แก้รายละเอียด</button></span>` : ''}
        </div>
        ${ctx.canEdit ? `<p class="hint" style="margin-top:-12px">${mode === 'cycle' ? 'คลิกวน: ยังไม่ส่ง → รอตรวจ → ผ่าน → ไม่เกี่ยวข้อง · คลิกขวา/กดค้าง = รายละเอียด (ลิงก์งาน หมายเหตุ ส่งกลับแก้ไข)' : 'คลิกช่องเพื่อใส่ลิงก์งาน วันที่ส่ง หมายเหตุ หรือส่งกลับแก้ไข'}</p>` : ''}
        <div class="mx-wrap"><table class="mx ck">
          <thead><tr><th class="task">ครู</th>${items.map((i) => `<th class="item"><span>${esc(i.name)}</span>
            <small>${i.period === 'year' ? 'ทั้งปี' : ''}${i.due_date ? `${i.period === 'year' ? ' · ' : ''}<span style="${i.due_date < today ? 'color:var(--red)' : ''}">ส่ง ${thaiDate(i.due_date, true)}</span>` : ''}</small></th>`).join('')}<th>ส่งแล้ว</th></tr></thead>
          <tbody>${ppl.map((s) => `<tr><td class="task">${esc(staffName(s))}</td>${items.map((i) => {
            const st = subStatus(subs, i.id, s.id); const od = isSubOverdue(i, st, today); const row = subOf(i.id, s.id);
            return `<td class="${SUBMIT[st].cls}${od ? ' od' : ''}"><button class="rc" data-i="${i.id}" data-s="${s.id}" title="${esc(`${staffName(s)} · ${i.name}: ${SUBMIT[st].label}${od ? ' (เลยกำหนด)' : ''}`)}">${SUBMIT[st].mark}${row?.link || row?.note || row?.review_note ? '<i class="has"></i>' : ''}</button></td>`; }).join('')}
            <td class="n">${pct(sum.byStaff[s.id].sent, sum.byStaff[s.id].applicable)}%</td></tr>`).join('')}</tbody>
          <tfoot><tr><td class="task">ผ่าน / ต้องส่ง</td>${items.map((i) => `<td>${sum.byItem[i.id].passed}/${sum.byItem[i.id].applicable}</td>`).join('')}<td></td></tr></tfoot>
        </table></div>
        ${pendingCard(items, ppl)}` : ''}
      </div>
      <div class="print-only">${items.length ? (printKind === 'summary' ? printSummary(items, ppl, sum) : printSlips(items, ppl)) : ''}</div>`;

    if (keep) { const sc = $('.mx-wrap', el); if (sc) [sc.scrollLeft, sc.scrollTop] = keep; }
    bind(items);
  }

  // ---------------------------------------------------------------- การ์ดย่อย
  function manageCard(items) {
    if (!ctx.canEdit) return items.length ? '' : `<div class="empty">ยังไม่มีรายการเอกสารของภาคเรียนที่ ${term}</div>`;
    const src = sourceTerm();
    const srcItems = src ? allItemsFor(src) : [];
    if (!hasTermItems()) {
      return `<div class="card"><h2>ภาคเรียนที่ ${term}/${ctx.year} ยังไม่มีรายการเอกสาร${items.length ? ` (มีรายการทั้งปี ${items.length} รายการ)` : ''}</h2>
        <div class="set-pick">
          <button data-seed><b>ใช้รายการตั้งต้น ${CHECKLIST_DEFAULTS.length} รายการ</b><span>${CHECKLIST_DEFAULTS.map((d) => esc(d.name)).join(' · ')}</span></button>
          ${srcItems.length ? `<button data-copy><b>คัดลอกจากภาคเรียนที่ ${src.term}/${src.year}</b><span>${srcItems.length} รายการ (ไม่คัดลอกวันกำหนดส่งและผลการส่ง)</span></button>` : ''}
          <button data-add><b>เพิ่มเอง</b><span>เพิ่มทีละรายการ</span></button>
        </div></div>`;
    }
    return `<div class="card"><div class="toolbar"><h2 class="grow">รายการเอกสาร ภาคเรียนที่ ${term}/${ctx.year}</h2>
        <button class="btn btn-primary" data-add>${icon('plus')} เพิ่มรายการ</button></div>
      <p class="hint">รายการ "ทั้งปี" แสดงทั้ง 2 ภาคเรียนและใช้ผลการส่งชุดเดียวกัน</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>รายการ</th><th>รอบ</th><th>กำหนดส่ง</th><th></th></tr></thead><tbody>
      ${items.map((i, k) => `<tr data-row="${i.id}"><td><input type="text" data-e="name" value="${esc(i.name)}" style="width:100%"></td>
        <td><select data-e="period">${Object.entries(PERIODS).map(([v, l]) => `<option value="${v}" ${i.period === v ? 'selected' : ''}>${v === 'year' ? 'ทั้งปี' : l}</option>`).join('')}</select></td>
        <td><input type="date" data-e="due_date" value="${esc(i.due_date || '')}"></td>
        <td class="nowrap" style="text-align:right"><button class="icon-btn" data-mv="-1" ${k ? '' : 'disabled'} title="เลื่อนขึ้น">${icon('up')}</button>
          <button class="icon-btn" data-mv="1" ${k < items.length - 1 ? '' : 'disabled'} title="เลื่อนลง">${icon('down')}</button>
          <button class="icon-btn danger" data-del title="ลบ">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  function myCard(items) {
    const me = ctx.myStaff;
    return `<div class="card mine"><h2>งานของฉัน — ${esc(staffName(me))}</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>รายการ</th><th>กำหนดส่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${items.map((i) => { const st = subStatus(subs, i.id, me.id); const row = subOf(i.id, me.id); const od = isSubOverdue(i, st, today);
        return `<tr><td>${esc(i.name)}${row?.review_note ? `<span class="sub" style="color:var(--amber)">ผู้ตรวจ: ${esc(row.review_note)}</span>` : ''}</td>
          <td class="nowrap" style="${od ? 'color:var(--red);font-weight:600' : ''}">${i.due_date ? thaiDate(i.due_date, true) : '-'}</td>
          <td><span class="chip ${SUBMIT[st].cls}">${SUBMIT[st].mark} ${SUBMIT[st].label}</span></td>
          <td style="text-align:right">${st === 'na' || st === 'passed' ? '' : `<button class="btn btn-sm ${st === 'none' || st === 'returned' ? 'btn-primary' : ''}" data-mine="${i.id}">${st === 'submitted' ? 'แก้ไขการส่ง' : 'ส่งงาน'}</button>`}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  function pendingCard(items, ppl) {
    const list = ppl.map((s) => ({ s, its: items.filter((i) => ['none', 'returned'].includes(subStatus(subs, i.id, s.id))) })).filter((x) => x.its.length);
    return `<div class="card"><h2>รายการค้างส่ง${list.length ? ` (${list.length} คน)` : ''}</h2>
      ${list.length ? `<div class="pending">${list.map(({ s, its }) => `<div><b>${esc(staffName(s))}</b> <span class="muted small">${its.length} รายการ</span>
        <div>${its.map((i) => { const st = subStatus(subs, i.id, s.id); const od = isSubOverdue(i, st, today);
          return `<span class="chip ${od ? 'chip-bad' : st === 'returned' ? 'chip-warn' : ''}">${esc(i.name)}${st === 'returned' ? ' (แก้ไข)' : ''}</span>`; }).join(' ')}</div></div>`).join('')}</div>`
        : '<p class="hint">ส่งครบทุกคนแล้ว</p>'}</div>`;
  }

  // ---------------------------------------------------------------- เหตุการณ์
  function bind(items) {
    $$('[data-term]', el).forEach((b) => b.addEventListener('click', () => { term = b.dataset.term; try { localStorage.setItem(`${TERM_KEY}-${ctx.year}`, term); } catch { /* */ } reload(); }));
    $$('[data-mode]', el).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    $('#c-manage', el)?.addEventListener('click', () => { manage = !manage; draw(); });
    $('#c-print-sum', el)?.addEventListener('click', () => { printKind = 'summary'; draw(); window.print(); });
    $('#c-print-slip', el)?.addEventListener('click', () => { printKind = 'slips'; draw(); window.print(); });

    // ตาราง
    $$('button.rc', el).forEach((b) => {
      const open = () => details(b.dataset.i, b.dataset.s);
      let hold = null; let held = false;
      b.addEventListener('click', () => { if (held) { held = false; return; } if (ctx.canEdit && mode === 'cycle') cycle(b.dataset.i, b.dataset.s); else open(); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!held) open(); });
      b.addEventListener('pointerdown', (e) => { held = false; if (e.pointerType !== 'mouse') hold = setTimeout(() => { held = true; open(); }, 550); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(hold)));
    });
    $$('[data-mine]', el).forEach((b) => b.addEventListener('click', () => submitMine(b.dataset.mine)));

    // จัดการรายการ
    $('[data-seed]', el)?.addEventListener('click', async () => {
      await ctx.db.insert('ac_checklist_items', CHECKLIST_DEFAULTS.filter((d) => !(d.period === 'year' && hasYearItem(d.name)))
        .map((d, k) => ({ academic_year: ctx.year, period: d.period === 'year' ? 'year' : term, name: d.name, sort_order: k + 1 })));
      await reload(); toast('สร้างรายการตั้งต้นแล้ว');
    });
    $('[data-copy]', el)?.addEventListener('click', copyFromSource);
    $$('[data-add]', el).forEach((b) => b.addEventListener('click', async () => {
      const r = await modal('เพิ่มรายการเอกสาร', `<label>ชื่อรายการ<input type="text" name="name" required></label>
        <div class="cols-2"><label>รอบ<select name="period"><option value="${term}">ภาคเรียนที่ ${term}</option><option value="year">ทั้งปี</option></select></label>
        <label>กำหนดส่ง<input type="date" name="due_date"></label></div>`, { okText: 'เพิ่ม' });
      if (!r?.name?.trim()) return;
      await ctx.db.insert('ac_checklist_items', [{ academic_year: ctx.year, period: r.period, name: r.name.trim(), due_date: r.due_date || null, sort_order: Math.max(0, ...allItems.map((i) => i.sort_order)) + 1 }]);
      manage = true; await reload();
    }));
    $$('tr[data-row]', el).forEach((tr) => {
      const id = tr.dataset.row;
      $$('[data-e]', tr).forEach((inp) => inp.addEventListener('change', async () => {
        const v = inp.value.trim();
        if (inp.dataset.e === 'name' && !v) { toast('ชื่อรายการว่างไม่ได้', 'err'); return; }
        await ctx.db.update('ac_checklist_items', { id }, { [inp.dataset.e]: v || null }); await reload();
      }));
      $$('[data-mv]', tr).forEach((b) => b.addEventListener('click', async () => {
        const items = itemsForTerm(allItems, term); const k = items.findIndex((i) => i.id === id); const j = k + Number(b.dataset.mv);
        [items[k], items[j]] = [items[j], items[k]];
        await Promise.all(items.map((i, n) => ctx.db.update('ac_checklist_items', { id: i.id }, { sort_order: n + 1 }))); await reload();
      }));
      $('[data-del]', tr).addEventListener('click', async () => {
        const n = subs.filter((s) => s.item_id === id).length;
        if (!(await confirmBox(`ลบรายการนี้${n ? ` และผลการส่ง ${n} ช่อง` : ''}?`, 'ลบ'))) return;
        await ctx.db.remove('ac_submissions', { item_id: id }).catch(() => {});
        await ctx.db.remove('ac_checklist_items', { id }); await reload();
      });
    });
  }

  // ภาคเรียนต้นทางสำหรับคัดลอก: ภาค 2 ← ภาค 1 ปีเดียวกัน · ภาค 1 ← ภาค 2 ปีก่อน
  const sourceTerm = () => (term === '2' ? { year: ctx.year, term: '1' } : { year: ctx.year - 1, term: '2' });
  let prevYearItems = null;
  const allItemsFor = (src) => (src.year === ctx.year ? allItems.filter((i) => i.period === src.term) : (prevYearItems || []));
  async function copyFromSource() {
    const src = sourceTerm();
    const from = allItemsFor(src);
    const rows = from.map((i, k) => ({ academic_year: ctx.year, period: i.period === 'year' ? 'year' : term, name: i.name, sort_order: k + 1 }))
      .filter((r) => !(r.period === 'year' && hasYearItem(r.name)));
    if (rows.length) await ctx.db.insert('ac_checklist_items', rows);
    await reload(); toast(`คัดลอก ${rows.length} รายการแล้ว`);
  }

  async function cycle(itemId, staffId) {
    const row = subOf(itemId, staffId);
    const cur = row?.status || 'none';
    const i = SUBMIT_CYCLE.indexOf(cur);
    const next = SUBMIT_CYCLE[(i < 0 ? 1 : i + 1) % SUBMIT_CYCLE.length];   // ส่งกลับแก้ไข → รอตรวจ
    await setStatus(itemId, staffId, next, {});
  }

  async function setStatus(itemId, staffId, status, extra) {
    const before = subs;
    const row = subOf(itemId, staffId);
    const review = ['passed', 'returned'].includes(status) && status !== row?.status ? { reviewed_by: ctx.me.id, reviewed_at: new Date().toISOString() } : {};
    const patch = { status, ...review, ...extra };
    if (status === 'submitted' && !row?.submitted_at && !extra.submitted_at) patch.submitted_at = today;
    if (status === 'none') subs = subs.filter((s) => s !== row);
    else if (row) subs = subs.map((s) => (s === row ? { ...s, ...patch } : s));
    else subs = [...subs, { id: `tmp-${Date.now()}`, item_id: itemId, staff_id: staffId, link: '', note: '', review_note: '', ...patch }];
    draw();
    busy++;
    try {
      if (status === 'none') { if (row) await ctx.db.remove('ac_submissions', { id: row.id }); }
      else {
        const [saved] = await ctx.db.upsert('ac_submissions', [{ item_id: itemId, staff_id: staffId, ...patch }], 'item_id,staff_id');
        if (saved) subs = subs.map((s) => (s.item_id === itemId && s.staff_id === staffId ? saved : s));
      }
    } catch (err) { subs = before; draw(); toast(err.message, 'err'); }
    finally { busy--; }
  }

  async function details(itemId, staffId) {
    const item = allItems.find((i) => i.id === itemId); const s = ctx.staffById[staffId];
    const row = subOf(itemId, staffId) || {}; const st = row.status || 'none';
    if (!ctx.canEdit) {
      await modal(`${staffName(s)} · ${item.name}`, `<p><span class="chip ${SUBMIT[st].cls}">${SUBMIT[st].mark} ${SUBMIT[st].label}</span></p>
        ${row.submitted_at ? `<p class="hint">ส่งเมื่อ ${thaiDate(row.submitted_at)}</p>` : ''}
        ${safeLink(row.link) ? `<p><a href="${esc(safeLink(row.link))}" target="_blank" rel="noopener">${icon('link')} เปิดงานที่ส่ง</a></p>` : ''}
        ${row.note ? `<p>หมายเหตุ: ${esc(row.note)}</p>` : ''}${row.review_note ? `<p>ผู้ตรวจ: ${esc(row.review_note)}</p>` : ''}`, { okText: 'ปิด', cancelText: '' });
      return;
    }
    const r = await modal(`${staffName(s)} · ${item.name}`, `
      <label>สถานะ<select name="status">${Object.entries(SUBMIT).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v.mark} ${v.label}</option>`).join('')}</select></label>
      <div class="cols-2"><label>วันที่ส่ง<input type="date" name="submitted_at" value="${esc(row.submitted_at || '')}"></label>
        <label>ลิงก์งาน<input type="text" name="link" value="${esc(row.link || '')}" placeholder="https://drive.google.com/…"></label></div>
      ${safeLink(row.link) ? `<a href="${esc(safeLink(row.link))}" target="_blank" rel="noopener" class="small">${icon('link')} เปิดลิงก์</a>` : ''}
      <label>หมายเหตุจากผู้ส่ง<textarea name="note" rows="2">${esc(row.note || '')}</textarea></label>
      <label>ความเห็นผู้ตรวจ (เช่น สิ่งที่ต้องแก้ไข)<textarea name="review_note" rows="2">${esc(row.review_note || '')}</textarea></label>
      ${row.reviewed_at ? `<p class="hint">ตรวจล่าสุด ${thaiDate(row.reviewed_at.slice(0, 10))} ${esc(ctx.profileById[row.reviewed_by]?.full_name || '')}</p>` : ''}`, { wide: true });
    if (!r) return;
    if (r.status === 'none' && st !== 'none' && (row.link || row.note || row.review_note) && !(await confirmBox('เปลี่ยนเป็น "ยังไม่ส่ง" จะลบลิงก์และหมายเหตุของช่องนี้ ยืนยัน?'))) return;
    await setStatus(itemId, staffId, r.status, r.status === 'none' ? {} : { submitted_at: r.submitted_at || null, link: r.link.trim(), note: r.note.trim(), review_note: r.review_note.trim() });
  }

  async function submitMine(itemId) {
    const item = allItems.find((i) => i.id === itemId); const row = subOf(itemId, ctx.myStaff.id) || {};
    const r = await modal(`ส่งงาน: ${item.name}`, `
      ${row.review_note ? `<div class="warn-box">ผู้ตรวจ: ${esc(row.review_note)}</div>` : ''}
      <label>ลิงก์งาน (Google Drive ฯลฯ)<input type="text" name="link" value="${esc(row.link || '')}" placeholder="https://drive.google.com/…"></label>
      <label>หมายเหตุ (ถ้ามี)<textarea name="note" rows="2">${esc(row.note || '')}</textarea></label>
      <p class="hint">กดส่งแล้วสถานะจะเป็น "รอตรวจ" ฝ่ายวิชาการจะตรวจและแจ้งผล</p>`, { okText: 'ส่งงาน' });
    if (!r) return;
    if (r.link.trim() && !safeLink(r.link.trim())) { toast('ลิงก์ต้องขึ้นต้นด้วย https://', 'err'); return; }
    busy++;
    try {
      const [saved] = await ctx.db.upsert('ac_submissions', [{ item_id: itemId, staff_id: ctx.myStaff.id, status: 'submitted', link: r.link.trim(), note: r.note.trim(), submitted_at: today }], 'item_id,staff_id');
      subs = [...subs.filter((s) => !(s.item_id === itemId && s.staff_id === ctx.myStaff.id)), saved || { item_id: itemId, staff_id: ctx.myStaff.id, status: 'submitted', link: r.link, note: r.note, submitted_at: today, review_note: row.review_note || '' }];
      draw(); toast('ส่งงานแล้ว');
    } catch (err) { toast(err.message, 'err'); }
    finally { busy--; }
  }

  // ---------------------------------------------------------------- พิมพ์
  const fb = () => (hasThaiOfficialFont() ? '' : ' fallback');
  const signBlock = () => `<div class="sign"><div>ลงชื่อ ..............................................<br>(${esc(ctx.settings.academic_head_name || '..............................................')})<br>หัวหน้าฝ่ายบริหารงานวิชาการ</div>
    <div>ลงชื่อ ..............................................<br>(${esc(ctx.settings.director_name || '..............................................')})<br>${esc(ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน')}</div></div>`;
  function printSummary(items, ppl, sum) {
    return `<div class="a4 land${fb()}">
      <h2>สรุปการส่งงานวิชาการของครู ภาคเรียนที่ ${term} ปีการศึกษา ${ctx.year}</h2>
      <div class="sub">โรงเรียน${esc(ctx.schoolName)} · ข้อมูล ณ วันที่ ${thaiDate(today)} · ${Object.values(SUBMIT).map((s) => `${s.mark} = ${s.label}`).join('  ')}</div>
      <table><thead><tr><th>ที่</th><th class="l">ชื่อ-สกุล</th>${items.map((i) => `<th class="w">${esc(i.name)}</th>`).join('')}<th>ร้อยละ<br>ที่ส่ง</th></tr></thead>
      <tbody>${ppl.map((s, k) => `<tr><td>${k + 1}</td><td class="l">${esc(staffName(s))}</td>${items.map((i) => `<td>${SUBMIT[subStatus(subs, i.id, s.id)].mark}</td>`).join('')}<td>${pct(sum.byStaff[s.id].sent, sum.byStaff[s.id].applicable)}</td></tr>`).join('')}
        <tr class="sum"><td></td><td class="l"><b>ผ่าน / ต้องส่ง</b></td>${items.map((i) => `<td>${sum.byItem[i.id].passed}/${sum.byItem[i.id].applicable}</td>`).join('')}<td><b>${pct(sum.all.sent, sum.all.applicable)}</b></td></tr></tbody></table>
      ${signBlock()}</div>`;
  }
  function printSlips(items, ppl) {
    const list = ppl.map((s) => ({ s, its: items.filter((i) => ['none', 'returned'].includes(subStatus(subs, i.id, s.id))) })).filter((x) => x.its.length);
    if (!list.length) return `<div class="a4 flow${fb()}"><p>ภาคเรียนที่ ${term}/${ctx.year} ครูส่งงานครบทุกคนแล้ว</p></div>`;
    return `<div class="a4 flow${fb()}">${list.map(({ s, its }) => `<div class="slip">
      <div class="slip-h"><b>แจ้งรายการเอกสารวิชาการที่ยังไม่ได้ส่ง</b><span>ภาคเรียนที่ ${term} ปีการศึกษา ${ctx.year}</span></div>
      <p>เรียน ${esc(staffName(s))}</p>
      <table><thead><tr><th>ที่</th><th class="l">รายการ</th><th>กำหนดส่ง</th><th class="l">สถานะ / สิ่งที่ต้องดำเนินการ</th></tr></thead>
      <tbody>${its.map((i, k) => { const row = subOf(i.id, s.id); const st = row?.status || 'none';
        return `<tr><td>${k + 1}</td><td class="l">${esc(i.name)}</td><td>${i.due_date ? thaiDate(i.due_date, true) : '-'}</td><td class="l">${SUBMIT[st].label}${row?.review_note ? ` — ${esc(row.review_note)}` : ''}</td></tr>`; }).join('')}</tbody></table>
      <p class="slip-f">ฝ่ายบริหารงานวิชาการ · ${thaiDate(today)}</p></div>`).join('')}</div>`;
  }

  async function reload() {
    await load();
    const src = sourceTerm();
    prevYearItems = src.year !== ctx.year ? (await ctx.db.select('ac_checklist_items', { eq: { academic_year: src.year } })).filter((i) => i.period === src.term || i.period === 'year') : null;
    draw();
  }
  await reload();

  let rt = null;
  const onRemote = () => { clearTimeout(rt); rt = setTimeout(async () => { if (busy) return onRemote(); await load(); draw(); }, 600); };
  const offs = ['ac_checklist_items', 'ac_submissions'].map((tb) => ctx.db.subscribe(tb, null, onRemote));
  return () => offs.forEach((f) => f());
}
