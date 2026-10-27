import type { S3Client } from '@aws-sdk/client-s3'
import { FileQuestion, WrapText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { describeError, getObjectBytes } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { previewKind } from '../../lib/mime'
import { IconButton } from '../ui/Button'
import { CodeEditor } from '../ui/CodeEditor'
import { EmptyState, Segmented, Spinner } from '../ui/Misc'
import type { ObjectActions } from './useObjectActions'

/** Quanto do início do arquivo é lido para prévias de texto. */
const TEXT_LIMIT = 1024 * 1024

/** CSV simples com aspas (RFC 4180), suficiente para prévia. */
function parseCsv(text: string, sep: string, maxRows: number): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if ((cell || row.length) && rows.length < maxRows) rows.push([...row, cell])
  return rows
}

function hexDump(bytes: Uint8Array): string {
  const lines: string[] = []
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = [...bytes.slice(off, off + 16)]
    const hex = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  return lines.join('\n')
}

function TextPreview({
  client,
  bucket,
  objectKey,
  versionId,
  size,
  kind,
}: {
  client: S3Client
  bucket: string
  objectKey: string
  versionId?: string
  size: number
  kind: 'text' | 'json' | 'csv' | 'none'
}) {
  const [state, setState] = useState<{ bytes?: Uint8Array; error?: string }>({})
  const [mode, setMode] = useState<'table' | 'raw'>(kind === 'csv' ? 'table' : 'raw')
  const [wrap, setWrap] = useState(false)
  const limit = kind === 'none' ? 512 : TEXT_LIMIT

  useEffect(() => {
    const ctrl = new AbortController()
    setState({})
    getObjectBytes(client, bucket, objectKey, { versionId, range: size > limit ? `bytes=0-${limit - 1}` : undefined, signal: ctrl.signal })
      .then((r) => setState({ bytes: r.bytes }))
      .catch((e) => !ctrl.signal.aborted && setState({ error: describeError(e) }))
    return () => ctrl.abort()
  }, [client, bucket, objectKey, versionId, size, limit])

  const text = useMemo(() => {
    if (!state.bytes || kind === 'none') return ''
    const t = new TextDecoder('utf-8').decode(state.bytes)
    if (kind === 'json' && size <= limit) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2)
      } catch {
        return t
      }
    }
    return t
  }, [state.bytes, kind, size, limit])

  const table = useMemo(() => {
    if (kind !== 'csv' || !text) return null
    const first = text.slice(0, text.indexOf('\n') + 1 || undefined)
    const sep = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ','
    return parseCsv(text, sep, 501)
  }, [kind, text])

  if (state.error) return <p className="text-[13px] text-rose-600 dark:text-rose-400">{state.error}</p>
  if (!state.bytes)
    return (
      <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando prévia…
      </p>
    )

  const truncated = size > limit

  if (kind === 'none')
    return (
      <div className="space-y-3">
        <EmptyState icon={FileQuestion} title="Sem prévia para este tipo">
          Abaixo, os primeiros {formatBytes(state.bytes.length)} em hexadecimal.
        </EmptyState>
        <CodeEditor value={hexDump(state.bytes)} readOnly minRows={4} />
      </div>
    )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {kind === 'csv' && (
          <Segmented
            size="xs"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'table', label: 'Tabela' },
              { value: 'raw', label: 'Texto' },
            ]}
          />
        )}
        {truncated && <span className="text-xs text-amber-600 dark:text-amber-400">Mostrando os primeiros {formatBytes(limit)} de {formatBytes(size)}.</span>}
        <div className="flex-1" />
        {mode === 'raw' && <IconButton icon={WrapText} label="Quebrar linhas" size="xs" active={wrap} onClick={() => setWrap((w) => !w)} />}
      </div>
      {mode === 'table' && table ? (
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
              <tr>
                <th className="px-2 py-1.5 text-right font-medium text-zinc-400">#</th>
                {table[0]?.map((h, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {table.slice(1).map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-right text-zinc-400 tabular-nums">{i + 1}</td>
                  {r.map((c, j) => (
                    <td key={j} className="max-w-64 truncate px-2 py-1 whitespace-nowrap" title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.length > 500 && <p className="p-2 text-xs text-zinc-500">Mostrando as primeiras 500 linhas.</p>}
        </div>
      ) : (
        <CodeEditor value={text} readOnly wrap={wrap} minRows={4} maxHeight="60vh" />
      )}
    </div>
  )
}

export function ObjectPreview({
  client,
  bucket,
  objectKey,
  versionId,
  contentType,
  size,
  actions,
}: {
  client: S3Client
  bucket: string
  objectKey: string
  versionId?: string
  contentType?: string
  size: number
  actions: ObjectActions
}) {
  const kind = previewKind(objectKey, contentType)
  const [url, setUrl] = useState<string | null>(null)
  const media = kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf'

  useEffect(() => {
    if (!media) return
    let alive = true
    setUrl(null)
    void actions.inAppUrl(objectKey, { versionId, contentType: kind === 'pdf' ? 'application/pdf' : undefined }).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [media, actions, objectKey, versionId, kind])

  if (size === 0) return <p className="py-8 text-center text-[13px] text-zinc-500">Objeto vazio (0 byte).</p>

  if (!media) return <TextPreview client={client} bucket={bucket} objectKey={objectKey} versionId={versionId} size={size} kind={kind as 'text' | 'json' | 'csv' | 'none'} />

  if (!url)
    return (
      <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando prévia…
      </p>
    )

  if (kind === 'image')
    return (
      <div className="checkerboard flex max-h-[65vh] items-center justify-center overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
        <img src={url} alt={objectKey} className="max-h-[62vh] max-w-full object-contain" />
      </div>
    )
  if (kind === 'video') return <video src={url} controls className="max-h-[65vh] w-full rounded-lg bg-black" />
  if (kind === 'audio') return <audio src={url} controls className="w-full" />
  return <iframe src={url} title={objectKey} className="h-[70vh] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800" />
}
