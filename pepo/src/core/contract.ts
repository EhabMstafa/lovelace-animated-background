import { presence, usePresence, type PresenceForm, type PresenceState } from './presence'
import { theme, useTheme, type Theme } from './theme'
import { useWorkspace, workspace, type ToolKind } from './workspace'

/**
 * The frontend's data and event contract in one place (prompt §72). The
 * visual layer reads these; PEPO's runtime drives them through the stores
 * (`presence`, `workspace`, `theme`) and `pepoEvents`. No backend is assumed.
 */
export interface PEPOView {
  presenceState: PresenceState
  presentationMode: PresenceForm
  theme: Theme
  isListening: boolean
  isSpeaking: boolean
  isWorking: boolean
  isInterrupted: boolean
  transcript: string | null
  /** Open tools, front first (minimised ones included, flagged). */
  activeTools: { id: string; kind: ToolKind; title: string; minimized: boolean }[]
}

export const pepoActions = {
  setPresenceState: (state: PresenceState) => presence.update({ state }),
  setPresentationMode: (form: PresenceForm) => presence.update({ form }),
  setTheme: (t: Theme) => theme.set(t),
  /** Live audio level 0..1 (microphone while listening, speech while speaking). */
  setAudioLevel: (level: number) => presence.setEnergy(level),
  setTranscript: (text: string | null) => presence.update({ transcript: text }),
  openTool: (kind: ToolKind, title: string, data?: Record<string, unknown>) => workspace.open(kind, title, data),
  closeTool: (id: string) => workspace.close(id),
  focusTool: (id: string) => workspace.focus(id),
}

/** The current view of PEPO for components (re-renders on state, theme and workspace changes). */
export function usePEPOView(): PEPOView {
  const p = usePresence()
  const t = useTheme()
  const windows = useWorkspace()
  return {
    presenceState: p.state,
    presentationMode: p.form,
    theme: t,
    isListening: p.state === 'listening',
    isSpeaking: p.state === 'speaking',
    isWorking: p.state === 'working',
    isInterrupted: p.state === 'interrupted',
    transcript: p.transcript,
    activeTools: [...windows].sort((a, b) => b.z - a.z).map((w) => ({ id: w.id, kind: w.kind, title: w.title, minimized: w.minimized })),
  }
}

/** The audio level changes at audio rate, so it is read imperatively, not rendered. */
export const readAudioLevel = () => presence.getEnergy()
