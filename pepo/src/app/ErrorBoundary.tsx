import { Component, type ReactNode } from 'react'

interface Props {
  /** Shown instead of the children after an error. */
  fallback?: ReactNode
  /** Names the part in the console report. */
  label: string
  /** Called after an error is caught, e.g. to schedule a remount. */
  onError?: (error: unknown) => void
  children: ReactNode
}

/**
 * Contains a failure to one part of the interface: a broken surface or a
 * lost graphics context must never take the whole of PEPO down with it.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[PEPO] ${this.props.label} failed`, error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
