import { useEffect } from 'react'
import { pepoEvents } from '../core/events'
import { presence, type PresenceState } from '../core/presence'

/**
 * DEMO ONLY: a stand-in for PEPO's runtime so the visual layer can be
 * experienced without a backend. It reacts to UI intents by scripting
 * presence states. Delete this component when the real runtime connects
 * and drives `presence` itself.
 */

const SAMPLE_UTTERANCE = 'Find the latest GLM inference benchmarks and compare them with last month'
const SAMPLE_REPLY = 'I found three new results. Want me to keep going?'

export function DemoConductor() {
  useEffect(() => {
    const timers = new Set<number>()
    let raf = 0
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
    }
    const clear = () => {
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
      cancelAnimationFrame(raf)
    }
    const set = (state: PresenceState, extra: Partial<Parameters<typeof presence.update>[0]> = {}) => {
      const from = presence.getSnapshot().state
      presence.update({ state, ...extra })
      if (from !== state) pepoEvents.emit('presenceChange', { from, to: state })
    }

    /** Speech energy for PEPO's own voice: phrases made of syllables. */
    const speak = (ms: number, done: () => void) => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = (now - start) / 1000
        if (now - start > ms) {
          presence.setEnergy(0)
          done()
          return
        }
        const phrase = Math.max(0, Math.sin(t * 1.9 + 0.3)) ** 0.5
        const syllable = 0.5 + 0.5 * Math.sin(t * 22 + Math.sin(t * 5) * 2.5)
        presence.setEnergy(phrase * (0.35 + 0.65 * syllable))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const respond = () => {
      set('understanding', { transcript: null })
      later(1100, () => {
        set('thinking')
        later(2200, () => {
          set('speaking', { caption: SAMPLE_REPLY })
          speak(3600, () => {
            set('idle')
            later(4200, () => presence.update({ caption: null }))
          })
        })
      })
    }

    const offStart = pepoEvents.on('voiceStart', () => {
      clear()
      set('listening', { caption: null, transcript: null })
      // Simulated live transcription, word by word.
      const words = SAMPLE_UTTERANCE.split(' ')
      words.forEach((_, i) =>
        later(700 + i * 260, () => presence.update({ transcript: words.slice(0, i + 1).join(' ') + (i === words.length - 1 ? '…' : '') })),
      )
      later(700 + words.length * 260 + 900, () => {
        if (presence.getSnapshot().state === 'listening') pepoEvents.emit('voiceStop')
      })
    })

    const offStop = pepoEvents.on('voiceStop', () => {
      clear()
      if (presence.getSnapshot().transcript) later(500, respond)
      else set('idle', { transcript: null })
    })

    const offText = pepoEvents.on('textSubmit', ({ text }) => {
      clear()
      presence.update({ caption: null, transcript: text })
      later(900, respond)
    })

    // First breath: PEPO acknowledges you once, then falls silent.
    later(1400, () => presence.update({ caption: "I'm here." }))
    later(6500, () => {
      if (presence.getSnapshot().caption === "I'm here.") presence.update({ caption: null })
    })

    return () => {
      clear()
      offStart()
      offStop()
      offText()
    }
  }, [])

  return null
}
