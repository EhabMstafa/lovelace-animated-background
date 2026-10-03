import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { theme, useTheme } from '../core/theme'

/** Dark or light. Remembered per viewer; follows the system until chosen. Key: T. */
export function ThemeToggle() {
  const current = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 't' || e.key === 'T') theme.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const light = current === 'light'
  return (
    <button
      className="theme-toggle"
      onClick={() => theme.toggle()}
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
      title={`${light ? 'Dark' : 'Light'} theme (T)`}
    >
      {light ? <Moon size={14} strokeWidth={1.6} /> : <Sun size={14} strokeWidth={1.6} />}
    </button>
  )
}
