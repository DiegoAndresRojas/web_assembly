import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from './Button'

export interface ErrorBoundaryProps {
  /** What the user was looking at, for the message ("the 3D view"). */
  area: string
  /** Label and action of the way out (e.g. back to the board). */
  exitLabel: string
  onExit: () => void
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Keeps a crash in one screen from blanking the whole app: shows what
 *  failed and a way back to a screen that still works. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.area}]`, error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          textAlign: 'center',
        }}
      >
        <strong>Something went wrong in {this.props.area}.</strong>
        <span className="text-muted" style={{ fontSize: 12, maxWidth: 480 }}>
          {error.message || String(error)}
        </span>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Your project is saved. You can go back and try again.
        </span>
        <Button
          variant="primary"
          onClick={() => {
            this.setState({ error: null })
            this.props.onExit()
          }}
        >
          {this.props.exitLabel}
        </Button>
      </div>
    )
  }
}
