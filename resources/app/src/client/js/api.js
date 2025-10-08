export async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...(opts || {}) });
    if (!res.ok) {
      let errorDetails = '';
      try {
        const errorData = await res.json();
        errorDetails = errorData.details || errorData.error || '';
      } catch {}
      throw new Error(`Request failed ${res.status}: ${errorDetails}`);
    }
    return await res.json();
  } catch (error) {
    console.error('API Request failed:', url, error);
    throw error;
  }
}

export async function search(q, type='all', opts) {
  const qs = new URLSearchParams({ q, type });
  if (opts && opts.sort) qs.set('sort', opts.sort);
  if (opts && (opts.limit || opts.limit === 0)) qs.set('limit', String(opts.limit));
  const data = await fetchJson(`/api/search?${qs.toString()}`);
  return data.items || [];
}

export async function requestDownload(url, format='mp3', quality) {
  return fetchJson('/api/download', { method: 'POST', body: JSON.stringify({ url, format, quality }) });
}

export async function getLibrary() {
  return fetchJson('/api/library');
}

export async function refreshLibrary() {
  return fetchJson('/api/library/refresh', { method: 'POST' });
}

export async function deleteLibraryItem(file) {
  return fetchJson(`/api/library/item/${encodeURIComponent(file)}`, { method: 'DELETE' });
}

export async function checkTracks(tracks) {
  return fetchJson('/api/download/check', { method: 'POST', body: JSON.stringify({ tracks }) });
}

export async function embedAllCovers() {
  return fetchJson('/api/library/embed-all', { method: 'POST' });
}

export async function cleanupCovers() {
  return fetchJson('/api/library/cleanup-covers', { method: 'POST' });
}

// Playlists API
export async function getPlaylists() {
  return fetchJson('/api/playlists');
}

export async function createPlaylist(name) {
  return fetchJson('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function deletePlaylist(id) {
  return fetchJson(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function renamePlaylist(id, name) {
  return fetchJson(`/api/playlists/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

export async function addTrackToPlaylist(id, track) {
  return fetchJson(`/api/playlists/${encodeURIComponent(id)}/tracks`, { method: 'POST', body: JSON.stringify({ track }) });
}

export async function removeTrackFromPlaylist(id, index) {
  return fetchJson(`/api/playlists/${encodeURIComponent(id)}/tracks/${index}`, { method: 'DELETE' });
}

export async function reorderPlaylist(id, from, to) {
  return fetchJson(`/api/playlists/${encodeURIComponent(id)}/reorder`, { method: 'POST', body: JSON.stringify({ from, to }) });
}
