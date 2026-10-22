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
export function resolveAnnual(year, staffById) {
  return year.tasks.map((t) => ({
    name: t.name,
    duties: splitLines(t.duties),
    members: membersOf(t.id, year.assignments, staffById).map((m) => ({
      name: staffName(m.staff), title: shortTitle(m.staff), role: ROLES[m.role].label })),
  }));
}

export function resolveSpecial(order, staffById) {
  return (order.body?.committees || []).map((c) => ({
    name: c.name || '',
    duties: splitLines(c.duties),
    members: (c.members || []).map((m) => {
      const s = m.staff_id && staffById[m.staff_id];
      return s ? { name: staffName(s), title: shortTitle(s), role: m.role || '' }
        : { name: m.name || '', title: m.position || '', role: m.role || '' };
    }).filter((m) => m.name),
  }));
}

export const splitLines = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*(\(?[0-9๐-๙]+[.)]\s*|[-•]\s*)/, '').trim()).filter(Boolean);

// ---------- 2) แบบจำลองเอกสาร ----------
// sections = ผลจาก resolve*, meta = { schoolName }
export function buildModel(order, sections, meta) {
  const mode = order.options?.numerals === 'arabic' ? 'arabic' : 'thai';
  const D = (s) => digits(s, mode);
  const showDuties = order.options?.show_duties !== false;
  const B = [];
  B.push({ type: 'garuda' });
  B.push({ type: 'center', text: D(`คำสั่งโรงเรียน${meta.schoolName || '……………'}`) });
  B.push({ type: 'center', text: D(`ที่ ${order.number || '……/……'}`) });
  B.push({ type: 'center', text: D(`เรื่อง ${order.title || '……………'}`) });
  B.push({ type: 'rule' });
  for (const p of [order.reason, order.legal]) if (p?.trim()) B.push({ type: 'para', text: D(p.trim()), space: true });

  sections.forEach((sec, i) => {
    const no = i + 1;
    B.push({ type: 'heading', no: D(`${no}.`), text: D(sec.name), keep: true });
    if (!sec.members.length) B.push({ type: 'member', no: '', name: '(ยังไม่ได้มอบหมาย)', title: '', role: '', empty: true });
    sec.members.forEach((m, k) => B.push({ type: 'member', no: D(`${no}.${k + 1}`), name: D(m.name), title: D(m.title), role: D(m.role) }));
    if (showDuties && sec.duties.length) {
      B.push({ type: 'dutyLabel', text: 'มีหน้าที่', keep: true });
      sec.duties.forEach((d, k) => B.push({ type: 'duty', no: D(`(${k + 1})`), text: D(d) }));
    }
  });

  if (order.closing?.trim()) B.push({ type: 'para', text: D(order.closing.trim()), space: true });
  if (order.effective_text?.trim()) B.push({ type: 'para', text: D(order.effective_text.trim()), space: true, keep: true });
  B.push({ type: 'sign', when: D(`สั่ง ณ วันที่ ${order.signed_date ? orderDate(order.signed_date) : '……… เดือน ……………… พ.ศ. ………'}`),
    name: D(`(${order.signer_name || '……………………………'})`), title: D(order.signer_title || 'ผู้อำนวยการโรงเรียน') });
  return { blocks: B, numerals: mode };
}

// ---------- 3) HTML ของแต่ละบล็อก ----------
export function blockHtml(b, { garuda } = {}) {
  switch (b.type) {
    case 'garuda': return `<div class="b garuda">${garuda ? `<img src="${esc(garuda)}" alt="ตราครุฑ">` : '<span class="ph">ตราครุฑ<br>(อัปโหลดใน<br>ข้อมูลพื้นฐาน)</span>'}</div>`;
    case 'center': return `<div class="b c">${esc(b.text)}</div>`;
    case 'rule': return '<div class="b rule"><span></span></div>';
    case 'para': return `<div class="b p${b.space ? ' sp' : ''}">${esc(b.text)}</div>`;
    case 'heading': return `<div class="b h"><span>${esc(b.no)}</span><span>${esc(b.text)}</span></div>`;
    case 'member': return `<div class="b m"><span>${esc(b.no)}</span><span>${b.empty ? `<i style="color:#b3261e">${esc(b.name)}</i>` : esc(b.name)}</span><span>${esc(b.title)}</span><span>${esc(b.role)}</span></div>`;
    case 'dutyLabel': return `<div class="b dl">${esc(b.text)}</div>`;
    case 'duty': return `<div class="b d"><span class="n">${esc(b.no)}</span>${esc(b.text)}</div>`;
    case 'sign': return `<div class="b sign"><div class="when">${esc(b.when)}</div><div class="who">${esc(b.name)}<br>${esc(b.title)}</div></div>`;
    default: return '';
  }
}

// ---------- 4) แบ่งหน้า: วัดความสูงจริงของแต่ละบล็อกแล้วจัดลงหน้า A4 ----------
const MM = 96 / 25.4;
export const CONTENT_H = (297 - 25 - 20) * MM;   // พื้นที่เนื้อหาต่อหน้า (px)

export function paginate(heights, keep) {
  // keep[i] = บล็อก i ต้องอยู่หน้าเดียวกับบล็อกถัดไป
  const pages = []; let cur = []; let used = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
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
export async function renderPages(el, model, { garuda } = {}) {
  try { await document.fonts.ready; } catch { /* */ }
  const fallback = !hasThaiOfficialFont();
  const htmls = model.blocks.map((b) => blockHtml(b, { garuda }));
  const meas = document.createElement('div');
  meas.className = `doc-measure${fallback ? ' fallback' : ''}`;
  meas.innerHTML = htmls.join('');
  document.body.appendChild(meas);
  const imgs = [...meas.querySelectorAll('img')];
  await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
  const heights = [...meas.children].map((c) => c.getBoundingClientRect().height);
  meas.remove();
  const keep = model.blocks.map((b) => !!b.keep);
  const pages = paginate(heights, keep);
  const D = (s) => digits(s, model.numerals);
  el.innerHTML = pages.map((idx, p) => `<div class="doc-page${fallback ? ' fallback' : ''}">
      ${p > 0 ? `<div class="pageno">${esc(D(`- ${p + 1} -`))}</div>` : ''}
      ${idx.map((i) => htmls[i]).join('')}</div>`).join('');
  return { pages: pages.length, fallback };
}
