import { cloneElement, useState, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Pos = { x: number; y: number }

/**
 * Tooltip posicionado com `position: fixed` via portal — não é cortado por
 * containers com overflow (ex.: a lista de tabelas com rolagem).
 */
export function Tooltip({
  label,
  children,
  disabled,
  side = 'right',
}: {
  label: ReactNode
  children: ReactElement<{ onMouseEnter?: (e: MouseEvent) => void; onMouseLeave?: () => void; onFocus?: (e: FocusEvent) => void; onBlur?: () => void }>
  disabled?: boolean
  side?: 'right' | 'bottom'
}) {
  const [pos, setPos] = useState<Pos | null>(null)
  if (disabled) return children

  const show = (el: Element) => {
    const r = el.getBoundingClientRect()
    setPos(side === 'right' ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.bottom + 6 })
  }
  const hide = () => setPos(null)

  return (
    <>
      {cloneElement(children, {
        onMouseEnter: (e: MouseEvent) => show(e.currentTarget),
        onMouseLeave: hide,
        onFocus: (e: FocusEvent) => show(e.currentTarget),
        onBlur: hide,
      })}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className={`animate-fade-in pointer-events-none fixed z-[90] max-w-xs rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900 ${
              side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2'
            }`}
            style={{ left: pos.x, top: pos.y }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}
