class Player {
  constructor() {
    this.audio = new Audio();
    this.queue = [];
    this.index = -1;
    this.ctx = null; // AudioContext
    this.analyser = null;
    this.srcNode = null; // MediaElementSource
    // Mega EQ state
    this.eqFilters = [];
    this.eqBandDefs = [
      20, 25, 31, 40, 50, 63, 80, 100, 125, 160,
      200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
      2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
    ];
    this.eqGains = new Array(this.eqBandDefs.length).fill(0);
    // Default OFF to minimize CPU; user can enable via UI
    this.eqEnabled = false;
    this.globalQ = 1.0; // bandwidth control
    this.preGainDb = 0; // input preamp
    this.hpfFreq = 20; // high-pass cutoff
    this.lpfFreq = 20000; // low-pass cutoff
    // Nodes
    this.preGain = null;
    this.hpfNode = null;
    this.lpfNode = null;
    this.compressor = null;
    // Default OFF to minimize CPU; user can enable via UI
    this.limiterEnabled = false;
    this.shuffle = false;
    this.repeat = 'off'; // 'off' | 'one' | 'all'
    this._repeatOncePlayed = false; // internal flag for 'one' behavior
    this._lastProgressUi = 0; // throttle timestamp for timeupdate UI

    const vol = document.getElementById('volume');
    vol.addEventListener('input', () => { this.audio.volume = parseFloat(vol.value); });

    const seek = document.getElementById('seek');
    this.audio.addEventListener('timeupdate', () => {
      if (document.hidden) return;
      const now = performance.now();
      if (now - this._lastProgressUi < 250) return; // update at ~4 Hz
      this._lastProgressUi = now;
      if (!isNaN(this.audio.duration)) seek.value = (this.audio.currentTime / this.audio.duration) * 100;
    });
    seek.addEventListener('input', () => {
      if (!isNaN(this.audio.duration)) this.audio.currentTime = (parseFloat(seek.value) / 100) * this.audio.duration;
    });

    const playBtn = document.getElementById('btn-play');
    const playUse = document.getElementById('play-icon-use');
    const curEl = document.getElementById('current-time');
    const durEl = document.getElementById('duration-time');
    // toggles
    this.elShuffle = document.getElementById('btn-shuffle');
    this.elRepeat = document.getElementById('btn-repeat');
    this.elRepeatIconUse = document.getElementById('repeat-icon-use');
    this.elRepeatLabel = document.getElementById('repeat-label');

    const fmt = (t)=>{ if(!isFinite(t)) return '0:00'; const m=Math.floor(t/60); const s=Math.floor(t%60); return `${m}:${s.toString().padStart(2,'0')}`};

    const updatePlayIcon = ()=> { if (document.hidden) return; playUse.setAttribute('href', this.audio.paused ? '#i-play' : '#i-pause'); };
    this.audio.addEventListener('play', updatePlayIcon);
    this.audio.addEventListener('pause', updatePlayIcon);

    playBtn.addEventListener('click', () => this.toggle());
    document.getElementById('btn-next').addEventListener('click', () => this.next());
    document.getElementById('btn-prev').addEventListener('click', () => this.prev());

    this.audio.addEventListener('loadedmetadata', ()=>{ if (document.hidden) return; durEl.textContent = fmt(this.audio.duration||0); });
    this.audio.addEventListener('timeupdate', ()=>{
      if (document.hidden) return;
      const now = performance.now();
      if (now - this._lastProgressUi < 250) return; // share the same throttle
      // do not set _lastProgressUi here; it's set in the other handler
      curEl.textContent = fmt(this.audio.currentTime||0);
    });
    this.audio.addEventListener('ended', () => this.onEnded());

    // hotkeys
    window.addEventListener('keydown',(e)=>{
      if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code==='Space'){ e.preventDefault(); this.toggle(); }
      if (e.code==='ArrowRight'){ this.seekRelative(5); }
      if (e.code==='ArrowLeft'){ this.seekRelative(-5); }
      if (e.code==='ArrowUp'){ this.volumeRelative(0.05); }
      if (e.code==='ArrowDown'){ this.volumeRelative(-0.05); }
    });

    // toggles listeners
    if (this.elShuffle) this.elShuffle.addEventListener('click', () => this.toggleShuffle());
    if (this.elRepeat) this.elRepeat.addEventListener('click', () => this.cycleRepeat());
    this.updateToggleUI();
  }

  ensureAudioGraph() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
      } catch {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      this.analyser = this.ctx.createAnalyser();
      // Smaller FFT reduces CPU while keeping features usable
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.85;
      this.srcNode = this.ctx.createMediaElementSource(this.audio);
      // Utility
      const dbToGain = (db) => Math.pow(10, db / 20);
      // Preamp
      this.preGain = this.ctx.createGain();
      this.preGain.gain.value = dbToGain(this.preGainDb || 0);
      // High-pass and Low-pass filters
      this.hpfNode = this.ctx.createBiquadFilter();
      this.hpfNode.type = 'highpass';
      this.hpfNode.frequency.value = this.hpfFreq || 20;
      this.hpfNode.Q.value = 0.707;
      this.lpfNode = this.ctx.createBiquadFilter();
      this.lpfNode.type = 'lowpass';
      this.lpfNode.frequency.value = this.lpfFreq || 20000;
      this.lpfNode.Q.value = 0.707;
      // Build peaking EQ filters
      this.eqFilters = this.eqBandDefs.map((freq, idx) => {
        const f = this.ctx.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = this.globalQ || 1.0;
        f.gain.value = this.eqGains[idx] || 0;
        return f;
      });
      // Dynamics compressor (acts as limiter)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -6;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      // Connect graph
      this._reconnectGraph();
    }
  }

  _reconnectGraph() {
    if (!this.ctx) return;
    try {
      // Disconnect everything first
      [this.srcNode, this.preGain, this.hpfNode, this.lpfNode, this.analyser, this.compressor, ...this.eqFilters].forEach(n=>{ try { n.disconnect(); } catch {} });
    } catch {}
    // src -> preGain -> hpf -> (eq chain or bypass) -> lpf -> analyser -> compressor -> destination
    this.srcNode.connect(this.preGain);
    this.preGain.connect(this.hpfNode);
    if (this.eqEnabled && this.eqFilters.length) {
      this.hpfNode.connect(this.eqFilters[0]);
      for (let i = 0; i < this.eqFilters.length - 1; i++) this.eqFilters[i].connect(this.eqFilters[i + 1]);
      this.eqFilters[this.eqFilters.length - 1].connect(this.lpfNode);
    } else {
      this.hpfNode.connect(this.lpfNode);
    }
    this.lpfNode.connect(this.analyser);
    if (this.limiterEnabled) {
      this.analyser.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    } else {
      this.analyser.connect(this.ctx.destination);
    }
  }

  setQueue(list, startIndex = 0) {
    this.queue = Array.isArray(list) ? list : [];
    this.index = this.queue.length ? Math.max(0, Math.min(this.queue.length - 1, startIndex)) : -1;
    if (this.index >= 0) this.playIndex(this.index);
  }

  addAndPlay(item) {
    this.queue.push(item);
    this.index = this.queue.length - 1;
    this.playIndex(this.index);
  }

  async playIndex(i) {
    const t = this.queue[i];
    if (!t) return;
    this.index = i;
    // Reset single-repeat flag when we explicitly start a track
    this._repeatOncePlayed = false;
    this.audio.src = t.src;
    this.ensureAudioGraph();
    // Resume AudioContext before playing to ensure it's not suspended
    try { if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume(); } catch {}
    try { await this.audio.play(); } catch {}
    document.getElementById('now-title').textContent = t.title || t.src;
    document.getElementById('now-artist').textContent = t.artist || '';
    const cover = document.getElementById('now-cover');
    cover.src = t.coverUrl || '';
    cover.style.display = t.coverUrl ? '' : 'none';
    // Notify listeners (e.g., recent plays tracker)
    try {
      window.dispatchEvent(new CustomEvent('trackchange', { detail: {
        src: t.src,
        title: t.title || t.src,
        artist: t.artist || '',
        coverUrl: t.coverUrl || ''
      }}));
    } catch {}
  }

  next() {
    if (this.shuffle && this.queue.length > 1) {
      const candidates = this.queue.map((_, i) => i).filter(i => i !== this.index);
      const nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
      this.playIndex(nextIdx);
      return;
    }
    if (this.index + 1 < this.queue.length) this.playIndex(this.index + 1);
    else if (this.repeat === 'all' && this.queue.length > 0) this.playIndex(0);
  }
  prev() { if (this.index - 1 >= 0) this.playIndex(this.index - 1); }
  toggle() {
    if (!this.ctx) this.ensureAudioGraph();
    if (this.audio.paused) {
      // Resume AudioContext to ensure processing resumes when playing
      try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch {}
      const p = this.audio.play();
      if (p && typeof p.catch === 'function') p.catch(()=>{});
    } else {
      this.audio.pause();
      // Suspend AudioContext to save CPU while paused
      try { if (this.ctx && this.ctx.state !== 'suspended') this.ctx.suspend(); } catch {}
    }
  }

  getAnalyser() { return this.analyser; }

  getEqBandDefs() { return this.eqBandDefs.slice(); }
  getEqGains() { return this.eqGains.slice(); }
  setEqGain(index, gainDb) {
    const i = Number(index) | 0;
    const g = Math.max(-12, Math.min(12, Number(gainDb)));
    if (i < 0 || i >= this.eqBandDefs.length) return;
    this.eqGains[i] = g;
    // Ensure graph exists and apply to filter if created
    this.ensureAudioGraph();
    const f = this.eqFilters[i];
    if (f) f.gain.value = g;
  }

  setEqEnabled(enabled){ this.eqEnabled = !!enabled; this.ensureAudioGraph(); this._reconnectGraph(); }
  isEqEnabled(){ return !!this.eqEnabled; }

  setGlobalQ(q){ const v = Math.max(0.4, Math.min(2.0, Number(q)||1.0)); this.globalQ = v; this.ensureAudioGraph(); this.eqFilters.forEach(f=>{ f.Q.value = v; }); }
  setPreGainDb(db){ const v = Math.max(-24, Math.min(24, Number(db)||0)); this.preGainDb = v; this.ensureAudioGraph(); const g = Math.pow(10, v/20); if (this.preGain) this.preGain.gain.value = g; }
  setHighpassFreq(freq){ const f = Math.max(10, Math.min(1000, Number(freq)||20)); this.hpfFreq = f; this.ensureAudioGraph(); if (this.hpfNode) this.hpfNode.frequency.value = f; }
  setLowpassFreq(freq){ const f = Math.max(1000, Math.min(20000, Number(freq)||20000)); this.lpfFreq = f; this.ensureAudioGraph(); if (this.lpfNode) this.lpfNode.frequency.value = f; }
  setLimiterEnabled(enabled){ this.limiterEnabled = !!enabled; this.ensureAudioGraph(); this._reconnectGraph(); }

  seekRelative(d){ if (!isNaN(this.audio.duration)) this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + d)); }
  volumeRelative(d){ const vol = document.getElementById('volume'); let v = Math.max(0, Math.min(1, (parseFloat(vol.value)||1)+d)); vol.value = String(v); this.audio.volume = v; }

  onEnded(){
    // Determine next index based on repeat/shuffle
    let nextIdx = -1;
    if (this.repeat === 'one') {
      // Repeat current only once, then revert to 'off'
      if (!this._repeatOncePlayed) {
        this._repeatOncePlayed = true;
        nextIdx = this.index; // replay current
      } else {
        // turn repeat off and continue to next track
        this.repeat = 'off';
        this._repeatOncePlayed = false;
        this.updateToggleUI();
        if (this.index + 1 < this.queue.length) nextIdx = this.index + 1;
        else nextIdx = -1;
      }
    } else if (this.shuffle && this.queue.length > 1) {
      // pick random different index
      const candidates = this.queue.map((_, i) => i).filter(i => i !== this.index);
      nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      if (this.index + 1 < this.queue.length) nextIdx = this.index + 1;
      else if (this.repeat === 'all' && this.queue.length > 0) nextIdx = 0;
      else nextIdx = -1;
    }
    if (nextIdx >= 0) this.playIndex(nextIdx);
  }

  toggleShuffle(){
    this.shuffle = !this.shuffle; this.updateToggleUI();
  }
  cycleRepeat(){
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    // Reset single-repeat flag whenever mode changes
    this._repeatOncePlayed = false;
    this.updateToggleUI();
  }
  updateToggleUI(){
    if (this.elShuffle) this.elShuffle.classList.toggle('active', this.shuffle);
    if (this.elRepeat) this.elRepeat.classList.toggle('active', this.repeat !== 'off');
    if (this.elRepeatIconUse) this.elRepeatIconUse.setAttribute('href', this.repeat === 'one' ? '#i-repeat-one' : '#i-repeat');
    if (this.elRepeatLabel) this.elRepeatLabel.textContent = this.repeat === 'off' ? 'Off' : this.repeat === 'one' ? 'One' : 'All';
  }
}

export const player = new Player();
