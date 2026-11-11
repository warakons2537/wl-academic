// =====================================================================
//  คำสั่งราชการ: ข้อมูล → "แบบจำลองเอกสาร" (รายการบล็อก) → หน้า A4 บนจอ/พิมพ์ และไฟล์ Word
//  ใช้แบบจำลองเดียวกันทั้งสองทาง ข้อความ/ลำดับจึงตรงกันเสมอ
//
//  รูปแบบตามระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ (แบบคำสั่ง):
//  ขอบบน 2.5 ซม. ล่าง 2 ซม. ซ้าย 3 ซม. ขวา 2 ซม. · ครุฑสูง 3 ซม. กึ่งกลาง · ย่อหน้า 2.5 ซม.
//  TH SarabunPSK 16 พอยต์ · เลขหน้าตั้งแต่หน้า 2 กึ่งกลางด้านบน "- ๒ -"
// =====================================================================
import { esc } from './util.js';
import { ROLES } from './task-sets.js';
import { digits, orderDate, staffName } from './thai.js';
import { membersOf } from './data.js';

// สั้น ๆ สำหรับคอลัมน์ตำแหน่งในรายชื่อ: วิทยฐานะ ถ้าไม่มีใช้ตำแหน่ง
export const shortTitle = (s) => (/^(รอง)?ผู้อำนวยการ/.test(s?.position || '') ? s.position : (s?.academic_rank || s?.position || ''));

// ---------- 1) รวบรวมข้อมูลของคำสั่ง (ชื่อคน ณ ตอนนี้) ----------
// over = order.body.members : { [taskId]: { hide:[staffId], edit:{[staffId]:{name,title,role}}, add:[{id,staff_id?,name,title,role}] } }
// ปรับรายชื่อเฉพาะในคำสั่งฉบับนี้ ไม่แตะข้อมูลหน้าจัดภาระงาน
export function resolveAnnual(year, staffById, over = {}) {
  return year.tasks.map((t) => {
    const ov = over?.[t.id] || {};
    const hide = new Set(ov.hide || []); const edits = ov.edit || {};
    const all = membersOf(t.id, year.assignments, staffById);
    const kept = all.filter((m) => !hide.has(m.staff.id)).map((m) => {
      const e = edits[m.staff.id] || {};
      return { name: e.name?.trim() || staffName(m.staff), title: e.title !== undefined ? e.title : shortTitle(m.staff),
        role: e.role !== undefined ? e.role : ROLES[m.role].label, ref: { k: 'a', t: t.id, id: m.staff.id } };
    });
    const added = (ov.add || []).map((a) => {
      const s = a.staff_id && staffById[a.staff_id];
      return { name: a.name?.trim() || (s ? staffName(s) : ''), title: a.title !== undefined ? a.title : (s ? shortTitle(s) : ''),
        role: a.role !== undefined ? a.role : 'กรรมการ', ref: { k: 'a', t: t.id, id: a.id, add: true } };
    }).filter((m) => m.name);
    return { id: t.id, name: t.name, duties: splitLines(t.duties), members: [...kept, ...added],
      hidden: all.filter((m) => hide.has(m.staff.id)).map((m) => ({ id: m.staff.id, name: staffName(m.staff) })) };
  });
}

export function resolveSpecial(order, staffById) {
  return (order.body?.committees || []).map((c, ci) => ({
    name: c.name || '',
    duties: splitLines(c.duties),
    members: (c.members || []).map((m, mi) => {
      const s = m.staff_id && staffById[m.staff_id];
      const ref = { k: 's', c: ci, m: mi };
      return s ? { name: m.name?.trim() || staffName(s), title: m.position !== undefined ? m.position : shortTitle(s), role: m.role || '', ref }
        : { name: m.name || '', title: m.position || '', role: m.role || '', ref };
    }).filter((m) => m.name),
  }));
}

export const splitLines = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*(\(?[0-9๐-๙]+[.)]\s*|[-•]\s*)/, '').trim()).filter(Boolean);

// ---------- รูปแบบของแต่ละบล็อก (ปรับได้บนหน้ากระดาษ) ----------
// หน่วย: first/left/right = ซม. · size/cs/before = พอยต์ · align = l ซ้าย | c กลาง | r ขวา | d กระจายแบบไทย (ใน Word) · pb = ขึ้นหน้าใหม่ก่อนบล็อกนี้
// ค่ามาตรฐานตามระเบียบ: ย่อหน้าเว้นบรรทัดแรก 2.5 ซม. · ตัวอักษร 16 พอยต์
export const FMT_COMMON = { first: 0, left: 0, right: 0, size: 16, cs: 0, before: 0, align: 'l', pb: false };
export const FMT_BASE = {
  center: { align: 'c' },
  para: { first: 2.5, before: 6, align: 'd' },
  heading: { left: 2.5, before: 6 },
  member: { left: 3.5 },
  dutyLabel: { left: 3.5 },
  duty: { left: 3.5, align: 'd' },
};
// ช่องที่ปรับได้ของบล็อกแต่ละชนิด
export const FMT_FIELDS = {
  center: ['left', 'right', 'size', 'cs', 'before', 'align'],
  para: ['first', 'left', 'right', 'size', 'cs', 'before', 'align', 'pb'],
  heading: ['left', 'right', 'size', 'cs', 'before', 'pb'],
  member: ['left', 'size', 'cs', 'before'],
  dutyLabel: ['left', 'size', 'cs', 'before', 'pb'],
  duty: ['left', 'right', 'size', 'cs', 'before', 'align', 'pb'],
};
// [ต่ำสุด, สูงสุด, ความละเอียด]
export const FMT_LIMITS = { first: [-8, 8, 0.05], left: [0, 10, 0.05], right: [-1.5, 8, 0.05], size: [8, 26, 0.5], cs: [-2, 4, 0.05], before: [0, 72, 1] };
export const fmtBase = (type) => ({ ...FMT_COMMON, ...(FMT_BASE[type] || {}) });
export function cleanFmt(type, f) {
  const out = { ...fmtBase(type) };
  for (const k of FMT_FIELDS[type] || []) {
    const v = f?.[k]; if (v === undefined || v === null || v === '') continue;
    if (k === 'pb') out.pb = !!v;
    else if (k === 'align') { if ('lcrd'.includes(v) && String(v).length === 1) out.align = v; }
    else {
      const [lo, hi, step] = FMT_LIMITS[k]; const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.round(Math.min(hi, Math.max(lo, Math.round(n / step) * step)) * 100) / 100;
    }
  }
  if (out.first < -out.left) out.first = -out.left;          // ย่อหน้าแขวนต้องไม่เลยขอบกระดาษ
  return out;
}
// รูปแบบที่ใช้จริง = มาตรฐาน ← ตั้งทั้งชนิด (options.fmtAll) ← ย่อหน้าแบบเดิม (options.para) ← เฉพาะบล็อก (options.fmt)
// key = null → ได้ค่าของทั้งชนิด
export const fmtOf = (type, key, options) => cleanFmt(type, { ...(options?.fmtAll?.[type] || {}),
  ...(key ? { ...(options?.para?.[key] || {}), ...(options?.fmt?.[key] || {}) } : {}) });

// ---------- 2) แบบจำลองเอกสาร ----------
// sections = ผลจาก resolve*, meta = { schoolName }
export function buildModel(order, sections, meta) {
  const mode = order.options?.numerals === 'arabic' ? 'arabic' : 'thai';
  const D = (s) => digits(s, mode);
  const showDuties = order.options?.show_duties !== false;
  const B = [];
  const push = (b) => { if (b.key) b.f = fmtOf(b.type, b.key, order.options); B.push(b); };
  const nl = (t) => String(t ?? '').replace(/\r/g, '');
  push({ type: 'garuda' });
  push({ type: 'center', key: 'school', text: D(`คำสั่งโรงเรียน${meta.schoolName || '……………'}`) });
  // field = แก้บนหน้ากระดาษได้ (pre = คำนำหน้าที่แก้ไม่ได้, val = ค่าที่แก้)
  push({ type: 'center', key: 'number', field: 'number', pre: 'ที่ ', val: D(nl(order.number)), text: D(`ที่ ${nl(order.number) || '……/……'}`) });
  push({ type: 'center', key: 'title', field: 'title', pre: 'เรื่อง ', val: D(nl(order.title)), text: D(`เรื่อง ${nl(order.title) || '……………'}`) });
  push({ type: 'rule' });
  const para = (key, extra = {}) => {
    const t = nl(order[key]);
    if (!t.trim()) return;
    push({ type: 'para', key, text: D(t.trim()), ...extra });
  };
  para('reason'); para('legal');

  sections.forEach((sec, i) => {
    const no = i + 1; const sk = sec.id ?? `c${i}`;
    push({ type: 'heading', key: `h:${sk}`, no: D(`${no}.`), text: D(sec.name), keep: true });
    if (!sec.members.length) push({ type: 'member', key: `m:${sk}:-`, no: '', name: '(ยังไม่ได้มอบหมาย)', title: '', role: '', empty: true });
    sec.members.forEach((m, k) => push({ type: 'member', key: `m:${sk}:${m.ref?.id ?? k}`, no: D(`${no}.${k + 1}`), name: D(m.name), title: D(m.title), role: D(m.role), ref: m.ref }));
    if (showDuties && sec.duties.length) {
      push({ type: 'dutyLabel', key: `dl:${sk}`, text: 'มีหน้าที่', keep: true });
      sec.duties.forEach((d, k) => push({ type: 'duty', key: `d:${sk}:${k}`, no: D(`(${k + 1})`), text: D(d) }));
    }
  });

  para('closing'); para('effective_text', { keep: true });
  push({ type: 'sign', when: D(`สั่ง ณ วันที่ ${order.signed_date ? orderDate(order.signed_date) : '……… เดือน ……………… พ.ศ. ………'}`),
    name: D(`(${order.signer_name || '……………………………'})`), title: D(order.signer_title || 'ผู้อำนวยการโรงเรียน') });
  return { blocks: B, numerals: mode };
}

// ---------- 3) HTML ของแต่ละบล็อก ----------
const num = (n) => String(Math.round(n * 1000) / 1000);
// รูปแบบ → CSS (ขนาด/ระยะอักษรคิดเป็นสัดส่วนของ --doc-size จึงใช้ได้ทั้งฟอนต์จริงและฟอนต์สำรอง)
export function fmtStyle(b) {
  const f = b.f; if (!f) return '';
  const s = []; const k = f.size / 16;
  if (k !== 1) s.push(`font-size:calc(var(--doc-size)*${num(k)})`, `line-height:calc(var(--doc-lh)*${num(k)})`);
  if (f.cs) s.push(`letter-spacing:calc(var(--doc-size)*${num(f.cs / 16)})`);
  s.push(`padding-top:${num(f.before)}pt`, `padding-left:${num(f.left + (b.type === 'duty' ? 1.1 : 0))}cm`);
  if (f.right) s.push(`margin-right:${num(f.right)}cm`);
  if (b.type === 'para') s.push(`text-indent:${num(f.first)}cm`);
  if (b.type === 'para' || b.type === 'center' || b.type === 'duty') s.push(`text-align:${{ c: 'center', r: 'right' }[f.align] || 'left'}`);
  return s.join(';');
}
const ed = (b, field, editable) => (editable && b.ref
  ? ` class="ed" contenteditable="true" spellcheck="false" data-ed="${esc(JSON.stringify({ ...b.ref, f: field }))}"` : '');
export function blockHtml(b, { garuda, editable } = {}) {
  const at = b.key ? ` data-bk="${esc(b.key)}" data-bt="${b.type}" style="${fmtStyle(b)}"` : '';
  const edit = ' contenteditable="true" spellcheck="false"';
  switch (b.type) {
    case 'garuda': return `<div class="b garuda">${garuda ? `<img src="${esc(garuda)}" alt="ตราครุฑ">` : '<span class="ph">ตราครุฑ<br>(อัปโหลดใน<br>ข้อมูลพื้นฐาน)</span>'}</div>`;
    case 'center': return editable && b.field
      ? `<div class="b c"${at}><span>${esc(b.pre)}</span><span class="ed"${edit} data-pkey="${b.field}">${esc(b.val)}</span></div>`
      : `<div class="b c"${at}>${esc(b.text)}</div>`;
    case 'rule': return '<div class="b rule"><span></span></div>';
    case 'para': return `<div class="b p${editable ? ' ed' : ''}"${at}${editable ? `${edit} data-pkey="${b.key}"` : ''}>${esc(b.text)}</div>`;
    case 'heading': return `<div class="b h"${at}><span>${esc(b.no)}</span><span>${esc(b.text)}</span></div>`;
    case 'member': return `<div class="b m"${at}><span>${esc(b.no)}</span><span>${b.empty ? `<i style="color:#b3261e">${esc(b.name)}</i>` : `<span${ed(b, 'name', editable)}>${esc(b.name)}</span>`}</span><span><span${ed(b, 'title', editable)}>${esc(b.title)}</span></span><span><span${ed(b, 'role', editable)}>${esc(b.role)}</span></span></div>`;
    case 'dutyLabel': return `<div class="b dl"${at}>${esc(b.text)}</div>`;
    case 'duty': return `<div class="b d"${at}><span class="n">${esc(b.no)}</span>${esc(b.text)}</div>`;
    case 'sign': return `<div class="b sign"><div class="when">${esc(b.when)}</div><div class="who">${esc(b.name)}<br>${esc(b.title)}</div></div>`;
    default: return '';
  }
}

// ---------- 4) แบ่งหน้า: วัดความสูงจริงของแต่ละบล็อกแล้วจัดลงหน้า A4 ----------
const MM = 96 / 25.4;
export const CONTENT_H = (297 - 25 - 20) * MM;   // พื้นที่เนื้อหาต่อหน้า (px)

export function paginate(heights, keep, brk = []) {
  // keep[i] = บล็อก i ต้องอยู่หน้าเดียวกับบล็อกถัดไป · brk[i] = บังคับขึ้นหน้าใหม่ก่อนบล็อก i
  const pages = []; let cur = []; let used = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (brk[i] && cur.length) { pages.push(cur); cur = []; used = 0; }
    if (used + h > CONTENT_H + 0.5 && cur.length) {
      // ดึงบล็อกที่ต้องติดกันท้ายหน้าไปหน้าใหม่ด้วย
      const carry = [];
      while (cur.length && keep[cur[cur.length - 1]] && carry.length < 3 && cur.length > 1) carry.unshift(cur.pop());
      pages.push(cur); cur = carry; used = carry.reduce((n, j) => n + heights[j], 0);
    }
    cur.push(i); used += h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

// มีฟอนต์ TH SarabunPSK / TH Sarabun New ในเครื่องหรือไม่ (เทียบความกว้างกับฟอนต์สำรอง)
let fontCache = null;
export function hasThaiOfficialFont() {
  if (fontCache !== null) return fontCache;
  try {
    const c = document.createElement('canvas').getContext('2d');
    const t = 'กขคงจฉ ทดสอบ ๑๒๓ abcXYZ';
    const w = (f) => { c.font = `40px ${f}`; return c.measureText(t).width; };
    fontCache = ['"TH SarabunPSK"', '"TH Sarabun New"'].some((f) => w(`${f}, monospace`) !== w('monospace') && w(`${f}, serif`) !== w('serif'));
  } catch { fontCache = false; }
  return fontCache;
}

// วาดเอกสารเป็นหน้า A4 ลงใน el (คืนจำนวนหน้า)
// stale() = true เมื่อมีการวาดรอบใหม่กว่าเริ่มแล้ว → ไม่เขียนทับ (คืน null)
export async function renderPages(el, model, { garuda, editable = false, stale } = {}) {
  try { await document.fonts.ready; } catch { /* */ }
  const fallback = !hasThaiOfficialFont();
  const htmls = model.blocks.map((b) => blockHtml(b, { garuda, editable }));
  const meas = document.createElement('div');
  meas.className = `doc-measure${fallback ? ' fallback' : ''}`;
  meas.innerHTML = htmls.join('');
  document.body.appendChild(meas);
  const imgs = [...meas.querySelectorAll('img')];
  await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
  const heights = [...meas.children].map((c) => c.getBoundingClientRect().height);
  meas.remove();
  const keep = model.blocks.map((b) => !!b.keep);
  const pages = paginate(heights, keep, model.blocks.map((b) => !!b.f?.pb));
  if (stale?.()) return null;
  const D = (s) => digits(s, model.numerals);
  el.innerHTML = pages.map((idx, p) => `<div class="doc-page${fallback ? ' fallback' : ''}">
      ${p > 0 ? `<div class="pageno">${esc(D(`- ${p + 1} -`))}</div>` : ''}
      ${idx.map((i) => htmls[i]).join('')}</div>`).join('');
  return { pages: pages.length, fallback };
}
