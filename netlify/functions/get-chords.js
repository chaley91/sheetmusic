// get-chords.js - Hybrid chord lookup (free APIs + fallback)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { title, artist } = JSON.parse(event.body);
    if (!title) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Title is required' }) };
    }

    const results = { title, artist, sources: [] };

    // Step 1: Try Songsterr API
    try {
      const songsterrData = await fetchSongsterr(title, artist);
      if (songsterrData) {
        results.sources.push({ name: 'songsterr', data: songsterrData });
      }
    } catch (err) {
      console.log('Songsterr lookup failed:', err.message);
    }

    // Step 2: Try MusicBrainz for metadata
    try {
      const mbData = await fetchMusicBrainz(title, artist);
      if (mbData) {
        results.sources.push({ name: 'musicbrainz', data: mbData });
      }
    } catch (err) {
      console.log('MusicBrainz lookup failed:', err.message);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(results)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Chord lookup failed: ' + err.message })
    };
  }
}

async function fetchSongsterr(title, artist) {
  const query = artist ? `${title} ${artist}` : title;
  const url = `https://www.songsterr.com/a/ra/songs.json?pattern=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'PianoSheetMusic/1.0' },
    signal: AbortSignal.timeout(5000)
  });

  if (!res.ok) return null;

  const songs = await res.json();
  if (!songs || songs.length === 0) return null;

  // Return best match
  const match = songs[0];
  return {
    title: match.title,
    artist: match.artist?.name || 'Unknown',
    songId: match.id
  };
}

async function fetchMusicBrainz(title, artist) {
  let query = `recording:"${title}"`;
  if (artist) query += ` AND artist:"${artist}"`;

  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&limit=3&fmt=json`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'PianoSheetMusic/1.0 (contact@example.com)' },
    signal: AbortSignal.timeout(5000)
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.recordings || data.recordings.length === 0) return null;

  const recording = data.recordings[0];
  return {
    title: recording.title,
    artist: recording['artist-credit']?.[0]?.name || 'Unknown',
    duration: recording.length ? Math.round(recording.length / 1000) : null,
    releaseDate: recording['first-release-date'] || null
  };
}
