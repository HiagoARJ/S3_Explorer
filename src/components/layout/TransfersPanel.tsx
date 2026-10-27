import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Copy,
  Eraser,
  FileArchive,
  MoveRight,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTransfers, type Job, type JobKind } from '../../hooks/useTransfers'
import { formatBytes, formatNumber } from '../../lib/format'
import { IconButton } from '../ui/Button'
import { ProgressBar, Spinner } from '../ui/Misc'

const KIND_ICON: Record<JobKind, LucideIcon> = {
  upload: ArrowUpFromLine,
  download: ArrowDownToLine,
  delete: Trash2,
  copy: Copy,
  move: MoveRight,
  zip: FileArchive,
  empty: Eraser,
}

function amount(j: Job, n: number) {
  return j.unit === 'bytes' ? formatBytes(n) : formatNumber(n)
}

function Row({ j, onCancel }: { j: Job; onCancel: () => void }) {
  const Icon = KIND_ICON[j.kind]
  const active = j.status === 'running' || j.status === 'queued'
  const pct = j.total ? j.loaded / j.total : 0
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate text-[13px]" title={j.label}>
          {j.label}
        </span>
        {j.status === 'done' && <CircleCheck className="size-4 shrink-0 text-emerald-500" />}
        {j.status === 'error' && <CircleX className="size-4 shrink-0 text-rose-500" />}
        {j.status === 'canceled' && <span className="text-[11px] text-zinc-400">cancelado</span>}
        {active && <IconButton icon={X} label="Cancelar" size="xs" onClick={onCancel} />}
      </div>
      {active && (
        <>
          <ProgressBar className="mt-1.5" value={pct} indeterminate={j.status === 'running' && !j.total} />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
            <span className="truncate">{j.status === 'queued' ? 'Na fila' : (j.detail ?? '')}</span>
            {j.total > 0 && (
              <span className="shrink-0">
                {amount(j, j.loaded)} / {amount(j, j.total)}
              </span>
            )}
          </div>
        </>
      )}
      {j.status === 'error' && <p className="mt-1 text-[11px] break-words text-rose-600 dark:text-rose-400">{j.error}</p>}
      {j.status === 'done' && j.detail && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{j.detail}</p>}
    </div>
  )
}

export function TransfersPanel() {
  const { jobs, cancel, clearFinished } = useTransfers()
  const [open, setOpen] = useState(true)
  if (!jobs.length) return null

  const active = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
  const failed = jobs.filter((j) => j.status === 'error').length
  const uploading = active.filter((j) => j.kind === 'upload')
  const upTotal = uploading.reduce((s, j) => s + j.total, 0)
  const upLoaded = uploading.reduce((s, j) => s + j.loaded, 0)

  return (
    <div className="animate-pop-in fixed right-4 bottom-4 z-40 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        {active.length ? <Spinner className="size-4 text-indigo-500" /> : failed ? <CircleX className="size-4 text-rose-500" /> : <CircleCheck className="size-4 text-emerald-500" />}
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {active.length ? `${active.length} em andamento` : failed ? `Concluído com ${failed} falha(s)` : 'Tudo concluído'}
          {uploading.length > 0 && upTotal > 0 && (
            <span className="ml-1.5 font-normal text-zinc-500">
              · {Math.round((upLoaded / upTotal) * 100)}% de {formatBytes(upTotal)}
            </span>
          )}
        </p>
        {!active.length && (
          <button onClick={clearFinished} className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Limpar
          </button>
        )}
        <IconButton icon={open ? ChevronDown : ChevronUp} label={open ? 'Minimizar' : 'Expandir'} size="xs" onClick={() => setOpen((o) => !o)} />
      </div>
      {open && (
        <div className="max-h-72 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/70">
          {jobs.slice(0, 200).map((j) => (
            <Row key={j.id} j={j} onCancel={() => cancel(j.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
