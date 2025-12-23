# voice-ai-assistant

Voice-first demo using Google Cloud Vertex AI (Gemini) + ElevenLabs TTS.

## Live demo checklist ✅
- [x] Uses **Google Cloud Vertex AI (Gemini)** for reasoning
- [x] Uses **ElevenLabs** for text-to-speech audio output
- [x] Voice-first interface (Web Speech API microphone input)
- [x] Frontend and backend are implemented and runnable locally
- [x] Backend is deployable to **Google Cloud Run**
- [x] Frontend is deployable to **Vercel** or static host
- [x] Conversation memory (last 3 messages) is preserved in the client
- [x] Voice mode indicators: Listening / Thinking / Speaking
- [x] Demo and Clear buttons for judges

## Quick demo instructions (3 minutes)
1. Backend
   - cd backend
   - copy `.env.example` -> `.env` and fill values: `GOOGLE_PROJECT_ID`, `GEMINI_MODEL` (optional), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.
   - Run `gcloud auth application-default login` to allow local Vertex AI access (or set service account credentials via env)
   - npm install
   - npm start
   - Optional: `npm run list-voices` to verify ElevenLabs API key and list `voice_id`s

2. Frontend
   - cd frontend
   - copy `.env.example` -> `.env` and set `VITE_BACKEND_URL=http://localhost:8080`
   - npm install
   - npm start
   - Open http://localhost:5173

3. Demo flow
   - Click **🎤 Speak** and say a question (allow microphone access)
   - Status will show **Listening…** then **Thinking…** then **Speaking…**
   - Use **Demo** to send a predefined question
   - Use **Clear** to reset conversation

## Deployment
- Backend: Cloud Run (use Secret Manager to provide `ELEVENLABS_API_KEY` securely)
- Frontend: Vercel (set `VITE_BACKEND_URL` to the Cloud Run URL)

## Notes
- Do not expose `ELEVENLABS_API_KEY` on the frontend; keep it secret on the backend.
- Rotate API keys if accidentally committed to source control.

---
This project is designed to be hackathon-ready; request help to deploy or demo it live and I'll walk you through the steps.
