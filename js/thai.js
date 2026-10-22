// ---------- ตัวเลขไทย / วันที่แบบหนังสือราชการ ----------
import { THAI_MONTHS, fromIso } from './util.js';

const TH = '๐๑๒๓๔๕๖๗๘๙';
export const toThaiDigits = (s) => String(s ?? '').replace(/[0-9]/g, (d) => TH[d]);
export const toArabicDigits = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(TH.indexOf(d)));
// แปลงตามที่เลือก: 'thai' | 'arabic'
export const digits = (s, mode) => (mode === 'arabic' ? toArabicDigits(s) : toThaiDigits(s));

// "สั่ง ณ วันที่ 15 พฤษภาคม พ.ศ. 2569"
export const orderDate = (isoDate) => {
  if (!isoDate) return '';
  const d = fromIso(isoDate.slice(0, 10));
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
};

// ปีการศึกษาปัจจุบัน (พ.ศ.) เดาจากวันที่: ปีการศึกษาเริ่ม 16 พ.ค.
export const guessAcademicYear = (now = new Date()) => {
  const y = now.getFullYear() + 543;
  return now.getMonth() < 4 || (now.getMonth() === 4 && now.getDate() < 16) ? y - 1 : y;
};

// ชื่อ-สกุลบุคลากร
export const staffName = (s) => (s ? `${s.prefix || ''}${s.first_name || ''} ${s.last_name || ''}`.trim() : '');
// วิทยฐานะเก็บแบบเต็ม เช่น "ครูชำนาญการพิเศษ" → ตำแหน่งเต็ม "ครู วิทยฐานะครูชำนาญการพิเศษ"
export const RANKS = ['ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ครูเชี่ยวชาญ', 'ครูเชี่ยวชาญพิเศษ',
  'ผู้อำนวยการชำนาญการ', 'ผู้อำนวยการชำนาญการพิเศษ', 'ผู้อำนวยการเชี่ยวชาญ', 'ผู้อำนวยการเชี่ยวชาญพิเศษ'];
export const POSITIONS = ['ผู้อำนวยการโรงเรียน', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง',
  'เจ้าหน้าที่ธุรการ', 'นักการภารโรง', 'ลูกจ้างประจำ'];
export const staffTitle = (s) => {
  if (!s) return '';
  const rank = (s.academic_rank || '').trim().replace(/^วิทยฐานะ\s*/, '');
  return rank ? `${s.position || 'ครู'} วิทยฐานะ${rank}` : (s.position || '');
};

// แยกคำนำหน้าออกจากชื่อเต็ม (ใช้ตอนนำเข้าจากรายการผู้ใช้/วางรายชื่อ)
const PREFIXES = ['ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.', 'นางสาว', 'นาง', 'นาย', 'น.ส.', 'ดร.'];
export function splitName(full) {
  let s = String(full || '').trim().replace(/^ครู\s*/, '');
  let prefix = '';
  for (const p of PREFIXES) if (s.startsWith(p)) { prefix = p === 'น.ส.' ? 'นางสาว' : p; s = s.slice(p.length).trim(); break; }
  const [first = '', ...rest] = s.split(/\s+/);
  return { prefix, first_name: first, last_name: rest.join(' ') };
}

// แทนค่า {ปี} {โรงเรียน} ในข้อความตั้งต้น
export const fillTemplate = (text, vars) => String(text || '').replace(/\{(ปี|โรงเรียน)\}/g, (_, k) => vars[k] ?? '');
