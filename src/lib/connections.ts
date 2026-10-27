import { readJSON, writeJSON } from './storage'

export type ConnectionKind = 'localstack' | 'aws' | 'custom'

export interface Connection {
  id: string
  name: string
  kind: ConnectionKind
  /** LocalStack/personalizado: URL ou caminho do proxy ("/localstack"). Ignorado para AWS. */
  endpoint: string
  /**
   * Endereço usado nas URLs pré-assinadas que você compartilha (fora do app).
   * Ex.: o proxy "/localstack" só existe no app; outros programas usam http://localhost:4566.
   */
  publicEndpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Credenciais temporárias (SSO / STS). */
  sessionToken: string
  /** Bloqueia qualquer escrita (objetos, buckets e configurações). */
  readOnly: boolean
  /** Se falso, secret e session token ficam só na sessão do navegador (sessionStorage). */
  rememberSecret: boolean
}

export const DEFAULT_CONNECTION_ID = 'localstack-default'

export const DEFAULT_LOCALSTACK: Connection = {
  id: DEFAULT_CONNECTION_ID,
  name: 'LocalStack',
  kind: 'localstack',
  endpoint: '/localstack',
  publicEndpoint: 'http://localhost:4566',
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  sessionToken: '',
  readOnly: false,
  rememberSecret: true,
}

export const AWS_REGIONS: { id: string; label: string }[] = [
  { id: 'us-east-1', label: 'Norte da Virgínia' },
  { id: 'us-east-2', label: 'Ohio' },
  { id: 'us-west-1', label: 'Norte da Califórnia' },
  { id: 'us-west-2', label: 'Oregon' },
  { id: 'sa-east-1', label: 'São Paulo' },
  { id: 'ca-central-1', label: 'Canadá Central' },
  { id: 'eu-west-1', label: 'Irlanda' },
  { id: 'eu-west-2', label: 'Londres' },
  { id: 'eu-west-3', label: 'Paris' },
  { id: 'eu-central-1', label: 'Frankfurt' },
  { id: 'eu-north-1', label: 'Estocolmo' },
  { id: 'eu-south-1', label: 'Milão' },
  { id: 'ap-south-1', label: 'Mumbai' },
  { id: 'ap-southeast-1', label: 'Singapura' },
  { id: 'ap-southeast-2', label: 'Sydney' },
  { id: 'ap-northeast-1', label: 'Tóquio' },
  { id: 'ap-northeast-2', label: 'Seul' },
  { id: 'ap-northeast-3', label: 'Osaka' },
  { id: 'ap-east-1', label: 'Hong Kong' },
  { id: 'me-central-1', label: 'Emirados Árabes' },
  { id: 'af-south-1', label: 'Cidade do Cabo' },
]

export const KIND_LABEL: Record<ConnectionKind, string> = {
  localstack: 'LocalStack',
  aws: 'AWS',
  custom: 'Compatível com S3',
}

export function newConnection(kind: ConnectionKind): Connection {
  const base = {
    id: `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    region: 'us-east-1',
    sessionToken: '',
  }
  if (kind === 'aws')
    return { ...base, name: 'AWS', kind, endpoint: '', publicEndpoint: '', accessKeyId: '', secretAccessKey: '', readOnly: true, rememberSecret: false }
  if (kind === 'localstack')
    return {
      ...base,
      name: 'LocalStack',
      kind,
      endpoint: 'http://localhost:4566',
      publicEndpoint: 'http://localhost:4566',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      readOnly: false,
      rememberSecret: true,
    }
  return {
    ...base,
    name: 'MinIO',
    kind,
    endpoint: 'http://localhost:9000',
    publicEndpoint: 'http://localhost:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    readOnly: false,
    rememberSecret: true,
  }
}

/** Endpoint efetivo passado ao SDK (undefined = endpoint público da AWS para a região). */
export function connectionEndpoint(c: Connection): string | undefined {
  if (c.kind === 'aws') return undefined
  return c.endpoint.trim() || undefined
}

export function connectionTarget(c: Connection): string {
  if (c.kind === 'aws') return `s3.${c.region}.amazonaws.com`
  const ep = c.endpoint.trim()
  return ep.startsWith('/') ? `${window.location.origin}${ep} (proxy)` : ep
}

/* ---------------- persistência ---------------- */

interface Stored {
  connections: Connection[]
  activeId: string
}

type Secrets = Record<string, { secretAccessKey: string; sessionToken: string }>

function readSessionSecrets(): Secrets {
  try {
    return JSON.parse(sessionStorage.getItem('s3x:secrets') || '{}') as Secrets
  } catch {
    return {}
  }
}

function writeSessionSecrets(s: Secrets) {
  try {
    sessionStorage.setItem('s3x:secrets', JSON.stringify(s))
  } catch {
    // indisponível
  }
}

export function loadConnections(): Stored {
  const stored = readJSON<Stored | null>('connections', null)
  let connections: Connection[] = [{ ...DEFAULT_LOCALSTACK }]
  if (stored?.connections?.length) {
    const secrets = readSessionSecrets()
    connections = stored.connections.map((c) => ({
      ...DEFAULT_LOCALSTACK,
      ...c,
      ...(!c.rememberSecret && secrets[c.id] ? secrets[c.id] : {}),
    }))
  }
  if (!connections.some((c) => c.id === DEFAULT_CONNECTION_ID)) connections.unshift({ ...DEFAULT_LOCALSTACK })
  const activeId = connections.some((c) => c.id === stored?.activeId) ? stored!.activeId : DEFAULT_CONNECTION_ID
  return { connections, activeId }
}

export function saveConnections(connections: Connection[], activeId: string) {
  const secrets: Secrets = {}
  const persisted = connections.map((c) => {
    if (c.rememberSecret) return c
    secrets[c.id] = { secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken }
    return { ...c, secretAccessKey: '', sessionToken: '' }
  })
  writeJSON('connections', { connections: persisted, activeId })
  writeSessionSecrets(secrets)
}
