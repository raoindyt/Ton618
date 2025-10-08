import { player } from '../player.js';

function fmtHz(freq){
  return freq >= 1000 ? `${(freq/1000).toFixed(freq % 1000 === 0 ? 0 : 1)} kHz` : `${freq} Hz`;
}

function lerp(a,b,t){ return a + (b-a)*t; }
function logSpaceLerp(x, x1, x2){
  // x, x1, x2 are frequencies; compute normalized t in log10 domain
  const lx = Math.log10(x), l1 = Math.log10(x1), l2 = Math.log10(x2);
  if (l2 - l1 === 0) return 0; return (lx - l1) / (l2 - l1);
}

// Interpolate preset anchor points (freq->gain) across band list
function buildPresetGains(bandFreqs, anchors){
  const keys = Object.keys(anchors).map(Number).sort((a,b)=>a-b);
  return bandFreqs.map(f=>{
    // below min
    if (f <= keys[0]) return anchors[keys[0]];
    // above max
    if (f >= keys[keys.length-1]) return anchors[keys[keys.length-1]];
    // between
    for (let i=0;i<keys.length-1;i++){
      const f1 = keys[i], f2 = keys[i+1];
      if (f>=f1 && f<=f2){
        const t = logSpaceLerp(f, f1, f2);
        return lerp(anchors[f1], anchors[f2], t);
      }
    }
    return 0;
  });
}

export function initEqualizer(){
  const root = document.getElementById('eq-ui');
  if (!root) return;

  // Ensure audio graph and filters exist
  player.ensureAudioGraph?.();

  const freqs = player.getEqBandDefs();
  const gains = player.getEqGains();

  // Advanced presets (anchor points, dB)
  const presets = {
    Flat: () => freqs.map(()=>0),
    BassBoost: () => buildPresetGains(freqs, {20:8, 40:7, 63:6, 100:4, 160:2, 250:1, 500:0, 1000:-1, 4000:-2, 10000:-3, 16000:-4}),
    TrebleBoost: () => buildPresetGains(freqs, {63:-3, 160:-2, 250:-1, 500:0, 1000:1, 2500:3, 4000:5, 6300:6, 10000:7, 16000:8, 20000:9}),
    Loudness: () => buildPresetGains(freqs, {20:6, 63:4, 250:0, 1000:0, 4000:2, 10000:4, 16000:6}),
    Vocal: () => buildPresetGains(freqs, {125:-2, 250:-1, 500:1, 1000:3, 2000:4, 4000:3, 8000:1, 16000:0}),
    Rock: () => buildPresetGains(freqs, {31:4, 63:3, 125:1, 250:0, 500:1, 1000:2, 2000:3, 4000:4, 8000:5, 16000:4}),
    Pop: () => buildPresetGains(freqs, {31:-1, 63:0, 125:1, 250:2, 500:1, 1000:0, 2000:2, 4000:3, 8000:4, 16000:5}),
    Dance: () => buildPresetGains(freqs, {31:5, 63:4, 125:2, 250:0, 500:-1, 1000:0, 2000:2, 4000:4, 8000:5, 16000:6})
  };

  const presetNames = Object.keys(presets);

  // Build UI
  root.innerHTML = `
    <div class="eq-header">
      <h2>Эквалайзер</h2>
      <div class="eq-presets">
        ${presetNames.map(name => `<button class="eq-preset" data-preset="${name}">${name}</button>`).join('')}
        <button class="eq-preset outline" data-preset="Flat">Сброс</button>
      </div>
    </div>
    <div class="eq-controls">
      <label>Предусиление <input id="eq-preamp" type="range" min="-24" max="24" step="0.5" /></label>
      <label>Q <input id="eq-q" type="range" min="0.4" max="2.0" step="0.05" /></label>
      <label>HPF <input id="eq-hpf" type="range" min="10" max="1000" step="5" /></label>
      <label>LPF <input id="eq-lpf" type="range" min="1000" max="20000" step="50" /></label>
      <label class="switch"><input id="eq-bypass" type="checkbox" /><span class="slider"></span></label><span style="margin-left:6px">Обход</span>
      <label class="switch" style="margin-left:10px"><input id="eq-limiter" type="checkbox" /><span class="slider"></span></label><span style="margin-left:6px">Лимитер</span>
    </div>
    <div class="eq-sliders"></div>
  `;

  const bandWrap = root.querySelector('.eq-sliders');
  // Horizontal scroll for many bands
  bandWrap.style.overflowX = 'auto';
  bandWrap.style.paddingBottom = '6px';

  // Create band sliders
  const bands = freqs.map((f, i) => {
    const div = document.createElement('div');
    div.className = 'eq-band';
    div.dataset.index = String(i);
    div.innerHTML = `
      <input type="range" min="-12" max="12" step="0.5" value="${gains[i] || 0}" orient="vertical" />
      <div class="eq-value">${(gains[i] || 0).toFixed(1)} dB</div>
      <div class="eq-label">${fmtHz(f)}</div>
    `;
    // Tooltips
    div.title = `Band ${fmtHz(f)}: Adjust gain in dB`;
    bandWrap.appendChild(div);
    return div;
  });

  // Wire band sliders
  for (const band of bands) {
    const idx = Number(band.dataset.index);
    const input = band.querySelector('input');
    const val = band.querySelector('.eq-value');
    // Helper to update WebKit fill percent
    const updatePct = () => {
      const min = parseFloat(input.min); const max = parseFloat(input.max); const v = parseFloat(input.value);
      const pct = ((v - min) / (max - min)) * 100;
      input.style.setProperty('--pct', `${pct}%`);
    };
    updatePct();

    input.title = `Gain for ${bands[idx]?.querySelector('.eq-label')?.textContent || ''}`;
    val.title = 'Click to set exact dB value';

    input.addEventListener('input', () => {
      const g = parseFloat(input.value);
      val.textContent = `${g.toFixed(1)} dB`;
      player.setEqGain(idx, g);
      updatePct();
    });

    // Click-to-edit popover for precise dB
    val.addEventListener('click', (e) => {
      openDbPopover(e.currentTarget, parseFloat(input.value) || 0, (newDb) => {
        const g = Math.max(-12, Math.min(12, newDb));
        input.value = String(g);
        val.textContent = `${g.toFixed(1)} dB`;
        player.setEqGain(idx, g);
        updatePct();
      });
    });
  }

  // Controls initial values
  const elPre = root.querySelector('#eq-preamp');
  const elQ = root.querySelector('#eq-q');
  const elHPF = root.querySelector('#eq-hpf');
  const elLPF = root.querySelector('#eq-lpf');
  const elBy = root.querySelector('#eq-bypass');
  const elLim = root.querySelector('#eq-limiter');
  elPre.value = String(player.preGainDb || 0);
  elQ.value = String(player.globalQ || 1.0);
  elHPF.value = String(player.hpfFreq || 20);
  elLPF.value = String(player.lpfFreq || 20000);
  elBy.checked = !player.isEqEnabled?.() ? true : false;
  elLim.checked = !!player.limiterEnabled;

  // Tooltips for controls
  (root.querySelector('#eq-preamp')?.parentElement)?.setAttribute('title','Предусиление: общий уровень до эквалайзера');
  (root.querySelector('#eq-q')?.parentElement)?.setAttribute('title','Q: ширина полос всех полос EQ (больше = уже)');
  (root.querySelector('#eq-hpf')?.parentElement)?.setAttribute('title','HPF: частота среза высокочастотного фильтра (убирает саб-бас)');
  (root.querySelector('#eq-lpf')?.parentElement)?.setAttribute('title','LPF: частота среза низкочастотного фильтра (убирает ультра-верха)');
  root.querySelector('#eq-bypass')?.parentElement?.setAttribute('title','Обход: отключить обработку EQ');
  root.querySelector('#eq-limiter')?.parentElement?.setAttribute('title','Лимитер: компрессор после EQ');

  elPre.addEventListener('input', ()=> player.setPreGainDb(parseFloat(elPre.value)));
  elQ.addEventListener('input', ()=> player.setGlobalQ(parseFloat(elQ.value)));
  elHPF.addEventListener('input', ()=> player.setHighpassFreq(parseFloat(elHPF.value)));
  elLPF.addEventListener('input', ()=> player.setLowpassFreq(parseFloat(elLPF.value)));
  elBy.addEventListener('change', ()=> player.setEqEnabled(!elBy.checked));
  elLim.addEventListener('change', ()=> player.setLimiterEnabled(!!elLim.checked));

  // Presets apply across 31 bands
  root.querySelectorAll('.eq-preset').forEach(btn => {
    // Tooltip on preset button
    btn.title = `Apply ${btn.dataset.preset} preset`;
    btn.addEventListener('click', () => {
      const name = btn.dataset.preset;
      const arr = (presets[name] ? presets[name]() : presets.Flat());
      bands.forEach((band, i) => {
        const input = band.querySelector('input');
        const val = band.querySelector('.eq-value');
        const g = Math.max(-12, Math.min(12, arr[i] ?? 0));
        input.value = String(g);
        val.textContent = `${g.toFixed(1)} dB`;
        player.setEqGain(i, g);
        // Update fill percent visual
        const min = parseFloat(input.min); const max = parseFloat(input.max);
        const pct = ((g - min) / (max - min)) * 100;
        input.style.setProperty('--pct', `${pct}%`);
      });
    });
  });

  // Popover implementation
  let activePopover = null;
  function openDbPopover(anchorEl, initialDb, onSubmit){
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'eq-popover';
    pop.innerHTML = `
      <div class="row"><label style="min-width:48px">Усиление</label><input type="number" id="eq-db-input" step="0.1" min="-12" max="12" value="${Number(initialDb).toFixed(1)}" /></div>
      <div class="actions">
        <button id="eq-db-cancel">Отмена</button>
        <button id="eq-db-apply" class="primary">Применить</button>
      </div>
    `;
    document.body.appendChild(pop);

    const rect = anchorEl.getBoundingClientRect();
    const x = rect.left + window.scrollX - 10;
    const y = rect.top + window.scrollY - (pop.offsetHeight || 80) - 8;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;

    const input = pop.querySelector('#eq-db-input');
    const apply = () => { const v = parseFloat(input.value); if (!isNaN(v)) onSubmit(v); closePopover(); };
    pop.querySelector('#eq-db-apply').addEventListener('click', apply);
    pop.querySelector('#eq-db-cancel').addEventListener('click', closePopover);
    input.addEventListener('keydown', (e)=>{ if (e.key==='Enter') apply(); if (e.key==='Escape') closePopover(); });
    setTimeout(()=> input.focus({ preventScroll:true }), 0);
    activePopover = pop;

    // Close on outside click
    setTimeout(()=>{
      const onDoc = (ev)=>{ if (activePopover && !activePopover.contains(ev.target)) closePopover(); };
      document.addEventListener('mousedown', onDoc, { once:true });
    }, 0);
  }
  function closePopover(){ if (activePopover){ activePopover.remove(); activePopover = null; } }
}
