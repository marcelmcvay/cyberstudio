import { useEffect } from 'react'
import { workspaceFileActions } from '../lib/download'

export default function WorkspaceFileActions() {
  useEffect(() => { workspaceFileActions() }, [])
  return null
}
