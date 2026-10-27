export interface BucketInfo {
  name: string
  createdAt?: Date
  /** Vem no ListBuckets mais recente; senão é resolvida com GetBucketLocation. */
  region?: string
}

export interface FolderEntry {
  kind: 'folder'
  /** Prefixo completo, terminado em "/" */
  key: string
}

export interface ObjectEntry {
  kind: 'object'
  key: string
  size: number
  lastModified?: Date
  etag?: string
  storageClass?: string
  versionId?: string
  isLatest?: boolean
  deleteMarker?: boolean
}

export type Entry = FolderEntry | ObjectEntry

export interface PageCursor {
  token?: string
  keyMarker?: string
  versionIdMarker?: string
}

export interface ListPage {
  folders: FolderEntry[]
  objects: ObjectEntry[]
  next?: PageCursor
}

export interface KeyRef {
  key: string
  versionId?: string
}

export interface Tally {
  count: number
  bytes: number
}

export interface BucketStats {
  objects: number
  bytes: number
  /** Objetos de 0 byte terminados em "/" (pastas criadas pelo console) */
  folders: number
  byStorageClass: Record<string, Tally>
  byExtension: Record<string, Tally>
  topPrefixes: Record<string, Tally>
  largest: { key: string; size: number }[]
  newest?: { key: string; date: Date }
  oldest?: { key: string; date: Date }
  complete: boolean
}

/** Chave de identidade de uma linha (a mesma chave pode ter várias versões). */
export function entryId(e: Entry): string {
  return e.kind === 'folder' ? `d:${e.key}` : `o:${e.key}\u0000${e.versionId ?? ''}`
}
