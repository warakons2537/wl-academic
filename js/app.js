import { db } from './db.js';
import { esc, $, $$, toast, indexBy, modal } from './util.js';
import { icon } from './icons.js';
import { mountNav, labelHtml } from './navbar.js';
import { BRAND } from './brand.js';
import { guessAcademicYear } from './thai.js';
import * as home from './views/home.js';
import * as basics from './views/basics.js';
import * as workload from './views/workload.js';
import * as orders from './views/orders.js';
import * as track from './views/track.js';
import * as checklist from './views/checklist.js';

const VIEWS = { home, basics, workload, orders, track, checklist };
const root = document.getElementById('app');
let cleanup = null;
const YEAR_KEY = 'wl-academic-year';

// ---------------------------------------------------------------------
// ข้อมูลกลางที่ทุกหน้าจอใช้ร่วมกัน
// ---------------------------------------------------------------------
async function loadContext(userId) {
  const [profiles, settingsRows, terms] = await Promise.all([
    db.select('profiles', { order: ['full_name'] }),
    db.select('school_settings'),
    db.select('terms', { order: ['academic_year', 'desc'] }),
  ]);
  const me = profiles.find((p) => p.id === userId) || { id: userId, role: 'pending', full_name: '' };
  const ctx = { db, me, isAdmin: me.role === 'admin', profiles, profileById: indexBy(profiles),
    settings: settingsRows[0] || {}, terms };
  if (me.role === 'pending') return ctx;

  const [acRows, staff, taskYears] = await Promise.all([
    db.select('ac_settings'),
    db.select('staff', { order: ['sort_order'] }),
    db.select('ac_tasks', { cols: 'academic_year' }).catch(() => []),
  ]);
  ctx.ac = acRows[0] || { teachers_enabled: false, numerals: 'thai' };
  ctx.canRead = ctx.isAdmin || !!ctx.ac.teachers_enabled;
  ctx.canEdit = ctx.isAdmin;
  ctx.staff = staff.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.first_name.localeCompare(b.first_name, 'th'));
  ctx.staffById = indexBy(ctx.staff);
  ctx.myStaff = ctx.staff.find((s) => s.profile_id === me.id) || null;

  const current = terms.find((t) => t.is_current)?.academic_year || terms[0]?.academic_year || guessAcademicYear();
  const years = new Set([current, ...terms.map((t) => t.academic_year), ...taskYears.map((t) => t.academic_year)]);
  ctx.years = [...years].sort((a, b) => b - a);
  ctx.currentYear = current;
  let saved = null; try { saved = Number(localStorage.getItem(YEAR_KEY)); } catch { /* */ }
  ctx.year = ctx.years.includes(saved) ? saved : current;
  ctx.schoolName = ctx.settings.school_name || '';
  return ctx;
}

// ---------------------------------------------------------------------
// หน้าเข้าสู่ระบบ
// ---------------------------------------------------------------------
function loginCover(sub) {
  return `<div class="login-cover">
    <a class="login-back" href="../" title="กลับหน้าทางเข้า Wangluek (Y.N.) Connected">← กลับหน้าทางเข้า</a>
    <img class="banner" src="img/banner.jpg" alt="${esc(BRAND.name)} — ${esc(BRAND.tagline)}">
    <ul><li>เก็บคลังงานวิชาการ 17 งาน พร้อมขอบข่ายหน้าที่</li><li>จัดภาระงานครูอย่างสมดุล เห็นชัดว่าใครรับกี่งาน</li>
      <li>ออกคำสั่งราชการ A4 ตามระเบียบงานสารบรรณ พิมพ์ PDF หรือส่งออก Word</li></ul>
    <small style="opacity:.8">${sub} · เวอร์ชัน ${esc(BRAND.version)}</small></div>`;
}

function renderLogin() {
  if (db.mode === 'demo') {
    const users = db.auth.demoUsers();
    const roleText = { admin: 'ฝ่ายวิชาการ (ผู้ดูแล)', teacher: 'ครู', pending: 'รออนุมัติ' };
    root.innerHTML = `
      <div class="login"><div class="login-book">${loginCover('โหมดทดลอง · ข้อมูลตัวอย่าง ชื่อบุคลากรสมมติ')}
        <div class="login-form">
          <h1>เข้าใช้งาน</h1>
          <p class="muted small" style="margin:0">เลือกบทบาทที่ต้องการทดลอง</p>
          <div class="who-pick">
            ${users.map((u) => `<button class="btn" data-u="${esc(u.id)}"><span>${esc(u.full_name)}</span>
              <span class="chip ${u.role === 'admin' ? 'chip-info' : u.role === 'pending' ? 'chip-warn' : ''}">${esc(roleText[u.role])}</span></button>`).join('')}
          </div>
        </div></div></div>`;
    $$('[data-u]', root).forEach((b) => b.addEventListener('click', async () => { await db.auth.signIn(b.dataset.u); boot(); }));
    return;
  }
  root.innerHTML = `
    <div class="login"><div class="login-book">${loginCover('ใช้บัญชีเดียวกับ WL Admin')}
      <div class="login-form">
        <h1>เข้าสู่ระบบ</h1>
        <p class="muted small" style="margin:0">ใช้อีเมลและรหัสผ่านเดียวกับ WL Admin ถ้าเข้า WL Admin อยู่แล้วในเบราว์เซอร์นี้ จะเข้าได้ทันทีโดยไม่ต้องกรอก</p>
        <form id="f-login">
          <label>อีเมล<input type="email" name="email" autocomplete="username" required></label>
          <label>รหัสผ่าน<input type="password" name="password" minlength="6" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit" style="justify-content:center;padding-block:10px">เข้าสู่ระบบ</button>
          <p class="muted small" style="margin:0">ยังไม่มีบัญชี? สมัครที่ WL Admin แล้วให้ผู้ดูแลอนุมัติ</p>
        </form>
      </div></div></div>`;
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    try { await db.auth.signIn(f.email, f.password); boot(); } catch (err) { toast(err.message, 'err'); }
  });
}

function messagePage(title, html) {
  root.innerHTML = `<div class="login"><div class="card" style="max-width:480px">
    <img src="${BRAND.logo}" alt="" style="width:56px;height:56px"><h1>${esc(title)}</h1>${html}
    <div class="row"><button class="btn" id="logout">ออกจากระบบ</button></div></div></div>`;
  $('#logout').addEventListener('click', async () => { await db.auth.signOut(); boot(); });
}

// ---------------------------------------------------------------------
// โครงหน้าหลัก
// ---------------------------------------------------------------------
const schoolLine = (ctx) => (ctx.schoolName ? `โรงเรียน${ctx.schoolName}` : 'ยังไม่ได้ตั้งชื่อโรงเรียน');

// ​ = จุดตัดบรรทัดที่ระบุเอง (กันตัดกลางคำบนเมนูแคบ)
const NAV = { home: 'หน้าแรก', basics: 'ข้อมูล​พื้นฐาน', workload: 'จัดภาระ​งาน', orders: 'ออกคำสั่ง', track: 'ติดตามงาน', checklist: 'เช็กการ​ส่งงาน' };
const BAR = ['home', 'workload', 'orders', 'track'];      // แถบเมนูล่างบนมือถือ
const MORE = ['basics', 'checklist'];                      // อยู่ในแผง "เพิ่มเติม"
let navCtl = null;

function renderShell(ctx) {
  const item = (v) => `<a href="#${v}" data-v="${v}">${icon(v)}<span>${labelHtml(NAV[v])}</span></a>`;
  const soon = (ic, label) => `<span class="soon" title="ระยะถัดไป">${icon(ic)}<span>${labelHtml(label)}</span></span>`;
  const name = ctx.me.full_name || ctx.me.email || '';
  root.innerHTML = `
    <div class="shell">
      <aside class="side no-print">
        <div class="brand"><img class="mark" src="${BRAND.logo}" alt=""><b>${esc(BRAND.name)}</b></div>
        <nav class="nav">
          ${item('home')}
          <div class="sec">ตั้งต้น</div>
          ${item('basics')}
          <div class="sec">งานวิชาการ</div>
          ${item('workload')}
          ${item('orders')}
          ${item('track')}
          ${item('checklist')}
          <div class="sec">ระยะถัดไป</div>
          ${soon('trophy', 'คลังผลงาน')}
          ${soon('report', 'รายงาน​SAR/PA')}
          ${BRAND.siblings.length ? `<div class="sec">แอปในเครือ</div>${BRAND.siblings.map((s) => `<a href="${esc(s.url)}" class="ext">${icon('link')}<span>${esc(s.name)}</span></a>`).join('')}` : ''}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar no-print">
          <div class="tb-title"><b>${esc(BRAND.name)}</b><small id="brand-school">${esc(schoolLine(ctx))}</small></div>
          <label class="tb-year"><span>ปีการศึกษา</span><select id="year" aria-label="ปีการศึกษา">${yearOptions(ctx)}</select></label>
          <div class="tb-user"><span class="avatar" aria-hidden="true">${esc((name.replace(/^(ครู|นาย|นางสาว|นาง)\s*/, '').replace(/^[เแโใไ]/, '')[0]) || '?')}</span>
            <span class="nm"><b title="${esc(name)}">${esc(name)}</b>${ctx.canEdit ? '' : '<small>ดูอย่างเดียว</small>'}</span>
            <button class="btn btn-sm" id="logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${icon('logout')}</button></div>
        </header>
        <div class="main-pad">${db.mode === 'demo' ? `<div class="demo-bar no-print"><span><b>โหมดทดลอง</b> ข้อมูลตัวอย่าง (ชื่อสมมติ) เก็บในเบราว์เซอร์นี้เท่านั้น</span>
        <button class="btn btn-sm" id="demo-reset">ล้างข้อมูลทดลอง</button></div>` : ''}<div class="main-inner" id="view"></div></div>
        <footer class="app-ver no-print">${esc(BRAND.name)} เวอร์ชัน ${esc(BRAND.version)}</footer></main>
    </div>
    <div id="bnav-root"></div>`;
  navCtl = mountNav($('#bnav-root'), { labels: NAV, bar: BAR, more: MORE, ext: BRAND.siblings });
  $('#logout').addEventListener('click', async () => { await db.auth.signOut(); boot(); });
  $('#demo-reset')?.addEventListener('click', async () => { db.resetDemo(); await db.auth.signOut(); boot(); });
  const onYear = async (e) => {
    if (e.target.value === 'new') {
      const next = Math.max(...ctx.years) + 1;
      const r = await modal('เพิ่มปีการศึกษา', `<label>ปีการศึกษา (พ.ศ.)<input type="number" name="y" value="${next}" min="2560" max="2700" required></label>
        <p class="hint">ใช้เตรียมคลังงานและจัดภาระงานล่วงหน้า (คัดลอกจากปีก่อนได้ในหน้า ข้อมูลพื้นฐาน › คลังงานวิชาการ)</p>`, { okText: 'เพิ่ม' });
      const y = Number(r?.y);
      if (y >= 2560 && y <= 2700) { ctx.addYear(y); location.hash = 'basics?tab=tasks'; route(ctx); } else drawYears(ctx);
      return;
    }
    ctx.year = Number(e.target.value);
    try { localStorage.setItem(YEAR_KEY, String(ctx.year)); } catch { /* */ }
    drawYears(ctx);
    route(ctx);
  };
  $('#year').addEventListener('change', onYear);
}

const yearOptions = (ctx) => ctx.years.map((y) => `<option ${y === ctx.year ? 'selected' : ''}>${y}</option>`).join('')
  + (ctx.canEdit ? '<option value="new">+ เพิ่มปี…</option>' : '');
function drawYears(ctx) {
  const sel = document.getElementById('year'); if (sel) sel.innerHTML = yearOptions(ctx);
}

async function route(ctx) {
  const v = (location.hash.replace('#', '') || 'home').split('?')[0];
  const view = VIEWS[v] ? v : 'home';
  $$('.nav a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
  navCtl?.setView(view);
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  const el = $('#view');
  el.innerHTML = '<div class="loading" role="status"><i class="bar"></i><span>กำลังโหลด…</span></div>';
  try { cleanup = (await VIEWS[view].render(el, ctx)) || null; }
  catch (err) { console.error(err); el.innerHTML = `<div class="card"><h2>เปิดหน้านี้ไม่สำเร็จ</h2><p>${esc(err.message)}</p></div>`; }
  window.scrollTo(0, 0);
}

// ตารางโครงสร้าง — เครื่องอื่นแก้แล้วโหลดชุดนี้ใหม่
const STRUCTURE = ['profiles', 'school_settings', 'terms', 'ac_settings', 'staff'];
const KEEP = new Set(['refresh', 'go', 'params', 'year', 'addYear']);
let hashHandler = null;
let structureOffs = [];

function makeLive(ctx, userId) {
  let chain = Promise.resolve();
  const load = async () => {
    const fresh = await loadContext(userId);
    delete fresh.year;
    for (const k of Object.keys(ctx)) if (!KEEP.has(k) && !(k in fresh)) delete ctx[k];
    Object.assign(ctx, fresh);
    if (!ctx.years.includes(ctx.year)) ctx.years = [...ctx.years, ctx.year].sort((a, b) => b - a);
    const sc = document.getElementById('brand-school'); if (sc) sc.textContent = schoolLine(ctx);
    drawYears(ctx);
  };
  ctx.refresh = () => { const p = chain.then(load, load); chain = p.catch(() => {}); return p; };
  ctx.go = (view, params = {}) => { ctx.params = params; location.hash = view; };
  ctx.addYear = (y) => {
    if (!ctx.years.includes(y)) ctx.years = [...ctx.years, y].sort((a, b) => b - a);
    ctx.year = y; try { localStorage.setItem(YEAR_KEY, String(y)); } catch { /* */ }
    drawYears(ctx);
  };
  return ctx;
}

function watchStructure(ctx) {
  structureOffs.forEach((f) => { try { f(); } catch { /* */ } });
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => ctx.refresh().then(() => {
    if (!ctx.canRead) boot();
  }).catch(() => {}), 400); };
  structureOffs = STRUCTURE.map((table) => db.subscribe(table, null, later));
}

async function boot() {
  if (hashHandler) window.removeEventListener('hashchange', hashHandler);
  structureOffs.forEach((f) => { try { f(); } catch { /* */ } }); structureOffs = [];
  const s = await db.auth.session();
  if (!s) return renderLogin();
  let ctx;
  try { ctx = await loadContext(s.user.id); }
  catch (err) {
    const missing = /ac_settings|staff|relation .* does not exist|schema cache/i.test(err.message);
    messagePage(missing ? 'ยังไม่ได้ติดตั้งฐานข้อมูล WL Academic' : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ',
      missing ? '<p>ผู้ดูแลต้องรันไฟล์ <code>supabase/academic.sql</code> ใน Supabase &gt; SQL Editor ก่อน (ดูคู่มือ docs/SETUP.md)</p>'
        : `<p>${esc(err.message)}</p>`);
    return;
  }
  if (ctx.me.role === 'pending') {
    messagePage('รอการอนุมัติ', `<p>บัญชี ${esc(ctx.me.email || ctx.me.full_name)} ยังรอผู้ดูแลอนุมัติใน WL Admin (ตั้งค่าระบบ &gt; ผู้ใช้)</p>`);
    return;
  }
  if (!ctx.canRead) {
    messagePage('ยังไม่เปิดให้ครูใช้งาน', '<p>ตอนนี้ WL Academic เปิดเฉพาะฝ่ายวิชาการ เมื่อโรงเรียนพร้อม ผู้ดูแลจะเปิดให้ครูทุกคนเข้าใช้ได้</p>');
    return;
  }
  makeLive(ctx, s.user.id);
  renderShell(ctx);
  watchStructure(ctx);
  hashHandler = () => route(ctx);
  window.addEventListener('hashchange', hashHandler);
  route(ctx);
}

db.auth.onChange(() => {});
boot();
