import type { S3Client } from '@aws-sdk/client-s3'
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { useCallback, useMemo } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { useTransfers } from '../../hooks/useTransfers'
import { copyObject, copyPrefix, deleteObjects, getObjectBytes, listAllObjects, presignGet, restoreObjectVersion } from '../../lib/api'
import { toAwsProxyUrl } from '../../lib/client'
import { downloadBlob, formatBytes, formatNumber, triggerDownload } from '../../lib/format'
import { previewKind } from '../../lib/mime'
import { baseName, parentPrefix } from '../../lib/paths'
import type { Entry, KeyRef, ObjectEntry } from '../../lib/types'

/** Acima disso o ZIP (montado em memória) fica arriscado no navegador. */
const ZIP_WARN_BYTES = 2 * 1024 ** 3

const COMPRESSIBLE = new Set(['text', 'json', 'csv'])

export function useObjectActions(client: S3Client, bucket: string, region: string) {
  const { connection, publicClientFor, settings } = useSettings()
  const { runJob } = useTransfers()
  const toast = useToast()
  const isAws = connection.kind === 'aws'

  /** URL pré-assinada para usar dentro do app (prévia, download): passa pelo proxy quando é AWS. */
  const inAppUrl = useCallback(
    async (key: string, opts: { versionId?: string; download?: boolean; contentType?: string } = {}) => {
      if (isAws) {
        // Assina para o host real com um cliente direto e só então troca o destino para o proxy
        const url = await presignGet(publicClientFor(region), bucket, key, { ...opts, expiresIn: 3600 })
        return toAwsProxyUrl(url)
      }
      return presignGet(client, bucket, key, { ...opts, expiresIn: 3600 })
    },
    [isAws, publicClientFor, region, client, bucket],
  )

  /** URL pré-assinada para compartilhar (fora do app). */
  const shareUrl = useCallback(
    (key: string, opts: { versionId?: string; expiresIn?: number; download?: boolean } = {}) =>
      presignGet(publicClientFor(region), bucket, key, { expiresIn: settings.presignExpires, ...opts }),
    [publicClientFor, region, bucket, settings.presignExpires],
  )

  const downloadOne = useCallback(
    async (key: string, versionId?: string) => {
      try {
        triggerDownload(await inAppUrl(key, { versionId, download: true }), baseName(key))
      } catch (e) {
        toast('error', 'Falha ao baixar', String((e as Error).message ?? e))
      }
    },
    [inAppUrl, toast],
  )

  /** Monta um ZIP com os objetos (pastas incluídas recursivamente). Caminhos relativos a `base`. */
  const downloadZip = useCallback(
    async (entries: Entry[], base: string, name: string) => {
      try {
        await runJob('zip', name, 'bytes', async ({ signal, progress, setDetail }) => {
          setDetail('Listando objetos…')
          const files: ObjectEntry[] = []
          for (const e of entries) {
            if (e.kind === 'folder') files.push(...(await listAllObjects(client, bucket, e.key, { signal })).filter((o) => !o.key.endsWith('/')))
            else if (!e.deleteMarker) files.push(e)
          }
          const total = files.reduce((s, f) => s + f.size, 0)
          if (total > ZIP_WARN_BYTES && !confirm(`O ZIP terá ${formatBytes(total)} e é montado na memória do navegador. Continuar?`))
            throw new DOMException('Cancelado', 'AbortError')
          progress(0, total)

          const chunks: Uint8Array<ArrayBuffer>[] = []
          let zipErr: Error | null = null
          const zip = new Zip((err, chunk) => {
            if (err) zipErr = err
            else chunks.push(chunk as Uint8Array<ArrayBuffer>)
          })
          let done = 0
          for (const [i, f] of files.entries()) {
            if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
            setDetail(`${formatNumber(i + 1)}/${formatNumber(files.length)} · ${baseName(f.key)}`)
            const { bytes } = await getObjectBytes(client, bucket, f.key, { versionId: f.versionId, signal })
            const path = f.key.startsWith(base) ? f.key.slice(base.length) : f.key
            const entry = COMPRESSIBLE.has(previewKind(f.key)) ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path)
            if (f.lastModified) entry.mtime = f.lastModified
            zip.add(entry)
            entry.push(bytes, true)
            done += f.size
            progress(done, total)
            if (zipErr) throw zipErr
          }
          zip.end()
          if (zipErr) throw zipErr
          downloadBlob(name, new Blob(chunks, { type: 'application/zip' }))
          setDetail(`${formatNumber(files.length)} arquivo(s)`)
        })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') toast('error', 'Falha ao gerar o ZIP', (e as Error).message)
      }
    },
    [runJob, client, bucket, toast],
  )

  /** Exclui objetos/versões e pastas (recursivo). */
  const deleteEntries = useCallback(
    async (entries: Entry[]) => {
      const label = entries.length === 1 ? baseName(entries[0].key) : `${entries.length} itens`
      return runJob('delete', `Excluir ${label}`, 'items', async ({ signal, progress, setDetail }) => {
        const refs: KeyRef[] = []
        for (const e of entries) {
          if (e.kind === 'folder') {
            setDetail(`Listando ${e.key}…`)
            refs.push(...(await listAllObjects(client, bucket, e.key, { signal })).map((o) => ({ key: o.key })))
            // O marcador da pasta (chave terminada em "/") entra na lista acima quando existe
          } else refs.push({ key: e.key, versionId: e.versionId })
        }
        progress(0, refs.length)
        let deleted = 0
        const errors: string[] = []
        for (let i = 0; i < refs.length; i += 1000) {
          if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
          const r = await deleteObjects(client, bucket, refs.slice(i, i + 1000))
          deleted += r.deleted
          errors.push(...r.errors)
          progress(deleted + errors.length, refs.length)
        }
        setDetail(`${formatNumber(deleted)} excluído(s)`)
        if (errors.length) {
          toast('error', `${errors.length} item(ns) não foram excluídos`, errors.slice(0, 3).join('\n'))
        } else toast('success', 'Excluído', entries.length === 1 ? entries[0].key : `${formatNumber(deleted)} objeto(s)`)
        return { deleted, errors }
      })
    },
    [runJob, client, bucket, toast],
  )

  /** Copia ou move para outro bucket/prefixo, mantendo o nome de cada item. */
  const copyMoveEntries = useCallback(
    async (entries: Entry[], dst: { bucket: string; prefix: string }, move: boolean) => {
      const label = entries.length === 1 ? baseName(entries[0].key) : `${entries.length} itens`
      return runJob(move ? 'move' : 'copy', `${move ? 'Mover' : 'Copiar'} ${label} → ${dst.bucket}/${dst.prefix}`, 'items', async ({ signal, progress }) => {
        let copied = 0
        const errors: string[] = []
        const objects = entries.filter((e): e is ObjectEntry => e.kind === 'object' && !e.deleteMarker)
        const folders = entries.filter((e) => e.kind === 'folder')
        let total = objects.length
        progress(0, total)
        for (const o of objects) {
          if (signal.aborted) throw new DOMException('Cancelado', 'AbortError')
          const target = dst.prefix + baseName(o.key)
          if (target === o.key && dst.bucket === bucket) {
            errors.push(`${o.key}: origem e destino iguais`)
            continue
          }
          try {
            await copyObject(client, { bucket, key: o.key, versionId: o.versionId }, { bucket: dst.bucket, key: target })
            if (move) await deleteObjects(client, bucket, [{ key: o.key }])
            copied++
          } catch (e) {
            errors.push(`${o.key}: ${(e as Error).message}`)
          }
          progress(copied + errors.length, total)
        }
        for (const f of folders) {
          const target = dst.prefix + baseName(f.key) + '/'
          if (dst.bucket === bucket && target.startsWith(f.key)) {
            errors.push(`${f.key}: não dá para copiar uma pasta para dentro dela mesma`)
            continue
          }
          const base = copied + errors.length
          const r = await copyPrefix(client, { bucket, prefix: f.key }, { bucket: dst.bucket, prefix: target }, {
            move,
            signal,
            onProgress: (d, t) => {
              total = objects.length + t
              progress(base + d, total)
            },
          })
          copied += r.copied
          errors.push(...r.errors)
        }
        if (errors.length) toast('error', `${errors.length} item(ns) com erro`, errors.slice(0, 3).join('\n'))
        else toast('success', move ? 'Movido' : 'Copiado', `${formatNumber(copied)} objeto(s) → s3://${dst.bucket}/${dst.prefix}`)
        return { copied, errors }
      })
    },
    [runJob, client, bucket, toast],
  )

  /** Renomeia um objeto ou pasta (cópia + exclusão; o S3 não tem rename). */
  const rename = useCallback(
    async (entry: Entry, newName: string) => {
      const parent = parentPrefix(entry.key)
      if (entry.kind === 'folder') {
        return runJob('move', `Renomear ${baseName(entry.key)} → ${newName}`, 'items', async ({ signal, progress }) => {
          const r = await copyPrefix(client, { bucket, prefix: entry.key }, { bucket, prefix: parent + newName + '/' }, { move: true, signal, onProgress: progress })
          if (r.errors.length) toast('error', `${r.errors.length} objeto(s) com erro`, r.errors.slice(0, 3).join('\n'))
          else toast('success', 'Pasta renomeada', `${formatNumber(r.copied)} objeto(s)`)
          return parent + newName + '/'
        })
      }
      const target = parent + newName
      await copyObject(client, { bucket, key: entry.key }, { bucket, key: target })
      await deleteObjects(client, bucket, [{ key: entry.key }])
      toast('success', 'Objeto renomeado', target)
      return target
    },
    [runJob, client, bucket, toast],
  )

  /** Restaura uma versão antiga copiando-a por cima da atual. */
  const restoreVersion = useCallback(
    async (key: string, versionId: string) => {
      await restoreObjectVersion(client, bucket, key, versionId)
      toast('success', 'Versão restaurada', `${baseName(key)} agora aponta para o conteúdo da versão ${versionId.slice(0, 12)}…`)
    },
    [client, bucket, toast],
  )

  return useMemo(
    () => ({ inAppUrl, shareUrl, downloadOne, downloadZip, deleteEntries, copyMoveEntries, rename, restoreVersion }),
    [inAppUrl, shareUrl, downloadOne, downloadZip, deleteEntries, copyMoveEntries, rename, restoreVersion],
  )
}

export type ObjectActions = ReturnType<typeof useObjectActions>
