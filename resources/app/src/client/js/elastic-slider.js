// Lightweight elastic slider without external deps
// Usage: new ElasticSlider({ container: HTMLElement, defaultValue, startingValue, maxValue, stepSize, isStepped, leftIconHTML, rightIconHTML, onChange })

export class ElasticSlider {
  constructor(opts) {
    this.opts = Object.assign({
      defaultValue: 50,
      startingValue: 0,
      maxValue: 100,
      isStepped: false,
      stepSize: 1,
      leftIconHTML: '',
      rightIconHTML: '',
      onChange: () => {}
    }, opts || {});

    this.value = this.opts.defaultValue;
    this.region = 'middle';
    this.overflow = 0; // px
    this.scale = 1; // hover scale
    this.animId = null;
    this._rect = null; // cached bounding rect during drag
    this._moveRAF = null; // rAF id for move coalescing
    this._queuedX = null; // last pointer x
    this._isDown = false; // pointer is down state
    this._build();
    this._bind();
    this._render();
  }

  _build() {
    const c = this.opts.container;
    c.classList.add('e-slider-container');
    c.innerHTML = `
      <div class="e-slider-wrapper">
        <div class="e-icon e-left">${this.opts.leftIconHTML || ''}</div>
        <div class="e-slider-root">
          <div class="e-slider-track-wrap">
            <div class="e-slider-track">
              <div class="e-slider-range"></div>
            </div>
          </div>
        </div>
        <div class="e-icon e-right">${this.opts.rightIconHTML || ''}</div>
      </div>
      <p class="e-value-indicator"></p>
    `;

    this.refs = {
      wrapper: c.querySelector('.e-slider-wrapper'),
      root: c.querySelector('.e-slider-root'),
      trackWrap: c.querySelector('.e-slider-track-wrap'),
      range: c.querySelector('.e-slider-range'),
      left: c.querySelector('.e-left'),
      right: c.querySelector('.e-right'),
      indicator: c.querySelector('.e-value-indicator'),
    };
  }

  _bind() {
    const { root, wrapper } = this.refs;

    const onMove = (clientX, isDown) => {
      const rect = this._rect || root.getBoundingClientRect();
      const { left, right, width } = rect;
      let newValue = this.opts.startingValue + ((clientX - left) / width) * (this.opts.maxValue - this.opts.startingValue);
      if (this.opts.isStepped) newValue = Math.round(newValue / this.opts.stepSize) * this.opts.stepSize;
      newValue = Math.max(this.opts.startingValue, Math.min(this.opts.maxValue, newValue));
      this.value = newValue;
      this.opts.onChange(this.value);

      if (clientX < left) {
        this.region = 'left';
        this.overflow = this._decay(left - clientX, 50);
      } else if (clientX > right) {
        this.region = 'right';
        this.overflow = this._decay(clientX - right, 50);
      } else {
        this.region = 'middle';
        this.overflow = 0;
      }
      this._render();
    };

    const scheduleMove = (clientX) => {
      this._queuedX = clientX;
      if (!this._moveRAF) {
        this._moveRAF = requestAnimationFrame(() => {
          this._moveRAF = null;
          if (this._queuedX != null) onMove(this._queuedX, this._isDown);
        });
      }
    };

    const pointerMove = (e) => { if (this._isDown || e.buttons > 0) scheduleMove(e.clientX); };
    const pointerDown = (e) => { this._isDown = true; this._rect = root.getBoundingClientRect(); scheduleMove(e.clientX); try { root.setPointerCapture(e.pointerId); } catch {} };
    const endPointer = () => { this._isDown = false; this._rect = null; this._springBack(); };
    const pointerUp = () => { endPointer(); };
    const pointerCancel = () => { endPointer(); };

    root.addEventListener('pointermove', pointerMove);
    root.addEventListener('pointerdown', pointerDown);
    root.addEventListener('pointerup', pointerUp);
    root.addEventListener('pointercancel', pointerCancel);

    // Hover scale
    wrapper.addEventListener('mouseenter', () => { this.scale = 1.12; this._render(); });
    wrapper.addEventListener('mouseleave', () => { this.scale = 1; this._render(); });
    wrapper.addEventListener('touchstart', () => { this.scale = 1.12; this._render(); }, { passive: true });
    wrapper.addEventListener('touchend', () => { this.scale = 1; this._render(); });
  }

  _springBack() {
    const start = this.overflow;
    const t0 = performance.now();
    const dur = 500;
    const step = (t) => {
      if (document.hidden) {
        this.overflow = 0;
        this._render();
        return;
      }
      const p = Math.min(1, (t - t0) / dur);
      // easeOutBack-like
      const s = 1.70158; const eased = 1 + (Math.pow(p - 1, 3) + (p - 1) * s * Math.pow(p - 1, 2));
      this.overflow = start * (1 - eased);
      this._render();
      if (p < 1) this.animId = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.animId); this.animId = requestAnimationFrame(step);
  }

  _decay(value, max) {
    if (max === 0) return 0;
    const entry = value / max;
    const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
    return sigmoid * max;
  }

  _render() {
    if (document.hidden) return;
    const { root, trackWrap, range, wrapper, left, right, indicator } = this.refs;
    const total = this.opts.maxValue - this.opts.startingValue || 1;
    const pct = ((this.value - this.opts.startingValue) / total) * 100;
    range.style.width = `${Math.max(0, Math.min(100, pct))}%`;

    // scale & overflow transforms
    wrapper.style.transform = `scale(${this.scale})`;
    wrapper.style.opacity = String(0.7 + (this.scale - 1) * 1.5);

    // Track squash and stretch
    const width = (this._rect ? this._rect.width : (root.clientWidth || 1));
    const scaleX = 1 + this.overflow / width;
    const scaleY = 1 - (this.overflow / 50) * 0.2; // min 0.8
    trackWrap.style.transformOrigin = this.region === 'left' ? 'right center' : this.region === 'right' ? 'left center' : 'center';
    trackWrap.style.transform = `scale(${scaleX.toFixed(4)}, ${Math.max(0.8, scaleY).toFixed(4)})`;

    // Icons nudge
    left.style.transform = this.region === 'left' ? `translateX(${-this.overflow / this.scale}px)` : 'translateX(0)';
    right.style.transform = this.region === 'right' ? `translateX(${this.overflow / this.scale}px)` : 'translateX(0)';

    indicator.textContent = `${Math.round(this.value)}`;
  }

  setValue(v) { this.value = Math.max(this.opts.startingValue, Math.min(this.opts.maxValue, v)); this._render(); }
  getValue() { return this.value; }
}
