import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteBucketCorsCommand,
  DeleteBucketEncryptionCommand,
  DeleteBucketLifecycleCommand,
  DeleteBucketPolicyCommand,
  DeleteBucketTaggingCommand,
  DeleteBucketWebsiteCommand,
  DeleteObjectsCommand,
  DeleteObjectTaggingCommand,
  DeletePublicAccessBlockCommand,
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLocationCommand,
  GetBucketNotificationConfigurationCommand,
  GetBucketPolicyCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetBucketWebsiteCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  GetObjectTaggingCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  PutBucketPolicyCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  PutPublicAccessBlockCommand,
  type BucketLocationConstraint,
  type CORSRule,
  type HeadObjectCommandOutput,
  type LifecycleRule,
  type NotificationConfiguration,
  type PublicAccessBlockConfiguration,
  type ServerSideEncryptionRule,
  type Tag,
  type WebsiteConfiguration,
  type S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { baseName } from './paths'
import type { BucketInfo, BucketStats, FolderEntry, KeyRef, ListPage, ObjectEntry } from './types'

type ErrLike = { name?: string; Code?: string; message?: string; code?: string; $metadata?: { httpStatusCode?: number } }

function errName(e: unknown): string {
  const x = e as ErrLike
  return x?.name || x?.Code || ''
}

/** Configurações opcionais do bucket respondem 404 com um código próprio quando não existem. */
async function orNull<T>(p: Promise<T>, ...notFound: string[]): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    const n = errName(e)
    if (notFound.includes(n) || (e as ErrLike)?.$metadata?.httpStatusCode === 404) {
      if (n === 'NoSuchBucket') throw e
      return null
    }
    throw e
  }
}

/* ============================== buckets ============================== */

export async function listBuckets(client: S3Client): Promise<BucketInfo[]> {
  const out: BucketInfo[] = []
  let token: string | undefined
  do {
    const r = await client.send(new ListBucketsCommand({ ContinuationToken: token, MaxBuckets: token ? 1000 : undefined }))
    for (const b of r.Buckets ?? []) {
      if (b.Name) out.push({ name: b.Name, createdAt: b.CreationDate, region: b.BucketRegion })
    }
    token = r.ContinuationToken
  } while (token)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function normalizeLocation(loc?: string | null): string {
  if (!loc) return 'us-east-1'
  if (loc === 'EU') return 'eu-west-1'
  return loc
}

export async function getBucketRegion(client: S3Client, bucket: string): Promise<string> {
  const r = await client.send(new GetBucketLocationCommand({ Bucket: bucket }))
  return normalizeLocation(r.LocationConstraint)
}

export async function createBucket(
  client: S3Client,
  opts: { name: string; region: string; versioning: boolean; objectLock: boolean; tags: Tag[] },
): Promise<void> {
  await client.send(
    new CreateBucketCommand({
      Bucket: opts.name,
      ObjectLockEnabledForBucket: opts.objectLock || undefined,
      ...(opts.region && opts.region !== 'us-east-1'
        ? { CreateBucketConfiguration: { LocationConstraint: opts.region as BucketLocationConstraint } }
        : {}),
    }),
  )
  if (opts.versioning && !opts.objectLock) await setVersioning(client, opts.name, 'Enabled')
  if (opts.tags.length) await putBucketTags(client, opts.name, opts.tags)
}

export async function deleteBucket(client: S3Client, bucket: string): Promise<void> {
  await client.send(new DeleteBucketCommand({ Bucket: bucket }))
}

/** Exclui todos os objetos, versões e marcadores de exclusão do bucket (ou de um prefixo). */
export async function emptyBucket(
  client: S3Client,
  bucket: string,
  opts: { prefix?: string; signal?: AbortSignal; onProgress?: (deleted: number) => void } = {},
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []
  const flush = async (batch: KeyRef[]) => {
    if (!batch.length) return
    const r = await deleteObjects(client, bucket, batch)
    deleted += r.deleted
    errors.push(...r.errors)
    opts.onProgress?.(deleted)
  }

  let useVersions = true
  let keyMarker: string | undefined
  let versionMarker: string | undefined
  let token: string | undefined
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    if (useVersions) {
      try {
        const r = await client.send(
          new ListObjectVersionsCommand({ Bucket: bucket, Prefix: opts.prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker }),
          { abortSignal: opts.signal },
        )
        const batch: KeyRef[] = [
          ...(r.Versions ?? []).map((v) => ({ key: v.Key!, versionId: v.VersionId })),
          ...(r.DeleteMarkers ?? []).map((v) => ({ key: v.Key!, versionId: v.VersionId })),
        ]
        await flush(batch)
        if (!r.IsTruncated) break
        keyMarker = r.NextKeyMarker
        versionMarker = r.NextVersionIdMarker
        continue
      } catch (e) {
        // Sem permissão para listar versões (ou emulador sem suporte): segue só com a versão atual
        if (deleted === 0 && ['AccessDenied', 'NotImplemented'].includes(errName(e))) {
          useVersions = false
          continue
        }
        throw e
      }
    }
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: opts.prefix, ContinuationToken: token }), {
      abortSignal: opts.signal,
    })
    await flush((r.Contents ?? []).map((o) => ({ key: o.Key! })))
    if (!r.IsTruncated) break
    token = r.NextContinuationToken
  }
  return { deleted, errors }
}

/** Percorre o bucket inteiro para somar objetos e tamanhos. */
export async function computeBucketStats(
  client: S3Client,
  bucket: string,
  opts: { prefix?: string; signal?: AbortSignal; onProgress?: (s: BucketStats) => void } = {},
): Promise<BucketStats> {
  const stats: BucketStats = {
    objects: 0,
    bytes: 0,
    folders: 0,
    byStorageClass: {},
    byExtension: {},
    topPrefixes: {},
    largest: [],
    newest: undefined,
    oldest: undefined,
    complete: false,
  }
  const base = opts.prefix ?? ''
  let token: string | undefined
  let pages = 0
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: base || undefined, ContinuationToken: token }), {
      abortSignal: opts.signal,
    })
    for (const o of r.Contents ?? []) {
      const key = o.Key!
      const size = o.Size ?? 0
      if (key.endsWith('/') && size === 0) {
        stats.folders++
        continue
      }
      stats.objects++
      stats.bytes += size
      const sc = o.StorageClass ?? 'STANDARD'
      const c = (stats.byStorageClass[sc] ??= { count: 0, bytes: 0 })
      c.count++
      c.bytes += size
      const name = baseName(key)
      const dot = name.lastIndexOf('.')
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '(sem extensão)'
      const e = (stats.byExtension[ext] ??= { count: 0, bytes: 0 })
      e.count++
      e.bytes += size
      const rest = key.slice(base.length)
      const slash = rest.indexOf('/')
      const top = slash >= 0 ? rest.slice(0, slash + 1) : '(raiz)'
      const t = (stats.topPrefixes[top] ??= { count: 0, bytes: 0 })
      t.count++
      t.bytes += size
      if (o.LastModified) {
        if (!stats.newest || o.LastModified > stats.newest.date) stats.newest = { key, date: o.LastModified }
        if (!stats.oldest || o.LastModified < stats.oldest.date) stats.oldest = { key, date: o.LastModified }
      }
      if (stats.largest.length < 10 || size > stats.largest[stats.largest.length - 1].size) {
        stats.largest.push({ key, size })
        stats.largest.sort((a, b) => b.size - a.size)
        stats.largest.length = Math.min(stats.largest.length, 10)
      }
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
    if (++pages % 2 === 0 || !token) opts.onProgress?.({ ...stats })
  } while (token)
  stats.complete = true
  return stats
}

/* ---------------- configurações do bucket ---------------- */

export async function getVersioning(client: S3Client, bucket: string) {
  const r = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }))
  return { status: (r.Status ?? 'Disabled') as 'Enabled' | 'Suspended' | 'Disabled', mfaDelete: r.MFADelete }
}

export async function setVersioning(client: S3Client, bucket: string, status: 'Enabled' | 'Suspended') {
  await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: status } }))
}

export async function getBucketTags(client: S3Client, bucket: string): Promise<Tag[]> {
  const r = await orNull(client.send(new GetBucketTaggingCommand({ Bucket: bucket })), 'NoSuchTagSet', 'NoSuchTagSetError')
  return r?.TagSet ?? []
}

export async function putBucketTags(client: S3Client, bucket: string, tags: Tag[]) {
  if (!tags.length) {
    await client.send(new DeleteBucketTaggingCommand({ Bucket: bucket }))
    return
  }
  await client.send(new PutBucketTaggingCommand({ Bucket: bucket, Tagging: { TagSet: tags } }))
}

export async function getBucketPolicy(client: S3Client, bucket: string): Promise<string | null> {
  const r = await orNull(client.send(new GetBucketPolicyCommand({ Bucket: bucket })), 'NoSuchBucketPolicy')
  return r?.Policy ?? null
}

export async function putBucketPolicy(client: S3Client, bucket: string, policy: string) {
  await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
}

export async function deleteBucketPolicy(client: S3Client, bucket: string) {
  await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }))
}

export async function getBucketCors(client: S3Client, bucket: string): Promise<CORSRule[] | null> {
  const r = await orNull(client.send(new GetBucketCorsCommand({ Bucket: bucket })), 'NoSuchCORSConfiguration')
  return r?.CORSRules ?? null
}

export async function putBucketCors(client: S3Client, bucket: string, rules: CORSRule[]) {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }))
}

export async function deleteBucketCors(client: S3Client, bucket: string) {
  await client.send(new DeleteBucketCorsCommand({ Bucket: bucket }))
}

export async function getBucketLifecycle(client: S3Client, bucket: string): Promise<LifecycleRule[] | null> {
  const r = await orNull(
    client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })),
    'NoSuchLifecycleConfiguration',
  )
  return r?.Rules ?? null
}

export async function putBucketLifecycle(client: S3Client, bucket: string, rules: LifecycleRule[]) {
  await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: rules } }))
}

export async function deleteBucketLifecycle(client: S3Client, bucket: string) {
  await client.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }))
}

export async function getBucketEncryption(client: S3Client, bucket: string): Promise<ServerSideEncryptionRule[] | null> {
  const r = await orNull(
    client.send(new GetBucketEncryptionCommand({ Bucket: bucket })),
    'ServerSideEncryptionConfigurationNotFoundError',
  )
  return r?.ServerSideEncryptionConfiguration?.Rules ?? null
}

export async function putBucketEncryption(client: S3Client, bucket: string, rules: ServerSideEncryptionRule[]) {
  await client.send(new PutBucketEncryptionCommand({ Bucket: bucket, ServerSideEncryptionConfiguration: { Rules: rules } }))
}

export async function deleteBucketEncryption(client: S3Client, bucket: string) {
  await client.send(new DeleteBucketEncryptionCommand({ Bucket: bucket }))
}

export async function getBucketWebsite(client: S3Client, bucket: string): Promise<WebsiteConfiguration | null> {
  const r = await orNull(client.send(new GetBucketWebsiteCommand({ Bucket: bucket })), 'NoSuchWebsiteConfiguration')
  if (!r) return null
  const { $metadata: _m, ...cfg } = r
  void _m
  return cfg
}

export async function putBucketWebsite(client: S3Client, bucket: string, cfg: WebsiteConfiguration) {
  await client.send(new PutBucketWebsiteCommand({ Bucket: bucket, WebsiteConfiguration: cfg }))
}

export async function deleteBucketWebsite(client: S3Client, bucket: string) {
  await client.send(new DeleteBucketWebsiteCommand({ Bucket: bucket }))
}

export async function getPublicAccessBlock(client: S3Client, bucket: string): Promise<PublicAccessBlockConfiguration | null> {
  const r = await orNull(
    client.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
    'NoSuchPublicAccessBlockConfiguration',
  )
  return r?.PublicAccessBlockConfiguration ?? null
}

export async function putPublicAccessBlock(client: S3Client, bucket: string, cfg: PublicAccessBlockConfiguration) {
  await client.send(new PutPublicAccessBlockCommand({ Bucket: bucket, PublicAccessBlockConfiguration: cfg }))
}

export async function deletePublicAccessBlock(client: S3Client, bucket: string) {
  await client.send(new DeletePublicAccessBlockCommand({ Bucket: bucket }))
}

export async function getBucketNotifications(client: S3Client, bucket: string): Promise<NotificationConfiguration> {
  const r = await client.send(new GetBucketNotificationConfigurationCommand({ Bucket: bucket }))
  const { $metadata: _m, ...cfg } = r
  void _m
  return cfg
}

export async function putBucketNotifications(client: S3Client, bucket: string, cfg: NotificationConfiguration) {
  await client.send(new PutBucketNotificationConfigurationCommand({ Bucket: bucket, NotificationConfiguration: cfg }))
}

export async function getObjectLock(client: S3Client, bucket: string) {
  const r = await orNull(
    client.send(new GetObjectLockConfigurationCommand({ Bucket: bucket })),
    'ObjectLockConfigurationNotFoundError',
  )
  return r?.ObjectLockConfiguration ?? null
}

/* ============================== objetos ============================== */

/** O "objeto pasta" da pasta atual (chave = prefixo terminado em "/") não aparece como item. */
function isFolderMarker(key: string, prefix: string): boolean {
  return prefix.endsWith('/') && key === prefix
}

export async function listObjects(
  client: S3Client,
  bucket: string,
  opts: { prefix: string; token?: string; maxKeys: number; recursive?: boolean; signal?: AbortSignal },
): Promise<ListPage> {
  const r = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: opts.prefix || undefined,
      Delimiter: opts.recursive ? undefined : '/',
      ContinuationToken: opts.token,
      MaxKeys: opts.maxKeys,
    }),
    { abortSignal: opts.signal },
  )
  const folders: FolderEntry[] = (r.CommonPrefixes ?? []).map((p) => ({ kind: 'folder', key: p.Prefix! }))
  const objects: ObjectEntry[] = (r.Contents ?? [])
    .filter((o) => !isFolderMarker(o.Key!, opts.prefix))
    .map((o) => ({
      kind: 'object',
      key: o.Key!,
      size: o.Size ?? 0,
      lastModified: o.LastModified,
      etag: o.ETag,
      storageClass: o.StorageClass ?? 'STANDARD',
    }))
  return {
    folders,
    objects,
    next: r.IsTruncated ? { token: r.NextContinuationToken } : undefined,
  }
}

export async function listVersions(
  client: S3Client,
  bucket: string,
  opts: { prefix: string; keyMarker?: string; versionIdMarker?: string; maxKeys: number; recursive?: boolean; signal?: AbortSignal },
): Promise<ListPage> {
  const r = await client.send(
    new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: opts.prefix || undefined,
      Delimiter: opts.recursive ? undefined : '/',
      KeyMarker: opts.keyMarker,
      VersionIdMarker: opts.versionIdMarker,
      MaxKeys: opts.maxKeys,
    }),
    { abortSignal: opts.signal },
  )
  const folders: FolderEntry[] = (r.CommonPrefixes ?? []).map((p) => ({ kind: 'folder', key: p.Prefix! }))
  const objects: ObjectEntry[] = [
    ...(r.Versions ?? []).map<ObjectEntry>((v) => ({
      kind: 'object',
      key: v.Key!,
      size: v.Size ?? 0,
      lastModified: v.LastModified,
      etag: v.ETag,
      storageClass: v.StorageClass ?? 'STANDARD',
      versionId: v.VersionId,
      isLatest: v.IsLatest,
    })),
    ...(r.DeleteMarkers ?? []).map<ObjectEntry>((m) => ({
      kind: 'object',
      key: m.Key!,
      size: 0,
      lastModified: m.LastModified,
      versionId: m.VersionId,
      isLatest: m.IsLatest,
      deleteMarker: true,
    })),
  ]
    .filter((o) => !isFolderMarker(o.key, opts.prefix))
    // Mesma chave agrupada, da versão mais nova para a mais antiga
    .sort((a, b) =>
      a.key === b.key ? (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0) : a.key < b.key ? -1 : 1,
    )
  return {
    folders,
    objects,
    next: r.IsTruncated ? { keyMarker: r.NextKeyMarker, versionIdMarker: r.NextVersionIdMarker } : undefined,
  }
}

/** Todas as chaves sob um prefixo (sem delimitador). */
export async function listAllObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
  opts: { signal?: AbortSignal; onProgress?: (n: number) => void } = {},
): Promise<ObjectEntry[]> {
  const out: ObjectEntry[] = []
  let token: string | undefined
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }), {
      abortSignal: opts.signal,
    })
    for (const o of r.Contents ?? [])
      out.push({ kind: 'object', key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified, etag: o.ETag, storageClass: o.StorageClass })
    opts.onProgress?.(out.length)
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return out
}

export async function headObject(client: S3Client, bucket: string, key: string, versionId?: string): Promise<HeadObjectCommandOutput> {
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }))
}

export async function getObjectBytes(
  client: S3Client,
  bucket: string,
  key: string,
  opts: { versionId?: string; range?: string; signal?: AbortSignal } = {},
): Promise<{ bytes: Uint8Array; contentType?: string; totalSize?: number }> {
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: opts.versionId, Range: opts.range }), {
    abortSignal: opts.signal,
  })
  const bytes = r.Body ? await r.Body.transformToByteArray() : new Uint8Array()
  const total = r.ContentRange?.match(/\/(\d+)$/)?.[1]
  return { bytes, contentType: r.ContentType, totalSize: total ? Number(total) : r.ContentLength }
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: string | Uint8Array | Blob,
  opts: { contentType?: string; metadata?: Record<string, string>; cacheControl?: string; contentDisposition?: string } = {},
) {
  return client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(body === '' ? { ContentLength: 0 } : {}),
      ContentType: opts.contentType,
      Metadata: opts.metadata,
      CacheControl: opts.cacheControl,
      ContentDisposition: opts.contentDisposition,
    }),
  )
}

export async function createFolder(client: S3Client, bucket: string, key: string) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key.endsWith('/') ? key : key + '/', Body: '', ContentLength: 0 }))
}

export interface UploadOptions {
  contentType?: string
  storageClass?: string
  metadata?: Record<string, string>
  tags?: Tag[]
  cacheControl?: string
  acl?: string
  onProgress?: (loaded: number, total: number) => void
}

/** Upload com multipart automático (partes de 8 MB, 4 em paralelo). Devolve um cancelador. */
export function uploadFile(client: S3Client, bucket: string, key: string, file: Blob, opts: UploadOptions = {}) {
  const up = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: opts.contentType,
      StorageClass: opts.storageClass as never,
      Metadata: opts.metadata && Object.keys(opts.metadata).length ? opts.metadata : undefined,
      CacheControl: opts.cacheControl || undefined,
    },
    tags: opts.tags,
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  })
  up.on('httpUploadProgress', (p) => opts.onProgress?.(p.loaded ?? 0, p.total ?? file.size))
  return { done: () => up.done(), abort: () => up.abort() }
}

/** Exclui em lotes de 1000 (limite do DeleteObjects). */
export async function deleteObjects(client: S3Client, bucket: string, refs: KeyRef[]): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []
  for (let i = 0; i < refs.length; i += 1000) {
    const chunk = refs.slice(i, i + 1000)
    const r = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((k) => ({ Key: k.key, VersionId: k.versionId })), Quiet: false },
      }),
    )
    deleted += r.Deleted?.length ?? 0
    for (const e of r.Errors ?? []) errors.push(`${e.Key}: ${e.Code} ${e.Message ?? ''}`.trim())
  }
  return { deleted, errors }
}

function copySource(bucket: string, key: string, versionId?: string): string {
  const k = encodeURIComponent(key).replace(/%2F/g, '/')
  return `${bucket}/${k}${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''}`
}

export async function copyObject(
  client: S3Client,
  src: { bucket: string; key: string; versionId?: string },
  dst: { bucket: string; key: string },
  opts: { storageClass?: string } = {},
) {
  await client.send(
    new CopyObjectCommand({
      Bucket: dst.bucket,
      Key: dst.key,
      CopySource: copySource(src.bucket, src.key, src.versionId),
      StorageClass: opts.storageClass as never,
    }),
  )
}

export interface ObjectProps {
  contentType: string
  cacheControl: string
  contentDisposition: string
  contentEncoding: string
  contentLanguage: string
  storageClass: string
  metadata: Record<string, string>
}

/** Metadados só mudam com uma cópia do objeto sobre ele mesmo (MetadataDirective=REPLACE). */
export async function updateObjectProps(client: S3Client, bucket: string, key: string, head: HeadObjectCommandOutput, p: ObjectProps) {
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: copySource(bucket, key),
      MetadataDirective: 'REPLACE',
      ContentType: p.contentType || undefined,
      CacheControl: p.cacheControl || undefined,
      ContentDisposition: p.contentDisposition || undefined,
      ContentEncoding: p.contentEncoding || undefined,
      ContentLanguage: p.contentLanguage || undefined,
      StorageClass: (p.storageClass || undefined) as never,
      Metadata: p.metadata,
      ServerSideEncryption: head.ServerSideEncryption,
      SSEKMSKeyId: head.ServerSideEncryption === 'aws:kms' ? head.SSEKMSKeyId : undefined,
    }),
  )
}

/**
 * Restaura uma versão antiga copiando-a por cima da atual. Os cabeçalhos da versão vão explícitos
 * (MetadataDirective=REPLACE): o LocalStack recusa copiar sobre a mesma chave "sem mudanças",
 * mesmo quando a origem é outra versão.
 */
export async function restoreObjectVersion(client: S3Client, bucket: string, key: string, versionId: string) {
  const h = await headObject(client, bucket, key, versionId)
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: copySource(bucket, key, versionId),
      MetadataDirective: 'REPLACE',
      ContentType: h.ContentType,
      CacheControl: h.CacheControl,
      ContentDisposition: h.ContentDisposition,
      ContentEncoding: h.ContentEncoding,
      ContentLanguage: h.ContentLanguage,
      Metadata: h.Metadata,
      StorageClass: h.StorageClass,
      ServerSideEncryption: h.ServerSideEncryption,
      SSEKMSKeyId: h.ServerSideEncryption === 'aws:kms' ? h.SSEKMSKeyId : undefined,
    }),
  )
}

/** Copia (ou move) tudo sob um prefixo para outro prefixo/bucket. */
export async function copyPrefix(
  client: S3Client,
  src: { bucket: string; prefix: string },
  dst: { bucket: string; prefix: string },
  opts: { move?: boolean; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ copied: number; errors: string[] }> {
  const all = await listAllObjects(client, src.bucket, src.prefix, { signal: opts.signal })
  const errors: string[] = []
  let copied = 0
  const moved: KeyRef[] = []
  let i = 0
  const worker = async () => {
    while (i < all.length) {
      if (opts.signal?.aborted) return
      const o = all[i++]
      const rel = o.key.slice(src.prefix.length)
      try {
        await copyObject(client, { bucket: src.bucket, key: o.key }, { bucket: dst.bucket, key: dst.prefix + rel })
        copied++
        moved.push({ key: o.key })
      } catch (e) {
        errors.push(`${o.key}: ${describeError(e)}`)
      }
      opts.onProgress?.(copied + errors.length, all.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, all.length) }, worker))
  if (opts.move && moved.length) {
    const r = await deleteObjects(client, src.bucket, moved)
    errors.push(...r.errors)
  }
  return { copied, errors }
}

export async function getObjectTags(client: S3Client, bucket: string, key: string, versionId?: string): Promise<Tag[]> {
  const r = await client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key, VersionId: versionId }))
  return r.TagSet ?? []
}

export async function putObjectTags(client: S3Client, bucket: string, key: string, tags: Tag[], versionId?: string) {
  if (!tags.length) {
    await client.send(new DeleteObjectTaggingCommand({ Bucket: bucket, Key: key, VersionId: versionId }))
    return
  }
  await client.send(new PutObjectTaggingCommand({ Bucket: bucket, Key: key, VersionId: versionId, Tagging: { TagSet: tags } }))
}

export async function presignGet(
  client: S3Client,
  bucket: string,
  key: string,
  opts: { versionId?: string; expiresIn?: number; download?: boolean | string; contentType?: string } = {},
): Promise<string> {
  const filename = typeof opts.download === 'string' ? opts.download : baseName(key)
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: opts.versionId,
      ResponseContentDisposition: opts.download
        ? `attachment; filename="${filename.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        : undefined,
      ResponseContentType: opts.contentType,
    }),
    { expiresIn: opts.expiresIn ?? 900 },
  )
}

export async function presignPut(client: S3Client, bucket: string, key: string, expiresIn: number, contentType?: string) {
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn })
}

/* ============================== erros ============================== */

export function describeError(err: unknown, endpoint?: string): string {
  const e = err as ErrLike
  const status = e?.$metadata?.httpStatusCode
  const name = errName(err)
  const msg = e?.message ?? String(err)
  const connection =
    name === 'TypeError' ||
    name === 'AggregateError' ||
    e?.code === 'ECONNREFUSED' ||
    /Failed to fetch|NetworkError|ECONNREFUSED|socket hang up|Load failed/i.test(msg) ||
    ((status === 500 || status === 502 || status === 503 || status === 504) &&
      /Deserialization|UnknownError|Unexpected|non-XML|XML|char/i.test(`${name} ${msg}`))
  if (connection) {
    if (endpoint?.includes('amazonaws.com'))
      return `Não foi possível conectar a ${endpoint}. Verifique a região, sua rede e se o app está rodando com o proxy (npm run dev ou Docker).`
    return `Não foi possível conectar${endpoint ? ` a ${endpoint}` : ''}. Verifique se o LocalStack está rodando (docker compose up -d).`
  }
  if (name === 'AbortError') return 'Operação cancelada.'
  if (['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'InvalidToken', 'CredentialsProviderError'].includes(name) || /Resolved credential object is not valid/i.test(msg))
    return 'Credenciais inválidas: confira a Access Key, a Secret Key e (se usar SSO/STS) o Session Token.'
  if (name === 'ExpiredToken') return 'As credenciais temporárias expiraram. Gere um novo Session Token.'
  if (name === 'AccessDenied') return `Acesso negado: ${msg}`
  if (name === 'NoSuchBucket') return 'O bucket não existe.'
  if (name === 'NoSuchKey' || name === 'NotFound') return 'O objeto não existe (ou foi excluído).'
  if (name === 'BucketAlreadyOwnedByYou') return 'Você já tem um bucket com esse nome.'
  if (name === 'BucketAlreadyExists') return 'Esse nome de bucket já está em uso (os nomes são globais na AWS).'
  if (name === 'BucketNotEmpty') return 'O bucket não está vazio. Esvazie-o antes de excluir.'
  if (name === 'InvalidBucketName') return 'Nome de bucket inválido.'
  if (name === 'MalformedPolicy') return `Política inválida: ${msg}`
  if (name === 'MalformedXML') return `Configuração inválida: ${msg}`
  if (name === 'InvalidObjectState') return 'O objeto está arquivado (Glacier/Deep Archive) e precisa ser restaurado antes.'
  if (name === 'PermanentRedirect' || name === 'AuthorizationHeaderMalformed')
    return 'O bucket está em outra região. Troque a região da conexão ou tente novamente.'
  if (name === 'UnknownError' || !msg || msg === name) {
    if (status === 403)
      return `O servidor recusou a requisição (HTTP 403)${endpoint ? ` em ${endpoint}` : ''}. Em LocalStack isso costuma ser bloqueio de CORS: use o endpoint "/localstack" (proxy).`
    if (status === 404) return 'Não encontrado (HTTP 404).'
    if (status) return `Resposta inesperada do servidor (HTTP ${status})${endpoint ? ` em ${endpoint}` : ''}.`
  }
  return msg
}

export function isNotFound(err: unknown): boolean {
  const n = errName(err)
  return n === 'NoSuchBucket' || n === 'NoSuchKey' || n === 'NotFound' || (err as ErrLike)?.$metadata?.httpStatusCode === 404
}
