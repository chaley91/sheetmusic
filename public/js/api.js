// API module - calls to Netlify functions

export async function analyzeSong(query, mode = 'simple') {
  const res = await fetch('/.netlify/functions/analyze-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}

export async function generateSheet(songData) {
  const res = await fetch('/.netlify/functions/generate-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(songData)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}

export async function getChords(title, artist) {
  const res = await fetch('/.netlify/functions/get-chords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}
