// แถบเมนูล่างสำหรับจอแคบ (<600px) + แผง "เพิ่มเติม" — รูปแบบเดียวกับ WL Admin
import { icon } from './icons.js';
import { esc } from './util.js';

// ชื่อเมนูที่มีจุดตัดบรรทัด (​) → ห่อแต่ละท่อนไม่ให้ตัดกลางคำ
export const labelHtml = (t) => t.split('​').map((w) => `<span class="w">${esc(w)}</span>`).join('​');
let cur = null;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cur?.close(); });

// bar = เมนูบนแถบล่าง · more = เมนูในแผงเพิ่มเติม · ext = ลิงก์แอปในเครือ [{name,url}]
export function mountNav(host, { labels, bar, more, ext = [] }) {
  let view = 'home', open = false;
  const link = (v) => `<a href="#${v}" data-v="${v}">${icon(v)}<span>${labelHtml(labels[v])}</span></a>`;
  const extLink = (s) => `<a href="${esc(s.url)}">${icon('link')}<span>${esc(s.name)}</span></a>`;

  function draw() {
    host.innerHTML = `
      <nav class="bnav no-print" aria-label="เมนูหลัก">
        ${bar.map(link).join('')}
        <button type="button" data-act="more" aria-haspopup="dialog" aria-expanded="${open}">${icon('more')}<span>เพิ่มเติม</span></button>
      </nav>
      <div class="sheet-wrap no-print"${open ? '' : ' hidden'}>
        <div class="sheet" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด"><div class="sheet-grip"></div>
          <div class="sheet-list">${more.map(link).join('')}${ext.map(extLink).join('')}</div></div>
      </div>`;
    mark();
  }
  function mark() {
    host.querySelectorAll('[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
    host.querySelector('[data-act="more"]')?.classList.toggle('on', more.includes(view));
  }
  function setOpen(v) {
    open = v; draw();
    if (v) host.querySelector('.sheet a')?.focus();
  }
  host.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('sheet-wrap') || t.closest('.sheet a')) return setOpen(false);
    if (t.closest('[data-act="more"]')) setOpen(!open);
  });
  draw();
  const ctl = { setView(v) { view = v; mark(); }, close() { if (open) setOpen(false); } };
  cur = ctl;
  return ctl;
}
