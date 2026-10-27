import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: Kind
  title: string
  message?: string
}

interface ToastCtx {
  toast: (kind: Kind, title: string, message?: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (kind: Kind, title: string, message?: string) => {
      const id = ++seq
      setToasts((t) => [...t.slice(-4), { id, kind, title, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-16 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CircleCheck : t.kind === 'error' ? CircleAlert : Info
          const color =
            t.kind === 'success' ? 'text-emerald-500' : t.kind === 'error' ? 'text-rose-500' : 'text-indigo-500'
          return (
            <div
              key={t.id}
              role="status"
              className="animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3.5 shadow-lg shadow-zinc-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.title}</p>
                {t.message && (
                  <p className="mt-0.5 text-xs break-words text-zinc-500 dark:text-zinc-400">{t.message}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                aria-label="Fechar"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast fora do ToastProvider')
  return c.toast
}
