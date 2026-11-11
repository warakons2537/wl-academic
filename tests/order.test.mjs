// node tests/order.test.mjs  — ตรวจตัวเลขไทย, แบบจำลองคำสั่ง, การแบ่งหน้า และโครงสร้างไฟล์ .docx
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { toThaiDigits, toArabicDigits, orderDate, staffTitle, splitName, guessAcademicYear } from '../js/thai.js';
import { buildModel, resolveAnnual, resolveSpecial, paginate, CONTENT_H, splitLines, fmtOf, cleanFmt, fmtStyle, blockHtml } from '../js/order-doc.js';
import { buildDocx } from '../js/docx.js';
import { seedDemo } from '../js/demo-data.js';
import { workloadSummary, taskWarnings, membersOf } from '../js/data.js';
import { TASK_SETS } from '../js/task-sets.js';
import { indexBy } from '../js/util.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('เลขไทย/อารบิก', () => {
  assert.equal(toThaiDigits('15/2569'), '๑๕/๒๕๖๙');
  assert.equal(toArabicDigits('มาตรา ๓๙'), 'มาตรา 39');
  assert.equal(orderDate('2026-05-12'), '12 พฤษภาคม พ.ศ. 2569');
  assert.equal(guessAcademicYear(new Date(2026, 9, 21)), 2569);
  assert.equal(guessAcademicYear(new Date(2027, 2, 1)), 2569);
  assert.equal(guessAcademicYear(new Date(2027, 4, 16)), 2570);
});

t('ตำแหน่งและชื่อ', () => {
  assert.equal(staffTitle({ position: 'ครู', academic_rank: 'ครูชำนาญการพิเศษ' }), 'ครู วิทยฐานะครูชำนาญการพิเศษ');
  assert.equal(staffTitle({ position: 'ครูผู้ช่วย', academic_rank: '' }), 'ครูผู้ช่วย');
  assert.deepEqual(splitName('ครูนางสาวพิมพ์ชนก ทองดี'), { prefix: 'นางสาว', first_name: 'พิมพ์ชนก', last_name: 'ทองดี' });
  assert.deepEqual(splitName('น.ส.กนก สายบุญ'), { prefix: 'นางสาว', first_name: 'กนก', last_name: 'สายบุญ' });
});

t('ชุดงาน 17 งานทั้ง 2 ชุด', () => {
  assert.equal(TASK_SETS.official.tasks.length, 17);
  assert.equal(TASK_SETS.practical.tasks.length, 17);
  assert.equal(new Set(TASK_SETS.practical.tasks.map((x) => x.group)).size, 6);
  for (const s of Object.values(TASK_SETS)) for (const x of s.tasks) assert.ok(splitLines(x.duties).length >= 2, x.name);
});

t('ตัดเลขข้อเดิมออกจากขอบข่ายหน้าที่', () => {
  assert.deepEqual(splitLines('1. ก\n(๒) ข\n- ค\n\n  ง  '), ['ก', 'ข', 'ค', 'ง']);
});

const demo = seedDemo();
const staffById = indexBy(demo.staff);
const year = { tasks: demo.ac_tasks, assignments: demo.ac_assignments };

t('ลำดับผู้รับผิดชอบ: หัวหน้า → กรรมการ → เลขานุการ', () => {
  const m = membersOf('tk-01', demo.ac_assignments, staffById).map((x) => x.role);
  assert.equal(m[0], 'head'); assert.equal(m[m.length - 1], 'secretary');
});

t('สรุปภาระงานและคำเตือน', () => {
  const { rows, avg } = workloadSummary(demo.staff, demo.ac_tasks, demo.ac_assignments);
  assert.equal(rows.reduce((s, r) => s + r.total, 0), demo.ac_assignments.length);
  assert.ok(avg > 0);
  const last = demo.ac_tasks[demo.ac_tasks.length - 1];
  assert.deepEqual(taskWarnings(last, membersOf(last.id, demo.ac_assignments, staffById)), ['ยังไม่มีหัวหน้างาน']);
});

const order = demo.ac_orders[0];
const model = buildModel(order, resolveAnnual(year, staffById), { schoolName: 'บ้านวังลึก (ยุวนาฏชนูทิศ)' });

t('แบบจำลองคำสั่งประจำปี (เลขไทย)', () => {
  const texts = model.blocks.map((b) => [b.text, b.no, b.name, b.when].filter(Boolean).join(' ')).join('\n');
  assert.match(texts, /คำสั่งโรงเรียนบ้านวังลึก/);
  assert.match(texts, /ที่ ๑๕\/๒๕๖๙/);
  assert.match(texts, /สั่ง ณ วันที่ ๑๒ พฤษภาคม พ.ศ. ๒๕๖๙/);
  assert.doesNotMatch(texts, /[0-9]/, 'ต้องไม่มีเลขอารบิกเมื่อเลือกเลขไทย');
  assert.equal(model.blocks.filter((b) => b.type === 'heading').length, 17);
  const empty = buildModel(order, resolveAnnual({ tasks: [demo.ac_tasks[0]], assignments: [] }, staffById), { schoolName: 'x' });
  assert.ok(empty.blocks.some((b) => b.type === 'member' && b.empty), 'งานที่ยังไม่มีคนต้องแสดงช่องว่าง');
});

t('แบบย่อไม่มีขอบข่ายหน้าที่ / เลขอารบิก', () => {
  const m2 = buildModel({ ...order, options: { numerals: 'arabic', show_duties: false } }, resolveAnnual(year, staffById), { schoolName: 'x' });
  assert.equal(m2.blocks.filter((b) => b.type === 'duty').length, 0);
  assert.ok(m2.blocks.some((b) => b.text === 'ที่ 15/2569'));
});

t('คำสั่งเฉพาะกิจ', () => {
  const sec = resolveSpecial(demo.ac_orders[1], staffById);
  assert.equal(sec.length, 2);
  assert.equal(sec[0].members[0].name, 'นายวิชัย ศรีสวัสดิ์');
  assert.equal(sec[1].duties.length, 2);
});

t('แบ่งหน้า: ไม่ทิ้งหัวข้อไว้ท้ายหน้า', () => {
  const H = Array(40).fill(26); H[30] = 26;
  const keep = H.map((_, i) => i === 35);
  const pages = paginate(H, keep);
  assert.equal(pages.flat().length, 40);
  for (const p of pages) assert.ok(p.reduce((s, i) => s + H[i], 0) <= CONTENT_H + 1);
  for (const p of pages.slice(0, -1)) assert.ok(!keep[p[p.length - 1]], 'บล็อกที่ต้องติดกันต้องไม่อยู่ท้ายหน้า');
});

t('ไฟล์ .docx', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  const bytes = buildDocx(model, { bytes: png, ext: 'png', w: 300, h: 330 }, { title: order.title });
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const s = new TextDecoder().decode(bytes);
  assert.match(s, /TH SarabunPSK/); assert.match(s, /w:titlePg/); assert.match(s, /w:fmt="thaiNumbers"/);
  assert.match(s, /w:top="1418"/); assert.match(s, /w:left="1701"/);
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/order-annual.docx', import.meta.url), bytes);
  const sp = buildModel(demo.ac_orders[1], resolveSpecial(demo.ac_orders[1], staffById), { schoolName: 'บ้านวังลึก (ยุวนาฏชนูทิศ)' });
  writeFileSync(new URL('./out/order-special.docx', import.meta.url), buildDocx(sp, null));
});

t('จัดรูปแบบทีละบล็อก: ค่ามาตรฐาน / ทั้งชนิด / เฉพาะบล็อก / ย่อหน้าแบบเดิม', () => {
  assert.deepEqual(fmtOf('para', 'reason', {}), { first: 2.5, left: 0, right: 0, size: 16, cs: 0, before: 6, align: 'd', pb: false });
  assert.equal(fmtOf('para', 'legal', { para: { legal: { first: 3, left: 1 } } }).first, 3, 'ค่าย่อหน้าที่บันทึกแบบเดิมยังใช้ได้');
  const opt = { fmtAll: { duty: { size: 15 } }, fmt: { 'd:tk-01:0': { cs: -0.3, pb: true } } };
  assert.equal(fmtOf('duty', 'd:tk-01:1', opt).size, 15);
  assert.deepEqual([fmtOf('duty', 'd:tk-01:0', opt).size, fmtOf('duty', 'd:tk-01:0', opt).cs], [15, -0.3]);
  assert.equal(cleanFmt('para', { left: 1, first: -5 }).first, -1, 'ย่อหน้าแขวนไม่เลยขอบซ้าย');
  assert.equal(cleanFmt('member', { size: 99, align: 'c', pb: true }).size, 26);
  assert.equal(cleanFmt('member', { align: 'c', pb: true }).pb, false, 'รายชื่อไม่มีขึ้นหน้าใหม่/จัดแนว');

  const m = buildModel({ ...order, title: 'บรรทัดหนึ่ง\nบรรทัดสอง', options: { ...order.options, ...opt, fmt: { ...opt.fmt, title: { size: 15.5, cs: -0.2 }, 'm:tk-01:x': { left: 3 } } } },
    resolveAnnual(year, staffById), { schoolName: 'x' });
  const title = m.blocks.find((b) => b.key === 'title');
  assert.match(fmtStyle(title), /font-size:calc\(var\(--doc-size\)\*0\.969\)/);
  assert.match(fmtStyle(title), /letter-spacing/);
  assert.match(blockHtml(title, { editable: true }), /data-pkey="title"/);
  assert.doesNotMatch(blockHtml(title, { editable: false }), /contenteditable/);
  assert.equal(new Set(m.blocks.filter((b) => b.key).map((b) => b.key)).size, m.blocks.filter((b) => b.key).length, 'รหัสบล็อกต้องไม่ซ้ำ');
  const d0 = m.blocks.findIndex((b) => b.key === 'd:tk-01:0');
  assert.ok(d0 > 0 && m.blocks[d0].f.pb);
  assert.match(fmtStyle(m.blocks[d0]), /padding-left:4\.6cm/);

  const pages = paginate(m.blocks.map(() => 20), m.blocks.map(() => false), m.blocks.map((b) => !!b.f?.pb));
  assert.equal(pages[1][0], d0, 'บล็อกที่สั่งขึ้นหน้าใหม่ต้องเป็นบรรทัดแรกของหน้า');

  const xml = new TextDecoder().decode(buildDocx(m, null));
  assert.match(xml, /<w:pageBreakBefore\/>/);
  assert.match(xml, /บรรทัดหนึ่ง<\/w:t><w:br\/><w:t xml:space="preserve">บรรทัดสอง/);
  assert.match(xml, /<w:spacing w:val="-4"\/><w:sz w:val="31"\/>/);
  assert.match(xml, /<w:spacing w:val="-6"\/><w:sz w:val="30"\/>/);
  assert.match(xml, /doNotExpandShiftReturn/);
  writeFileSync(new URL('./out/order-formatted.docx', import.meta.url), buildDocx(m, null));
});

t('ความกว้างคอลัมน์รายชื่อ (ทั้งฉบับ)', () => {
  const m = buildModel({ ...order, options: { ...order.options, memCols: [1, 5.5, 99] } }, resolveAnnual(year, staffById), { schoolName: 'x' });
  const row = m.blocks.find((b) => b.type === 'member' && !b.empty);
  assert.deepEqual(row.cols, [1, 5.5, 5], 'รวมแล้วต้องเหลือที่ให้ช่องบทบาท');
  assert.match(fmtStyle(row), /grid-template-columns:1cm 5\.5cm 5cm minmax\(0,1fr\)/);
  assert.deepEqual(model.blocks.find((b) => b.type === 'member').cols, [1.2, 4.4, 3.3]);
  const m2 = buildModel({ ...order, options: { ...order.options, memCols: [1, 5.5, 3] } }, resolveAnnual(year, staffById), { schoolName: 'x' });
  const xml = new TextDecoder().decode(buildDocx(m2, null));
  assert.match(xml, /<w:gridCol w:w="567"\/><w:gridCol w:w="3119"\/><w:gridCol w:w="1701"\/><w:gridCol w:w="1701"\/>/);   // 1 · 5.5 · 3 · ที่เหลือ 3 ซม.
});

console.log(`\nผ่านทั้งหมด ${n} ชุด`);
