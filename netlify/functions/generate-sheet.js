import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { title, artist, simple } = JSON.parse(event.body);
    if (!title || !simple) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Title and simple data are required' }) };
    }

    const result = await generateDetailedSheet(title, artist, simple);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('generate-sheet error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Sheet generation failed' })
    };
  }
}

async function generateDetailedSheet(title, artist, simple) {
  const chordSummary = simple.chordProgression
    ? simple.chordProgression.map(s => `${s.section}: ${s.chords.join(' - ')}`).join('\n')
    : 'Unknown';

  const prompt = `You are an expert pianist and arranger. Create a piano accompaniment arrangement for "${title}" by "${artist}" in ABC notation.

Song details:
- Key: ${simple.key || 'Unknown'}
- Time Signature: ${simple.timeSignature || '4/4'}
- Tempo: ${simple.tempo || 'Moderate'}
- Chord Progression:
${chordSummary}

Requirements:
- Two staves: treble clef (right hand) and bass clef (left hand)
- Use %%staves {1 2} for grand staff layout
- V:1 clef=treble name="RH" for right hand
- V:2 clef=bass name="LH" for left hand
- This is ACCOMPANIMENT, not melody transcription
- Right hand: chord voicings, fills, counter-melodies appropriate to the genre
- Left hand: bass line patterns appropriate to the genre (root-fifth, walking bass, arpeggios, etc.)
- Include chord symbols above the treble staff using "Chord" notation
- Include at least the main sections (Verse, Chorus minimum)
- Make it musically accurate and playable by an intermediate pianist
- The ABC notation MUST be valid and parseable

Respond ONLY with a JSON object (no markdown, no code fences):
{
  "abcNotation": "X:1\\nT:${title} - Piano Accompaniment\\n%%staves {1 2}\\nM:${simple.timeSignature || '4/4'}\\nL:1/8\\nQ:1/4=${simple.tempo ? simple.tempo.replace(/[^0-9]/g, '') || '120' : '120'}\\nK:${simple.key ? simple.key.split(' ')[0] : 'C'}\\nV:1 clef=treble name=\\"RH\\"\\n...\\nV:2 clef=bass name=\\"LH\\"\\n...",
  "sections": ["Intro", "Verse", "Chorus"],
  "notes": "Brief description of arrangement approach"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0]?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse Claude response as JSON');
    }
  }

  // If ABC has issues, try one correction pass
  if (parsed.abcNotation && parsed.abcNotation.length < 50) {
    const corrected = await correctABC(title, artist, parsed.abcNotation, simple);
    if (corrected) {
      parsed.abcNotation = corrected;
    }
  }

  return parsed;
}

async function correctABC(title, artist, badAbc, simple) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `The following ABC notation for a piano arrangement of "${title}" by "${artist}" seems too short or malformed. Please generate a complete, valid ABC notation for a piano accompaniment.

Previous attempt: ${badAbc}

Key: ${simple.key || 'C'}
Time: ${simple.timeSignature || '4/4'}
Chords: ${simple.chordProgression?.map(s => s.chords.join('-')).join(' | ') || 'Unknown'}

Requirements:
- Two staves with %%staves {1 2}
- V:1 clef=treble, V:2 clef=bass
- Full accompaniment pattern, not just melody
- At least 16 measures

Respond with ONLY the ABC notation text, no JSON, no markdown fences.`
      }]
    });

    const correctedAbc = response.content[0]?.text?.trim();
    if (correctedAbc && correctedAbc.startsWith('X:')) {
      return correctedAbc;
    }
  } catch (err) {
    console.error('ABC correction failed:', err.message);
  }
  return null;
}
