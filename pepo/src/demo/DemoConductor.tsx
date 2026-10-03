import { useEffect } from 'react'
import { conversation } from '../core/conversation'
import { pepoEvents, type PEPOEventMap } from '../core/events'
import { presence, type PresenceState } from '../core/presence'
import { systemStatus } from '../core/status'
import { workspace, type ToolKind } from '../core/workspace'
import { SAMPLE, TRIP_BROWSER } from './sampleContent'

/**
 * DEMO ONLY: a stand-in for PEPO's runtime so the visual layer can be
 * experienced without a backend. It reacts to UI intents by scripting
 * presence states. Delete this component when the real runtime connects
 * and drives `presence` itself.
 */

const SAMPLE_UTTERANCE = 'Plan a trip to Norway and compare places'
const SAMPLE_REPLY = 'I found three new results. Want me to keep going?'
const TASK_REPLY = "Here's a seven-day route through the fjords. Want me to book the trains?"
const TASK_PATTERN = /norway|trip|travel|plan|route|fjord|compare/i
/** Scenario 3: "Open the terminal and check the service." */
const SERVICE_PATTERN = /terminal|service|server|status|logs?\b/i
const SERVICE_LINES = [
  '$ systemctl status pepo-voice',
  '● pepo-voice.service — PEPO speech pipeline',
  '  Active: active (running) since 14:58 · 2h 3min ago',
  '$ journalctl -u pepo-voice --since "1 hour ago" --priority warning',
  '-- No entries --',
  '$ curl -s localhost:7860/health',
  '✓ healthy · stt 38 ms · tts 112 ms',
]
const SERVICE_REPLY = 'The voice service is running. No warnings in the last hour.'

const ITINERARY = [
  'Day 1 — Oslo · Opera House, Bygdøy, evening on Aker Brygge',
  'Day 2 — Bergen Line to Myrdal, Flåm Railway down to the fjord',
  'Day 3 — Nærøyfjord cruise to Gudvangen, bus to Bergen',
  'Day 4 — Bergen · Bryggen, Fløyen, fish market',
  'Day 5 — Drive to Geiranger via Strynefjellet, fjord viewpoints',
  'Day 6 — Ålesund · Art Nouveau town, Aksla at sunset',
  'Day 7 — Fly to Bodø, ferry to Lofoten · Reine, Hamnøy',
]

const TITLES: Record<ToolKind, string> = {
  map: 'Map', notes: 'Notes', terminal: 'Terminal', browser: 'Browser', files: 'Files', code: 'Code', images: 'Images',
  documents: 'Norway trip · plan', tasks: 'Tasks', conversation: 'Conversation',
}

type Cue = { at: number; kind: PEPOEventMap['cue']['kind'] }
/** Both replies are a statement, then a question: the question gets a slight tilt. */
const REPLY_CUES: Cue[] = [{ at: 2.4, kind: 'question' }]

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

    /** PEPO says a line: it is captioned, kept in the conversation, then voiced. */
    const say = (line: string) => {
      presence.update({ caption: line })
      conversation.add('pepo', line)
    }

    /**
     * Speech energy for PEPO's own voice: phrases made of syllables. Semantic
     * cues (a question, an emphasis) are sent at the phrase they belong to;
     * the Avatar's head follows those, never the loudness.
     */
    const speak = (ms: number, done: () => void, cues: Cue[] = []) => {
      const start = performance.now()
      cues.forEach((c) => later(c.at * 1000, () => pepoEvents.emit('cue', { kind: c.kind })))
      const tick = (now: number) => {
        const t = (now - start) / 1000
        if (now - start > ms) {
          presence.setEnergy(0)
          done()
          return
        }
        // Two phrases with a real pause between them ("I found three new results. / Want me to keep going?").
        const inPhrase = (t > 0.05 && t < 1.9) || (t > 2.45 && t < 4.0)
        const edge = Math.min(1, Math.min(Math.abs(t - 0.05), Math.abs(t - 1.9), Math.abs(t - 2.45), Math.abs(t - 4.0)) * 8)
        const syllable = 0.5 + 0.5 * Math.sin(t * 22 + Math.sin(t * 5) * 2.5)
        presence.setEnergy(inPhrase ? edge * (0.35 + 0.65 * syllable) : 0)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    // Understand, think, answer. The body (Orb or Avatar) is the viewer's
    // choice; each form plays these states in its own way.
    /**
     * The work scene: PEPO understands, thinks, steps aside and opens a map,
     * notes and a terminal; light flows to each while it writes; then it
     * answers. The terminal (secondary) collapses once the work is done.
     */
    const runTask = () => {
      set('understanding', { transcript: null })
      later(1000, () => {
        set('thinking')
        later(1400, () => {
          set('working', { caption: 'Planning the route…' })
          conversation.add('tool', 'Opened Map, Notes and Browser for the Norway route')
          // A tool the viewer already opened is reused: give it this task's title and content.
          const map = workspace.open('map', 'Norway · route', { progress: 0 })
          workspace.update(map, { title: 'Norway · route', active: true, data: { progress: 0 } })
          const t0 = performance.now()
          const draw = () => {
            const k = Math.min(1, (performance.now() - t0) / 5600)
            workspace.update(map, { data: { progress: k } })
            if (k < 1) later(90, draw)
            else workspace.update(map, { active: false })
          }
          later(400, draw)

          later(900, () => {
            const notes = workspace.open('notes', 'Itinerary', { heading: 'Norway · 7 days', lines: [] })
            workspace.update(notes, { title: 'Itinerary', active: true, data: { heading: 'Norway · 7 days', lines: [] } })
            ITINERARY.forEach((line, i) =>
              later(500 + i * 620, () => {
                const w = workspace.find('notes')
                if (!w) return
                workspace.update(w.id, { data: { lines: [...((w.data.lines as string[]) ?? []), line] } })
                if (i === ITINERARY.length - 1) workspace.update(w.id, { active: false })
              }),
            )
          })

          // The browser comes in as context: comparing the places on the route.
          later(1700, () => {
            const web = workspace.open('browser', 'Browser', { query: TRIP_BROWSER.query, loading: true, results: [] })
            workspace.update(web, { active: true, data: { query: TRIP_BROWSER.query, loading: true, results: [], view: null } })
            later(1400, () => {
              const w = workspace.find('browser')
              if (w) workspace.update(w.id, { active: false, data: { ...TRIP_BROWSER, loading: false } })
            })
          })

          later(6900, () => {
            // A breath before the voice: the body prepares, then audio begins.
            set('speaking')
            say(TASK_REPLY)
            later(520, () =>
              speak(
                4200,
                () => {
                  // Done. The work stays where it is: the user decides when to put it away.
                  set('success')
                  later(900, () => set('idle'))
                  later(4200, () => presence.update({ caption: null }))
                },
                REPLY_CUES,
              ),
            )
          })
        })
      })
    }

    /**
     * Scenario 3: the terminal becomes the primary object; PEPO stays
     * visible beside it and says what it found.
     */
    const runServiceCheck = () => {
      set('understanding', { transcript: null })
      later(800, () => {
        set('working', { caption: 'Checking the service…' })
        conversation.add('tool', 'Opened Terminal')
        const term = workspace.open('terminal', 'Terminal', { lines: [] })
        workspace.update(term, { active: true, data: { lines: [] } })
        SERVICE_LINES.forEach((line, i) =>
          later(500 + i * 520 + (line.startsWith('$') ? 0 : 180), () => {
            const w = workspace.find('terminal')
            if (!w) return
            workspace.update(w.id, { data: { lines: [...((w.data.lines as string[]) ?? []), line] } })
            if (i === SERVICE_LINES.length - 1) workspace.update(w.id, { active: false })
          }),
        )
        later(500 + SERVICE_LINES.length * 520 + 600, () => {
          set('speaking')
          say(SERVICE_REPLY)
          later(520, () =>
            speak(3600, () => {
              set('success')
              later(900, () => set('idle'))
              later(4200, () => presence.update({ caption: null }))
            }),
          )
        })
      })
    }
    const route = (text: string) => (SERVICE_PATTERN.test(text) ? runServiceCheck : TASK_PATTERN.test(text) ? runTask : respond)

    const respond = () => {
      set('understanding', { transcript: null })
      later(1100, () => {
        set('thinking')
        later(2200, () => {
          // A breath before the voice: the body prepares, then audio begins.
          set('speaking')
          say(SAMPLE_REPLY)
          later(520, () =>
            speak(
              4200,
              () => {
                set('idle')
                later(4200, () => presence.update({ caption: null }))
              },
              REPLY_CUES,
            ),
          )
        })
      })
    }

    const listen = () => {
      set('listening', { caption: null, transcript: null })
      // Simulated live transcription, word by word.
      const words = SAMPLE_UTTERANCE.split(' ')
      words.forEach((_, i) =>
        later(700 + i * 260, () => presence.update({ transcript: words.slice(0, i + 1).join(' ') + (i === words.length - 1 ? '…' : '') })),
      )
      later(700 + words.length * 260 + 900, () => {
        if (presence.getSnapshot().state === 'listening') pepoEvents.emit('voiceStop')
      })
    }

    const offStart = pepoEvents.on('voiceStart', () => {
      const wasSpeaking = presence.getSnapshot().state === 'speaking'
      clear()
      presence.setEnergy(0)
      if (wasSpeaking) {
        // Interrupted: speech stops at once, PEPO turns its attention to the user.
        set('interrupted', { caption: null })
        later(280, listen)
      } else listen()
    })

    // Opening the keyboard: PEPO becomes attentive (only from rest).
    const offFocus = pepoEvents.on('inputFocus', ({ active }) => {
      const s = presence.getSnapshot().state
      if (active && s === 'idle') set('attentive')
      else if (!active && s === 'attentive') set('idle')
    })

    const offStop = pepoEvents.on('voiceStop', () => {
      clear()
      const said = presence.getSnapshot().transcript
      if (said) conversation.add('user', said.replace(/…$/, ''))
      if (said) later(500, route(said))
      else set('idle', { transcript: null })
    })

    const offText = pepoEvents.on('textSubmit', ({ text }) => {
      clear()
      presence.update({ caption: null, transcript: text })
      conversation.add('user', text)
      later(900, route(text))
    })

    // Tools opened from the dock: the runtime would decide what to show.
    const offTool = pepoEvents.on('toolOpen', ({ toolId }) => {
      const kind = toolId as ToolKind
      if (TITLES[kind]) workspace.open(kind, TITLES[kind], SAMPLE[kind] ?? {})
    })

    // Review shortcuts: W runs the multi-tool trip scene, S the service check.
    const scene = (utterance: string, run: () => void) => {
      clear()
      workspace.closeAll()
      presence.update({ transcript: utterance, caption: null })
      conversation.add('user', utterance)
      later(600, run)
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key === 'w' || e.key === 'W') scene(SAMPLE_UTTERANCE, runTask)
      else if (e.key === 's' || e.key === 'S') scene('Open the terminal and check the service', runServiceCheck)
    }
    window.addEventListener('keydown', onKey)

    // Status the runtime would report (demo values), following the presence.
    const report = () => {
      const s = presence.getSnapshot().state
      systemStatus.setService('Speech recognition', s === 'listening' ? 'busy' : 'ready', s === 'listening' ? 'Listening' : 'Ready')
      systemStatus.setService('Language model', s === 'thinking' || s === 'understanding' || s === 'working' ? 'busy' : 'ready', s === 'working' ? 'Using tools' : s === 'thinking' || s === 'understanding' ? 'Thinking' : 'Local · ready')
      systemStatus.setService('Voice', s === 'speaking' ? 'busy' : 'ready', s === 'speaking' ? 'Speaking' : 'Ready')
    }
    report()
    const offStatus = presence.subscribe(report)

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
      offFocus()
      offTool()
      offStatus()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return null
}
