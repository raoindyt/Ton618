// Core DOM helpers and common UI utilities

export function qs(sel) { return document.querySelector(sel); }
export function qsa(sel) { return document.querySelectorAll(sel); }

export function setActiveView(name){
  qsa('.view').forEach(v => v.classList.remove('active'));
  const view = qs(`#view-${name}`);
  if (view) view.classList.add('active');
  qsa('.sidebar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  try { document.dispatchEvent(new CustomEvent('viewchange', { detail: { view: name } })); } catch {}
}

export function attachPills(){
  const pills = qsa('#search-pills .pill');
  pills.forEach(p => p.addEventListener('click', () => {
    pills.forEach(x => x.classList.remove('active'));
    p.classList.add('active');
  }));
}
