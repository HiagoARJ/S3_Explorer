import type { S3Client } from '@aws-sdk/client-s3'
import { useCallback, useSyncExternalStore } from 'react'
import { computeBucketStats, describeError } from '../lib/api'
import type { BucketStats } from '../lib/types'

/**
 * O S3 não informa tamanho/quantidade de um bucket: é preciso listar tudo.
 * O resultado fica em memória (por conexão + bucket) e é compartilhado entre o painel e a visão geral.
 */
export interface StatsEntry {
  stats?: BucketStats
  loading: boolean
  error?: string
  at?: Date
}

const store = new Map<string, StatsEntry>()
const running = new Map<string, AbortController>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

function set(key: string, patch: Partial<StatsEntry>) {
  store.set(key, { loading: false, ...store.get(key), ...patch })
  emit()
}

export function computeStats(key: string, client: S3Client, bucket: string): Promise<void> {
  running.get(key)?.abort()
  const ctrl = new AbortController()
  running.set(key, ctrl)
  set(key, { loading: true, error: undefined })
  return computeBucketStats(client, bucket, {
    signal: ctrl.signal,
    onProgress: (s) => !ctrl.signal.aborted && set(key, { stats: s, loading: true }),
  })
    .then((stats) => set(key, { stats, loading: false, at: new Date() }))
    .catch((e) => {
      if (!ctrl.signal.aborted) set(key, { loading: false, error: describeError(e) })
    })
    .finally(() => {
      if (running.get(key) === ctrl) running.delete(key)
    })
}

export function cancelStats(key: string) {
  running.get(key)?.abort()
  running.delete(key)
  const e = store.get(key)
  if (e?.loading) set(key, { loading: false })
}

/** Invalida o cache (ex.: após uploads ou exclusões). */
export function invalidateStats(key: string) {
  if (store.delete(key)) emit()
}

export function statsKey(connectionId: string, bucket: string) {
  return `${connectionId}:${bucket}`
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Versão do store: muda a cada atualização (para listas que leem várias entradas). */
export function useStatsVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

export function useStatsEntry(key: string): StatsEntry | undefined {
  const get = useCallback(() => store.get(key), [key])
  return useSyncExternalStore(subscribe, get)
}

export function getStatsEntry(key: string): StatsEntry | undefined {
  return store.get(key)
}
