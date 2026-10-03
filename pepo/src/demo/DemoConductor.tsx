import { useEffect } from 'react'
import { pepoEvents } from '../core/events'
import { presence, type PresenceState } from '../core/presence'
import { systemStatus } from '../core/status'
import { workspace, type ToolKind } from '../core/workspace'

/**
 * DEMO ONLY: a stand-in for PEPO's runtime so the visual layer can be
 * experienced without a backend. It reacts to UI intents by scripting
 * presence states. Delete this component when the real runtime connects
 * and drives `presence` itself.
 */

const SAMPLE_UTTERANCE = 'Plan a seven day trip to Norway with the fjords and Lofoten'
const SAMPLE_REPLY = 'I found three new results. Want me to keep going?'
const TASK_REPLY = "Here's a seven-day route through the fjords. Want me to book the trains?"
const TASK_PATTERN = /norway|trip|travel|plan|route|fjord/i

const ITINERARY = [
  'Day 1 — Oslo · Opera House, Bygdøy, evening on Aker Brygge',
  'Day 2 — Bergen Line to Myrdal, Flåm Railway down to the fjord',
  'Day 3 — Nærøyfjord cruise to Gudvangen, bus to Bergen',
  'Day 4 — Bergen · Bryggen, Fløyen, fish market',
  'Day 5 — Drive to Geiranger via Strynefjellet, fjord viewpoints',
  'Day 6 — Ålesund · Art Nouveau town, Aksla at sunset',
  'Day 7 — Fly to Bodø, ferry to Lofoten · Reine, Hamnøy',
]
const TERMINAL = [
  '$ trains search --from Oslo --to Myrdal --date +1d',
  'Bergen Line 08:25 → 13:05 · 3 seats left',
  '$ ferry schedule nærøyfjord --day 3',
  'Flåm 09:00 → Gudvangen 11:00',
  '$ weather forecast bergen geiranger lofoten',
  'Bergen 12° rain · Geiranger 14° clear · Lofoten 9° wind',
  '$ route optimise --stops 7 --mode rail,ferry,road',
  '✓ 1,890 km · 7 days · 3 transfers',
]

const TITLES: Record<ToolKind, string> = {
  map: 'Map', notes: 'Notes', terminal: 'Terminal', browser: 'Browser', files: 'Files', code: 'Code', images: 'Images',
}

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
          set('working', { caption: 'Working on it.' })
          const map = workspace.open('map', 'Norway · route', { progress: 0 })
          workspace.update(map, { active: true })
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
            workspace.update(notes, { active: true })
            ITINERARY.forEach((line, i) =>
              later(500 + i * 620, () => {
                const w = workspace.find('notes')
                if (!w) return
                workspace.update(w.id, { data: { lines: [...((w.data.lines as string[]) ?? []), line] } })
                if (i === ITINERARY.length - 1) workspace.update(w.id, { active: false })
              }),
            )
          })

          later(1700, () => {
            const term = workspace.open('terminal', 'Terminal', { lines: [] })
            workspace.update(term, { active: true })
            TERMINAL.forEach((line, i) =>
              later(300 + i * 480 + (line.startsWith('$') ? 0 : 160), () => {
                const w = workspace.find('terminal')
                if (!w) return
                workspace.update(w.id, { data: { lines: [...((w.data.lines as string[]) ?? []), line] } })
                if (i === TERMINAL.length - 1) workspace.update(w.id, { active: false })
              }),
            )
          })

          later(6900, () => {
            set('speaking', { caption: TASK_REPLY })
            later(520, () =>
              speak(4200, () => {
                set('idle')
                later(2600, () => {
                  const w = workspace.find('terminal')
                  if (w) workspace.close(w.id)
                })
                later(4200, () => presence.update({ caption: null }))
              }),
            )
          })
        })
      })
    }

    const respond = () => {
      set('understanding', { transcript: null })
      later(1100, () => {
        set('thinking')
        later(2200, () => {
          // A breath before the voice: the body prepares, then audio begins.
          set('speaking', { caption: SAMPLE_REPLY })
          later(520, () =>
            speak(4200, () => {
              set('idle')
              later(4200, () => presence.update({ caption: null }))
            }),
          )
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
      const said = presence.getSnapshot().transcript
      if (said) later(500, TASK_PATTERN.test(said) ? runTask : respond)
      else set('idle', { transcript: null })
    })

    const offText = pepoEvents.on('textSubmit', ({ text }) => {
      clear()
      presence.update({ caption: null, transcript: text })
      later(900, TASK_PATTERN.test(text) ? runTask : respond)
    })

    // Tools opened from the dock: the runtime would decide what to show.
    const offTool = pepoEvents.on('toolOpen', ({ toolId }) => {
      const kind = toolId as ToolKind
      if (TITLES[kind]) workspace.open(kind, TITLES[kind])
    })

    // Review shortcut: W runs the work scene.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'w' || e.key === 'W') {
        clear()
        workspace.closeAll()
        presence.update({ transcript: SAMPLE_UTTERANCE, caption: null })
        later(600, runTask)
      }
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
      offTool()
      offStatus()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return null
}
