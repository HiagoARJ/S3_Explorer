import type { S3Client } from '@aws-sdk/client-s3'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeError, uploadFile, type UploadOptions } from '../lib/api'

export type JobKind = 'upload' | 'download' | 'delete' | 'copy' | 'move' | 'zip' | 'empty'
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface Job {
  id: number
  kind: JobKind
  label: string
  detail?: string
  status: JobStatus
  loaded: number
  total: number
  unit: 'bytes' | 'items'
  error?: string
  result?: string
  startedAt?: number
  finishedAt?: number
}

export interface JobContext {
  signal: AbortSignal
  progress: (loaded: number, total?: number) => void
  setDetail: (d: string) => void
}

interface TransfersCtx {
  jobs: Job[]
  /** Envia arquivos em fila (3 em paralelo). Resolve quando todos terminarem. */
  enqueueUploads: (
    client: S3Client,
    bucket: string,
    items: { file: File; key: string; contentType?: string }[],
    opts?: Omit<UploadOptions, 'onProgress' | 'contentType'>,
  ) => Promise<{ ok: number; failed: number }>
  /** Operação longa com progresso e cancelamento (exclusões, cópias, ZIP…). */
  runJob: <T>(
    kind: JobKind,
    label: string,
    unit: Job['unit'],
    fn: (ctx: JobContext) => Promise<T>,
  ) => Promise<T>
  cancel: (id: number) => void
  clearFinished: () => void
}

const Ctx = createContext<TransfersCtx | null>(null)
const CONCURRENCY = 3
let seq = 0

interface Pending {
  id: number
  start: () => Promise<void>
}

export function TransfersProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const aborters = useRef(new Map<number, () => void>())
  const queue = useRef<Pending[]>([])
  const running = useRef(0)

  const patch = useCallback((id: number, p: Partial<Job>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)))
  }, [])

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length) {
      const next = queue.current.shift()!
      running.current++
      void next.start().finally(() => {
        running.current--
        pump()
      })
    }
  }, [])

  const enqueueUploads = useCallback<TransfersCtx['enqueueUploads']>(
    (client, bucket, items, opts = {}) => {
      const created: Job[] = items.map((it) => ({
        id: ++seq,
        kind: 'upload',
        label: it.key,
        detail: bucket,
        status: 'queued',
        loaded: 0,
        total: it.file.size,
        unit: 'bytes',
      }))
      const newestFirst = [...created].reverse()
      setJobs((js) => [...newestFirst, ...js])

      const results = items.map(
        (it, i) =>
          new Promise<boolean>((resolve) => {
            const id = created[i].id
            let canceled = false
            aborters.current.set(id, () => {
              canceled = true
              queue.current = queue.current.filter((q) => q.id !== id)
              patch(id, { status: 'canceled', finishedAt: Date.now() })
              resolve(false)
            })
            queue.current.push({
              id,
              start: async () => {
                if (canceled) return
                patch(id, { status: 'running', startedAt: Date.now() })
                const up = uploadFile(client, bucket, it.key, it.file, {
                  ...opts,
                  contentType: it.contentType,
                  onProgress: (loaded, total) => patch(id, { loaded, total }),
                })
                aborters.current.set(id, () => {
                  canceled = true
                  void up.abort()
                })
                try {
                  await up.done()
                  patch(id, { status: 'done', loaded: it.file.size, finishedAt: Date.now() })
                  resolve(true)
                } catch (e) {
                  patch(id, canceled ? { status: 'canceled', finishedAt: Date.now() } : { status: 'error', error: describeError(e), finishedAt: Date.now() })
                  resolve(false)
                } finally {
                  aborters.current.delete(id)
                }
              },
            })
          }),
      )
      pump()
      return Promise.all(results).then((r) => ({ ok: r.filter(Boolean).length, failed: r.filter((x) => !x).length }))
    },
    [patch, pump],
  )

  const runJob = useCallback<TransfersCtx['runJob']>(
    async (kind, label, unit, fn) => {
      const id = ++seq
      const ctrl = new AbortController()
      setJobs((js) => [{ id, kind, label, status: 'running', loaded: 0, total: 0, unit, startedAt: Date.now() }, ...js])
      aborters.current.set(id, () => ctrl.abort())
      let last = 0
      try {
        const out = await fn({
          signal: ctrl.signal,
          progress: (loaded, total) => {
            // no máximo ~10 atualizações por segundo
            const now = performance.now()
            if (now - last < 100 && (total === undefined || loaded < total)) return
            last = now
            patch(id, total === undefined ? { loaded } : { loaded, total })
          },
          setDetail: (detail) => patch(id, { detail }),
        })
        patch(id, { status: 'done', finishedAt: Date.now() })
        return out
      } catch (e) {
        patch(
          id,
          ctrl.signal.aborted
            ? { status: 'canceled', finishedAt: Date.now() }
            : { status: 'error', error: describeError(e), finishedAt: Date.now() },
        )
        throw e
      } finally {
        aborters.current.delete(id)
      }
    },
    [patch],
  )

  const cancel = useCallback((id: number) => aborters.current.get(id)?.(), [])

  const clearFinished = useCallback(() => setJobs((js) => js.filter((j) => j.status === 'running' || j.status === 'queued')), [])

  const value = useMemo(() => ({ jobs, enqueueUploads, runJob, cancel, clearFinished }), [jobs, enqueueUploads, runJob, cancel, clearFinished])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTransfers(): TransfersCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTransfers fora do TransfersProvider')
  return c
}
