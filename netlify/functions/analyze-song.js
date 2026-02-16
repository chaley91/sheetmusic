import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { query, mode } = JSON.parse(event.body);
    if (!query) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Query is required' }) };
    }

    // Step 1: Get chord reference data from APIs
    let chordContext = '';
    try {
      const chordRes = await fetch(
        `${process.env.URL || 'http://localhost:8888'}/.netlify/functions/get-chords`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: query, artist: '' }),
          signal: AbortSignal.timeout(8000)
        }
      );
      if (chordRes.ok) {
        const chordData = await chordRes.json();
        if (chordData.sources?.length > 0) {
          chordContext = `\nReference data from music databases:\n${JSON.stringify(chordData.sources, null, 2)}`;
        }
      }
    } catch (err) {
      console.log('Chord pre-fetch skipped:', err.message);
    }

    // Step 2: Ask Claude to analyze the song
    const result = await analyzeWithClaude(query, mode, chordContext);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('analyze-song error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Analysis failed' })
    };
  }
}

async function analyzeWithClaude(query, mode, chordContext) {
  const simplePrompt = `You are an expert music theorist and pianist. For the song "${query}":

1. Identify the exact title and artist
2. Identify the key signature (and any key changes)
3. Identify the time signature and approximate tempo (BPM)
4. List the chord progression section by section (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro as applicable)
5. Generate ABC notation showing a simple chord chart

${chordContext ? `Cross-reference your knowledge with this data:${chordContext}` : 'Use your knowledge of this song.'}

IMPORTANT: The ABC notation must be valid. Use standard ABC notation format.
For the chord chart ABC, show chord symbols above a simple rhythmic staff.
Example format:
X:1
T:Song Title - Chords
C:Artist
M:4/4
L:1/4
K:C
"C"z4|"Am"z4|"F"z4|"G"z4|

Respond ONLY with a JSON object (no markdown, no code fences) with this exact structure:
{
  "title": "Exact Song Title",
  "artist": "Artist Name",
  "simple": {
    "key": "C Major",
    "tempo": "~120 BPM",
    "timeSignature": "4/4",
    "chordProgression": [
      { "section": "Intro", "chords": ["C", "Am", "F", "G"] },
      { "section": "Verse", "chords": ["C", "Am", "F", "G"] }
    ],
    "abcNotation": "X:1\\nT:Song Title - Chords\\n..."
  }
}`;

  const detailedPrompt = `You are an expert music theorist and pianist. For the song "${query}":

1. Identify the exact title and artist
2. Provide full analysis: key, time signature, tempo
3. List chord progressions by section
4. Generate ABC notation for BOTH a simple chord chart AND a full piano accompaniment

${chordContext ? `Cross-reference your knowledge with this data:${chordContext}` : 'Use your knowledge of this song.'}

For the detailed ABC notation:
- Use two staves: treble clef (right hand) and bass clef (left hand)
- Use %%staves {1 2} for grand staff layout
- V:1 clef=treble for right hand
- V:2 clef=bass for left hand
- This is ACCOMPANIMENT, not melody transcription
- Right hand: chord voicings, fills, counter-melodies
- Left hand: bass line patterns appropriate to the genre
- Use appropriate patterns (arpeggios, block chords, stride, etc.)
- Include chord symbols above the treble staff
- Keep it musically accurate and playable

Respond ONLY with a JSON object (no markdown, no code fences) with this exact structure:
{
  "title": "Exact Song Title",
  "artist": "Artist Name",
  "simple": {
    "key": "C Major",
    "tempo": "~120 BPM",
    "timeSignature": "4/4",
    "chordProgression": [
      { "section": "Intro", "chords": ["C", "Am", "F", "G"] }
    ],
    "abcNotation": "X:1\\nT:Song Title - Chords\\n..."
  },
  "detailed": {
    "abcNotation": "X:1\\nT:Song Title - Piano\\n%%staves {1 2}\\n...",
    "sections": ["Intro", "Verse", "Chorus"],
    "notes": "Brief description of the arrangement style"
  }
}`;

  const prompt = mode === 'detailed' ? detailedPrompt : simplePrompt;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: mode === 'detailed' ? 8192 : 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0]?.text || '';

  // Parse JSON from Claude's response
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from the response if it has extra text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse Claude response as JSON');
    }
  }

  return parsed;
}
