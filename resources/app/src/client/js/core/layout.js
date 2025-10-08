// Layout utilities: keep content clear of the fixed player and adapt to viewport
// Keeps scripts modular and small (<300 lines)

let ro;
let lastMini = null;

function setCSSVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

function measurePlayer() {
  const player = document.querySelector('.player');
  if (!player) return;
  const rect = player.getBoundingClientRect();
  const h = Math.ceil(rect.height);
  setCSSVar('--player-h', `${h}px`);
}

function observePlayerResize() {
  const player = document.querySelector('.player');
  if (!player || typeof ResizeObserver === 'undefined') return;
  ro = new ResizeObserver(() => measurePlayer());
  ro.observe(player);
}

function onWindowResize() {
  // Debounce recalculation
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(()=>{ measurePlayer(); applyViewportFlags(); updateVH(); }, 50); });
}

function applyViewportFlags() {
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  document.body.classList.toggle('is-compact', w < 860);
  const isShort = h < 800; // short viewport threshold (raise for desktops with taskbars, windowed modes)
  document.body.classList.toggle('is-short', isShort);
  const player = document.querySelector('.player');
  if (player) {
    if (lastMini !== isShort) {
      player.classList.toggle('mini', isShort);
      lastMini = isShort;
      // re-measure after class change
      requestAnimationFrame(measurePlayer);
    }
  }
}

function updateVH(){
  // Fix mobile browser UI affecting 100vh
  const vh = window.innerHeight * 0.01;
  setCSSVar('--vh', `${vh}px`);
}

export function initLayout() {
  // Initial measure on next frame to ensure styles applied
  requestAnimationFrame(() => { updateVH(); measurePlayer(); observePlayerResize(); });
  onWindowResize();
  applyViewportFlags();
}
