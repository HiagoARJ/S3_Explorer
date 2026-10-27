import { Eraser, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBuckets } from '../../hooks/useBuckets'
import { useToast } from '../../hooks/useToast'
import { useTransfers } from '../../hooks/useTransfers'
import { deleteBucket, describeError, emptyBucket, listObjects } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Checkbox } from '../ui/Form'
import { Spinner } from '../ui/Misc'

/**
 * Esvaziar ou excluir um bucket. Excluir um bucket com objetos oferece esvaziá-lo antes,
 * como faz o console da AWS.
 */
export function BucketDangerDialog({
  bucket,
  mode,
  open,
  onClose,
  onDone,
}: {
  bucket: string
  mode: 'empty' | 'delete'
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { clientForBucket, refresh } = useBuckets()
  const { runJob } = useTransfers()
  const toast = useToast()
  const [typed, setTyped] = useState('')
  const [hasObjects, setHasObjects] = useState<boolean | null>(null)
  const [emptyFirst, setEmptyFirst] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmText = mode === 'empty' ? 'esvaziar permanentemente' : bucket

  useEffect(() => {
    if (!open) return
    setTyped('')
    setError(null)
    setEmptyFirst(true)
    setHasObjects(null)
    let alive = true
    clientForBucket(bucket)
      .then((c) => listObjects(c, bucket, { prefix: '', maxKeys: 1, recursive: true }))
      .then((p) => alive && setHasObjects(p.objects.length > 0 || p.folders.length > 0))
      .catch(() => alive && setHasObjects(null))
    return () => {
      alive = false
    }
  }, [open, bucket, clientForBucket])

  const run = async () => {
    setBusy(true)
    setError(null)
    // Esvaziar pode demorar: o diálogo fecha e o progresso segue no painel de transferências
    let closed = false
    try {
      const client = await clientForBucket(bucket)
      if (mode === 'empty' || (hasObjects !== false && emptyFirst)) {
        closed = true
        onClose()
        const r = await runJob('empty', `Esvaziar ${bucket}`, 'items', ({ signal, progress, setDetail }) =>
          emptyBucket(client, bucket, {
            signal,
            onProgress: (n) => {
              progress(n)
              setDetail(`${formatNumber(n)} excluído(s)`)
            },
          }),
        )
        if (r.errors.length) {
          toast('error', `${r.errors.length} objeto(s) não foram excluídos`, r.errors.slice(0, 3).join('\n'))
          return
        }
        if (mode === 'empty') {
          toast('success', 'Bucket esvaziado', `${formatNumber(r.deleted)} objeto(s)/versão(ões) excluído(s)`)
          onDone()
          return
        }
      }
      await deleteBucket(client, bucket)
      toast('success', 'Bucket excluído', bucket)
      onClose()
      await refresh()
      onDone()
    } catch (e) {
      const msg = describeError(e)
      if (!closed) setError(msg)
      else toast('error', mode === 'empty' ? 'Falha ao esvaziar o bucket' : 'Falha ao excluir o bucket', msg)
    } finally {
      setBusy(false)
    }
  }

  const ok = typed === confirmText
  const Icon = mode === 'empty' ? Eraser : Trash2

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={mode === 'empty' ? 'Esvaziar bucket' : 'Excluir bucket'}
      footer={
        <>
          {error && <p className="mr-auto text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Icon} onClick={run} disabled={!ok} loading={busy}>
            {mode === 'empty' ? 'Esvaziar' : hasObjects && emptyFirst ? 'Esvaziar e excluir' : 'Excluir bucket'}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <TriangleAlert className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
          {mode === 'empty' ? (
            <p>
              Todos os objetos de <span className="font-mono font-semibold">{bucket}</span>, incluindo versões anteriores e marcadores
              de exclusão, serão excluídos permanentemente. O bucket continua existindo.
            </p>
          ) : (
            <>
              <p>
                O bucket <span className="font-mono font-semibold">{bucket}</span> e as configurações dele serão excluídos.
              </p>
              {hasObjects === null ? (
                <p className="flex items-center gap-2 text-xs text-zinc-500">
                  <Spinner className="size-3.5" /> Verificando se há objetos…
                </p>
              ) : hasObjects ? (
                <div className="rounded-lg bg-amber-50 p-2.5 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  O bucket tem objetos, e o S3 só exclui buckets vazios.
                  <Checkbox className="mt-2" checked={emptyFirst} onChange={setEmptyFirst} label="Esvaziar antes (exclui todos os objetos e versões)" />
                </div>
              ) : null}
            </>
          )}
          <div>
            <p className="mb-1.5 text-[13px]">
              Digite <span className="font-mono font-semibold text-zinc-900 dark:text-white">{confirmText}</span> para confirmar:
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ok && !busy && void run()}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
            />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
