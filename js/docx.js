// =====================================================================
//  เขียนไฟล์ Word (.docx) จากแบบจำลองคำสั่งราชการ — ไม่ต้องใช้ไลบรารี
//  A4 · ขอบบน 2.5 ล่าง 2 ซ้าย 3 ขวา 2 ซม. · TH SarabunPSK 16 พอยต์ · ครุฑสูง 3 ซม.
//  เลขหน้า "- ๒ -" กึ่งกลางด้านบนตั้งแต่หน้า 2 (หน้าแรกไม่มีเลขหน้า)
// =====================================================================

const xmlEsc = (s) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- zip (แบบไม่บีบอัด) — ชุดเดียวกับ WL Admin ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameB = enc.encode(name); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nameB.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nameB, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nameB.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- หน่วย ----------
const CM = 567;                 // twips ต่อ ซม.
const tw = (cm) => Math.round(cm * CM);
const EMU_CM = 360000;
export const FONT = 'TH SarabunPSK';

// ตารางรายชื่อ (ไม่มีเส้น) — ตรงกับ CSS .b.m : เยื้อง 3.5 ซม. · ลำดับ 1.2 · ชื่อ 4.4 · ตำแหน่ง 3.3 · บทบาท 3.6 ซม.
// ใช้ตารางแทนแท็บ ชื่อยาวจะขึ้นบรรทัดใหม่ในช่องของตัวเอง ไม่ดันคอลัมน์ถัดไปให้เพี้ยน
const MEM = { left: 3.5, cols: [1.2, 4.4, 3.3, 3.6] };

const run = (text, { b = false } = {}) => (text === '' ? '' :
  `<w:r>${b ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`);
const tab = '<w:r><w:tab/></w:r>';
const pPr = ({ jc, ind, before = 0, keep = false, tabs = [], border = false } = {}) => `<w:pPr>${keep ? '<w:keepNext/><w:keepLines/>' : ''}${border
  ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>' : ''}${tabs.length
  ? `<w:tabs>${tabs.map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join('')}</w:tabs>` : ''}<w:spacing w:before="${before}" w:after="0" w:line="240" w:lineRule="auto"/>${ind ? `<w:ind ${ind}/>` : ''}${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>`;
const para = (opts, inner) => `<w:p>${pPr(opts)}${inner}</w:p>`;

function imageXml(img) {
  const h = 3 * EMU_CM;                                  // สูง 3 ซม.
  const w = Math.round(h * (img.w / img.h));
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="1" name="ตราครุฑ"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="garuda.${img.ext}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// แปลงบล็อกเป็นย่อหน้า Word
function blockXml(b, img) {
  const SP = 120; // ระยะก่อนย่อหน้า 6 พอยต์
  switch (b.type) {
    case 'garuda': return img ? para({ jc: 'center', keep: true }, imageXml(img)) : '';
    case 'center': return para({ jc: 'center', keep: true }, run(b.text));
    case 'rule': return para({ jc: 'center', keep: true, border: true, ind: `w:left="${tw(5.25)}" w:right="${tw(5.25)}"` }, '') + para({ keep: true }, '');
    case 'para': return para({ jc: 'thaiDistribute', ind: `w:firstLine="${tw(2.5)}"`, before: b.space ? SP : 0, keep: b.keep }, run(b.text));
    case 'heading': return para({ keep: true, before: SP, ind: `w:left="${tw(3.5)}" w:hanging="${tw(1)}"`, tabs: [tw(3.5)] }, run(b.no, { b: true }) + tab + run(b.text, { b: true }));
    case 'member': return memberRow(b);
    case 'dutyLabel': return para({ keep: true, ind: `w:left="${tw(3.5)}"` }, run(b.text));
    case 'duty': return para({ jc: 'thaiDistribute', ind: `w:left="${tw(4.6)}" w:hanging="${tw(1.1)}"`, tabs: [tw(4.6)] }, run(b.no) + tab + run(b.text));
    case 'sign': {
      const who = `w:left="${tw(5.5)}" w:right="${tw(1.5)}"`;
      return para({ keep: true, before: 240, ind: `w:left="${tw(6.5)}"` }, run(b.when))
        + para({ keep: true }, '') + para({ keep: true }, '')
        + para({ keep: true, jc: 'center', ind: who }, run(b.name))
        + para({ jc: 'center', ind: who }, run(b.title));
    }
    default: return '';
  }
}

function memberRow(b) {
  const cell = (w, text) => `<w:tc><w:tcPr><w:tcW w:w="${tw(w)}" w:type="dxa"/></w:tcPr>${para({}, run(text))}</w:tc>`;
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${[b.no, b.name, b.title, b.role].map((t, i) => cell(MEM.cols[i], t)).join('')}</w:tr>`;
}
const memberTable = (rows) => `<w:tbl><w:tblPr><w:tblW w:w="${tw(MEM.cols.reduce((a, c) => a + c, 0))}" w:type="dxa"/><w:tblInd w:w="${tw(MEM.left)}" w:type="dxa"/>
<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>
<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>
<w:tblGrid>${MEM.cols.map((c) => `<w:gridCol w:w="${tw(c)}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;

// รวมบรรทัดรายชื่อที่ติดกันเป็นตารางเดียว
function bodyXml(blocks, img) {
  const out = []; let rows = [];
  const flushRows = () => { if (rows.length) { out.push(memberTable(rows)); rows = []; } };
  for (const b of blocks) {
    if (b.type === 'member') { rows.push(blockXml(b, img)); continue; }
    flushRows(); out.push(blockXml(b, img));
  }
  flushRows();
  return out.join('\n');
}

const rPrDefault = `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="th-TH" w:eastAsia="en-US" w:bidi="th-TH"/>`;

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

// model = buildModel(...) · img = { bytes: Uint8Array, ext: 'png'|'jpeg', w, h } หรือ null
export function buildDocx(model, img = null, { title = 'คำสั่ง' } = {}) {
  const body = bodyXml(model.blocks, img);
  const pageField = ' PAGE ';   // รูปแบบเลขไทยกำหนดที่ pgNumType ของ section
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/>
<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${tw(2.5)}" w:right="${tw(2)}" w:bottom="${tw(2)}" w:left="${tw(3)}" w:header="${tw(1.3)}" w:footer="${tw(1)}" w:gutter="0"/>
${model.numerals === 'thai' ? '<w:pgNumType w:fmt="thaiNumbers"/>' : ''}<w:titlePg/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
${body}
${sect}</w:body></w:document>`;

  const dash = '-';
  const header1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${dash} </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${pageField}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${model.numerals === 'thai' ? '๒' : '2'}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve"> ${dash}</w:t></w:r></w:p></w:hdr>`;
  const header2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p></w:hdr>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${rPrDefault}</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr>${rPrDefault}</w:rPr></w:style>
</w:styles>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="${tw(1)}"/><w:characterSpacingControl w:val="doNotCompress"/><w:themeFontLang w:val="en-US" w:bidi="th-TH"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>WL Academic</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;

  const ext = img?.ext === 'jpeg' ? 'jpeg' : 'png';
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdH2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>
${img ? `<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/garuda.${ext}"/>` : ''}
</Relationships>`;

  const files = [
    ['[Content_Types].xml', types], ['_rels/.rels', rels], ['docProps/core.xml', core],
    ['word/document.xml', doc], ['word/_rels/document.xml.rels', docRels], ['word/styles.xml', styles],
    ['word/settings.xml', settings], ['word/header1.xml', header1], ['word/header2.xml', header2],
  ];
  if (img) files.push([`word/media/garuda.${ext}`, img.bytes]);
  return zipStore(files);
}

// data URL → { bytes, ext, w, h } (ใช้ในเบราว์เซอร์)
export async function imageFromDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  const im = new Image(); im.src = dataUrl;
  await new Promise((r) => { im.onload = im.onerror = r; });
  const w = im.naturalWidth || 300; const h = im.naturalHeight || 360;
  let kind = m[1].toLowerCase();
  let b64 = m[2];
  if (!['png', 'jpeg', 'jpg'].includes(kind)) {           // แปลงชนิดอื่นเป็น PNG ให้ Word เปิดได้
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0);
    b64 = c.toDataURL('image/png').split(',')[1]; kind = 'png';
  }
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: kind === 'png' ? 'png' : 'jpeg', w, h };
}

export function downloadBytes(bytes, filename, mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
