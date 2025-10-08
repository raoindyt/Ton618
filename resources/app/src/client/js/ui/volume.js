import { ElasticSlider } from '../elastic-slider.js';
import { player } from '../player.js';

export function initElasticVolume(){
  const host = document.getElementById('vol-elastic'); if(!host) return;
  const volInput = document.getElementById('volume');
  const leftIcon = '<svg class="icon"><use href="#i-volume"/></svg>';
  const rightIcon = '<svg class="icon"><use href="#i-volume"/></svg>';
  const defaultValue = Math.round(parseFloat(volInput.value || '1') * 100);
  const slider = new ElasticSlider({
    container: host,
    defaultValue,
    startingValue: 0,
    maxValue: 100,
    isStepped: true,
    stepSize: 1,
    leftIconHTML: leftIcon,
    rightIconHTML: rightIcon,
    onChange: (v)=>{
      const val = Math.max(0, Math.min(100, v));
      const frac = val / 100;
      volInput.value = String(frac);
      player.audio.volume = frac;
    }
  });

  volInput.addEventListener('input', ()=>{
    slider.setValue(parseFloat(volInput.value || '1') * 100);
  });

  window._volSlider = slider;
}
