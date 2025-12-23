/*
  voice-ai-assistant/backend/index.js

  Minimal Express server that accepts text, asks Gemini (Vertex AI) to reply,
  then uses ElevenLabs Text-to-Speech to create an audio response and returns
  base64-encoded audio to the frontend.

  Setup:
  - For local development: create a .env with values from .env.example
  - For production: run on Cloud Run and use a service account with VertexAI
    permissions. Provide ELEVENLABS_API_KEY as a secret env var.
*/

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { VertexAI } = require('@google-cloud/vertexai');
const fetch = global.fetch || require('node-fetch');

const app = express();
app.use(express.json({ limit: '512kb' }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({ origin: FRONTEND_ORIGIN }));

const PORT = process.env.PORT || 8080;

// --- Vertex AI (Gemini) setup ---
const project = process.env.GOOGLE_PROJECT_ID;
const location = process.env.GOOGLE_LOCATION || 'us-central1';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!project) {
  console.warn('Warning: GOOGLE_PROJECT_ID is not set. Local testing will require ADC (gcloud auth application-default login)');
}

const vertexAI = new VertexAI({ project, location });
const generativeModel = vertexAI.getGenerativeModel({ model: geminiModel });

// --- ElevenLabs settings ---
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
  console.warn('Warning: ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID missing in env. TTS will fail without it.');
}

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// POST /chat
// Body: { text: "user message", history: [{role:'user'|'assistant', text: '...'}] }
// Response: { replyText: string, audioBase64?: string, mime?: string }
app.post('/chat', async (req, res) => {
  try {
    const { text, history } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });

    console.info('Incoming chat request. text length:', text.length, 'history length:', Array.isArray(history) ? history.length : 0);

    // Build a simple prompt with system instruction + last 3 history items + current user message
    const systemInstruction = 'You are a friendly, concise assistant for a hackathon demo. Keep responses short and clear.';
    let promptParts = [];
    promptParts.push(`System: ${systemInstruction}`);

    if (Array.isArray(history)) {
      // only keep last 3
      const last = history.slice(-3);
      last.forEach((m) => {
        const role = m.role === 'assistant' ? 'Assistant' : 'User';
        promptParts.push(`${role}: ${String(m.text || '')}`);
      });
    }

    promptParts.push(`User: ${text}`);
    promptParts.push('Assistant:');
    const prompt = promptParts.join('\n');

    console.debug('Prompt to Gemini:\n', prompt);

    // Ask Gemini (non-streamed) and await the response
    const genResult = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // you can tune generationConfig here if needed
      // generationConfig: { maxOutputTokens: 256 },
    });

    const candidate = genResult?.response?.candidates?.[0];
    let replyText = '';

    if (candidate && candidate.content) {
      // The parts array may contain objects with text or strings. Be defensive.
      const parts = candidate.content.parts || [];
      replyText = parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
    }

    if (!replyText) replyText = 'Sorry, I could not generate a response.';

    console.info('Gemini replyText length:', replyText.length);

    // If ElevenLabs is not configured, return text only
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.json({ replyText });
    }

    // Prepare TTS request to ElevenLabs
    const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    const ttsResp = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: replyText,
        model: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
    });

    if (!ttsResp.ok) {
      const textBody = await ttsResp.text();
      console.error('ElevenLabs TTS failed:', ttsResp.status, textBody);
      return res.status(502).json({ error: 'TTS service failed', details: textBody });
    }

    const arrayBuffer = await ttsResp.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const audioBase64 = audioBuffer.toString('base64');

    // Return consistent JSON
    res.json({ replyText, audioBase64, mime: 'audio/mpeg' });
  } catch (err) {
    console.error('Error in /chat:', err);
    const msg = err?.message || String(err);

    // Detect auth issues from the Google client and return helpful guidance
    if (msg.includes('Unable to authenticate') || msg.includes('GoogleAuthError') || msg.includes('Could not load the default credentials')) {
      return res.status(401).json({
        error: 'auth_error',
        details: msg,
        help: 'Local fix: run `gcloud auth application-default login` or set the `GOOGLE_APPLICATION_CREDENTIALS` env var to a service account JSON file. For Cloud Run, attach a service account with Vertex AI permissions. See https://cloud.google.com/docs/authentication'
      });
    }

    res.status(500).json({ error: 'server_error', details: msg });
  }
});

// GET /voices - list ElevenLabs voices (useful for verifying API key)
app.get('/voices', async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.status(400).json({ error: 'ELEVENLABS_API_KEY not configured' });
  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, Accept: 'application/json' }
    });
    if (!resp.ok) return res.status(resp.status).send(await resp.text());
    const body = await resp.json();
    res.json(body);
  } catch (err) {
    console.error('Error fetching voices:', err);
    res.status(500).json({ error: 'voices_failed', details: err?.message || String(err) });
  }
});

// Serve simple message on root
app.get('/', (req, res) => res.send('voice-ai-assistant backend is running'));

// Runtime auth check for Vertex AI
let vertexReady = false;
async function checkVertexAuth() {
  try {
    console.log('Checking Vertex AI authentication...');
    // Lightweight call to validate credentials (small token usage)
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Say ok.' }] }],
      generationConfig: { maxOutputTokens: 1 },
    });
    if (result?.response?.candidates?.length) {
      vertexReady = true;
      console.log('Vertex AI authentication check succeeded. Vertex is reachable.');
    } else {
      vertexReady = false;
      console.warn('Vertex AI returned no candidates; check model and project settings.');
    }
  } catch (err) {
    vertexReady = false;
    console.error('Vertex AI auth check failed:', err?.message || err);
    console.error('Local fix: run `gcloud auth application-default login` or set the `GOOGLE_APPLICATION_CREDENTIALS` env var to a service account JSON file. For Cloud Run, attach a service account with Vertex AI permissions. See https://cloud.google.com/docs/authentication');
  }
}

// Status endpoint for quick checks
app.get('/check-vertex', (req, res) => {
  if (vertexReady) return res.json({ ok: true, vertexReady: true, message: 'Vertex ready' });
  return res.status(503).json({ ok: false, vertexReady: false, message: 'Vertex not ready. Check logs for auth errors.' });
});

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await checkVertexAuth();
});