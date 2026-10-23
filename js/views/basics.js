import { esc, $, $$, toast, modal, confirmBox, groupBy } from '../util.js';
import { icon } from '../icons.js';
import { TASK_SETS, ORDER_DEFAULTS } from '../task-sets.js';
import { staffName, staffTitle, splitName, RANKS, POSITIONS } from '../thai.js';
import { splitLines } from '../order-doc.js';

const TABS = [
  ['school', 'ข้อมูลโรงเรียน'], ['garuda', 'ตราครุฑ'], ['staff', 'บุคลากร'], ['tasks', 'คลังงานวิชาการ'], ['settings', 'ตั้งค่าแอป'],
];

const tabFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('tab');

export async function render(el, ctx) {
  let tab = tabFromHash() || 'school';
  if (!TABS.some(([k]) => k === tab)) tab = 'school';
  let offs = [];
  const stop = () => { offs.forEach((f) => { try { f(); } catch { /* */ } }); offs = []; };

  const draw = async () => {
    stop();
    el.innerHTML = `
      <div class="page-head"><div><h1>ข้อมูลพื้นฐาน</h1><p>ข้อมูลตั้งต้นที่ใช้ในการจัดภาระงานและออกคำสั่ง${ctx.canEdit ? '' : ' (ดูอย่างเดียว)'}</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="tab-body"></div>`;
    $$('[data-t]', el).forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.t; history.replaceState(null, '', `#basics?tab=${tab}`); draw();
    }));
    const body = $('#tab-body', el);
    const fn = { school, garuda, staff, tasks, settings }[tab];
    const off = await fn(body, ctx, draw);
    if (off) offs.push(off);
  };
  await draw();
  return stop;
}

// ---------------------------------------------------------------------
// ข้อมูลโรงเรียน (ตาราง school_settings ของ WL Admin)
// ---------------------------------------------------------------------
async function school(el, ctx) {
  const s = ctx.settings;
  const f = (name, label, ph = '') => `<label>${label}<input type="text" name="${name}" value="${esc(s[name] || '')}" placeholder="${esc(ph)}" ${ctx.canEdit ? '' : 'disabled'}></label>`;
  el.innerHTML = `<form class="card" id="f-school">
    <div class="note-box">ข้อมูลชุดนี้ <b>ใช้ร่วมกับ WL Admin</b> แก้ที่แอปใดก็เปลี่ยนทั้งสองแอป</div>
    <div class="cols-2">
      ${f('school_name', 'ชื่อโรงเรียน (ไม่ต้องพิมพ์คำว่า "โรงเรียน")', 'บ้านวังลึก (ยุวนาฏชนูทิศ)')}
      ${f('area_office', 'สังกัดเขตพื้นที่', 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสุโขทัย เขต 2')}
      ${f('director_name', 'ชื่อผู้อำนวยการ (มีคำนำหน้า)', 'นาย…')}
      ${f('director_title', 'ตำแหน่งใต้ลายเซ็น', 'ผู้อำนวยการโรงเรียน…')}
      ${f('academic_head_name', 'หัวหน้าฝ่ายบริหารงานวิชาการ')}
      ${f('province', 'จังหวัด')}
    </div>
    ${ctx.canEdit ? '<div class="row"><button class="btn btn-primary" type="submit">บันทึก</button></div>' : ''}
  </form>`;
  $('#f-school', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = Object.fromEntries(new FormData(e.target).entries());
    for (const k of Object.keys(patch)) patch[k] = patch[k].trim();
    try { await ctx.db.update('school_settings', { id: 1 }, patch); await ctx.refresh(); toast('บันทึกข้อมูลโรงเรียนแล้ว'); }
    catch (err) { toast(err.message, 'err'); }
  });
}

// ---------------------------------------------------------------------
// ตราครุฑ
// ---------------------------------------------------------------------
async function garuda(el, ctx, redraw) {
  const [row] = await ctx.db.select('ac_assets', { eq: { key: 'garuda' } });
  el.innerHTML = `<div class="card">
    <div class="garuda-box">
      <div class="pv">${row ? `<img src="${esc(row.data_url)}" alt="ตราครุฑ">` : 'ยังไม่มี<br>ตราครุฑ'}</div>
      <div class="stack" style="max-width:520px">
        <p class="hint">ใช้ภาพตราครุฑมาตรฐานของทางราชการ ไฟล์ PNG พื้นโปร่งใสจะดีที่สุด (JPG ก็ได้) ระบบย่อภาพให้อัตโนมัติ
          และวางบนหัวคำสั่งที่ความสูง 3 ซม. ตามระเบียบงานสารบรรณ</p>
        ${row ? `<p class="hint">ไฟล์: ${esc(row.name || '-')}</p>` : ''}
        ${ctx.canEdit ? `<div class="toolbar"><label class="btn btn-primary">${icon('upload')} ${row ? 'เปลี่ยนภาพ' : 'อัปโหลดภาพ'}
            <input type="file" id="g-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
          ${row ? `<button class="btn btn-danger" id="g-del">${icon('trash')} ลบ</button>` : ''}</div>` : ''}
      </div>
    </div></div>`;
  $('#g-file', el)?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('ไฟล์ใหญ่เกิน 5 MB', 'err');
    try {
      const data_url = await shrinkImage(file, 720);
      await ctx.db.upsert('ac_assets', [{ key: 'garuda', data_url, name: file.name }], 'key');
      toast('บันทึกตราครุฑแล้ว'); redraw();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#g-del', el)?.addEventListener('click', async () => {
    if (!(await confirmBox('ลบตราครุฑ?'))) return;
    await ctx.db.remove('ac_assets', { key: 'garuda' }); redraw();
  });
}

// ย่อภาพให้สูงไม่เกิน maxH px แล้วเก็บเป็น PNG (คงพื้นโปร่งใส)
function shrinkImage(file, maxH) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่ภาพที่เปิดได้'));
      im.onload = () => {
        const k = Math.min(1, maxH / (im.naturalHeight || maxH));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((im.naturalWidth || maxH) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || maxH) * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------
// บุคลากร (ตารางกลาง staff)
// ---------------------------------------------------------------------
async function staff(el, ctx, redraw) {
  const linked = new Set(ctx.staff.map((s) => s.profile_id).filter(Boolean));
  const unlinkedProfiles = ctx.profiles.filter((p) => p.role !== 'pending' && !linked.has(p.id));
  const list = ctx.staff;
  el.innerHTML = `<div class="card">
    <div class="toolbar">
      <span class="grow hint">${list.filter((s) => s.active).length} คน · ใช้ร่วมกันทุกแอปในเครือ WL · ไม่ต้องมีบัญชีผู้ใช้ก็ใส่ชื่อในคำสั่งได้</span>
      ${ctx.canEdit ? `<button class="btn" id="s-paste">${icon('copy')} วางรายชื่อจาก Excel</button>
        ${unlinkedProfiles.length ? `<button class="btn" id="s-import">${icon('users')} นำเข้าจากผู้ใช้ WL Admin (${unlinkedProfiles.length})</button>` : ''}
        <button class="btn btn-primary" id="s-add">${icon('plus')} เพิ่มบุคลากร</button>` : ''}
    </div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="c">ที่</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>ระดับชั้น / กลุ่มสาระ</th><th>บัญชีผู้ใช้</th>${ctx.canEdit ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((s, i) => `<tr class="${s.active ? '' : 'inactive'}">
        <td class="c">${i + 1}</td>
        <td class="nowrap"><b>${esc(staffName(s))}</b>${s.active ? '' : '<span class="sub">ย้าย/ไม่ปฏิบัติงานแล้ว</span>'}</td>
        <td>${esc(staffTitle(s))}</td>
        <td>${esc([s.levels, s.subject_area].filter(Boolean).join(' · ') || '-')}</td>
        <td>${s.profile_id ? `<span class="chip chip-ok">${esc(ctx.profileById[s.profile_id]?.email || 'ผูกแล้ว')}</span>` : '<span class="muted small">-</span>'}</td>
        ${ctx.canEdit ? `<td style="white-space:nowrap;text-align:right">
          <button class="icon-btn" data-up="${s.id}" title="เลื่อนขึ้น" ${i ? '' : 'disabled'}>${icon('up')}</button>
          <button class="icon-btn" data-down="${s.id}" title="เลื่อนลง" ${i < list.length - 1 ? '' : 'disabled'}>${icon('down')}</button>
          <button class="icon-btn" data-edit="${s.id}" title="แก้ไข">${icon('edit')}</button>
          <button class="icon-btn danger" data-del="${s.id}" title="ลบ">${icon('trash')}</button></td>` : ''}
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีรายชื่อบุคลากร เริ่มจาก "เพิ่มบุคลากร" หรือ "วางรายชื่อจาก Excel"</div>'}
    <p class="hint">ลำดับในตารางนี้ใช้เป็นลำดับรายชื่อในคำสั่ง (ภายในบทบาทเดียวกัน)</p>
  </div>`;

  const save = async (rows) => { await ctx.db.upsert('staff', rows); await ctx.refresh(); redraw(); };
  const nextOrder = () => Math.max(0, ...ctx.staff.map((s) => s.sort_order || 0)) + 1;

  $('#s-add', el)?.addEventListener('click', async () => {
    const r = await staffForm(ctx, {});
    if (r) { await save([{ ...r, sort_order: nextOrder() }]); toast('เพิ่มบุคลากรแล้ว'); }
  });
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', async () => {
    const cur = ctx.staffById[b.dataset.edit];
    const r = await staffForm(ctx, cur);
    if (r) { await ctx.db.update('staff', { id: cur.id }, r); await ctx.refresh(); redraw(); toast('บันทึกแล้ว'); }
  }));
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    const s = ctx.staffById[b.dataset.del];
    const used = (await ctx.db.select('ac_assignments', { eq: { staff_id: s.id } })).length;
    const msg = used
      ? `${staffName(s)} มีงานวิชาการ ${used} งาน ถ้าลบ จะถูกนำออกจากทุกงาน (ถ้าย้ายโรงเรียน แนะนำให้กด "แก้ไข" แล้วเอาเครื่องหมาย "ยังปฏิบัติงาน" ออกแทน) ยืนยันลบ?`
      : `ลบ ${staffName(s)}?`;
    if (!(await confirmBox(msg, 'ลบ'))) return;
    try {
      await ctx.db.remove('ac_assignments', { staff_id: s.id });
      await ctx.db.remove('staff', { id: s.id }); await ctx.refresh(); redraw();
    } catch (err) { toast(err.message, 'err'); }
  }));
  const move = async (id, dir) => {
    const arr = [...ctx.staff]; const i = arr.findIndex((s) => s.id === id); const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await Promise.all(arr.map((s, k) => (s.sort_order !== k + 1 ? ctx.db.update('staff', { id: s.id }, { sort_order: k + 1 }) : null)));
    await ctx.refresh(); redraw();
  };
  $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => move(b.dataset.up, -1)));
  $$('[data-down]', el).forEach((b) => b.addEventListener('click', () => move(b.dataset.down, 1)));

  $('#s-import', el)?.addEventListener('click', async () => {
    const r = await modal('นำเข้าจากผู้ใช้ WL Admin', `<p class="hint">เลือกผู้ใช้ที่จะเพิ่มเป็นบุคลากร ระบบแยกคำนำหน้าให้อัตโนมัติ แล้วผูกกับบัญชีให้ทันที (แก้ตำแหน่ง/วิทยฐานะภายหลังได้)</p>
      ${unlinkedProfiles.map((p) => `<label class="inline"><input type="checkbox" name="p_${esc(p.id)}" checked> ${esc(p.full_name || p.email)} <span class="muted small">${esc(p.email || '')}</span></label>`).join('')}`, { okText: 'นำเข้า' });
    if (!r) return;
    let k = nextOrder();
    const rows = unlinkedProfiles.filter((p) => r[`p_${p.id}`]).map((p) => ({ ...splitName(p.full_name || p.email), position: 'ครู', profile_id: p.id, sort_order: k++ }));
    if (rows.length) { await save(rows); toast(`นำเข้า ${rows.length} คน`); }
  });

  $('#s-paste', el)?.addEventListener('click', async () => {
    const r = await modal('วางรายชื่อจาก Excel', `<p class="hint">คัดลอกจาก Excel หรือพิมพ์บรรทัดละ 1 คน: <b>ชื่อ-สกุล (มีคำนำหน้า)</b> ตามด้วยแท็บหรือจุลภาค แล้ว <b>ตำแหน่ง</b> และ <b>วิทยฐานะ</b> (ไม่ใส่ก็ได้)</p>
      <textarea name="t" rows="10" placeholder="นางรัตนา ใจงาม\tครู\tครูชำนาญการพิเศษ&#10;นายอนุชา มีสุข, ครู, ครูชำนาญการ&#10;นางสาวกนกวรรณ สายบุญ, ครูผู้ช่วย"></textarea>`, { okText: 'เพิ่มรายชื่อ', wide: true });
    if (!r?.t?.trim()) return;
    let k = nextOrder();
    const rows = r.t.split('\n').map((line) => line.split(/\t|,/).map((x) => x.trim())).filter((c) => c[0])
      .map(([name, position, rank]) => ({ ...splitName(name), position: position || 'ครู', academic_rank: (rank || '').replace(/^วิทยฐานะ\s*/, ''), sort_order: k++ }));
    if (rows.some((x) => !x.first_name)) return toast('มีบางบรรทัดที่อ่านชื่อไม่ได้', 'err');
    await save(rows); toast(`เพิ่ม ${rows.length} คน`);
  });
}

async function staffForm(ctx, s) {
  const linked = new Set(ctx.staff.filter((x) => x.id !== s.id).map((x) => x.profile_id).filter(Boolean));
  const profs = ctx.profiles.filter((p) => p.role !== 'pending' && !linked.has(p.id));
  const r = await modal(s.id ? 'แก้ไขบุคลากร' : 'เพิ่มบุคลากร', `
    <div class="cols-2">
      <label>คำนำหน้า<input type="text" name="prefix" list="dl-prefix" value="${esc(s.prefix || '')}" placeholder="นาย / นาง / นางสาว"></label>
      <label>ชื่อ<input type="text" name="first_name" value="${esc(s.first_name || '')}" required></label>
      <label>นามสกุล<input type="text" name="last_name" value="${esc(s.last_name || '')}"></label>
      <label>ตำแหน่ง<input type="text" name="position" list="dl-pos" value="${esc(s.position || 'ครู')}"></label>
      <label>วิทยฐานะ<select name="academic_rank"><option value="">— ไม่มีวิทยฐานะ —</option>
        ${RANKS.map((x) => `<option ${x === s.academic_rank ? 'selected' : ''}>${x}</option>`).join('')}
        ${s.academic_rank && !RANKS.includes(s.academic_rank) ? `<option selected>${esc(s.academic_rank)}</option>` : ''}</select></label>
      <label>ระดับชั้นที่รับผิดชอบ<input type="text" name="levels" value="${esc(s.levels || '')}" placeholder="เช่น ป.4–ป.6"></label>
      <label>กลุ่มสาระ / งานหลัก<input type="text" name="subject_area" value="${esc(s.subject_area || '')}"></label>
      <label>ผูกกับบัญชีผู้ใช้<select name="profile_id"><option value="">— ยังไม่มีบัญชี —</option>
        ${profs.map((p) => `<option value="${esc(p.id)}" ${p.id === s.profile_id ? 'selected' : ''}>${esc(p.full_name || p.email)} (${esc(p.email || '')})</option>`).join('')}</select></label>
    </div>
    <label class="inline"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> ยังปฏิบัติงานที่โรงเรียน</label>
    <datalist id="dl-prefix"><option>นาย</option><option>นาง</option><option>นางสาว</option><option>ว่าที่ร้อยตรี</option><option>ว่าที่ร้อยตรีหญิง</option></datalist>
    <datalist id="dl-pos">${POSITIONS.map((x) => `<option>${x}</option>`).join('')}</datalist>`, { wide: true });
  if (!r) return null;
  return { prefix: r.prefix.trim(), first_name: r.first_name.trim(), last_name: r.last_name.trim(), position: r.position.trim() || 'ครู',
    academic_rank: r.academic_rank, levels: r.levels.trim(), subject_area: r.subject_area.trim(), profile_id: r.profile_id || null, active: !!r.active };
}

// ---------------------------------------------------------------------
// คลังงานวิชาการ (รายปี)
// ---------------------------------------------------------------------
async function tasks(el, ctx, redraw) {
  const year = ctx.year;
  const all = await ctx.db.select('ac_tasks', { eq: { academic_year: year } });
  const list = all.sort((a, b) => a.sort_order - b.sort_order);
  const off = ctx.db.subscribe('ac_tasks', null, () => { clearTimeout(tasks.t); tasks.t = setTimeout(redraw, 400); });

  if (!list.length) {
    const other = ctx.years.filter((y) => y !== year);
    const counts = await Promise.all(other.map(async (y) => [y, (await ctx.db.select('ac_tasks', { eq: { academic_year: y } })).length]));
    const copyable = counts.filter(([, c]) => c > 0);
    el.innerHTML = `<div class="card">
      <h2>ปีการศึกษา ${year} ยังไม่มีคลังงานวิชาการ</h2>
      ${ctx.canEdit ? `<p class="hint">เลือกชุดตั้งต้น แก้ชื่องาน ขอบข่ายหน้าที่ และเพิ่มงานได้ภายหลัง</p>
      <div class="set-pick">
        ${Object.entries(TASK_SETS).map(([k, s]) => `<button data-set="${k}"><b>${esc(s.label)}</b><span>${esc(s.note)}</span></button>`).join('')}
        ${copyable.map(([y, c]) => `<button data-copy="${y}"><b>คัดลอกจากปีการศึกษา ${y}</b><span>${c} งาน พร้อมการจัดภาระงานเดิม (เฉพาะบุคลากรที่ยังปฏิบัติงาน) แล้วปรับเฉพาะส่วนที่เปลี่ยน</span></button>`).join('')}
        <button data-blank><b>เริ่มจากว่าง</b><span>เพิ่มงานเองทีละงาน</span></button>
      </div>` : '<p class="hint">รอฝ่ายวิชาการตั้งค่า</p>'}
    </div>`;
    $$('[data-set]', el).forEach((b) => b.addEventListener('click', async () => {
      const set = TASK_SETS[b.dataset.set];
      await ctx.db.insert('ac_tasks', set.tasks.map((t, i) => ({ academic_year: year, group_name: t.group || '', name: t.name, duties: t.duties, sort_order: i + 1, source: b.dataset.set })));
      toast(`สร้างคลังงาน ${set.tasks.length} งานแล้ว`); ctx.addYear(year); redraw();
    }));
    $$('[data-copy]', el).forEach((b) => b.addEventListener('click', async () => {
      try { const n = await ctx.db.rpc('ac_copy_year', { from_year: Number(b.dataset.copy), to_year: year, with_assignments: true }); toast(`คัดลอก ${n} งานแล้ว`); redraw(); }
      catch (err) { toast(err.message, 'err'); }
    }));
    $('[data-blank]', el)?.addEventListener('click', () => editTask(ctx, { academic_year: year, sort_order: 1 }, [], redraw));
    return off;
  }

  const groups = [...new Set(list.map((t) => t.group_name))];
  let no = 0;
  el.innerHTML = `<div class="card">
    <div class="toolbar"><span class="grow hint">ปีการศึกษา ${year} · ${list.length} งาน · แก้ชื่อหรือขอบข่ายหน้าที่ที่นี่ คำสั่งที่ออกแล้วไม่เปลี่ยนตาม</span>
      ${ctx.canEdit ? `<button class="btn btn-danger" id="t-reset">${icon('trash')} ล้างคลังงานปีนี้</button>
      <button class="btn btn-primary" id="t-add">${icon('plus')} เพิ่มงาน</button>` : ''}</div>
    <div class="task-list">
      ${groups.map((g) => `${g ? `<div class="task-group">${esc(g)}</div>` : ''}${list.filter((t) => t.group_name === g).map((t) => {
        no++; const d = splitLines(t.duties); const idx = list.indexOf(t);
        return `<div class="task-row"><span class="no">${no}</span><div><div class="nm">${esc(t.name)}</div>
          ${d.length ? `<details class="duties"><summary>ขอบข่ายหน้าที่ ${d.length} ข้อ</summary><ol>${d.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>` : '<span class="hint" style="color:var(--amber)">ยังไม่มีขอบข่ายหน้าที่</span>'}</div>
          ${ctx.canEdit ? `<div class="acts"><button class="icon-btn" data-up="${t.id}" ${idx ? '' : 'disabled'} title="เลื่อนขึ้น">${icon('up')}</button>
            <button class="icon-btn" data-down="${t.id}" ${idx < list.length - 1 ? '' : 'disabled'} title="เลื่อนลง">${icon('down')}</button>
            <button class="icon-btn" data-edit="${t.id}" title="แก้ไข">${icon('edit')}</button>
            <button class="icon-btn danger" data-del="${t.id}" title="ลบ">${icon('trash')}</button></div>` : ''}</div>`;
      }).join('')}`).join('')}
    </div></div>`;

  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  $('#t-add', el)?.addEventListener('click', () => editTask(ctx, { academic_year: year, sort_order: list.length + 1, group_name: list[list.length - 1]?.group_name || '' }, groups, redraw));
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => editTask(ctx, byId[b.dataset.edit], groups, redraw)));
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    const t = byId[b.dataset.del];
    if (!(await confirmBox(`ลบ "${t.name}" และการมอบหมายของงานนี้?`, 'ลบ'))) return;
    await ctx.db.remove('ac_tasks', { id: t.id });
    await ctx.db.remove('ac_assignments', { task_id: t.id }).catch(() => {});
    redraw();
  }));
  const move = async (id, dir) => {
    const arr = [...list]; const i = arr.findIndex((t) => t.id === id); const j = i + dir;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (arr[i].group_name !== arr[j].group_name) { const g = arr[i].group_name; arr[i].group_name = arr[j].group_name; arr[j].group_name = g; }
    await Promise.all(arr.map((t, k) => ctx.db.update('ac_tasks', { id: t.id }, { sort_order: k + 1, group_name: t.group_name })));
    redraw();
  };
  $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => move(b.dataset.up, -1)));
  $$('[data-down]', el).forEach((b) => b.addEventListener('click', () => move(b.dataset.down, 1)));
  $('#t-reset', el)?.addEventListener('click', async () => {
    const orders = await ctx.db.select('ac_orders', { eq: { academic_year: year, kind: 'annual' } });
    const issued = orders.some((o) => o.status === 'issued');
    if (!(await confirmBox(`ล้างคลังงานปีการศึกษา ${year} ทั้งหมด ${list.length} งาน และการจัดภาระงานของปีนี้? ${issued ? 'คำสั่งที่ออกแล้วยังอยู่ครบ (เก็บข้อมูลไว้ในตัวคำสั่ง)' : 'คำสั่งฉบับร่างของปีนี้จะเหลือแต่หัวเรื่อง'}`, 'ล้างคลังงาน'))) return;
    for (const t of list) { await ctx.db.remove('ac_assignments', { task_id: t.id }).catch(() => {}); await ctx.db.remove('ac_tasks', { id: t.id }); }
    toast('ล้างคลังงานแล้ว'); redraw();
  });
  return off;
}

async function editTask(ctx, t, groups, redraw) {
  const r = await modal(t.id ? 'แก้ไขงาน' : 'เพิ่มงานวิชาการ', `
    <label>กลุ่มงาน (เว้นว่างได้)<input type="text" name="group_name" list="dl-groups" value="${esc(t.group_name || '')}"></label>
    <label>ชื่องาน<input type="text" name="name" value="${esc(t.name || '')}" required></label>
    <label>ขอบข่ายหน้าที่ (บรรทัดละ 1 ข้อ ไม่ต้องใส่ตัวเลข)<textarea name="duties" rows="8">${esc(t.duties || '')}</textarea></label>
    <datalist id="dl-groups">${groups.filter(Boolean).map((g) => `<option>${esc(g)}</option>`).join('')}</datalist>`, { wide: true });
  if (!r) return;
  const row = { group_name: r.group_name.trim(), name: r.name.trim(), duties: splitLines(r.duties).join('\n') };
  try {
    if (t.id) await ctx.db.update('ac_tasks', { id: t.id }, row);
    else { await ctx.db.insert('ac_tasks', [{ ...row, academic_year: t.academic_year, sort_order: t.sort_order, source: 'custom' }]); ctx.addYear(t.academic_year); }
    toast('บันทึกแล้ว'); redraw();
  } catch (err) { toast(err.message, 'err'); }
}

// ---------------------------------------------------------------------
// ตั้งค่าแอป
// ---------------------------------------------------------------------
async function settings(el, ctx) {
  const a = ctx.ac;
  const dis = ctx.canEdit ? '' : 'disabled';
  el.innerHTML = `<form class="card" id="f-set">
    <h2>การเข้าใช้งาน</h2>
    <label class="inline"><input type="checkbox" name="teachers_enabled" ${a.teachers_enabled ? 'checked' : ''} ${dis}>
      เปิดให้ครูทุกคน (ที่อนุมัติใน WL Admin แล้ว) เข้าดู WL Academic ได้</label>
    <p class="hint">เปิดแล้ว ครูดูข้อมูลได้ และ<b>ส่งเอกสารของตัวเอง</b>ได้ในเมนู "เช็กการส่งงาน" (ต้องผูกบัญชีกับรายชื่อในแท็บบุคลากร) ส่วนอื่นยังแก้ไม่ได้ · ปิดสวิตช์นี้ = เฉพาะผู้ดูแล/ฝ่ายวิชาการ</p>
    <h2 style="margin-top:8px">ค่าตั้งต้นของคำสั่ง</h2>
    <label class="inline"><span>ตัวเลขในคำสั่ง</span>
      <select name="numerals" ${dis}><option value="thai" ${a.numerals !== 'arabic' ? 'selected' : ''}>เลขไทย (๑ ๒ ๓)</option><option value="arabic" ${a.numerals === 'arabic' ? 'selected' : ''}>เลขอารบิก (1 2 3)</option></select></label>
    <div class="stack">
      <label>ย่อหน้าเหตุผล (คำสั่งประจำปี) — ใช้ {ปี} และ {โรงเรียน} แทนค่าอัตโนมัติ<textarea name="order_reason" rows="3" ${dis}>${esc(a.order_reason || ORDER_DEFAULTS.reason)}</textarea></label>
      <label>ย่อหน้าข้อกฎหมาย<textarea name="order_legal" rows="4" ${dis}>${esc(a.order_legal || ORDER_DEFAULTS.legal)}</textarea></label>
      <label>ย่อหน้าปิดท้าย<textarea name="order_closing" rows="2" ${dis}>${esc(a.order_closing || ORDER_DEFAULTS.closing)}</textarea></label>
    </div>
    ${ctx.canEdit ? `<div class="toolbar"><button class="btn btn-primary" type="submit">บันทึก</button><button class="btn btn-ghost" type="button" id="set-reset">คืนข้อความมาตรฐาน</button></div>` : ''}
  </form>`;
  $('#set-reset', el)?.addEventListener('click', () => {
    $('[name=order_reason]', el).value = ORDER_DEFAULTS.reason;
    $('[name=order_legal]', el).value = ORDER_DEFAULTS.legal;
    $('[name=order_closing]', el).value = ORDER_DEFAULTS.closing;
  });
  $('#f-set', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const patch = { teachers_enabled: f.get('teachers_enabled') === 'on', numerals: f.get('numerals'),
      order_reason: f.get('order_reason').trim(), order_legal: f.get('order_legal').trim(), order_closing: f.get('order_closing').trim() };
    try { await ctx.db.upsert('ac_settings', [{ id: 1, ...patch }], 'id'); await ctx.refresh(); toast('บันทึกการตั้งค่าแล้ว'); }
    catch (err) { toast(err.message, 'err'); }
  });
}
