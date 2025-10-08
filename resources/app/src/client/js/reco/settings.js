// Recommendation system settings

const SETTINGS_KEY = 'reco_settings_v1';

const DEFAULT_SETTINGS = {
  useLastFm: true,
  lastFmApiKey: '',
  useSoundAnalysis: true,
  useGenreMatching: true,
  diversityLevel: 0.6, // 0 = more similar, 1 = more diverse
  maxSimilarArtists: 3,
  genreWeight: 0.5,
  excludeLive: true,
  excludeCovers: true,
  excludeInstrumental: false
};

export function getRecoSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function setRecoSettings(settings) {
  try {
    const current = getRecoSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function resetRecoSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {}
  return DEFAULT_SETTINGS;
}