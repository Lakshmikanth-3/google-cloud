// Simple script to list ElevenLabs voices using ELEVENLABS_API_KEY from env
// Usage: ELEVENLABS_API_KEY=sk_xxx node scripts/list-voices.js
require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

(async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return console.error('Missing ELEVENLABS_API_KEY in env');
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key, Accept: 'application/json' }
    });
    if (!res.ok) {
      console.error('Failed to list voices:', res.status, await res.text());
      process.exit(1);
    }
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error listing voices:', err);
    process.exit(1);
  }
})();
