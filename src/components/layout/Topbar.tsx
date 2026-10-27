import { ChevronRight, Cloud, Lock, Menu, Monitor, Moon, Search, Sun } from 'lucide-react'
import { routeHref, type Route } from '../../hooks/useHashRoute'
import { useSettings, type Theme } from '../../hooks/useSettings'
import { prefixCrumbs } from '../../lib/paths'
import { IconButton } from '../ui/Button'
import { Kbd } from '../ui/Misc'

const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const themeIcon = { system: Monitor, light: Sun, dark: Moon }
const themeLabel = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: escuro' }

const crumbCls = 'truncate text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
const sep = <ChevronRight className="size-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />

export function Topbar({ route, onMenu, onSearch }: { route: Route; onMenu: () => void; onSearch: () => void }) {
  const { settings, update, connection } = useSettings()
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const crumbs = route.bucket && route.tab === 'objects' ? prefixCrumbs(route.prefix) : []

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/80 px-3 backdrop-blur-md sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/80">
      <IconButton icon={Menu} label="Menu" className="lg:hidden" onClick={onMenu} />

      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        <a href={routeHref()} className={`shrink-0 ${crumbCls}`}>
          Buckets
        </a>
        {route.bucket && (
          <>
            {sep}
            {crumbs.length ? (
              <a href={routeHref(route.bucket)} className={`max-w-48 ${crumbCls}`}>
                {route.bucket}
              </a>
            ) : (
              <span className="truncate font-medium">{route.bucket}</span>
            )}
          </>
        )}
        {/* Pastas intermediárias somem em telas estreitas; a atual sempre aparece */}
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={c.prefix} className={`min-w-0 items-center gap-1.5 ${last ? 'flex' : 'hidden md:flex'}`}>
              {sep}
              {last ? (
                <span className="truncate font-medium">{c.name}</span>
              ) : (
                <a href={routeHref(route.bucket, 'objects', c.prefix)} className={`max-w-40 ${crumbCls}`}>
                  {c.name}
                </a>
              )}
            </span>
          )
        })}
      </nav>

      <div className="flex-1" />

      {connection.kind === 'aws' && (
        <span
          className="hidden items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-500/20 ring-inset sm:inline-flex dark:text-amber-300"
          title="Conectado a uma conta AWS real"
        >
          <Cloud className="size-3.5" />
          {connection.name} · {connection.region}
        </span>
      )}
      {connection.readOnly && (
        <span
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-200 ring-inset dark:text-zinc-400 dark:ring-zinc-800"
          title="Escritas bloqueadas nesta conexão"
        >
          <Lock className="size-3.5" />
          <span className="hidden sm:inline">Somente leitura</span>
        </span>
      )}

      <button
        onClick={onSearch}
        className="focus-ring hidden h-8 w-64 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600 xl:flex dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Ir para bucket…</span>
        <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
        <Kbd>K</Kbd>
      </button>
      <IconButton icon={Search} label="Ir para bucket" className="xl:hidden" onClick={onSearch} />
      <IconButton
        icon={themeIcon[settings.theme]}
        label={themeLabel[settings.theme]}
        onClick={() => update({ theme: nextTheme[settings.theme] })}
      />
    </header>
  )
}
