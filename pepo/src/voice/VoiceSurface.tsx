import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Keyboard, X } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { presence, usePresence } from '../core/presence'
import { ease } from '../core/tokens'
import { Transcript } from './Transcript'
import { useMicrophoneEnergy } from './useMicrophoneEnergy'
import { Waveform } from './Waveform'

const BUSY = new Set(['understanding', 'thinking', 'speaking', 'working'])

/** One quiet word for what PEPO is doing, so state never rests on colour or motion alone. */
const WORD: Partial<Record<string, string>> = {
  understanding: 'Thinking…',
  thinking: 'Thinking…',
  working: 'Working…',
  speaking: 'Speaking',
  waiting: 'Waiting',
  success: 'Done',
  error: "Couldn't finish",
}
/** The same, as a sentence for screen readers. */
const SPOKEN: Partial<Record<string, string>> = {
  listening: 'PEPO is listening.',
  understanding: 'PEPO is thinking.',
  thinking: 'PEPO is thinking.',
  working: 'PEPO is working.',
  speaking: 'PEPO is speaking.',
  interrupted: 'PEPO stopped and is listening.',
  waiting: 'PEPO is waiting.',
  success: 'Done.',
  error: "PEPO couldn't finish that.",
}

/**
 * The floating command surface under the Orb. Voice first; the keyboard
 * is one tap away but never the default.
 *
 * It only emits intents (voiceStart / voiceStop / textSubmit). Whoever
 * owns PEPO's runtime decides what the presence does in response.
 */
export function VoiceSurface({ captureMic = true }: { captureMic?: boolean }) {
  const { state, transcript } = usePresence()
  const listening = state === 'listening'
  const busy = BUSY.has(state)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const micButton = useRef<HTMLButtonElement>(null)

  useMicrophoneEnergy(captureMic && listening)

  const toggleVoice = () => {
    if (listening) pepoEvents.emit('voiceStop')
    else {
      setTyping(false)
      pepoEvents.emit('voiceStart')
    }
  }

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    pepoEvents.emit('textSubmit', { text })
    setDraft('')
    setTyping(false)
  }

  // Space to talk, "/" to type, Escape to close. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key === 'Escape') {
        if (typing) setTyping(false)
        else if (presence.getSnapshot().state === 'listening') pepoEvents.emit('voiceStop')
        return
      }
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space' && !(target instanceof HTMLButtonElement)) {
        e.preventDefault()
        micButton.current?.click()
      } else if (e.key === '/') {
        e.preventDefault()
        setTyping(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [typing])

  useEffect(() => {
    if (typing) input.current?.focus()
    pepoEvents.emit('inputFocus', { active: typing })
  }, [typing])

  // Mic halo follows live energy without re-rendering.
  useEffect(() => {
    if (!listening) return
    let raf = 0
    const tick = () => {
      micButton.current?.style.setProperty('--energy', presence.getEnergy().toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      micButton.current?.style.setProperty('--energy', '0')
    }
  }, [listening])

  return (
    <div className="voice-surface">
      <span className="sr-only" role="status" aria-live="polite">
        {SPOKEN[state] ?? ''}
      </span>
      <Transcript text={transcript} />

      <motion.div
        layout
        className={`command surface ${listening ? 'is-listening' : ''} ${busy ? 'is-busy' : ''} ${typing ? 'is-typing' : ''}`}
        transition={{ layout: { duration: 0.36, ease: ease.out } }}
      >
        <motion.button
          layout="position"
          ref={micButton}
          className={`mic ${listening ? 'is-live' : ''}`}
          onClick={toggleVoice}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Talk to PEPO'}
        >
          <span className="mic-core" />
        </motion.button>

        <AnimatePresence mode="popLayout" initial={false}>
          {typing ? (
            <motion.form
              key="type"
              className="command-input"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask PEPO…"
                aria-label="Message PEPO"
                autoComplete="off"
              />
              <button type="submit" className="icon-btn" aria-label="Send" disabled={!draft.trim()}>
                <ArrowUp size={15} strokeWidth={1.6} />
              </button>
              <button type="button" className="icon-btn" aria-label="Close keyboard" onClick={() => setTyping(false)}>
                <X size={14} strokeWidth={1.6} />
              </button>
            </motion.form>
          ) : listening ? (
            <motion.div
              key="listen"
              className="command-listening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="command-label is-live">listening…</span>
              <Waveform />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              className="command-idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button className={`command-label ${WORD[state] ? 'is-state' : ''}`} onClick={toggleVoice} tabIndex={-1}>
                {WORD[state] ?? 'Talk to PEPO'}
              </button>
              <button className="icon-btn" aria-label="Type instead" onClick={() => setTyping(true)}>
                <Keyboard size={15} strokeWidth={1.4} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
