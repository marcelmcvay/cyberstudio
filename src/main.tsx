import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'
import App from './App'
import { isDesktop } from './desktop/client'
import WorkspaceTheme from './components/WorkspaceTheme'
import WorkspaceFileActions from './components/WorkspaceFileActions'
import './styles/tokens.css'
import './styles/global.css'
import './styles/workspace-theme.css'

// This entrypoint mounts once; it is not a Fast Refresh component module.
// eslint-disable-next-line react-refresh/only-export-components
const DesktopApp = lazy(() => import('./desktop/DesktopApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceTheme />
    <WorkspaceFileActions />
    <Suspense fallback={<div className="boot" />}>
      {isDesktop ? <DesktopApp /> : <App />}
    </Suspense>
  </StrictMode>,
)
