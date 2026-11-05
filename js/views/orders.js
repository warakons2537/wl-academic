import { esc, $, $$, toast, modal, confirmBox, todayIso, thaiDate } from '../util.js';
import { icon } from '../icons.js';
import { ORDER_DEFAULTS } from '../task-sets.js';
import { loadYear, membersOf, taskWarnings } from '../data.js';
import { staffName, fillTemplate, digits } from '../thai.js';
import { shortTitle, buildModel, resolveAnnual, resolveSpecial, renderPages, INDENT_DEFAULT, clampIndent } from '../order-doc.js';
import { buildDocx, imageFromDataUrl, downloadBytes } from '../docx.js';

const idFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('id');

export async function render(el, ctx) {
  const id = idFromHash();
  return id ? editor(el, ctx, id) : list(el, ctx);
}

// ---------------------------------------------------------------------
// รายการคำสั่ง
// ---------------------------------------------------------------------
const SPECIAL_TEMPLATES = {
  blank: { label: 'ว่าง', title: ORDER_DEFAULTS.special_title, committees: [{ name: 'คณะกรรมการ…', duties: '', members: [] }] },
  exam: { label: 'คณะกรรมการดำเนินการสอบ', title: 'แต่งตั้งคณะกรรมการดำเนินการสอบปลายภาคเรียนที่ … ปีการศึกษา {ปี}',
    reason: 'ด้วยโรงเรียน{โรงเรียน} กำหนดจัดสอบปลายภาคเรียนที่ … ปีการศึกษา {ปี} ระหว่างวันที่ … เพื่อให้การดำเนินการสอบเป็นไปด้วยความเรียบร้อย ถูกต้องตามระเบียบการวัดและประเมินผลการเรียนของสถานศึกษา',
    committees: [
      { name: 'คณะกรรมการอำนวยการ', duties: 'ให้คำปรึกษา แนะนำ และอำนวยความสะดวกในการดำเนินการสอบ', members: [] },
      { name: 'คณะกรรมการจัดทำและตรวจสอบข้อสอบ', duties: 'จัดทำข้อสอบให้สอดคล้องกับตัวชี้วัด\nตรวจสอบความถูกต้องของข้อสอบและเก็บรักษาเป็นความลับ', members: [] },
      { name: 'คณะกรรมการกำกับห้องสอบ', duties: 'กำกับการสอบให้เป็นไปตามระเบียบ\nรับ-ส่งข้อสอบและกระดาษคำตอบตามเวลาที่กำหนด', members: [] },
    ] },
  contest: { label: 'ครูผู้ควบคุมนักเรียนไปแข่งขัน', title: 'แต่งตั้งครูผู้ควบคุมและฝึกซ้อมนักเรียนเข้าร่วมการแข่งขัน…',
    reason: 'ด้วย… กำหนดจัดการแข่งขัน… ระหว่างวันที่ … ณ … โรงเรียน{โรงเรียน} ได้ส่งนักเรียนเข้าร่วมการแข่งขัน เพื่อให้การดำเนินการเป็นไปด้วยความเรียบร้อยและปลอดภัย',
    committees: [{ name: 'ครูผู้ฝึกสอนและควบคุมนักเรียน', duties: 'ฝึกซ้อมนักเรียนให้พร้อมสำหรับการแข่งขัน\nควบคุมดูแลความปลอดภัยของนักเรียนตลอดการเดินทาง', members: [] }] },
};

async function list(el, ctx) {
  const orders = (await ctx.db.select('ac_orders', { eq: { academic_year: ctx.year } }))
    .sort((a, b) => numKey(b.number) - numKey(a.number) || String(b.updated_at).localeCompare(String(a.updated_at)));
  el.innerHTML = `
    <div class="page-head"><div><h1>ออกคำสั่ง</h1><p>ปีการศึกษา ${ctx.year} · คำสั่งตามแบบงานสารบรรณ พิมพ์ A4 / PDF หรือดาวน์โหลด Word</p></div>
      ${ctx.canEdit ? `<div class="toolbar"><button class="btn" id="o-special">${icon('plus')} คำสั่งเฉพาะกิจ</button>
        <button class="btn btn-primary" id="o-annual">${icon('plus')} คำสั่งมอบหมายงานประจำปี</button></div>` : ''}</div>
    ${orders.length ? `<div class="order-list">${orders.map((o) => `<div class="order-row"><button class="order-item" data-id="${o.id}">
        <span class="no">${esc(o.number || '—')}</span>
        <span style="min-width:0"><span class="t">${esc(o.title || '(ไม่มีชื่อเรื่อง)')}</span>
          <small>${o.kind === 'annual' ? 'มอบหมายงานประจำปี' : 'เฉพาะกิจ'} · ${o.signed_date ? `สั่ง ณ ${thaiDate(o.signed_date)}` : 'ยังไม่ระบุวันที่'}</small></span>
        <span class="chip ${o.status === 'issued' ? 'chip-ok' : 'chip-warn'}">${o.status === 'issued' ? `${icon('lock')} ออกแล้ว` : 'ฉบับร่าง'}</span></button>${ctx.canEdit ? `<button class="btn btn-danger btn-icon" data-del="${o.id}" title="ลบคำสั่ง" aria-label="ลบคำสั่ง">${icon('trash')}</button>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">ยังไม่มีคำสั่งในปีการศึกษา ${ctx.year}${ctx.canEdit ? '<br>เริ่มจาก "คำสั่งมอบหมายงานประจำปี" ซึ่งดึงรายชื่อจากหน้าจัดภาระงานให้อัตโนมัติ' : ''}</div>`}`;

  $$('[data-id]', el).forEach((b) => b.addEventListener('click', () => { location.hash = `orders?id=${b.dataset.id}`; }));
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    const o = orders.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`ลบคำสั่ง ที่ ${o.number || '-'} "${o.title || '(ไม่มีชื่อเรื่อง)'}"?${o.status === 'issued' ? ' (คำสั่งนี้ออกแล้ว)' : ''} ลบแล้วกู้คืนไม่ได้`, 'ลบ'))) return;
    try { await ctx.db.remove('ac_orders', { id: o.id }); toast('ลบคำสั่งแล้ว'); list(el, ctx); }
    catch (err) { toast(`ลบคำสั่งไม่สำเร็จ: ${err.message}`, 'err'); }
  }));
  const vars = { ปี: String(ctx.year), โรงเรียน: ctx.schoolName };
  const base = () => ({
    academic_year: ctx.year, number: `…/${ctx.year}`, signed_date: todayIso(),
    signer_name: ctx.settings.director_name || '', signer_title: ctx.settings.director_title || (ctx.schoolName ? `ผู้อำนวยการโรงเรียน${ctx.schoolName}` : 'ผู้อำนวยการโรงเรียน'),
    effective_text: ORDER_DEFAULTS.effective, options: { numerals: ctx.ac.numerals || 'thai', show_duties: true }, status: 'draft',
  });
  $('#o-annual', el)?.addEventListener('click', async () => {
    try {
      const [row] = await ctx.db.insert('ac_orders', [{ ...base(), kind: 'annual', title: fillTemplate(ORDER_DEFAULTS.title, vars),
        reason: fillTemplate(ctx.ac.order_reason || ORDER_DEFAULTS.reason, vars), legal: fillTemplate(ctx.ac.order_legal || ORDER_DEFAULTS.legal, vars),
        closing: fillTemplate(ctx.ac.order_closing || ORDER_DEFAULTS.closing, vars), body: {} }]);
      location.hash = `orders?id=${row.id}`;
    } catch (err) { toast(`สร้างคำสั่งไม่สำเร็จ: ${err.message}`, 'err'); }
  });
  $('#o-special', el)?.addEventListener('click', async () => {
    const r = await modal('คำสั่งเฉพาะกิจ', `<p class="hint">เลือกแบบตั้งต้น แล้วแก้ไขรายละเอียดได้ทั้งหมด</p>
      ${Object.entries(SPECIAL_TEMPLATES).map(([k, t], i) => `<label class="inline"><input type="radio" name="tpl" value="${k}" ${i ? '' : 'checked'}> ${esc(t.label)}</label>`).join('')}`, { okText: 'สร้าง' });
    if (!r) return;
    const t = SPECIAL_TEMPLATES[r.tpl];
    const [row] = await ctx.db.insert('ac_orders', [{ ...base(), kind: 'special', title: fillTemplate(t.title, vars),
      reason: fillTemplate(t.reason || ORDER_DEFAULTS.special_reason, vars), legal: ORDER_DEFAULTS.special_legal,
      closing: 'ให้ผู้ที่ได้รับแต่งตั้งปฏิบัติหน้าที่ที่ได้รับมอบหมายอย่างเต็มกำลังความสามารถ เพื่อให้เกิดผลดีแก่ทางราชการ',
      body: { committees: t.committees } }]);
    location.hash = `orders?id=${row.id}`;
  });
}
const numKey = (s) => { const m = /(\d+)/.exec(String(s || '').replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))); return m ? Number(m[1]) : -1; };

// ---------------------------------------------------------------------
// แก้ไขคำสั่ง + ตัวอย่าง A4
// ---------------------------------------------------------------------
async function editor(el, ctx, id) {
  const [rows, garudaRows] = await Promise.all([ctx.db.select('ac_orders', { eq: { id } }), ctx.db.select('ac_assets', { eq: { key: 'garuda' } })]);
  let o = rows[0];
  if (!o) { el.innerHTML = '<div class="empty">ไม่พบคำสั่งนี้ (อาจถูกลบแล้ว) <a href="#orders">กลับไปรายการคำสั่ง</a></div>'; return; }
  const garuda = garudaRows[0]?.data_url || null;
  let year = await loadYear(ctx.db, o.academic_year);
  const locked = () => o.status === 'issued' || !ctx.canEdit;

  const sections = () => (o.status === 'issued' && o.snapshot ? o.snapshot.sections
    : o.kind === 'annual' ? resolveAnnual(year, ctx.staffById, o.body?.members) : resolveSpecial(o, ctx.staffById));
  const meta = () => (o.status === 'issued' && o.snapshot ? o.snapshot.meta : { schoolName: ctx.schoolName });
  const model = () => buildModel(o, sections(), meta());

  const field = (name, label, type = 'text') => `<label>${label}<input type="${type}" name="${name}" value="${esc(o[name] || '')}" ${locked() ? 'disabled' : ''}></label>`;
  const area = (name, label, rowsN = 3) => `<label>${label}<textarea name="${name}" rows="${rowsN}" ${locked() ? 'disabled' : ''}>${esc(o[name] || '')}</textarea></label>`;

  function drawForm() {
    const warn = o.kind === 'annual' ? year.tasks.filter((t) => taskWarnings(t, membersOf(t.id, year.assignments, ctx.staffById)).length).length : 0;
    $('#o-form', el).innerHTML = `
      <div class="toolbar"><a class="btn btn-sm" href="#orders">${icon('back')} รายการคำสั่ง</a><span class="grow"></span>
        <span class="chip ${o.status === 'issued' ? 'chip-ok' : 'chip-warn'}">${o.status === 'issued' ? `${icon('lock')} ออกคำสั่งแล้ว` : 'ฉบับร่าง'}</span>
        <span class="small muted" id="o-saved"></span></div>
      ${o.status === 'issued' ? `<div class="note-box">คำสั่งนี้ล็อกแล้ว รายชื่อและข้อความถูกเก็บ ณ วันที่ออกคำสั่ง แก้ภาระงานภายหลังจะไม่เปลี่ยนคำสั่งฉบับนี้</div>` : ''}
      <div class="cols-2">${field('number', 'ที่ (เลขที่คำสั่ง)')}${field('signed_date', 'สั่ง ณ วันที่', 'date')}</div>
      ${area('title', 'เรื่อง', 2)}
      ${area('reason', 'ย่อหน้าเหตุผล', 4)}
      ${area('legal', 'ย่อหน้าข้อกฎหมาย / อาศัยอำนาจ', 4)}
      ${o.kind === 'annual'
        ? `<div class="note-box">รายชื่อและบทบาทดึงจาก <a href="#workload">จัดภาระงาน</a> ปีการศึกษา ${o.academic_year} อัตโนมัติ
            (${year.tasks.length} งาน)${warn ? `<br><b style="color:var(--amber)">⚠ ${warn} งานยังจัดคนไม่ครบ</b>` : ''}<br>
            ปรับชื่อ/ตำแหน่ง เพิ่มหรือนำครูออกเฉพาะในคำสั่งนี้ได้ด้านล่าง หรือคลิกแก้บนหน้ากระดาษโดยตรง (ไม่กระทบหน้าจัดภาระงาน)</div>
          <div id="o-members" class="stack"></div>`
        : '<div id="o-comms" class="stack"></div>'}
      ${area('closing', 'ย่อหน้าปิดท้าย', 3)}
      ${field('effective_text', 'ทั้งนี้ ตั้งแต่…')}
      <div class="cols-2">${field('signer_name', 'ผู้ลงนาม (ชื่อในวงเล็บ)')}${field('signer_title', 'ตำแหน่งผู้ลงนาม')}</div>
      <div class="toolbar">
        <span class="small">ตัวเลข</span><span class="seg"><button type="button" data-num="thai" class="${o.options?.numerals !== 'arabic' ? 'on' : ''}" ${locked() ? 'disabled' : ''}>๑ ๒ ๓</button><button type="button" data-num="arabic" class="${o.options?.numerals === 'arabic' ? 'on' : ''}" ${locked() ? 'disabled' : ''}>1 2 3</button></span>
        <label class="inline small"><input type="checkbox" id="o-duties" ${o.options?.show_duties !== false ? 'checked' : ''} ${locked() ? 'disabled' : ''}> แสดงขอบข่ายหน้าที่</label>
      </div>
      <p class="hint" style="margin-top:-6px">ไม่ติ๊ก "แสดงขอบข่ายหน้าที่" = คำสั่งแบบกระชับ มีเฉพาะรายชื่อผู้รับผิดชอบ</p>
      <div class="toolbar">
        <button class="btn btn-primary" id="o-print">${icon('print')} พิมพ์ / บันทึก PDF</button>
        <button class="btn" id="o-docx">${icon('download')} Word (.docx)</button>
      </div>
      ${ctx.canEdit ? `<div class="toolbar" style="border-top:1px solid var(--rule);padding-top:12px">
        ${o.status === 'issued' ? `<button class="btn" id="o-unlock">${icon('edit')} ยกเลิกการล็อกเพื่อแก้ไข</button>`
          : `<button class="btn btn-gold" id="o-issue">${icon('lock')} ออกคำสั่ง (ล็อกฉบับนี้)</button>`}
        <button class="btn" id="o-dup">${icon('copy')} ทำสำเนา</button>
        <span class="grow"></span><button class="btn btn-danger" id="o-del">${icon('trash')}</button></div>` : ''}`;

    if (o.kind === 'special') drawCommittees(); else drawMembers();
    $$('input[name], textarea[name]', $('#o-form', el)).forEach((inp) => inp.addEventListener('input', () => { o[inp.name] = inp.value; queueSave(); }));
    $$('[data-num]', el).forEach((b) => b.addEventListener('click', () => { o.options = { ...o.options, numerals: b.dataset.num }; queueSave(true); drawForm(); }));
    $('#o-duties', el).addEventListener('change', (e) => { o.options = { ...o.options, show_duties: e.target.checked }; queueSave(true); });
    $('#o-print', el).addEventListener('click', async () => { await flush(); window.print(); });
    $('#o-docx', el).addEventListener('click', downloadDocx);
    $('#o-issue', el)?.addEventListener('click', issue);
    $('#o-unlock', el)?.addEventListener('click', unlock);
    $('#o-dup', el)?.addEventListener('click', duplicate);
    $('#o-del', el)?.addEventListener('click', remove);
  }

  // ---------- คณะกรรมการ (คำสั่งเฉพาะกิจ) ----------
  const ROLE_HINTS = ['ประธานกรรมการ', 'รองประธานกรรมการ', 'กรรมการ', 'กรรมการและเลขานุการ', 'กรรมการและผู้ช่วยเลขานุการ', 'ครูผู้ฝึกสอน', 'ครูผู้ควบคุม'];
  function drawCommittees() {
    const box = $('#o-comms', el);
    const comms = o.body?.committees || [];
    const dis = locked() ? 'disabled' : '';
    const active = ctx.staff.filter((s) => s.active);
    box.innerHTML = `<b>คณะกรรมการ / ผู้ได้รับแต่งตั้ง</b>
      ${comms.map((c, i) => `<div class="committee" data-c="${i}">
        <div class="toolbar"><input type="text" class="grow" data-f="name" value="${esc(c.name)}" placeholder="ชื่อคณะ เช่น คณะกรรมการกำกับห้องสอบ" ${dis}>
          ${locked() ? '' : `<button class="icon-btn" data-cup="${i}" ${i ? '' : 'disabled'} title="เลื่อนขึ้น">${icon('up')}</button><button class="icon-btn danger" data-cdel="${i}" title="ลบคณะ">${icon('trash')}</button>`}</div>
        ${(c.members || []).map((m, k) => `<div class="mem" data-m="${k}">
          ${m.staff_id !== undefined && m.staff_id !== null ? `<select data-mf="staff_id" ${dis}>${active.map((s) => `<option value="${s.id}" ${s.id === m.staff_id ? 'selected' : ''}>${esc(staffName(s))}</option>`).join('')}
              ${m.staff_id && !active.some((s) => s.id === m.staff_id) ? `<option selected value="${esc(m.staff_id)}">${esc(staffName(ctx.staffById[m.staff_id]) || '(ไม่พบ)')}</option>` : ''}</select>`
            : `<input type="text" data-mf="name" value="${esc(m.name || '')}" placeholder="ชื่อ-สกุล (บุคคลภายนอก)" ${dis}>`}
          <input type="text" data-mf="position" value="${esc(m.position ?? '')}" placeholder="${esc(m.staff_id ? (shortTitle(ctx.staffById[m.staff_id]) || 'ตำแหน่ง') : 'ตำแหน่ง')}" ${dis}>
          <input type="text" data-mf="role" list="dl-roles" value="${esc(m.role || '')}" placeholder="บทบาท" ${dis}>
          ${locked() ? '' : `<button class="icon-btn danger" data-mdel="${k}" title="นำออก">${icon('trash')}</button>`}</div>`).join('')}
        ${locked() ? '' : `<div class="toolbar"><button type="button" class="btn btn-sm" data-madd="${i}">${icon('users')} เลือกบุคลากร</button>
          <button type="button" class="btn btn-sm btn-ghost" data-mext="${i}">${icon('plus')} บุคคลภายนอก</button></div>`}
        <label class="small muted" style="display:flex;flex-direction:column;gap:4px">หน้าที่ (บรรทัดละ 1 ข้อ)<textarea data-f="duties" rows="3" ${dis}>${esc(c.duties || '')}</textarea></label>
      </div>`).join('')}
      ${locked() ? '' : `<button type="button" class="btn" id="c-add">${icon('plus')} เพิ่มคณะ</button>`}
      <datalist id="dl-roles">${ROLE_HINTS.map((r) => `<option>${r}</option>`).join('')}</datalist>`;

    const C = () => (o.body.committees ||= []);
    const changed = (redraw = false) => { queueSave(); if (redraw) drawCommittees(); };
    $$('.committee', box).forEach((card) => {
      const i = Number(card.dataset.c);
      $$('[data-f]', card).forEach((inp) => inp.addEventListener('input', () => { C()[i][inp.dataset.f] = inp.value; changed(); }));
      $$('.mem', card).forEach((row) => { const k = Number(row.dataset.m);
        $$('[data-mf]', row).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
          const mm = C()[i].members[k]; mm[inp.dataset.mf] = inp.value;
          if (inp.dataset.mf === 'staff_id') { delete mm.name; delete mm.position; changed(true); return; }   // เปลี่ยนคน → ล้างชื่อ/ตำแหน่งที่แก้ไว้
          if (inp.dataset.mf === 'position' && inp.value === '') delete mm.position;
          changed(); })); });
    });
    $$('[data-cdel]', box).forEach((b) => b.addEventListener('click', () => { C().splice(Number(b.dataset.cdel), 1); changed(true); }));
    $$('[data-cup]', box).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.cup); const c = C(); [c[i - 1], c[i]] = [c[i], c[i - 1]]; changed(true); }));
    $$('[data-mdel]', box).forEach((b) => b.addEventListener('click', () => { const i = Number(b.closest('.committee').dataset.c); C()[i].members.splice(Number(b.dataset.mdel), 1); changed(true); }));
    $$('[data-mext]', box).forEach((b) => b.addEventListener('click', () => { (C()[Number(b.dataset.mext)].members ||= []).push({ name: '', role: 'กรรมการ' }); changed(true); }));
    $$('[data-madd]', box).forEach((b) => b.addEventListener('click', async () => {
      const i = Number(b.dataset.madd); const have = new Set((C()[i].members || []).map((m) => m.staff_id));
      const r = await modal('เลือกบุคลากร', `<label>บทบาทของผู้ที่เลือก<input type="text" name="role" list="dl-roles2" value="กรรมการ"></label>
        <datalist id="dl-roles2">${ROLE_HINTS.map((x) => `<option>${x}</option>`).join('')}</datalist>
        <div class="stack" style="gap:4px">${active.map((s) => `<label class="inline"><input type="checkbox" name="s_${s.id}" ${have.has(s.id) ? 'disabled' : ''}> ${esc(staffName(s))} <span class="muted small">${esc(s.academic_rank || s.position)}</span></label>`).join('')}</div>`, { okText: 'เพิ่ม' });
      if (!r) return;
      const add = active.filter((s) => r[`s_${s.id}`]).map((s) => ({ staff_id: s.id, role: r.role || 'กรรมการ' }));
      (C()[i].members ||= []).push(...add); changed(true);
    }));
    $('#c-add', box)?.addEventListener('click', () => { C().push({ name: '', duties: '', members: [] }); changed(true); });
  }

  // ---------- รายชื่อในคำสั่งประจำปี (ปรับเฉพาะคำสั่งนี้) ----------
  const newId = () => (globalThis.crypto?.randomUUID?.() || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const MO = (tid) => (((o.body ||= {}).members ||= {})[tid] ||= {});
  function drawMembers() {
    const box = $('#o-members', el); if (!box) return;
    const dis = locked() ? 'disabled' : '';
    const secs = sections();
    const open = new Set($$('details[open]', box).map((d) => d.dataset.t));
    box.innerHTML = secs.map((sec, i) => `<details class="mgroup" data-t="${esc(sec.id || i)}" ${open.has(sec.id || i) ? 'open' : ''}>
        <summary>${i + 1}. ${esc(sec.name)} <span class="muted small">(${sec.members.length} คน)</span></summary>
        ${sec.members.map((m) => `<div class="mrow" data-ref="${esc(JSON.stringify(m.ref))}">
          <input type="text" data-f="name" value="${esc(m.name)}" placeholder="ชื่อ-สกุล" ${dis}>
          <input type="text" data-f="title" value="${esc(m.title)}" placeholder="ตำแหน่ง" ${dis}>
          <input type="text" data-f="role" list="dl-roles3" value="${esc(m.role)}" placeholder="บทบาท" ${dis}>
          ${locked() ? '<span></span>' : `<button type="button" class="icon-btn danger" data-rm title="นำออกจากคำสั่งนี้">${icon('trash')}</button>`}</div>`).join('')}
        ${(sec.hidden || []).map((h) => `<div class="small muted">นำออกแล้ว: ${esc(h.name)} ${locked() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-restore="${esc(h.id)}">คืน</button>`}</div>`).join('')}
        ${locked() ? '' : `<div class="toolbar"><button type="button" class="btn btn-sm" data-addstaff="${esc(sec.id)}">${icon('users')} เพิ่มครู</button>
          <button type="button" class="btn btn-sm btn-ghost" data-addext="${esc(sec.id)}">${icon('plus')} บุคคลอื่น</button></div>`}
      </details>`).join('') + `<datalist id="dl-roles3">${ROLE_HINTS.map((r) => `<option>${r}</option>`).join('')}</datalist>`;

    $$('.mrow', box).forEach((row) => {
      if (!row.dataset.ref || row.dataset.ref === 'undefined') return;   // ภาพบันทึกเก่าไม่มีรหัสอ้างอิง
      const ref = JSON.parse(row.dataset.ref);
      $$('[data-f]', row).forEach((inp) => inp.addEventListener('input', () => { setMember(ref, inp.dataset.f, inp.value); queueSave(); }));
      $('[data-rm]', row)?.addEventListener('click', () => {
        const ov = MO(ref.t);
        if (ref.add) ov.add = (ov.add || []).filter((a) => a.id !== ref.id);
        else { ov.hide = [...new Set([...(ov.hide || []), ref.id])]; delete (ov.edit || {})[ref.id]; }
        queueSave(true); drawMembers();
      });
    });
    $$('[data-restore]', box).forEach((b) => b.addEventListener('click', () => {
      const tid = b.closest('details').dataset.t; const ov = MO(tid); ov.hide = (ov.hide || []).filter((x) => x !== b.dataset.restore);
      queueSave(true); drawMembers();
    }));
    $$('[data-addext]', box).forEach((b) => b.addEventListener('click', () => { (MO(b.dataset.addext).add ||= []).push({ id: newId(), name: '', title: '', role: 'กรรมการ' }); queueSave(true); drawMembers(); }));
    $$('[data-addstaff]', box).forEach((b) => b.addEventListener('click', async () => {
      const tid = b.dataset.addstaff; const active = ctx.staff.filter((x) => x.active);
      const taken = new Set(sections().find((x) => x.id === tid).members.map((m) => m.ref.id));
      const r = await modal('เพิ่มครูในคำสั่งนี้', `<label>บทบาท<input type="text" name="role" list="dl-roles3" value="กรรมการ"></label>
        <div class="stack" style="gap:4px">${active.map((x) => `<label class="inline"><input type="checkbox" name="s_${x.id}" ${taken.has(x.id) ? 'disabled' : ''}> ${esc(staffName(x))} <span class="muted small">${esc(x.academic_rank || x.position)}</span></label>`).join('')}</div>`, { okText: 'เพิ่ม' });
      if (!r) return;
      const ov = MO(tid);
      for (const x of active.filter((x) => r[`s_${x.id}`])) {
        if ((ov.hide || []).includes(x.id)) ov.hide = ov.hide.filter((h) => h !== x.id);     // เคยนำออก → คืน
        else (ov.add ||= []).push({ id: newId(), staff_id: x.id, role: r.role || 'กรรมการ' });
      }
      queueSave(true); drawMembers();
    }));
  }
  // เขียนค่าที่แก้ไขของผู้รับผิดชอบหนึ่งคน (จากฟอร์มหรือจากหน้ากระดาษ)
  function setMember(ref, field, value) {
    if (ref.k === 's') {
      const m = o.body.committees[ref.c].members[ref.m]; const key = field === 'title' ? 'position' : field;
      if (value === '' && key !== 'role' && m.staff_id) delete m[key]; else m[key] = value;
      return;
    }
    const ov = MO(ref.t);
    if (ref.add) { const a = (ov.add || []).find((x) => x.id === ref.id); if (a) a[field] = value; return; }
    ((ov.edit ||= {})[ref.id] ||= {})[field] = value;
  }

  // ---------- บันทึกอัตโนมัติ ----------
  let timer = null; let pending = null;
  const status = (t) => { const s = $('#o-saved', el); if (s) s.textContent = t; };
  function queueSave(now = false, preview = true) {
    if (locked()) return;
    status('กำลังบันทึก…');
    clearTimeout(timer);
    timer = setTimeout(() => { pending = save(); }, now ? 0 : 700);
    if (preview) schedulePreview();
  }
  async function save() {
    const patch = { number: o.number, title: o.title, reason: o.reason, legal: o.legal, closing: o.closing, effective_text: o.effective_text,
      signed_date: o.signed_date || null, signer_name: o.signer_name, signer_title: o.signer_title, options: o.options, body: o.body };
    try { await ctx.db.update('ac_orders', { id: o.id }, patch); status('บันทึกแล้ว'); }
    catch (err) { status(''); toast(err.message, 'err'); }
  }
  const flush = async () => { if (timer) { clearTimeout(timer); timer = null; pending = save(); } if (pending) await pending; };

  // ---------- ตัวอย่าง ----------
  let pt = null;
  const schedulePreview = (ms = 250) => { clearTimeout(pt); pt = setTimeout(drawPreview, ms); };
  async function drawPreview() {
    const zoom = $('#o-pages', el); if (!zoom) return;
    const info = await renderPages(zoom, model(), { garuda, editable: !locked() });
    refreshBar();
    $('#o-pinfo', el).innerHTML = `${digits(info.pages, 'arabic')} หน้า${info.fallback ? ' · เครื่องนี้ไม่มีฟอนต์ TH SarabunPSK ตัวอย่างใช้ Sarabun ขนาดเทียบเท่า (ตำแหน่งบรรทัดอาจต่างเล็กน้อย) ไฟล์ Word ใช้ TH SarabunPSK' : ''}${garuda ? '' : ' · <a href="#basics?tab=garuda">ยังไม่มีตราครุฑ</a>'}`;
    fit();
  }
  function fit() {
    const sc = $('.doc-scroll', el); const z = $('#o-pages', el); if (!sc || !z) return;
    const pageW = 210 * 96 / 25.4 + 24;
    z.style.zoom = String(Math.min(1, (sc.clientWidth - 8) / pageW));
  }

  // ---------- คำสั่งปุ่ม ----------
  async function downloadDocx() {
    await flush();
    try {
      const img = await imageFromDataUrl(garuda);
      const bytes = buildDocx(model(), img, { title: o.title });
      const safe = (s) => String(s || 'คำสั่ง').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
      downloadBytes(bytes, `คำสั่ง ${safe(o.number)} ${safe(o.title)}.docx`);
      if (!img) toast('ยังไม่มีตราครุฑ ไฟล์ Word จึงไม่มีตราครุฑ');
    } catch (err) { toast(err.message, 'err'); }
  }
  async function issue() {
    await flush();
    const secs = sections();
    const empty = o.kind === 'annual' ? secs.filter((s) => !s.members.length).length : 0;
    const ok = await confirmBox(`ออกคำสั่ง ที่ ${o.number} และล็อกฉบับนี้? รายชื่อและข้อความจะถูกเก็บไว้ตามที่เห็นตอนนี้ ${empty ? `(มี ${empty} งานที่ยังไม่มีผู้รับผิดชอบ)` : ''}`, 'ออกคำสั่ง');
    if (!ok) return;
    const snapshot = { sections: secs, meta: meta(), at: new Date().toISOString() };
    await ctx.db.update('ac_orders', { id: o.id }, { status: 'issued', snapshot });
    o = { ...o, status: 'issued', snapshot }; drawForm(); drawPreview(); toast('ออกคำสั่งและล็อกแล้ว');
  }
  async function unlock() {
    if (!(await confirmBox('ยกเลิกการล็อก? รายชื่อในคำสั่งจะกลับไปดึงจากข้อมูลปัจจุบัน (ใช้เมื่อต้องแก้คำสั่งที่ยังไม่ได้ลงนามเท่านั้น)', 'ยกเลิกการล็อก'))) return;
    await ctx.db.update('ac_orders', { id: o.id }, { status: 'draft', snapshot: null });
    o = { ...o, status: 'draft', snapshot: null }; year = await loadYear(ctx.db, o.academic_year); drawForm(); drawPreview();
  }
  async function duplicate() {
    await flush();
    const { id: _id, created_by: _c, updated_at: _u, snapshot: _s, ...rest } = o;
    const [row] = await ctx.db.insert('ac_orders', [{ ...rest, number: `…/${o.academic_year}`, status: 'draft', snapshot: null, title: o.title }]);
    toast('ทำสำเนาแล้ว'); location.hash = `orders?id=${row.id}`;
  }
  async function remove() {
    if (!(await confirmBox(`ลบคำสั่ง ที่ ${o.number || '-'}?${o.status === 'issued' ? ' (คำสั่งนี้ออกแล้ว)' : ''}`, 'ลบ'))) return;
    clearTimeout(timer); timer = null;
    await ctx.db.remove('ac_orders', { id: o.id }); location.hash = 'orders';
  }

  // ---------- แก้ไขบนหน้ากระดาษ + ย่อหน้า ----------
  let selKey = null;
  const paraOf = (k) => ({ ...INDENT_DEFAULT, ...(o.options?.para?.[k] || {}) });
  const PARA_NAME = { reason: 'ย่อหน้าเหตุผล', legal: 'ย่อหน้าข้อกฎหมาย', closing: 'ย่อหน้าปิดท้าย', effective_text: 'ทั้งนี้ ตั้งแต่…' };
  function refreshBar() {
    const bar = $('#o-ibar', el); if (!bar) return;
    const on = !!selKey && !locked();
    bar.dataset.off = on ? '0' : '1';
    $('#ib-name', el).textContent = selKey ? PARA_NAME[selKey] : 'คลิกย่อหน้าบนหน้ากระดาษเพื่อเลือก';
    if (selKey) { const p = paraOf(selKey); $('#ib-first', el).value = p.first; $('#ib-left', el).value = p.left; }
  }
  function setIndent(patch) {
    if (!selKey || locked()) return;
    const cur = paraOf(selKey);
    const left = clampIndent(patch.left ?? cur.left);
    const first = clampIndent(patch.first ?? cur.first, -left, 8);
    o.options = { ...o.options, para: { ...(o.options?.para || {}), [selKey]: { first, left } } };
    const pe = $(`[data-pkey="${selKey}"]`, $('#o-pages', el));     // ปรับทันทีบนหน้า แล้วค่อยแบ่งหน้าใหม่
    if (pe) { pe.style.textIndent = `${first}cm`; pe.style.paddingLeft = `${left}cm`; }
    refreshBar(); queueSave();
  }
  function bindPageEditing() {
    const pages = $('#o-pages', el);
    pages.addEventListener('focusin', (e) => {
      clearTimeout(pt);                                           // ย้ายไปแก้จุดอื่น ไม่วาดหน้าใหม่ทับ
      const k = e.target.dataset?.pkey; if (k) { selKey = k; refreshBar(); }
    });
    pages.addEventListener('focusout', (e) => { if (e.target.isContentEditable && dirtyPage) { dirtyPage = false; schedulePreview(450); } });
    pages.addEventListener('input', (e) => {
      const t = e.target; if (locked() || !t.isContentEditable) return;
      const text = t.innerText.replace(/\s*\n+\s*/g, ' ');
      if (t.dataset.pkey) {
        o[t.dataset.pkey] = text;
        const f = $(`[name="${t.dataset.pkey}"]`, $('#o-form', el)); if (f) f.value = text;
      } else if (t.dataset.ed) {
        const d = JSON.parse(t.dataset.ed); setMember(d, d.f, text);
        if (o.kind === 'annual') drawMembers(); else drawCommittees();
      } else return;
      dirtyPage = true; queueSave(false, false);
    });
    pages.addEventListener('keydown', (e) => {
      const t = e.target; if (!t.isContentEditable) return;
      if (e.key === 'Enter') { e.preventDefault(); t.blur(); return; }
      if (e.key === 'Tab' && t.dataset.pkey) {                    // Tab / Shift+Tab = เพิ่ม/ลดย่อหน้า
        e.preventDefault(); selKey = t.dataset.pkey;
        setIndent({ first: paraOf(selKey).first + (e.shiftKey ? -0.5 : 0.5) });
      }
    });
    pages.addEventListener('paste', (e) => {
      if (!e.target.isContentEditable) return;
      e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n+\s*/g, ' '));
    });
    const bar = $('#o-ibar', el);
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    $$('[data-ib]', bar).forEach((b) => b.addEventListener('click', () => {
      const [fld, d] = b.dataset.ib.split(':'); setIndent({ [fld]: paraOf(selKey)[fld] + Number(d) });
    }));
    $('#ib-first', bar).addEventListener('change', (e) => setIndent({ first: e.target.value }));
    $('#ib-left', bar).addEventListener('change', (e) => setIndent({ left: e.target.value }));
    $('#ib-reset', bar).addEventListener('click', () => setIndent({ ...INDENT_DEFAULT }));
  }
  let dirtyPage = false;

  el.innerHTML = `<div class="editor">
      <div class="card form no-print" id="o-form"></div>
      <div class="stack print-area">
        <div class="hint no-print" id="o-pinfo"></div>
        <div class="ibar no-print" id="o-ibar" data-off="1">
          <b id="ib-name"></b>
          <span class="step">บรรทัดแรก <button type="button" class="btn btn-sm" data-ib="first:-0.5" aria-label="ลดย่อหน้าบรรทัดแรก">−</button><input type="number" id="ib-first" step="0.25" min="-8" max="8"><button type="button" class="btn btn-sm" data-ib="first:0.5" aria-label="เพิ่มย่อหน้าบรรทัดแรก">+</button> ซม.</span>
          <span class="step">เยื้องทั้งย่อหน้า <button type="button" class="btn btn-sm" data-ib="left:-0.5" aria-label="ลดการเยื้อง">−</button><input type="number" id="ib-left" step="0.25" min="0" max="8"><button type="button" class="btn btn-sm" data-ib="left:0.5" aria-label="เพิ่มการเยื้อง">+</button> ซม.</span>
          <button type="button" class="btn btn-sm btn-ghost rst" id="ib-reset">คืนค่ามาตรฐาน (2.5 ซม.)</button>
          <span class="muted small" style="flex-basis:100%">${locked() ? 'คำสั่งล็อกอยู่ แก้ไขบนหน้าไม่ได้' : 'คลิกข้อความบนหน้ากระดาษเพื่อพิมพ์แก้ได้ทันที (ย่อหน้า ชื่อ ตำแหน่ง บทบาท) · กด Tab / Shift+Tab เพื่อเพิ่ม/ลดย่อหน้า'}</span>
        </div>
        <div class="doc-scroll"><div class="doc-zoom" id="o-pages"></div></div>
      </div></div>`;
  drawForm();
  bindPageEditing();
  await drawPreview();
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  const beforePrint = () => { const z = $('#o-pages', el); if (z) z.style.zoom = '1'; };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', fit);

  // ข้อมูลเปลี่ยนจากที่อื่น (ภาระงาน/บุคลากร) → วาดตัวอย่างใหม่
  let rt = null;
  const reloadYear = () => { clearTimeout(rt); rt = setTimeout(async () => { if (o.status !== 'issued') { year = await loadYear(ctx.db, o.academic_year); drawPreview(); } }, 500); };
  const offs = o.kind === 'annual' ? [ctx.db.subscribe('ac_assignments', null, reloadYear), ctx.db.subscribe('ac_tasks', null, reloadYear), ctx.db.subscribe('staff', null, reloadYear)] : [];
  return () => {
    flush();
    offs.forEach((f) => f());
    window.removeEventListener('resize', onResize); window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', fit);
  };
}
