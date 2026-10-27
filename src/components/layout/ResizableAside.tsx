import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { readJSON, writeJSON } from '../../lib/storage'

export const SIDEBAR_DEFAULT = 256
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 520
export const SIDEBAR_COLLAPSED = 64
/** Arrastar abaixo dessa largura recolhe o menu (e acima dela, estando recolhido, expande). */
const SNAP = 150

interface Layout {
  width: number
  collapsed: boolean
}

const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))

export function useSidebarLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    const l = readJSON<Partial<Layout>>('layout', {})
    return { width: clamp(l.width ?? SIDEBAR_DEFAULT), collapsed: !!l.collapsed }
  })
  useEffect(() => writeJSON('layout', layout), [layout])

  const toggle = useCallback(() => setLayout((l) => ({ ...l, collapsed: !l.collapsed })), [])
  return { ...layout, setLayout, toggle }
}

export function ResizableAside({
  width,
  collapsed,
  onChange,
  children,
}: {
  width: number
  collapsed: boolean
  onChange: (l: Layout) => void
  children: ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  // `restore`: largura expandida no início do arraste — é a que volta ao expandir depois de recolher.
  const start = useRef<{ x: number; w: number; restore: number } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: collapsed ? SIDEBAR_COLLAPSED : width, restore: width }
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const w = start.current.w + e.clientX - start.current.x
    if (w < SNAP) {
      if (!collapsed) onChange({ width: start.current.restore, collapsed: true })
    } else {
      onChange({ width: clamp(w), collapsed: false })
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (collapsed) return
      const w = width - step
      onChange(w < SIDEBAR_MIN ? { width, collapsed: true } : { width: clamp(w), collapsed: false })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(collapsed ? { width, collapsed: false } : { width: clamp(width + step), collapsed: false })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange({ width, collapsed: !collapsed })
    }
  }

  // Durante o arraste: cursor global e sem seleção de texto
  useEffect(() => {
    if (!dragging) return
    const prev = [document.body.style.cursor, document.body.style.userSelect]
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prev[0]
      document.body.style.userSelect = prev[1]
    }
  }, [dragging])

  const current = collapsed ? SIDEBAR_COLLAPSED : width

  return (
    <aside
      style={{ width: current }}
      className={`relative hidden shrink-0 border-r border-zinc-200 bg-zinc-100/60 lg:block dark:border-zinc-800/80 dark:bg-zinc-900/40 ${
        dragging ? '' : 'transition-[width] duration-200 ease-out'
      }`}
    >
      {/* sem overflow-hidden: o popover de conexões precisa ultrapassar o menu recolhido */}
      <div className="h-full min-w-0">{children}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar menu lateral"
        aria-valuemin={SIDEBAR_COLLAPSED}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={current}
        tabIndex={0}
        title="Arraste para redimensionar · duplo clique para restaurar · Enter recolhe/expande"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange({ width: SIDEBAR_DEFAULT, collapsed: false })}
        onKeyDown={onKeyDown}
        className="group/handle absolute inset-y-0 -right-1.5 z-20 flex w-3 cursor-col-resize touch-none justify-center outline-none"
      >
        <span
          className={`h-full w-0.5 rounded-full transition-colors ${
            dragging
              ? 'bg-indigo-500'
              : 'bg-transparent group-hover/handle:bg-indigo-500/60 group-focus-visible/handle:bg-indigo-500'
          }`}
        />
      </div>
    </aside>
  )
}
