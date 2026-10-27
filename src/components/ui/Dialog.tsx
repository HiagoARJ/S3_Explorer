import { TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

// Pilha de camadas abertas: Esc fecha apenas a camada do topo (ex.: diálogo sobre o drawer).
const escStack: { current: () => void }[] = []

function onGlobalKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && escStack.length) {
    e.preventDefault()
    escStack[escStack.length - 1].current()
  }
}

export function useEscape(onClose: () => void, enabled = true) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!enabled) return
    const entry = ref
    if (escStack.length === 0) window.addEventListener('keydown', onGlobalKey)
    escStack.push(entry)
    return () => {
      const i = escStack.lastIndexOf(entry)
      if (i >= 0) escStack.splice(i, 1)
      if (escStack.length === 0) window.removeEventListener('keydown', onGlobalKey)
    }
  }, [enabled])
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = 'md',
  busy,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  busy?: boolean
}) {
  useEscape(() => !busy && onClose(), open)
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="animate-fade-in fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] dark:bg-black/60"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-pop-in relative my-auto flex max-h-[calc(100vh-4rem)] w-full ${w} flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900`}
      >
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          {Icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
              <Icon className="size-[18px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/70 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  children,
  width = 'w-[min(640px,100vw)]',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="animate-fade-in absolute inset-0 bg-zinc-950/20 dark:bg-black/40" onClick={onClose} />
      <aside
        className={`animate-slide-in absolute top-0 right-0 flex h-full ${width} flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900`}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Excluir',
  confirmText,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  children?: ReactNode
  confirmLabel?: string
  /** Se definido, o usuário precisa digitar esse texto para confirmar. */
  confirmText?: string
  busy?: boolean
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) setTyped('')
  }, [open])
  const ok = !confirmText || typed === confirmText
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!ok} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <TriangleAlert className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
          {children}
          {confirmText && (
            <div className="mt-4">
              <p className="mb-1.5 text-[13px]">
                Digite <span className="font-mono font-semibold text-zinc-900 dark:text-white">{confirmText}</span>{' '}
                para confirmar:
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ok && !busy && onConfirm()}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
