// ข้อมูลตัวอย่างสำหรับโหมดทดลอง (ชื่อบุคลากรทั้งหมดสมมติ)
import { TASK_SETS, ORDER_DEFAULTS } from './task-sets.js';

export function seedDemo() {
  const profiles = [
    { id: 'u-admin', full_name: 'นางรัตนา ใจงาม', email: 'academic@demo', role: 'admin' },
    { id: 'u-teacher', full_name: 'นายอนุชา มีสุข', email: 'teacher@demo', role: 'teacher' },
    { id: 'u-new', full_name: 'ครูใหม่ (รออนุมัติ)', email: 'new@demo', role: 'pending' },
  ];
  const school_settings = [{ id: 1, school_name: 'บ้านวังลึก (ยุวนาฏชนูทิศ)', school_code: '00000000',
    affiliation: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', area_office: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสุโขทัย เขต ๒',
    subdistrict: '', district: '', province: 'สุโขทัย', director_name: 'นายวิชัย ศรีสวัสดิ์',
    director_title: 'ผู้อำนวยการโรงเรียนบ้านวังลึก (ยุวนาฏชนูทิศ)', registrar_name: '', academic_head_name: 'นางรัตนา ใจงาม' }];
  const terms = [
    { id: 'term-1', academic_year: 2569, term: 1, start_date: '2026-05-16', end_date: '2026-10-09', is_current: false },
    { id: 'term-2', academic_year: 2569, term: 2, start_date: '2026-11-01', end_date: '2027-03-31', is_current: true },
  ];
  const ac_settings = [{ id: 1, teachers_enabled: false, numerals: 'thai',
    order_reason: ORDER_DEFAULTS.reason, order_legal: ORDER_DEFAULTS.legal, order_closing: ORDER_DEFAULTS.closing }];

  const S = (id, prefix, first_name, last_name, position, academic_rank, levels, subject_area, sort_order, profile_id = null) =>
    ({ id, prefix, first_name, last_name, position, academic_rank, levels, subject_area, sort_order, profile_id, active: true, note: '' });
  const staff = [
    S('st-01', 'นาย', 'วิชัย', 'ศรีสวัสดิ์', 'ผู้อำนวยการโรงเรียน', 'ผู้อำนวยการชำนาญการพิเศษ', '', '', 1),
    S('st-02', 'นาง', 'รัตนา', 'ใจงาม', 'ครู', 'ครูชำนาญการพิเศษ', 'ป.4–ป.6', 'ภาษาไทย', 2, 'u-admin'),
    S('st-03', 'นาง', 'สุภาพร', 'แก้วมณี', 'ครู', 'ครูชำนาญการพิเศษ', 'ป.1–ป.3', 'คณิตศาสตร์', 3),
    S('st-04', 'นาย', 'ธนวัฒน์', 'บุญเรือง', 'ครู', 'ครูชำนาญการ', 'ม.1–ม.3', 'คณิตศาสตร์', 4),
    S('st-05', 'นาย', 'อนุชา', 'มีสุข', 'ครู', 'ครูชำนาญการ', 'ม.1–ม.3', 'วิทยาศาสตร์และเทคโนโลยี', 5, 'u-teacher'),
    S('st-06', 'นางสาว', 'พิมพ์ชนก', 'ทองดี', 'ครู', '', 'อ.2–อ.3', 'ปฐมวัย', 6),
    S('st-07', 'นางสาว', 'กนกวรรณ', 'สายบุญ', 'ครูผู้ช่วย', '', 'ม.1–ม.3', 'ภาษาต่างประเทศ', 7),
    S('st-08', 'นางสาว', 'จิราพร', 'พรหมมา', 'พนักงานราชการ', '', 'ป.1–ป.3', 'ภาษาไทย', 8),
    S('st-09', 'นาย', 'ณัฐพล', 'ศรีเมือง', 'ครูอัตราจ้าง', '', 'ป.4–ม.3', 'คอมพิวเตอร์', 9),
    S('st-10', 'นางสาว', 'อรอุมา', 'นิลสุวรรณ', 'เจ้าหน้าที่ธุรการ', '', '', 'ธุรการ', 10),
  ];

  const ac_tasks = TASK_SETS.practical.tasks.map((t, i) => ({ id: `tk-${String(i + 1).padStart(2, '0')}`, academic_year: 2569,
    group_name: t.group || '', name: t.name, duties: t.duties, sort_order: i + 1, source: 'practical' }));

  // จัดภาระงานตัวอย่าง (เว้นงานสุดท้ายไว้ยังไม่มีหัวหน้า เพื่อให้เห็นคำเตือน)
  const pool = ['st-02', 'st-03', 'st-04', 'st-05', 'st-06', 'st-07', 'st-08', 'st-09'];
  const ac_assignments = [];
  ac_tasks.forEach((t, i) => {
    const pick = (k) => pool[(i * 3 + k) % pool.length];
    const add = (sid, role, n) => { if (!ac_assignments.some((a) => a.task_id === t.id && a.staff_id === sid))
      ac_assignments.push({ id: `as-${t.id}-${n}`, task_id: t.id, staff_id: sid, role, sort_order: n }); };
    if (i < ac_tasks.length - 1) add(pick(0), 'head', 0);
    add(pick(1), 'member', 1);
    if (i % 3 === 0) add(pick(5), 'member', 2);
    add(pick(2), 'secretary', 3);
  });

  const ac_orders = [{
    id: 'ord-1', academic_year: 2569, kind: 'annual', number: '15/2569',
    title: ORDER_DEFAULTS.title.replace('{ปี}', '2569'),
    reason: ORDER_DEFAULTS.reason.replace('{โรงเรียน}', 'บ้านวังลึก (ยุวนาฏชนูทิศ)').replace('{ปี}', '2569'),
    legal: ORDER_DEFAULTS.legal, closing: ORDER_DEFAULTS.closing, body: {}, effective_text: ORDER_DEFAULTS.effective,
    signed_date: '2026-05-12', signer_name: 'นายวิชัย ศรีสวัสดิ์', signer_title: 'ผู้อำนวยการโรงเรียนบ้านวังลึก (ยุวนาฏชนูทิศ)',
    options: { numerals: 'thai', show_duties: true }, status: 'draft', snapshot: null, created_by: 'u-admin', updated_at: '2026-05-12T09:00:00Z',
  }, {
    id: 'ord-2', academic_year: 2569, kind: 'special', number: '48/2569',
    title: 'แต่งตั้งคณะกรรมการดำเนินการสอบปลายภาคเรียนที่ ๒ ปีการศึกษา ๒๕๖๙',
    reason: 'ด้วยโรงเรียนบ้านวังลึก (ยุวนาฏชนูทิศ) กำหนดจัดสอบปลายภาคเรียนที่ ๒ ปีการศึกษา ๒๕๖๙ ระหว่างวันที่ ๑๐–๑๒ มีนาคม ๒๕๗๐ เพื่อให้การดำเนินการสอบเป็นไปด้วยความเรียบร้อย ถูกต้องตามระเบียบการวัดและประเมินผล',
    legal: ORDER_DEFAULTS.special_legal, closing: 'ให้คณะกรรมการที่ได้รับแต่งตั้งปฏิบัติหน้าที่อย่างเคร่งครัด เพื่อให้เกิดผลดีแก่ทางราชการ',
    body: { committees: [
      { name: 'คณะกรรมการอำนวยการ', duties: 'ให้คำปรึกษา แนะนำ และอำนวยความสะดวกในการดำเนินการสอบ', members: [
        { staff_id: 'st-01', role: 'ประธานกรรมการ' }, { staff_id: 'st-02', role: 'กรรมการและเลขานุการ' }] },
      { name: 'คณะกรรมการกำกับห้องสอบ', duties: 'กำกับการสอบให้เป็นไปตามระเบียบ\nรับ-ส่งข้อสอบและกระดาษคำตอบตามเวลาที่กำหนด', members: [
        { staff_id: 'st-04', role: 'ห้อง ม.1' }, { staff_id: 'st-05', role: 'ห้อง ม.2' }, { staff_id: 'st-07', role: 'ห้อง ม.3' }] },
    ] },
    effective_text: 'ทั้งนี้ ตั้งแต่วันที่ ๑๐ มีนาคม ๒๕๗๐ ถึงวันที่ ๑๒ มีนาคม ๒๕๗๐',
    signed_date: '2027-03-01', signer_name: 'นายวิชัย ศรีสวัสดิ์', signer_title: 'ผู้อำนวยการโรงเรียนบ้านวังลึก (ยุวนาฏชนูทิศ)',
    options: { numerals: 'thai', show_duties: true }, status: 'draft', snapshot: null, created_by: 'u-admin', updated_at: '2027-03-01T09:00:00Z',
  }];

  return { profiles, school_settings, terms, ac_settings, ac_assets: [], staff, ac_tasks, ac_assignments, ac_orders };
}
