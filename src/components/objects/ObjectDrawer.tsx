import type { HeadObjectCommandOutput, S3Client } from '@aws-sdk/client-s3'
import {
  Copy,
  Download,
  Eye,
  FilePen,
  History,
  Info,
  Link2,
  MoreHorizontal,
  MoveRight,
  Pencil,
  RotateCcw,
  Save,
  Settings2,
  Tags as TagsIcon,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import {
  deleteObjects,
  describeError,
  getObjectBytes,
  getObjectTags,
  headObject,
  isNotFound,
  listVersions,
  putObject,
  putObjectTags,
  updateObjectProps,
  type ObjectProps,
} from '../../lib/api'
import { cleanEtag, copyText, formatBytes, formatDateShort, formatDateTime } from '../../lib/format'
import { fileIcon, isEditable } from '../../lib/mime'
import { baseName, encodeKey, objectArn, s3Uri } from '../../lib/paths'
import type { Entry, ObjectEntry } from '../../lib/types'
import { Button, IconButton } from '../ui/Button'
import { CodeEditor, jsonError } from '../ui/CodeEditor'
import { ConfirmDialog, Drawer } from '../ui/Dialog'
import { Field, Input, Select } from '../ui/Form'
import { KeyValueEditor, kvHasDupes, kvToRecord, recordToKv, type KV } from '../ui/KeyValueEditor'
import { Badge, DetailRow, EmptyState, MenuItem, MenuLabel, Popover, Spinner, Tabs } from '../ui/Misc'
import { ObjectPreview } from './ObjectPreview'
import { STORAGE_CLASSES } from './UploadDialog'
import type { ObjectActions } from './useObjectActions'

type DrawerTab = 'overview' | 'preview' | 'edit' | 'properties' | 'tags' | 'versions'

/** Edição de texto no app: acima disso, melhor baixar. */
const EDIT_LIMIT = 5 * 1024 * 1024

export interface DrawerTarget {
  key: string
  versionId?: string
}

export type DrawerRequest = 'delete' | 'copy' | 'move' | 'rename' | 'presign'

/* ---------------- editar texto ---------------- */

function EditTab({
  client,
  bucket,
  objectKey,
  head,
  onSaved,
}: {
  client: S3Client
  bucket: string
  objectKey: string
  head: HeadObjectCommandOutput
  onSaved: () => void
}) {
  const toast = useToast()
  const [original, setOriginal] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isJson = /json/.test(head.ContentType ?? '') || objectKey.endsWith('.json')

  useEffect(() => {
    getObjectBytes(client, bucket, objectKey)
      .then((r) => {
        const t = new TextDecoder('utf-8').decode(r.bytes)
        setOriginal(t)
        setText(t)
      })
      .catch((e) => setError(describeError(e)))
  }, [client, bucket, objectKey])

  const syntax = isJson ? jsonError(text) : null
  const dirty = original !== null && text !== original

  const save = async () => {
    setSaving(true)
    try {
      await putObject(client, bucket, objectKey, text, {
        contentType: head.ContentType,
        metadata: head.Metadata,
        cacheControl: head.CacheControl,
        contentDisposition: head.ContentDisposition,
      })
      toast('success', 'Objeto salvo', objectKey)
      setOriginal(text)
      onSaved()
    } catch (e) {
      toast('error', 'Falha ao salvar', describeError(e))
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
  if (original === null)
    return (
      <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando…
      </p>
    )
  return (
    <div className="space-y-3">
      <CodeEditor value={text} onChange={setText} invalid={!!syntax} minRows={20} maxHeight="62vh" />
      {syntax && <p className="text-[13px] text-amber-600 dark:text-amber-400">JSON inválido — {syntax}</p>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">Salvar substitui o objeto (Content-Type e metadados são mantidos).</span>
        <Button size="sm" disabled={!dirty || saving} onClick={() => setText(original)}>
          Descartar
        </Button>
        <Button size="sm" variant="primary" icon={Save} disabled={!dirty} loading={saving} onClick={save}>
          Salvar
        </Button>
      </div>
    </div>
  )
}

/* ---------------- propriedades / metadados ---------------- */

function PropertiesTab({
  client,
  bucket,
  objectKey,
  head,
  readOnly,
  onSaved,
}: {
  client: S3Client
  bucket: string
  objectKey: string
  head: HeadObjectCommandOutput
  readOnly: boolean
  onSaved: () => void
}) {
  const toast = useToast()
  const initial = useCallback(
    (): ObjectProps => ({
      contentType: head.ContentType ?? '',
      cacheControl: head.CacheControl ?? '',
      contentDisposition: head.ContentDisposition ?? '',
      contentEncoding: head.ContentEncoding ?? '',
      contentLanguage: head.ContentLanguage ?? '',
      storageClass: head.StorageClass ?? 'STANDARD',
      metadata: head.Metadata ?? {},
    }),
    [head],
  )
  const [p, setP] = useState<ObjectProps>(initial)
  const [meta, setMeta] = useState<KV[]>(() => recordToKv(head.Metadata))
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setP(initial())
    setMeta(recordToKv(head.Metadata))
  }, [head, initial])

  const set = (patch: Partial<ObjectProps>) => setP((x) => ({ ...x, ...patch }))
  const dirty = JSON.stringify({ ...p, metadata: kvToRecord(meta) }) !== JSON.stringify(initial())
  const badMeta = kvHasDupes(meta) || meta.some((m) => m.key && !/^[A-Za-z0-9-_.]+$/.test(m.key))

  const save = async () => {
    setSaving(true)
    try {
      await updateObjectProps(client, bucket, objectKey, head, { ...p, metadata: kvToRecord(meta) })
      toast('success', 'Propriedades salvas', objectKey)
      onSaved()
    } catch (e) {
      toast('error', 'Falha ao salvar', describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, k: keyof Omit<ObjectProps, 'metadata' | 'storageClass'>, ph?: string) => (
    <Field label={label}>
      <Input inputSize="sm" value={p[k]} onChange={(e) => set({ [k]: e.target.value })} className="font-mono" placeholder={ph} readOnly={readOnly} />
    </Field>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('Content-Type', 'contentType', 'application/octet-stream')}
        {field('Cache-Control', 'cacheControl', 'max-age=3600')}
        {field('Content-Disposition', 'contentDisposition', 'attachment; filename="x.pdf"')}
        {field('Content-Encoding', 'contentEncoding', 'gzip')}
        {field('Content-Language', 'contentLanguage', 'pt-BR')}
        <Field label="Classe de armazenamento">
          <Select inputSize="sm" value={p.storageClass} onChange={(e) => set({ storageClass: e.target.value })} disabled={readOnly}>
            {!STORAGE_CLASSES.some((s) => s.value === p.storageClass) && <option value={p.storageClass}>{p.storageClass}</option>}
            {STORAGE_CLASSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Metadados do usuário</p>
        <KeyValueEditor items={meta} onChange={setMeta} keyPrefix="x-amz-meta-" addLabel="Adicionar metadado" readOnly={readOnly} />
        {badMeta && <p className="mt-1 text-xs text-rose-600">Chaves de metadados aceitam letras, números, "-", "_" e ".".</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">O S3 aplica mudanças copiando o objeto sobre ele mesmo.</span>
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={() => {
              setP(initial())
              setMeta(recordToKv(head.Metadata))
            }}
          >
            Descartar
          </Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} disabled={!dirty || badMeta} onClick={save}>
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------- tags ---------------- */

function TagsTab({ client, bucket, objectKey, versionId, readOnly }: { client: S3Client; bucket: string; objectKey: string; versionId?: string; readOnly: boolean }) {
  const toast = useToast()
  const [original, setOriginal] = useState<KV[] | null>(null)
  const [draft, setDraft] = useState<KV[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getObjectTags(client, bucket, objectKey, versionId)
      .then((t) => {
        const kv = t.map((x) => ({ key: x.Key ?? '', value: x.Value ?? '' }))
        setOriginal(kv)
        setDraft(kv)
      })
      .catch((e) => setError(describeError(e)))
  }, [client, bucket, objectKey, versionId])
  useEffect(load, [load])

  if (error) return <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
  if (!original)
    return (
      <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando…
      </p>
    )
  const clean = draft.filter((d) => d.key.trim())
  const dirty = JSON.stringify(clean) !== JSON.stringify(original)

  return (
    <div className="space-y-3">
      <KeyValueEditor items={draft} onChange={setDraft} addLabel="Adicionar tag" max={10} readOnly={readOnly} />
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={!dirty} onClick={() => setDraft(original)}>
            Descartar
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Save}
            loading={saving}
            disabled={!dirty || kvHasDupes(draft)}
            onClick={async () => {
              setSaving(true)
              try {
                await putObjectTags(client, bucket, objectKey, clean.map((t) => ({ Key: t.key.trim(), Value: t.value })), versionId)
                toast('success', 'Tags salvas')
                load()
              } catch (e) {
                toast('error', 'Falha ao salvar as tags', describeError(e))
              } finally {
                setSaving(false)
              }
            }}
          >
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------- versões ---------------- */

function VersionsTab({
  client,
  bucket,
  objectKey,
  current,
  readOnly,
  actions,
  onSelect,
  onChanged,
}: {
  client: S3Client
  bucket: string
  objectKey: string
  current?: string
  readOnly: boolean
  actions: ObjectActions
  onSelect: (versionId?: string) => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [list, setList] = useState<ObjectEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<ObjectEntry | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const out: ObjectEntry[] = []
      let cursor: { keyMarker?: string; versionIdMarker?: string } | undefined = {}
      // Sem delimitador e com o prefixo = chave; filtra outras chaves que começam igual
      while (cursor && out.length < 5000) {
        const page = await listVersions(client, bucket, { prefix: objectKey, maxKeys: 1000, recursive: true, ...cursor })
        out.push(...page.objects.filter((o) => o.key === objectKey))
        cursor = page.next
        if (page.objects.some((o) => o.key > objectKey)) break
      }
      setList(out)
      setError(null)
    } catch (e) {
      setError(describeError(e))
    }
  }, [client, bucket, objectKey])
  useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
  if (!list)
    return (
      <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando versões…
      </p>
    )
  if (!list.length) return <EmptyState icon={History} title="Sem versões">O bucket não guarda versões deste objeto.</EmptyState>

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{list.length} versão(ões), da mais nova para a mais antiga.</p>
      <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
        {list.map((v) => {
          const selected = (current ?? list.find((x) => x.isLatest)?.versionId) === v.versionId
          return (
            <div key={v.versionId} className={`flex items-center gap-3 px-3 py-2 text-[13px] ${selected ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-mono text-[12px]" title={v.versionId}>
                    {v.versionId === 'null' ? 'null (antes do versionamento)' : v.versionId}
                  </span>
                  {v.isLatest && <Badge tone="green">atual</Badge>}
                  {v.deleteMarker && <Badge tone="rose">marcador de exclusão</Badge>}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(v.lastModified)}
                  {!v.deleteMarker && ` · ${formatBytes(v.size)}`}
                </p>
              </div>
              {!v.deleteMarker && (
                <>
                  <IconButton icon={Eye} label="Ver esta versão" size="xs" onClick={() => onSelect(v.isLatest ? undefined : v.versionId)} />
                  <IconButton icon={Download} label="Baixar esta versão" size="xs" onClick={() => actions.downloadOne(objectKey, v.versionId)} />
                  {!readOnly && !v.isLatest && (
                    <IconButton
                      icon={RotateCcw}
                      label="Restaurar (vira a versão atual)"
                      size="xs"
                      onClick={async () => {
                        try {
                          await actions.restoreVersion(objectKey, v.versionId!)
                          await load()
                          onSelect(undefined)
                          onChanged()
                        } catch (e) {
                          toast('error', 'Falha ao restaurar', describeError(e))
                        }
                      }}
                    />
                  )}
                </>
              )}
              {!readOnly && <IconButton icon={Trash2} label="Excluir permanentemente" size="xs" tone="danger" onClick={() => setToDelete(v)} />}
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        busy={busy}
        title={toDelete?.deleteMarker ? 'Remover marcador de exclusão' : 'Excluir versão'}
        confirmLabel={toDelete?.deleteMarker ? 'Remover' : 'Excluir versão'}
        onConfirm={async () => {
          if (!toDelete) return
          setBusy(true)
          try {
            await deleteObjects(client, bucket, [{ key: objectKey, versionId: toDelete.versionId }])
            toast('success', toDelete.deleteMarker ? 'Marcador removido' : 'Versão excluída')
            setToDelete(null)
            if (current === toDelete.versionId) onSelect(undefined)
            await load()
            onChanged()
          } catch (e) {
            toast('error', 'Falha ao excluir', describeError(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {toDelete?.deleteMarker
          ? 'Remover o marcador de exclusão "desfaz" a exclusão: a versão anterior volta a ser a atual.'
          : 'Esta versão será excluída permanentemente.'}
      </ConfirmDialog>
    </div>
  )
}

/* ---------------- painel ---------------- */

export function ObjectDrawer({
  target,
  client,
  bucket,
  versioning,
  actions,
  onClose,
  onChanged,
  onRequest,
  onSelectVersion,
}: {
  target: DrawerTarget | null
  client: S3Client
  bucket: string
  versioning: string | null
  actions: ObjectActions
  onClose: () => void
  onChanged: () => void
  onRequest: (req: DrawerRequest, entry: Entry) => void
  onSelectVersion: (versionId?: string) => void
}) {
  const { readOnly, connection } = useSettings()
  const toast = useToast()
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [head, setHead] = useState<HeadObjectCommandOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const key = target?.key ?? ''
  const versionId = target?.versionId

  useEffect(() => {
    if (!target) return
    let alive = true
    setHead(null)
    setError(null)
    headObject(client, bucket, target.key, target.versionId)
      .then((h) => alive && setHead(h))
      .catch((e) => alive && setError(isNotFound(e) ? 'Objeto não encontrado. Ele pode ter sido excluído ou a versão selecionada é um marcador de exclusão.' : describeError(e)))
    return () => {
      alive = false
    }
  }, [client, bucket, target?.key, target?.versionId, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Abrir o painel começa em Detalhes; trocar de versão com ele aberto mantém a aba
  const isOpen = !!target
  useEffect(() => {
    if (isOpen) setTab('overview')
  }, [isOpen])
  useEffect(() => {
    if (versionId) setTab((t) => (t === 'edit' ? 'overview' : t))
  }, [versionId])

  if (!target) return null

  const reload = () => {
    setNonce((n) => n + 1)
    onChanged()
  }
  const size = head?.ContentLength ?? 0
  const { icon: Icon, color } = fileIcon(key, head?.ContentType)
  const isOld = !!versionId
  const canEdit = !readOnly && !isOld && !!head && isEditable(key, head.ContentType) && size <= EDIT_LIMIT && !head.ContentEncoding
  const entry: ObjectEntry = { kind: 'object', key, size, versionId, lastModified: head?.LastModified, isLatest: !isOld }
  const objectUrl =
    connection.kind === 'aws'
      ? `https://${bucket}.s3.amazonaws.com/${encodeKey(key)}`
      : `${(connection.publicEndpoint || connection.endpoint).replace(/\/+$/, '')}/${bucket}/${encodeKey(key)}`

  const copy = async (label: string, text: string) => {
    if (await copyText(text)) toast('success', `${label} copiado`, text)
  }
  const CopyBtn = ({ label, text }: { label: string; text: string }) => (
    <button onClick={() => copy(label, text)} className="ml-1.5 inline-flex align-middle text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title={`Copiar ${label}`}>
      <Copy className="size-3.5" />
    </button>
  )

  const tabs = [
    { id: 'overview' as const, label: 'Detalhes', icon: Info },
    { id: 'preview' as const, label: 'Prévia', icon: Eye },
    ...(canEdit ? [{ id: 'edit' as const, label: 'Editar', icon: FilePen }] : []),
    { id: 'properties' as const, label: 'Propriedades', icon: Settings2 },
    { id: 'tags' as const, label: 'Tags', icon: TagsIcon },
    ...(versioning ? [{ id: 'versions' as const, label: 'Versões', icon: History }] : []),
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'overview'

  return (
    <Drawer open onClose={onClose} width="w-[min(820px,100vw)]">
      <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <Icon className={`size-[18px] ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold" title={key}>
            {baseName(key)}
          </h2>
          <p className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400" title={key}>
            s3://{bucket}/{key}
          </p>
          {isOld && (
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone="amber">versão {versionId === 'null' ? 'null' : versionId!.slice(0, 16)}…</Badge>
              <button onClick={() => onSelectVersion(undefined)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                ver a atual
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" icon={Download} onClick={() => actions.downloadOne(key, versionId)} disabled={!head}>
            Baixar
          </Button>
          <IconButton icon={Link2} label="Link pré-assinado" onClick={() => onRequest('presign', entry)} disabled={!head} />
          <Popover
            width="w-56"
            trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Mais ações" onClick={toggle} />}
          >
            {(close) => (
              <>
                <MenuLabel>Copiar</MenuLabel>
                <MenuItem icon={Copy} onClick={() => (close(), copy('Chave', key))}>
                  Chave
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => (close(), copy('URI', s3Uri(bucket, key)))}>
                  URI do S3
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => (close(), copy('ARN', objectArn(bucket, key)))}>
                  ARN
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => (close(), copy('URL', objectUrl))}>
                  URL do objeto
                </MenuItem>
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                <MenuItem icon={Copy} onClick={() => (close(), onRequest('copy', entry))}>
                  Copiar para…
                </MenuItem>
                {!readOnly && (
                  <>
                    {!isOld && (
                      <>
                        <MenuItem icon={MoveRight} onClick={() => (close(), onRequest('move', entry))}>
                          Mover para…
                        </MenuItem>
                        <MenuItem icon={Pencil} onClick={() => (close(), onRequest('rename', entry))}>
                          Renomear
                        </MenuItem>
                      </>
                    )}
                    <MenuItem icon={Trash2} danger onClick={() => (close(), onRequest('delete', entry))}>
                      {isOld ? 'Excluir esta versão' : 'Excluir'}
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Popover>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
      </div>

      <div className="px-5">
        <Tabs<DrawerTab> value={activeTab} onChange={setTab} items={tabs} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <EmptyState icon={Info} tone="error" title="Não foi possível carregar">
            {error}
          </EmptyState>
        ) : !head ? (
          <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
            <Spinner className="size-3.5" /> Carregando…
          </p>
        ) : activeTab === 'overview' ? (
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            <DetailRow label="Chave" mono>
              {key}
              <CopyBtn label="Chave" text={key} />
            </DetailRow>
            <DetailRow label="Tamanho">
              {formatBytes(size)} <span className="text-zinc-400">({size.toLocaleString('pt-BR')} bytes)</span>
            </DetailRow>
            <DetailRow label="Modificado em">
              {formatDateTime(head.LastModified)} <span className="text-zinc-400">· {formatDateShort(head.LastModified)}</span>
            </DetailRow>
            <DetailRow label="Content-Type" mono>
              {head.ContentType ?? '—'}
            </DetailRow>
            <DetailRow label="ETag" mono>
              {cleanEtag(head.ETag)}
              {cleanEtag(head.ETag).includes('-') && <span className="ml-1.5 font-sans text-[11px] text-zinc-400">(multipart)</span>}
            </DetailRow>
            <DetailRow label="Classe">{head.StorageClass ?? 'STANDARD'}</DetailRow>
            {head.VersionId && (
              <DetailRow label="Versão" mono>
                {head.VersionId}
              </DetailRow>
            )}
            <DetailRow label="Criptografia">
              {head.ServerSideEncryption ? `${head.ServerSideEncryption}${head.SSEKMSKeyId ? ` · ${head.SSEKMSKeyId}` : ''}` : 'nenhuma'}
            </DetailRow>
            {head.CacheControl && (
              <DetailRow label="Cache-Control" mono>
                {head.CacheControl}
              </DetailRow>
            )}
            {head.ContentDisposition && (
              <DetailRow label="Content-Disposition" mono>
                {head.ContentDisposition}
              </DetailRow>
            )}
            {head.ContentEncoding && (
              <DetailRow label="Content-Encoding" mono>
                {head.ContentEncoding}
              </DetailRow>
            )}
            {head.Expires && <DetailRow label="Expires">{formatDateTime(head.Expires)}</DetailRow>}
            {head.ObjectLockMode && (
              <DetailRow label="Object Lock">
                {head.ObjectLockMode} até {formatDateTime(head.ObjectLockRetainUntilDate)}
              </DetailRow>
            )}
            {head.Metadata && Object.keys(head.Metadata).length > 0 && (
              <DetailRow label="Metadados">
                <div className="space-y-0.5 font-mono text-[12px]">
                  {Object.entries(head.Metadata).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-zinc-500">x-amz-meta-{k}:</span> {v}
                    </div>
                  ))}
                </div>
              </DetailRow>
            )}
            <DetailRow label="URI" mono>
              {s3Uri(bucket, key)}
              <CopyBtn label="URI" text={s3Uri(bucket, key)} />
            </DetailRow>
            <DetailRow label="ARN" mono>
              {objectArn(bucket, key)}
              <CopyBtn label="ARN" text={objectArn(bucket, key)} />
            </DetailRow>
            <DetailRow label="URL" mono>
              {objectUrl}
              <CopyBtn label="URL" text={objectUrl} />
            </DetailRow>
          </dl>
        ) : activeTab === 'preview' ? (
          <ObjectPreview client={client} bucket={bucket} objectKey={key} versionId={versionId} contentType={head.ContentType} size={size} actions={actions} />
        ) : activeTab === 'edit' ? (
          <EditTab key={nonce} client={client} bucket={bucket} objectKey={key} head={head} onSaved={reload} />
        ) : activeTab === 'properties' ? (
          <PropertiesTab client={client} bucket={bucket} objectKey={key} head={head} readOnly={readOnly || isOld} onSaved={reload} />
        ) : activeTab === 'tags' ? (
          <TagsTab client={client} bucket={bucket} objectKey={key} versionId={versionId} readOnly={readOnly} />
        ) : (
          <VersionsTab
            client={client}
            bucket={bucket}
            objectKey={key}
            current={versionId}
            readOnly={readOnly}
            actions={actions}
            onSelect={onSelectVersion}
            onChanged={reload}
          />
        )}
      </div>
    </Drawer>
  )
}
