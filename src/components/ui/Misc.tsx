import { Loader2, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />
}

export type Tone = 'neutral' | 'indigo' | 'green' | 'amber' | 'rose' | 'sky' | 'violet'

const tones: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-700/60',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25',
}

export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  className = '',
  title,
}: {
  children: ReactNode
  tone?: Tone
  icon?: LucideIcon
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1 font-sans text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </kbd>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = 'neutral',
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        className={`mb-4 flex size-12 items-center justify-center rounded-2xl ring-1 ${
          tone === 'error'
            ? 'bg-rose-50 text-rose-500 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20'
            : 'bg-zinc-100 text-zinc-400 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-zinc-800'
        }`}
      >
        <Icon className="size-6" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  icon: Icon,
  description,
  actions,
}: {
  title: string
  icon?: LucideIcon
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800/80">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-zinc-400" />}
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
  count?: number
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-zinc-200)] dark:shadow-[inset_0_-1px_0_var(--color-zinc-800)]"
    >
      {items.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`focus-ring relative flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? 'border-indigo-500 text-zinc-900 dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {t.icon && <t.icon className="size-4" />}
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: {
  options: { value: T; label: string; icon?: LucideIcon; title?: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
}) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-md font-medium transition-all ${
              size === 'xs' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[13px]'
            } ${
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {o.icon && <o.icon className="size-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Menu suspenso: fecha ao clicar fora, com Esc ou ao rolar a página.
 * Renderizado num portal com posição fixa para não ser cortado por tabelas com overflow;
 * abre para cima quando não cabe embaixo.
 */
export function Popover({
  trigger,
  children,
  align = 'right',
  width = 'w-56',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  /** Classe de largura; "w-full" = largura do gatilho. */
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const h = menu.current?.offsetHeight ?? 0
    const below = window.innerHeight - r.bottom
    const up = below < h + 12 && r.top > below
    setPos({
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      ...(align === 'right' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
      ...(width === 'w-full' ? { width: r.width } : {}),
    })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = (e: Event) => !menu.current?.contains(e.target as Node) && setOpen(false)
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        createPortal(
          <div
            ref={menu}
            style={pos}
            className={`animate-pop-in fixed z-70 ${width === 'w-full' ? '' : width} max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900`}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  hint,
  danger,
}: {
  icon?: LucideIcon
  children: ReactNode
  onClick: () => void
  hint?: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        danger
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-70" />}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11px] text-zinc-400">{hint}</span>}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{children}</div>
}

export function ProgressBar({
  value,
  tone = 'indigo',
  indeterminate,
  className = '',
}: {
  /** 0 a 1 */
  value: number
  tone?: 'indigo' | 'green' | 'rose' | 'amber'
  indeterminate?: boolean
  className?: string
}) {
  const color = { indigo: 'bg-indigo-500', green: 'bg-emerald-500', rose: 'bg-rose-500', amber: 'bg-amber-500' }[tone]
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800 ${className}`}>
      {indeterminate ? (
        <div className={`animate-progress h-full w-1/3 rounded-full ${color}`} />
      ) : (
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${color}`}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      )}
    </div>
  )
}

/** Linha rótulo/valor para painéis de detalhes. */
export function DetailRow({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`min-w-0 wrap-break-word ${mono ? 'font-mono text-[12px]' : ''}`}>{children}</dd>
    </div>
  )
}
