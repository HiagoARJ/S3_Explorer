import { CornerDownLeft, FolderOpen, LayoutDashboard, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBuckets } from '../../hooks/useBuckets'
import { useSettings } from '../../hooks/useSettings'
import { formatDateShort } from '../../lib/format'
import { BucketIcon } from '../../lib/icons'
import { parentPrefix } from '../../lib/paths'
import { useEscape } from '../ui/Dialog'
import { Kbd } from '../ui/Misc'

interface Entry {
  id: string
  label: string
  hint?: string
  icon: typeof Search
  run: () => void
}

function fuzzyScore(text: string, q: string): number {
  const t = text.toLowerCase()
  if (!q) return 1
  const idx = t.indexOf(q)
  if (idx >= 0) return 100 - idx
  let ti = 0
  for (const ch of q) {
    ti = t.indexOf(ch, ti)
    if (ti < 0) return 0
    ti++
  }
  return 1
}

export function CommandPalette({
  open,
  onClose,
  onOpen,
  onHome,
  onCreateBucket,
}: {
  open: boolean
  onClose: () => void
  /** Abre um bucket (e opcionalmente uma pasta). */
  onOpen: (bucket: string, prefix?: string) => void
  onHome: () => void
  onCreateBucket: () => void
}) {
  const { buckets } = useBuckets()
  const { readOnly } = useSettings()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEscape(onClose, open)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const raw = q.trim()
    // s3://bucket/pasta/arquivo → abre direto a pasta
    const uri = raw.match(/^s3:\/\/([^/]+)\/?(.*)$/i)
    if (uri) {
      const [, bucket, rest] = uri
      const prefix = rest.endsWith('/') || !rest ? rest : parentPrefix(rest)
      return [{ id: 'uri', label: `Abrir ${raw}`, hint: 'caminho S3', icon: FolderOpen, run: () => onOpen(bucket, prefix) }]
    }
    const s = raw.toLowerCase()
    const bucketEntries = buckets
      .map((b) => ({ b, score: fuzzyScore(b.name, s) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map<Entry>(({ b }) => ({
        id: `b:${b.name}`,
        label: b.name,
        hint: b.region ?? (b.createdAt ? formatDateShort(b.createdAt) : undefined),
        icon: BucketIcon,
        run: () => onOpen(b.name),
      }))
    const actions: Entry[] = [
      { id: 'home', label: 'Painel de buckets', icon: LayoutDashboard, run: onHome },
      ...(readOnly ? [] : [{ id: 'create', label: 'Criar bucket', icon: Plus, run: onCreateBucket }]),
    ].filter((a) => fuzzyScore(a.label, s) > 0)
    return [...bucketEntries, ...actions]
  }, [q, buckets, onOpen, onHome, onCreateBucket, readOnly])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (e?: Entry) => {
    if (!e) return
    onClose()
    e.run()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="animate-fade-in fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} />
      <div className="animate-pop-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Search className="size-4 text-zinc-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, entries.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(entries[active])
              }
            }}
            placeholder="Buscar bucket, ação ou colar s3://bucket/pasta/"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">Nada encontrado.</p>
          ) : (
            entries.map((e, i) => (
              <button
                key={e.id}
                data-idx={i}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(e)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100' : ''
                }`}
              >
                <e.icon className="size-4 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{e.label}</span>
                {e.hint && <span className="text-xs text-zinc-400">{e.hint}</span>}
                {i === active && <CornerDownLeft className="size-3.5 text-zinc-400" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
