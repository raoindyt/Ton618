// Galaxy-style static star background with nebula glow
let _ctx = null, _canvas = null;
let _w = 0, _h = 0, _dpr = 1;
let _stars = [];
let _enabled = true; // reflects settings toggle

function _rand(min, max){ return Math.random() * (max - min) + min; }

function _generateStars(){
  const area = _w * _h;
  const baseCount = Math.max(350, Math.min(1200, Math.floor(area / 1800)));
  _stars = [];
  // base faint stars
  for (let i = 0; i < baseCount; i++){
    _stars.push({ x: Math.random()*_w, y: Math.random()*_h, r: _rand(0.4,1.2), a: _rand(0.15,0.6), glow: _rand(0,0.8), color: '#ffffff' });
  }
  // brighter clustered stars along a diagonal (galactic band)
  const clusterCount = Math.floor(baseCount * 0.08);
  for (let i = 0; i < clusterCount; i++){
    const t = Math.random();
    const x = t * _w + _rand(-60, 60);
    const y = (1 - t) * _h + _rand(-60, 60);
    _stars.push({ x, y, r: _rand(1.2, 2.4), a: _rand(0.7, 1), glow: _rand(2, 6), color: Math.random() < 0.5 ? '#aee3ff' : '#ffd1ff' });
  }
}

function _resize(){
  if (!_canvas) return;
  _w = Math.floor(innerWidth);
  _h = Math.floor(innerHeight);
  _dpr = Math.min(2, window.devicePixelRatio || 1);
  _canvas.width = Math.floor(_w * _dpr);
  _canvas.height = Math.floor(_h * _dpr);
  _canvas.style.width = _w + 'px';
  _canvas.style.height = _h + 'px';
  if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  _generateStars();
  if (_enabled && !document.hidden) _render();
}

function _render(){
  if (!_ctx) return;

  // Deep space base gradient
  const g = _ctx.createLinearGradient(0, 0, _w, _h);
  g.addColorStop(0, '#0b0a16');
  g.addColorStop(0.5, '#0d0c1d');
  g.addColorStop(1, '#0a0a14');
  _ctx.globalCompositeOperation = 'source-over';
  _ctx.globalAlpha = 1;
  _ctx.shadowBlur = 0;
  _ctx.fillStyle = g;
  _ctx.fillRect(0, 0, _w, _h);

  // Nebulae soft glows (purple/magenta/cyan) to mimic the provided image
  const R = Math.max(_w, _h);
  const nebulae = [
    { x: _w * 0.65, y: _h * 0.25, r: R * 0.45, c1: 'rgba(110,86,255,0.10)' },
    { x: _w * 0.35, y: _h * 0.70, r: R * 0.50, c1: 'rgba(255,94,203,0.08)' },
    { x: _w * 0.80, y: _h * 0.80, r: R * 0.30, c1: 'rgba(90,220,255,0.06)' }
  ];
  nebulae.forEach(n => {
    const rg = _ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    rg.addColorStop(0, n.c1);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    _ctx.globalCompositeOperation = 'lighter';
    _ctx.fillStyle = rg;
    _ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  });

  // Stars
  _ctx.globalCompositeOperation = 'lighter';
  for (const s of _stars){
    if (s.glow > 1.5){
      _ctx.shadowBlur = 2 * s.glow;
      _ctx.shadowColor = s.color || '#ffffff';
    } else {
      _ctx.shadowBlur = 0;
    }
    _ctx.globalAlpha = s.a;
    _ctx.fillStyle = s.color || 'rgba(255,255,255,' + s.a + ')';
    _ctx.beginPath();
    _ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    _ctx.fill();
  }
  _ctx.globalAlpha = 1;
  _ctx.shadowBlur = 0;
  _ctx.globalCompositeOperation = 'source-over';
}

function _start(){
  if (!_enabled || document.hidden) return;
  if (_canvas) _canvas.style.display = 'block';
  _render();
}

function _stop(){
  if (_ctx) _ctx.clearRect(0, 0, _w, _h);
  if (_canvas) _canvas.style.display = 'none';
}

export function initStars(){
  _canvas = document.getElementById('bg-stars');
  if (!_canvas) return;
  _ctx = _canvas.getContext('2d');
  addEventListener('resize', _resize);
  _resize();
  document.addEventListener('visibilitychange', () => { if (document.hidden) _stop(); else if (_enabled) _start(); });
}

export function setStarsEnabled(enabled){
  if (!_canvas) return;
  _enabled = !!enabled;
  if (_enabled) _start(); else _stop();
}
