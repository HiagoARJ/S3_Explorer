import type { S3Client } from '@aws-sdk/client-s3'
import { Copy, FilePlus, FolderPlus, Link2, MoveRight, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBuckets } from '../../hooks/useBuckets'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { createFolder, describeError, presignPut, putObject } from '../../lib/api'
import { copyText, formatNumber } from '../../lib/format'
import { guessContentType } from '../../lib/mime'
import { baseName, normalizePrefix } from '../../lib/paths'
import type { Entry } from '../../lib/types'
import { EXPIRY_OPTIONS } from '../layout/SettingsDialog'
import { Button } from '../ui/Button'
import { CodeEditor } from '../ui/CodeEditor'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Select } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import type { ObjectActions } from './useObjectActions'

function validName(name: string, folder = false): string | null {
  if (!name.trim()) return 'Informe um nome.'
  if (!folder && name.includes('/')) return 'Use "/" só em nomes de pasta.'
  if (name.startsWith('/')) return 'Não comece com "/".'
  if (name === '.' || name === '..') return 'Nome inválido.'
  if (new TextEncoder().encode(name).length > 1024) return 'Chaves do S3 têm no máximo 1024 bytes.'
  return null
}

/* ---------------- nova pasta ---------------- */

export function CreateFolderDialog({
  open,
  onClose,
  client,
  bucket,
  prefix,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  client: S3Client
  bucket: string
  prefix: string
  onCreated: (prefix: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
    }
  }, [open])

  const submit = async () => {
    const clean = name.trim().replace(/\/+$/, '')
    const v = validName(clean, true)
    if (v) return setError(v)
    setBusy(true)
    try {
      const key = prefix + clean + '/'
      await createFolder(client, bucket, key)
      toast('success', 'Pasta criada', key)
      onCreated(key)
      onClose()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      icon={FolderPlus}
      title="Criar pasta"
      description={
        <>
          Em <span className="font-mono">s3://{bucket}/{prefix}</span>
        </>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" icon={FolderPlus} onClick={submit} loading={busy}>
            Criar pasta
          </Button>
        </>
      }
    >
      <Field label="Nome da pasta" error={error} hint='No S3, pastas são prefixos. É criado um objeto vazio terminado em "/", como no console da AWS.'>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className="font-mono" placeholder="relatorios" />
      </Field>
    </Dialog>
  )
}

/* ---------------- novo arquivo de texto ---------------- */

export function NewFileDialog({
  open,
  onClose,
  client,
  bucket,
  prefix,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  client: S3Client
  bucket: string
  prefix: string
  onCreated: (key: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setName('')
      setContent('')
      setError(null)
    }
  }, [open])

  const submit = async () => {
    const v = validName(name.trim())
    if (v) return setError(v)
    setBusy(true)
    try {
      const key = prefix + name.trim()
      await putObject(client, bucket, key, content, { contentType: guessContentType(key, 'text/plain') + '; charset=utf-8' })
      toast('success', 'Arquivo criado', key)
      onCreated(key)
      onClose()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={FilePlus}
      title="Novo arquivo de texto"
      description={
        <>
          Em <span className="font-mono">s3://{bucket}/{prefix}</span>
        </>
      }
      footer={
        <>
          {error && <p className="mr-auto text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" icon={FilePlus} onClick={submit} loading={busy}>
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome do arquivo" hint={name ? `Content-Type: ${guessContentType(name, 'text/plain')}` : undefined}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="font-mono" placeholder="config.json" />
        </Field>
        <CodeEditor value={content} onChange={setContent} minRows={14} placeholder="Conteúdo…" />
      </div>
    </Dialog>
  )
}

/* ---------------- renomear ---------------- */

export function RenameDialog({
  entry,
  onClose,
  actions,
  onDone,
}: {
  entry: Entry | null
  onClose: () => void
  actions: ObjectActions
  onDone: (newKey: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (entry) {
      setName(baseName(entry.key))
      setError(null)
    }
  }, [entry])
  if (!entry) return null
  const isFolder = entry.kind === 'folder'

  const submit = async () => {
    const clean = name.trim().replace(/\/+$/, '')
    const v = validName(clean) ?? (clean === baseName(entry.key) ? 'O nome não mudou.' : null)
    if (v) return setError(v)
    setBusy(true)
    try {
      if (isFolder) {
        onClose()
        onDone(await actions.rename(entry, clean))
      } else {
        const k = await actions.rename(entry, clean)
        onClose()
        onDone(k)
      }
    } catch (e) {
      if (isFolder) toast('error', 'Falha ao renomear', describeError(e))
      else setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      size="sm"
      icon={Pencil}
      title={isFolder ? 'Renomear pasta' : 'Renomear objeto'}
      description="O S3 não tem renomear: o app copia para o novo nome e exclui o original."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Pencil} onClick={submit} loading={busy}>
            Renomear
          </Button>
        </>
      }
    >
      <Field label="Novo nome" error={error} hint={isFolder ? 'Todos os objetos da pasta serão copiados e excluídos.' : undefined}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className="font-mono" />
      </Field>
    </Dialog>
  )
}

/* ---------------- excluir ---------------- */

export function DeleteDialog({
  entries,
  versioning,
  versionsMode,
  onClose,
  onConfirm,
}: {
  entries: Entry[] | null
  versioning: string | null
  versionsMode: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => setTyped(''), [entries])
  if (!entries) return null

  const folders = entries.filter((e) => e.kind === 'folder').length
  const versions = entries.filter((e) => e.kind === 'object' && e.versionId && versionsMode).length
  const permanent = versionsMode ? versions > 0 : versioning !== 'Enabled'
  const needsTyping = folders > 0 || permanent
  const word = 'excluir'
  const ok = !needsTyping || typed === word

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={entries.length === 1 ? 'Excluir item' : `Excluir ${formatNumber(entries.length)} itens`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" icon={Trash2} onClick={onConfirm} disabled={!ok}>
            Excluir
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <TriangleAlert className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
          <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-zinc-50 p-2 font-mono text-xs dark:bg-zinc-950">
            {entries.slice(0, 50).map((e) => (
              <li key={e.key + (e.kind === 'object' ? (e.versionId ?? '') : '')} className="truncate">
                {e.key}
                {e.kind === 'object' && versionsMode && e.versionId && <span className="text-zinc-400"> · v {e.versionId.slice(0, 10)}</span>}
              </li>
            ))}
            {entries.length > 50 && <li className="text-zinc-400">… e mais {entries.length - 50}</li>}
          </ul>
          {folders > 0 && <p>Pastas são excluídas com todo o conteúdo.</p>}
          {versionsMode && versions > 0 && <p>As versões selecionadas serão excluídas permanentemente.</p>}
          {!versionsMode && versioning === 'Enabled' && (
            <p>O bucket é versionado: será criado um marcador de exclusão e as versões anteriores continuam recuperáveis.</p>
          )}
          {!versionsMode && versioning !== 'Enabled' && <p>O bucket não é versionado: a exclusão é permanente.</p>}
          {needsTyping && (
            <div>
              <p className="mb-1.5 text-[13px]">
                Digite <span className="font-mono font-semibold text-zinc-900 dark:text-white">{word}</span> para confirmar:
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ok && onConfirm()}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------- copiar / mover ---------------- */

export function CopyMoveDialog({
  state,
  bucket,
  prefix,
  onClose,
  actions,
  onDone,
}: {
  state: { entries: Entry[]; move: boolean } | null
  bucket: string
  prefix: string
  onClose: () => void
  actions: ObjectActions
  onDone: () => void
}) {
  const { names } = useBuckets()
  const toast = useToast()
  const [dstBucket, setDstBucket] = useState(bucket)
  const [dstPrefix, setDstPrefix] = useState(prefix)
  useEffect(() => {
    if (state) {
      setDstBucket(bucket)
      setDstPrefix(prefix)
    }
  }, [state, bucket, prefix])
  if (!state) return null
  const { entries, move } = state
  const same = dstBucket === bucket && normalizePrefix(dstPrefix) === prefix

  const submit = () => {
    onClose()
    actions
      .copyMoveEntries(entries, { bucket: dstBucket, prefix: normalizePrefix(dstPrefix) }, move)
      .then(onDone)
      .catch((e) => (e as Error).name !== 'AbortError' && toast('error', move ? 'Falha ao mover' : 'Falha ao copiar', describeError(e)))
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      icon={move ? MoveRight : Copy}
      title={`${move ? 'Mover' : 'Copiar'} ${entries.length === 1 ? baseName(entries[0].key) : `${formatNumber(entries.length)} itens`}`}
      description="Os nomes são mantidos; pastas vão com todo o conteúdo."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={move ? MoveRight : Copy} onClick={submit} disabled={same}>
            {move ? 'Mover' : 'Copiar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <Field label="Bucket de destino">
          <Select value={dstBucket} onChange={(e) => setDstBucket(e.target.value)}>
            {!names.includes(bucket) && <option value={bucket}>{bucket}</option>}
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pasta de destino" error={same ? 'Escolha outro destino.' : null}>
          <Input value={dstPrefix} onChange={(e) => setDstPrefix(e.target.value)} className="font-mono" placeholder="(raiz)" />
        </Field>
      </div>
      <p className="mt-3 font-mono text-xs text-zinc-500">
        → s3://{dstBucket}/{normalizePrefix(dstPrefix)}
      </p>
    </Dialog>
  )
}

/* ---------------- link pré-assinado ---------------- */

export function PresignDialog({
  target,
  onClose,
  actions,
  bucket,
  region,
}: {
  target: { key: string; versionId?: string } | null
  onClose: () => void
  actions: ObjectActions
  bucket: string
  region: string
}) {
  const { settings, publicClientFor, readOnly } = useSettings()
  const toast = useToast()
  const [expires, setExpires] = useState(settings.presignExpires)
  const [method, setMethod] = useState<'GET' | 'PUT'>('GET')
  const [download, setDownload] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      setExpires(settings.presignExpires)
      setMethod('GET')
      setUrl('')
    }
  }, [target, settings.presignExpires])
  if (!target) return null

  const generate = async () => {
    setBusy(true)
    try {
      setUrl(
        method === 'GET'
          ? await actions.shareUrl(target.key, { versionId: target.versionId, expiresIn: expires, download })
          : await presignPut(publicClientFor(region), bucket, target.key, expires, guessContentType(target.key)),
      )
    } catch (e) {
      toast('error', 'Falha ao gerar o link', describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const curl =
    method === 'GET'
      ? `curl -o "${baseName(target.key)}" "${url}"`
      : `curl -X PUT -H "Content-Type: ${guessContentType(target.key)}" --upload-file "${baseName(target.key)}" "${url}"`

  return (
    <Dialog open onClose={onClose} size="lg" icon={Link2} title="Link pré-assinado" description={<span className="font-mono">s3://{bucket}/{target.key}</span>} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tipo">
            <Segmented
              value={method}
              onChange={(m) => {
                setMethod(m)
                setUrl('')
              }}
              options={[
                { value: 'GET', label: 'Baixar (GET)' },
                ...(readOnly || target.versionId ? [] : [{ value: 'PUT' as const, label: 'Enviar (PUT)' }]),
              ]}
            />
          </Field>
          <Field label="Validade" className="w-44">
            <Select
              value={expires}
              onChange={(e) => {
                setExpires(Number(e.target.value))
                setUrl('')
              }}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          {method === 'GET' && (
            <label className="flex h-9 items-center gap-2 text-[13px]">
              <input type="checkbox" checked={download} onChange={(e) => (setDownload(e.target.checked), setUrl(''))} className="size-4 accent-indigo-600" />
              Forçar download
            </label>
          )}
          <Button variant="primary" icon={Link2} onClick={generate} loading={busy}>
            Gerar link
          </Button>
        </div>

        {url && (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium">URL</span>
                <Button size="xs" variant="ghost" icon={Copy} onClick={async () => (await copyText(url)) && toast('success', 'Link copiado')}>
                  Copiar
                </Button>
              </div>
              <CodeEditor value={url} readOnly wrap minRows={4} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium">Exemplo com curl</span>
                <Button size="xs" variant="ghost" icon={Copy} onClick={async () => (await copyText(curl)) && toast('success', 'Comando copiado')}>
                  Copiar
                </Button>
              </div>
              <CodeEditor value={curl} readOnly wrap minRows={3} />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Qualquer pessoa com o link pode {method === 'GET' ? 'baixar o objeto' : 'enviar um arquivo para esta chave'} até ele expirar.
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}
