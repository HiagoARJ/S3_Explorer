import type { S3Client } from '@aws-sdk/client-s3'
import { ChevronDown, ChevronRight, FilePlus, FolderPlus, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../hooks/useToast'
import { useTransfers } from '../../hooks/useTransfers'
import { formatBytes, formatNumber } from '../../lib/format'
import { fileIcon, guessContentType } from '../../lib/mime'
import { normalizePrefix } from '../../lib/paths'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Select } from '../ui/Form'
import { KeyValueEditor, kvHasDupes, kvToRecord, type KV } from '../ui/KeyValueEditor'
import { filesFromInput, type PickedFile } from './dropFiles'

export const STORAGE_CLASSES = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'INTELLIGENT_TIERING', label: 'Intelligent-Tiering' },
  { value: 'STANDARD_IA', label: 'Standard-IA' },
  { value: 'ONEZONE_IA', label: 'One Zone-IA' },
  { value: 'GLACIER_IR', label: 'Glacier Instant Retrieval' },
  { value: 'GLACIER', label: 'Glacier Flexible Retrieval' },
  { value: 'DEEP_ARCHIVE', label: 'Glacier Deep Archive' },
  { value: 'REDUCED_REDUNDANCY', label: 'Reduced Redundancy' },
]

export function UploadDialog({
  open,
  initial,
  prefix,
  bucket,
  client,
  onClose,
  onUploaded,
}: {
  open: boolean
  initial: PickedFile[]
  prefix: string
  bucket: string
  client: S3Client
  onClose: () => void
  onUploaded: () => void
}) {
  const { enqueueUploads } = useTransfers()
  const toast = useToast()
  const [files, setFiles] = useState<PickedFile[]>([])
  const [dest, setDest] = useState(prefix)
  const [storageClass, setStorageClass] = useState('STANDARD')
  const [cacheControl, setCacheControl] = useState('')
  const [contentType, setContentType] = useState('')
  const [metadata, setMetadata] = useState<KV[]>([])
  const [tags, setTags] = useState<KV[]>([])
  const [advanced, setAdvanced] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setFiles(initial)
    setDest(prefix)
    setContentType('')
    setAdvanced(false)
  }, [open, initial, prefix])

  const total = useMemo(() => files.reduce((s, f) => s + f.file.size, 0), [files])
  const add = (list: PickedFile[]) => setFiles((fs) => [...fs, ...list.filter((n) => !fs.some((f) => f.path === n.path))])
  const invalid = kvHasDupes(metadata) || kvHasDupes(tags) || metadata.some((m) => m.key && !/^[A-Za-z0-9-_.]+$/.test(m.key))

  const submit = () => {
    const base = normalizePrefix(dest)
    const items = files.map((f) => ({
      file: f.file,
      key: base + f.path,
      contentType: contentType.trim() || f.file.type || guessContentType(f.path),
    }))
    const count = items.length
    onClose()
    void enqueueUploads(client, bucket, items, {
      storageClass: storageClass === 'STANDARD' ? undefined : storageClass,
      cacheControl: cacheControl.trim() || undefined,
      metadata: kvToRecord(metadata),
      tags: tags.filter((t) => t.key.trim()).map((t) => ({ Key: t.key.trim(), Value: t.value })),
    }).then(({ ok, failed }) => {
      onUploaded()
      if (failed) toast('error', `${failed} de ${count} arquivo(s) não foram enviados`, 'Veja o painel de transferências.')
      else toast('success', 'Envio concluído', `${formatNumber(ok)} arquivo(s) em s3://${bucket}/${base}`)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={Upload}
      title="Enviar arquivos"
      description={
        <>
          Para <span className="font-mono">s3://{bucket}/{normalizePrefix(dest)}</span>
        </>
      }
      footer={
        <>
          <span className="mr-auto text-[13px] text-zinc-500 dark:text-zinc-400">
            {formatNumber(files.length)} arquivo(s) · {formatBytes(total)}
          </span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Upload} onClick={submit} disabled={!files.length || invalid}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Pasta de destino" hint="Vazio = raiz do bucket. Pastas que não existem são criadas pelos próprios caminhos.">
          <Input value={dest} onChange={(e) => setDest(e.target.value)} className="font-mono" placeholder="(raiz)" />
        </Field>

        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="flex-1 text-[13px] font-medium">Arquivos</span>
            <Button size="xs" icon={FilePlus} onClick={() => fileInput.current?.click()}>
              Adicionar arquivos
            </Button>
            <Button size="xs" icon={FolderPlus} onClick={() => dirInput.current?.click()}>
              Adicionar pasta
            </Button>
            {files.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setFiles([])}>
                Limpar
              </Button>
            )}
          </div>
          <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/70">
            {files.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-zinc-500">Nenhum arquivo. Adicione ou arraste para a lista de objetos.</p>
            ) : (
              files.slice(0, 500).map((f) => {
                const { icon: Icon, color } = fileIcon(f.path, f.file.type)
                return (
                  <div key={f.path} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]">
                    <Icon className={`size-4 shrink-0 ${color}`} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={f.path}>
                      {f.path}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{formatBytes(f.file.size)}</span>
                    <IconButton icon={X} label="Remover" size="xs" onClick={() => setFiles((fs) => fs.filter((x) => x !== f))} />
                  </div>
                )
              })
            )}
            {files.length > 500 && <p className="px-3 py-2 text-xs text-zinc-500">… e mais {formatNumber(files.length - 500)} arquivo(s)</p>}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {advanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Propriedades (classe, cabeçalhos, metadados e tags)
        </button>

        {advanced && (
          <div className="space-y-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/30">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Classe de armazenamento">
                <Select value={storageClass} onChange={(e) => setStorageClass(e.target.value)}>
                  {STORAGE_CLASSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Content-Type" hint="Vazio = detectado por arquivo">
                <Input value={contentType} onChange={(e) => setContentType(e.target.value)} className="font-mono" placeholder="automático" />
              </Field>
              <Field label="Cache-Control">
                <Input value={cacheControl} onChange={(e) => setCacheControl(e.target.value)} className="font-mono" placeholder="max-age=3600" />
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Metadados do usuário</p>
              <KeyValueEditor items={metadata} onChange={setMetadata} keyPrefix="x-amz-meta-" addLabel="Adicionar metadado" />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Tags</p>
              <KeyValueEditor items={tags} onChange={setTags} addLabel="Adicionar tag" max={10} />
            </div>
          </div>
        )}
      </div>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => (add(filesFromInput(e.target.files)), (e.target.value = ''))} />
      <input
        ref={dirInput}
        type="file"
        hidden
        {...({ webkitdirectory: '' } as object)}
        onChange={(e) => (add(filesFromInput(e.target.files)), (e.target.value = ''))}
      />
    </Dialog>
  )
}
