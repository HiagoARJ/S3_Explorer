import type { S3Client } from '@aws-sdk/client-s3'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient, createPublicClient } from '../lib/client'
import {
  connectionTarget,
  DEFAULT_CONNECTION_ID,
  DEFAULT_LOCALSTACK,
  loadConnections,
  saveConnections,
  type Connection,
} from '../lib/connections'
import { readJSON, writeJSON } from '../lib/storage'

export type Theme = 'system' | 'light' | 'dark'
export type Density = 'compact' | 'comfortable'

export interface Settings {
  theme: Theme
  density: Density
  /** Objetos por página na listagem (máximo do S3: 1000). */
  pageSize: number
  /** Validade padrão (segundos) das URLs pré-assinadas. */
  presignExpires: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'comfortable',
  pageSize: 200,
  presignExpires: 3600,
}

interface SettingsCtx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  isDark: boolean

  connections: Connection[]
  connection: Connection
  setActiveConnection: (id: string) => void
  saveConnection: (c: Connection) => void
  deleteConnection: (id: string) => void

  /** Cliente na região da conexão. */
  client: S3Client
  /** Cliente para a região de um bucket específico (a AWS exige a região certa para URLs pré-assinadas). */
  clientFor: (region?: string) => S3Client
  /** Cliente para gerar URLs pré-assinadas que funcionam fora do app. */
  publicClientFor: (region?: string) => S3Client
  /** Endpoint da conexão ativa, para exibição e mensagens de erro. */
  endpointLabel: string
  readOnly: boolean
}

const Ctx = createContext<SettingsCtx | null>(null)

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>('settings', {}) }))
  const [conn, setConn] = useState(loadConnections)
  const systemDark = useSystemDark()
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => saveConnections(conn.connections, conn.activeId), [conn])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeJSON('settings', next)
      return next
    })
  }, [])

  const setActiveConnection = useCallback((id: string) => setConn((c) => ({ ...c, activeId: id })), [])

  const saveConnection = useCallback((c: Connection) => {
    setConn((prev) => {
      const exists = prev.connections.some((x) => x.id === c.id)
      return {
        ...prev,
        connections: exists ? prev.connections.map((x) => (x.id === c.id ? c : x)) : [...prev.connections, c],
      }
    })
  }, [])

  const deleteConnection = useCallback((id: string) => {
    if (id === DEFAULT_CONNECTION_ID) return
    setConn((prev) => ({
      connections: prev.connections.filter((x) => x.id !== id),
      activeId: prev.activeId === id ? DEFAULT_CONNECTION_ID : prev.activeId,
    }))
  }, [])

  const connection = conn.connections.find((c) => c.id === conn.activeId) ?? DEFAULT_LOCALSTACK

  // Um cliente por região, recriado quando a conexão muda
  const clients = useMemo(() => {
    const cache = new Map<string, S3Client>()
    const pub = new Map<string, S3Client>()
    const base = connection.region || 'us-east-1'
    return {
      clientFor: (region?: string) => {
        const r = region || base
        let c = cache.get(r)
        if (!c) cache.set(r, (c = createClient(connection, r)))
        return c
      },
      publicClientFor: (region?: string) => {
        const r = region || base
        let c = pub.get(r)
        if (!c) pub.set(r, (c = createPublicClient(connection, r)))
        return c
      },
    }
  }, [connection])

  const client = useMemo(() => clients.clientFor(), [clients])
  const endpointLabel = useMemo(() => connectionTarget(connection), [connection])

  const value = useMemo(
    () => ({
      settings,
      update,
      isDark,
      connections: conn.connections,
      connection,
      setActiveConnection,
      saveConnection,
      deleteConnection,
      client,
      clientFor: clients.clientFor,
      publicClientFor: clients.publicClientFor,
      endpointLabel,
      readOnly: connection.readOnly,
    }),
    [settings, update, isDark, conn.connections, connection, setActiveConnection, saveConnection, deleteConnection, client, clients, endpointLabel],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSettings fora do SettingsProvider')
  return c
}
