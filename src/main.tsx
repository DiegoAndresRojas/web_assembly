import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { useStore } from './store'
import { runStartupTasks } from './store/startup'
import './styles/tokens.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found')

if (import.meta.env.DEV) {
  // Debug-only: lets the browser devtools console (or an automated test)
  // inspect/drive the store directly, e.g. `__store.getState().projects`.
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}

void runStartupTasks(useStore)

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
