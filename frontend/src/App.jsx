import React, { useState, useRef, useEffect } from 'react'
import './App.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080'

function App() {
  // status: idle | listening | thinking | speaking
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [replyText, setReplyText] = useState('')
  const [messages, setMessages] = useState([]) // { role, text }
  const [error, setError] = useState(null)

  const audioRef = useRef(null)
  const recogRef = useRef(null)
  const aiCardRef = useRef(null)

  const recognitionSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  // Auto-scroll AI response into view when replyText changes
  useEffect(() => {
    if (aiCardRef.current) {
      aiCardRef.current.scrollTop = aiCardRef.current.scrollHeight
    }
  }, [replyText])

  // Send text to backend with last 3 messages as history
  async function sendText(text) {
    if (!text) return
    setError(null)

    // Append user message locally
    setMessages((prev) => {
      const next = [...prev, { role: 'user', text }].slice(-6)
      return next
    })

    setTranscript(text)
    setReplyText('')
    setStatus('thinking')

    try {
      const history = messages.slice(-3)
      const resp = await fetch(BACKEND_URL + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, history })
      })
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(body || 'Server error')
      }
      const data = await resp.json()
      const ai = data?.replyText || data?.text || 'No response'

      // append assistant message locally
      setMessages((prev) => [...prev, { role: 'assistant', text: ai }].slice(-6))
      setReplyText(ai)

      // If audio exists, play it and show speaking UI
      if (data?.audioBase64) {
        try {
          const audioBytes = atob(data.audioBase64)
          const len = audioBytes.length
          const u8 = new Uint8Array(len)
          for (let i = 0; i < len; i++) u8[i] = audioBytes.charCodeAt(i)
          const blob = new Blob([u8.buffer], { type: data.mime || 'audio/mpeg' })
          const url = URL.createObjectURL(blob)
          if (audioRef.current) {
            audioRef.current.src = url
            audioRef.current.onplay = () => setStatus('speaking')
            audioRef.current.onended = () => setStatus('idle')
            await audioRef.current.play()
          } else {
            setStatus('idle')
          }
        } catch (err) {
          console.error('Audio playback error', err)
          setStatus('idle')
          setError('Audio playback failed')
        }
      } else {
        setStatus('idle')
      }
    } catch (err) {
      console.error('sendText error', err)
      setError(String(err?.message || err))
      setStatus('idle')
    }
  }

  // Start listening using Web Speech API
  const startListening = () => {
    if (!recognitionSupported) return setError('Web Speech API not supported in this browser')
    if (status === 'thinking' || status === 'speaking') return // disabled while AI busy
    if (recogRef.current) return // already listening

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1

    // Update UI states
    recog.onstart = () => setStatus('listening')
    recog.onend = () => {
      recogRef.current = null
      if (status === 'listening') setStatus('idle')
    }
    recog.onerror = (e) => {
      console.error('Speech recognition error', e)
      recogRef.current = null
      setStatus('idle')
      setError('Speech recognition error: ' + (e?.error || 'unknown'))
    }

    // When speech is recognized, auto-stop and send to backend
    recog.onresult = async (ev) => {
      const text = ev.results[0][0].transcript
      setTranscript(text)
      recogRef.current = null
      setStatus('thinking')
      await sendText(text)
    }

    recogRef.current = recog
    recog.start()
  }

  const handleDemo = () => sendText('Give me a short, three-line introduction you can use for a hackathon demo.')
  const handleClear = () => {
    setTranscript('')
    setReplyText('')
    setMessages([])
    setError(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setStatus('idle')
  }

  // Minor helper: highlight first sentence of the reply
  const renderReply = (text) => {
    if (!text) return <em>Responses appear here</em>
    const [first, ...rest] = text.split(/([.!?]\s+)/).filter(Boolean)
    const restText = rest.join('')
    return (
      <div>
        <div className="reply-first">{first}</div>
        {restText ? <div className="reply-rest">{restText}</div> : null}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <header className="header">
          <div className="logo">🎙</div>
          <div>
            <h1 className="title">Voice AI Assistant</h1>
            <p className="subtitle">Talk to AI. Get human-like answers.</p>
          </div>
        </header>

        <main>
          <div className="voice-area">
            {/* Large circular microphone button with state-based classes */}
            <button
              className={`mic-button ${status}`}
              onClick={startListening}
              disabled={status === 'thinking' || status === 'speaking'}
              aria-label="Start speaking"
            >
              {status === 'listening' && <span className="mic-label">Listening…</span>}
              {status === 'thinking' && <span className="mic-label">Thinking…</span>}
              {status === 'speaking' && <span className="mic-label">Speaking…</span>}
              {status === 'idle' && <span className="mic-label">Tap to Speak</span>}

              {/* Visuals: pulse / spinner / waveform */}
              <div className="mic-icon">🎤</div>
              {status === 'listening' && <span className="pulse" />}
              {status === 'thinking' && <div className="spinner" />}
              {status === 'speaking' && (
                <div className="waveform" aria-hidden>
                  <span></span><span></span><span></span><span></span>
                </div>
              )}
            </button>

            <div className="controls">
              <button className="btn secondary" onClick={handleClear}>Clear Conversation</button>
              <button className="btn secondary" onClick={handleDemo}>Demo Mode</button>
            </div>

            {error && <div className="error">{error}</div>}
          </div>

          <section className="cards">
            <div className="card-small">
              <h4>You said</h4>
              {/* editable transcript: simple contentEditable */}
              <div
                className="transcript"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => setTranscript(e.target.innerText.trim())}
              >
                {transcript || <span className="muted">(speak or use Demo)</span>}
              </div>
            </div>

            <div className="card-small">
              <h4>AI says</h4>
              <div className="ai-reply" ref={aiCardRef}>
                {renderReply(replyText)}
              </div>
            </div>
          </section>

          {/* Minimal audio player, hidden until audio src set */}
          <div className={`audio-wrap ${audioRef.current && audioRef.current.src ? 'visible' : 'hidden'}`}>
            <audio ref={audioRef} controls />
          </div>
        </main>

        <footer className="footer">Backend: <code>{BACKEND_URL}</code></footer>
      </div>
    </div>
  )
}

export default App
