import type { S3Client } from '@aws-sdk/client-s3'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeError, getBucketRegion, listBuckets } from '../lib/api'
import type { BucketInfo } from '../lib/types'
import { useSettings } from './useSettings'

export type ConnectionState = 'connecting' | 'online' | 'offline'

interface BucketsCtx {
  buckets: BucketInfo[]
  names: string[]
  loading: boolean
  error: string | null
  connection: ConnectionState
  lastLoadedAt: Date | null
  refresh: () => Promise<void>
  /** Região do bucket (na AWS consulta GetBucketLocation quando o ListBuckets não informa). */
  resolveRegion: (bucket: string) => Promise<string>
  /** Cliente já na região do bucket. */
  clientForBucket: (bucket: string) => Promise<S3Client>
}

const Ctx = createContext<BucketsCtx | null>(null)

export function BucketsProvider({ children }: { children: ReactNode }) {
  const { client, clientFor, endpointLabel, connection: conn } = useSettings()
  const [buckets, setBuckets] = useState<BucketInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const reqId = useRef(0)
  const regions = useRef(new Map<string, Promise<string>>())

  const refresh = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const list = await listBuckets(client)
      if (id !== reqId.current) return
      for (const b of list) if (b.region) regions.current.set(b.name, Promise.resolve(b.region))
      setBuckets(list)
      setConnection('online')
      setError(null)
      setLastLoadedAt(new Date())
    } catch (err) {
      if (id !== reqId.current) return
      setError(describeError(err, endpointLabel))
      setConnection('offline')
      setBuckets([])
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [client, endpointLabel])

  const resolveRegion = useCallback(
    (bucket: string) => {
      // Fora da AWS a região não muda o destino: usa a da conexão
      if (conn.kind !== 'aws') return Promise.resolve(conn.region || 'us-east-1')
      let p = regions.current.get(bucket)
      if (!p) {
        p = getBucketRegion(client, bucket).catch(() => conn.region || 'us-east-1')
        regions.current.set(bucket, p)
      }
      return p
    },
    [client, conn.kind, conn.region],
  )

  const clientForBucket = useCallback(async (bucket: string) => clientFor(await resolveRegion(bucket)), [clientFor, resolveRegion])

  useEffect(() => {
    regions.current = new Map()
    setConnection('connecting')
    setBuckets([])
    setError(null)
    void refresh()
  }, [refresh])

  const names = useMemo(() => buckets.map((b) => b.name), [buckets])

  const value = useMemo(
    () => ({ buckets, names, loading, error, connection, lastLoadedAt, refresh, resolveRegion, clientForBucket }),
    [buckets, names, loading, error, connection, lastLoadedAt, refresh, resolveRegion, clientForBucket],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBuckets(): BucketsCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useBuckets fora do BucketsProvider')
  return c
}
