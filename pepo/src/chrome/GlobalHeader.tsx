import { useEffect, useState } from 'react'
import { PresenceToggle } from './PresenceToggle'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Align ticks to the minute boundary; no need to wake every second.
    let interval = 0
    const timeout = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [])
  return now
}

interface GlobalHeaderProps {
  userInitial?: string
}

/** A hairline of information. Nothing here should ever call for attention. */
export function GlobalHeader({ userInitial = 'E' }: GlobalHeaderProps) {
  const now = useClock()

  return (
    <header className="global-header">
      <div className="flex items-baseline gap-4">
        <span className="wordmark">PEPO</span>
        <span className="hidden text-[12px] tracking-[0.01em] text-[var(--text-muted)] md:inline">
          Your intelligent companion
        </span>
      </div>

      <div className="flex items-center gap-5 text-[12px] text-[var(--text-secondary)]">
        <PresenceToggle />
        <span className="flex items-center gap-2" title="Running on this device. Nothing leaves it.">
          <span className="local-dot" />
          <span className="hidden sm:inline">Local</span>
        </span>
        <time className="tabular-nums hidden sm:inline" dateTime={now.toISOString()}>
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
        <button className="user-chip" aria-label="Account">
          {userInitial}
        </button>
      </div>
    </header>
  )
}
