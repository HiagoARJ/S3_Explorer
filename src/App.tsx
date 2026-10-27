import { useCallback, useEffect, useState } from 'react'
import { BucketsDashboard } from './components/buckets/BucketsDashboard'
import { BucketView } from './components/buckets/BucketView'
import { CreateBucketDialog } from './components/buckets/CreateBucketDialog'
import { CommandPalette } from './components/layout/CommandPalette'
import { ConnectionsDialog } from './components/layout/ConnectionsDialog'
import { ResizableAside, useSidebarLayout } from './components/layout/ResizableAside'
import { SettingsDialog } from './components/layout/SettingsDialog'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { TransfersPanel } from './components/layout/TransfersPanel'
import { BucketsProvider } from './hooks/useBuckets'
import { useHashRoute } from './hooks/useHashRoute'
import { SettingsProvider, useSettings } from './hooks/useSettings'
import { ToastProvider } from './hooks/useToast'
import { TransfersProvider, useTransfers } from './hooks/useTransfers'
import type { ConnectionKind } from './lib/connections'

function Shell() {
  const { route, navigate } = useHashRoute()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [connDialog, setConnDialog] = useState<{ open: boolean; newKind?: ConnectionKind }>({ open: false })
  const { readOnly } = useSettings()
  const { jobs } = useTransfers()
  const layout = useSidebarLayout()
  const { toggle: toggleSidebar } = layout

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      // Ctrl+B recolhe/expande o menu lateral (fora de campos de texto)
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [toggleSidebar])

  // Evita fechar a aba no meio de um envio
  const busy = jobs.some((j) => j.status === 'running' || j.status === 'queued')
  useEffect(() => {
    if (!busy) return
    const on = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', on)
    return () => window.removeEventListener('beforeunload', on)
  }, [busy])

  const openCreate = useCallback(() => !readOnly && setCreateOpen(true), [readOnly])
  const manageConnections = useCallback(() => setConnDialog({ open: true }), [])
  const addAws = useCallback(() => setConnDialog({ open: true, newKind: 'aws' }), [])
  const goHome = useCallback(() => navigate(), [navigate])
  const openBucket = useCallback((b: string, prefix = '') => navigate(b, 'objects', prefix), [navigate])

  const sidebarProps = {
    current: route.bucket,
    onCreateBucket: openCreate,
    onOpenSettings: () => setSettingsOpen(true),
    onNavigate: () => setMobileNav(false),
    onSwitchedConnection: () => {
      setMobileNav(false)
      navigate()
    },
    onManageConnections: manageConnections,
    onAddAws: addAws,
    onSearch: () => setPaletteOpen(true),
  }

  return (
    <div className="flex h-full">
      <ResizableAside width={layout.width} collapsed={layout.collapsed} onChange={layout.setLayout}>
        <Sidebar {...sidebarProps} collapsed={layout.collapsed} onToggleCollapse={toggleSidebar} />
      </ResizableAside>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-zinc-950/40" onClick={() => setMobileNav(false)} />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-72 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <Sidebar {...sidebarProps} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar route={route} onMenu={() => setMobileNav(true)} onSearch={() => setPaletteOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {route.bucket ? (
            <BucketView key={route.bucket} bucket={route.bucket} tab={route.tab} prefix={route.prefix} navigate={navigate} />
          ) : (
            <BucketsDashboard onOpen={openBucket} onCreateBucket={openCreate} onOpenSettings={manageConnections} />
          )}
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onManageConnections={manageConnections} />
      <ConnectionsDialog open={connDialog.open} initialNew={connDialog.newKind} onClose={() => setConnDialog({ open: false })} onActivated={() => navigate()} />
      <CreateBucketDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={openBucket} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpen={openBucket} onHome={goHome} onCreateBucket={openCreate} />
      <TransfersPanel />
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <BucketsProvider>
          <TransfersProvider>
            <Shell />
          </TransfersProvider>
        </BucketsProvider>
      </ToastProvider>
    </SettingsProvider>
  )
}
