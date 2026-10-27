import type { S3Client } from '@aws-sdk/client-s3'
import {
  ArrowUpFromLine,
  ChevronRight,
  Copy,
  CornerLeftUp,
  Download,
  FilePlus,
  FileUp,
  FolderPlus,
  FolderUp,
  History,
  ListTree,
  MoveRight,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { describeError, listObjects, listVersions } from '../../lib/api'
import { formatBytes, formatNumber } from '../../lib/format'
import { BucketIcon } from '../../lib/icons'
import { baseName, parentPrefix, prefixCrumbs } from '../../lib/paths'
import { entryId, type Entry, type FolderEntry, type ObjectEntry, type PageCursor } from '../../lib/types'
import { Button, IconButton } from '../ui/Button'
import { Input } from '../ui/Form'
import { Card, EmptyState, MenuItem, Popover, Spinner } from '../ui/Misc'
import { filesFromDrop, filesFromInput, type PickedFile } from './dropFiles'
import { CopyMoveDialog, CreateFolderDialog, DeleteDialog, NewFileDialog, PresignDialog, RenameDialog } from './ObjectDialogs'
import { ObjectDrawer, type DrawerRequest, type DrawerTarget } from './ObjectDrawer'
import { ObjectsTable, type RowAction, type SortState } from './ObjectsTable'
import { UploadDialog } from './UploadDialog'
import { useObjectActions } from './useObjectActions'

interface Listing {
  folders: FolderEntry[]
  objects: ObjectEntry[]
  next?: PageCursor
  loading: boolean
  error: string | null
}

const EMPTY: Listing = { folders: [], objects: [], loading: true, error: null }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function ObjectsBrowser({
  client,
  bucket,
  region,
  prefix,
  versioning,
  onPrefixChange,
  onDataChanged,
}: {
  client: S3Client
  bucket: string
  region: string
  prefix: string
  versioning: string | null
  onPrefixChange: (prefix: string) => void
  onDataChanged: () => void
}) {
  const { settings, readOnly } = useSettings()
  const toast = useToast()
  const actions = useObjectActions(client, bucket, region)

  const [versionsMode, setVersionsMode] = useState(false)
  const [flat, setFlat] = useState(false)
  const [search, setSearch] = useState('')
  const query = useDebounced(search, 300)
  const [list, setList] = useState<Listing>(EMPTY)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState>({ col: 'name', dir: 'asc' })
  const lastClicked = useRef<string | null>(null)
  const reqId = useRef(0)

  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [upload, setUpload] = useState<PickedFile[] | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [newFile, setNewFile] = useState(false)
  const [renaming, setRenaming] = useState<Entry | null>(null)
  const [deleting, setDeleting] = useState<Entry[] | null>(null)
  const [copyMove, setCopyMove] = useState<{ entries: Entry[]; move: boolean } | null>(null)
  const [presign, setPresign] = useState<{ key: string; versionId?: string } | null>(null)
  const [dragDepth, setDragDepth] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  const listPrefix = prefix + query

  const fetchPage = useCallback(
    async (cursor: PageCursor | undefined, append: boolean) => {
      const id = ++reqId.current
      setList((l) => ({ ...(append ? l : EMPTY), loading: true, error: null }))
      try {
        const page = versionsMode
          ? await listVersions(client, bucket, { prefix: listPrefix, maxKeys: settings.pageSize, recursive: flat, ...cursor })
          : await listObjects(client, bucket, { prefix: listPrefix, maxKeys: settings.pageSize, recursive: flat, token: cursor?.token })
        if (id !== reqId.current) return
        setList((l) => ({
          folders: append ? [...l.folders, ...page.folders] : page.folders,
          objects: append ? [...l.objects, ...page.objects] : page.objects,
          next: page.next,
          loading: false,
          error: null,
        }))
        return page.next
      } catch (e) {
        if (id !== reqId.current) return
        setList((l) => ({ ...l, loading: false, error: describeError(e) }))
      }
    },
    [client, bucket, listPrefix, settings.pageSize, versionsMode, flat],
  )

  const reload = useCallback(() => {
    setSelected(new Set())
    return fetchPage(undefined, false)
  }, [fetchPage])

  useEffect(() => {
    void reload()
  }, [reload])

  // Trocar de pasta limpa a busca
  useEffect(() => setSearch(''), [prefix])

  const loadAll = async () => {
    let next = list.next
    let guard = 0
    while (next && guard++ < 200) next = await fetchPage(next, true)
  }

  const changed = useCallback(() => {
    onDataChanged()
    void reload()
  }, [onDataChanged, reload])

  const entries = useMemo<Entry[]>(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const folders = [...list.folders].sort((a, b) => a.key.localeCompare(b.key) * (sort.col === 'name' ? dir : 1))
    if (versionsMode && sort.col === 'name') return [...folders, ...list.objects]
    const objs = [...list.objects].sort((a, b) => {
      let r = 0
      if (sort.col === 'size') r = a.size - b.size
      else if (sort.col === 'modified') r = (a.lastModified?.getTime() ?? 0) - (b.lastModified?.getTime() ?? 0)
      else if (sort.col === 'class') r = (a.storageClass ?? '').localeCompare(b.storageClass ?? '')
      return (r || a.key.localeCompare(b.key)) * dir
    })
    return [...folders, ...objs]
  }, [list.folders, list.objects, sort, versionsMode])

  const selectedEntries = entries.filter((e) => selected.has(entryId(e)))

  const toggle = (e: Entry, shift: boolean) => {
    const id = entryId(e)
    setSelected((s) => {
      const next = new Set(s)
      if (shift && lastClicked.current) {
        const ids = entries.map(entryId)
        const a = ids.indexOf(lastClicked.current)
        const b = ids.indexOf(id)
        if (a >= 0 && b >= 0) {
          for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x)
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClicked.current = id
  }

  const open = (e: Entry) => {
    if (e.kind === 'folder') onPrefixChange(e.key)
    else if (!e.deleteMarker) setDrawer({ key: e.key, versionId: versionsMode && !e.isLatest ? e.versionId : undefined })
  }

  const runDelete = async (items: Entry[]) => {
    setDeleting(null)
    try {
      await actions.deleteEntries(items)
      if (drawer && items.some((i) => i.key === drawer.key)) setDrawer(null)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('error', 'Falha ao excluir', describeError(e))
    }
    changed()
  }

  const onAction = (a: RowAction, e: Entry) => {
    const ver = e.kind === 'object' && versionsMode ? e.versionId : undefined
    if (a === 'open') open(e)
    else if (a === 'download' && e.kind === 'object') void actions.downloadOne(e.key, ver)
    else if (a === 'zip') void actions.downloadZip([e], parentPrefix(e.key), `${bucket}-${baseName(e.key)}.zip`)
    else if (a === 'presign') setPresign({ key: e.key, versionId: ver })
    else if (a === 'copy' || a === 'move') setCopyMove({ entries: [e], move: a === 'move' })
    else if (a === 'rename') setRenaming(e)
    else if (a === 'delete') setDeleting([e])
  }

  const onDrawerRequest = (req: DrawerRequest, e: Entry) => {
    if (req === 'presign') setPresign({ key: e.key, versionId: e.kind === 'object' ? e.versionId : undefined })
    else if (req === 'copy' || req === 'move') setCopyMove({ entries: [e], move: req === 'move' })
    else if (req === 'rename') setRenaming(e)
    else if (req === 'delete') setDeleting([e])
  }

  const downloadSelection = () => {
    const objs = selectedEntries.filter((e) => e.kind === 'object' && !e.deleteMarker)
    if (selectedEntries.length === 1 && objs.length === 1) {
      const o = objs[0] as ObjectEntry
      void actions.downloadOne(o.key, versionsMode ? o.versionId : undefined)
    } else {
      const name = prefix ? baseName(prefix) : bucket
      void actions.downloadZip(selectedEntries, prefix, `${name}-${selectedEntries.length}-itens.zip`)
    }
  }

  /* ---------------- arrastar e soltar ---------------- */

  const canDrop = !readOnly && !versionsMode
  const onDragEnter = (e: DragEvent) => {
    if (!canDrop || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }
  const onDragLeave = (e: DragEvent) => {
    if (!canDrop || !e.dataTransfer.types.includes('Files')) return
    setDragDepth((d) => Math.max(0, d - 1))
  }
  const onDrop = async (e: DragEvent) => {
    if (!canDrop) return
    e.preventDefault()
    setDragDepth(0)
    const files = await filesFromDrop(e.dataTransfer)
    if (files.length) setUpload(files)
  }

  const crumbs = prefixCrumbs(prefix)
  const totalBytes = list.objects.reduce((s, o) => s + (o.deleteMarker ? 0 : o.size), 0)
  const isEmpty = !list.loading && !list.error && entries.length === 0

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          icon={Search}
          inputSize="sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={prefix ? `Buscar em ${baseName(prefix)}/ por prefixo` : 'Buscar por prefixo'}
          className="w-full sm:w-72"
          right={
            search && (
              <button onClick={() => setSearch('')} className="rounded p-0.5 text-zinc-400 hover:text-zinc-600" aria-label="Limpar">
                <X className="size-3.5" />
              </button>
            )
          }
        />
        {versioning && (
          <Button size="sm" variant={versionsMode ? 'primary' : 'secondary'} icon={History} onClick={() => setVersionsMode((v) => !v)} title="Mostra versões anteriores e marcadores de exclusão">
            Versões
          </Button>
        )}
        <Button size="sm" variant={flat ? 'primary' : 'secondary'} icon={ListTree} onClick={() => setFlat((v) => !v)} title="Lista tudo sob a pasta atual, sem agrupar em pastas">
          Plana
        </Button>
        <IconButton icon={RefreshCw} label="Atualizar" onClick={() => reload()} loading={list.loading} />
        <div className="flex-1" />
        {!readOnly && (
          <>
            <Popover
              width="w-52"
              trigger={({ toggle }) => (
                <Button size="sm" icon={Plus} onClick={toggle}>
                  Novo
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={FolderPlus} onClick={() => (close(), setNewFolder(true))}>
                    Pasta
                  </MenuItem>
                  <MenuItem icon={FilePlus} onClick={() => (close(), setNewFile(true))}>
                    Arquivo de texto
                  </MenuItem>
                </>
              )}
            </Popover>
            <Popover
              width="w-52"
              trigger={({ toggle }) => (
                <Button size="sm" variant="primary" icon={Upload} onClick={toggle}>
                  Enviar
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={FileUp} onClick={() => (close(), fileInput.current?.click())}>
                    Arquivos
                  </MenuItem>
                  <MenuItem icon={FolderUp} onClick={() => (close(), dirInput.current?.click())}>
                    Pasta
                  </MenuItem>
                  <MenuItem icon={ArrowUpFromLine} onClick={() => (close(), setUpload([]))}>
                    Com opções…
                  </MenuItem>
                </>
              )}
            </Popover>
          </>
        )}
      </div>

      <Card className="relative overflow-hidden">
        <div onDragEnter={onDragEnter} onDragOver={(e) => canDrop && e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
          {/* Caminho + seleção */}
          <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
            {selectedEntries.length > 0 ? (
              <>
                <span className="text-[13px] font-medium">{formatNumber(selectedEntries.length)} selecionado(s)</span>
                <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpar
                </Button>
                <div className="flex-1" />
                <Button size="xs" icon={Download} onClick={downloadSelection}>
                  {selectedEntries.length === 1 && selectedEntries[0].kind === 'object' ? 'Baixar' : 'Baixar ZIP'}
                </Button>
                <Button size="xs" icon={Copy} onClick={() => setCopyMove({ entries: selectedEntries, move: false })}>
                  Copiar
                </Button>
                {!readOnly && !versionsMode && (
                  <Button size="xs" icon={MoveRight} onClick={() => setCopyMove({ entries: selectedEntries, move: true })}>
                    Mover
                  </Button>
                )}
                {!readOnly && (
                  <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(selectedEntries)}>
                    Excluir
                  </Button>
                )}
              </>
            ) : (
              <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
                <IconButton icon={CornerLeftUp} label="Pasta acima" size="xs" disabled={!prefix} onClick={() => onPrefixChange(parentPrefix(prefix))} />
                <button onClick={() => onPrefixChange('')} className="flex shrink-0 items-center gap-1.5 rounded px-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <BucketIcon className="size-3.5 text-emerald-500" />
                  {bucket}
                </button>
                {crumbs.map((c, i) => (
                  <span key={c.prefix} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="size-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />
                    <button
                      onClick={() => onPrefixChange(c.prefix)}
                      className={`truncate rounded px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${i === crumbs.length - 1 ? 'font-medium' : 'text-zinc-500 dark:text-zinc-400'}`}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
                {query && (
                  <span className="ml-1 truncate rounded bg-amber-100 px-1.5 font-mono text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{query}*</span>
                )}
              </nav>
            )}
          </div>

          {list.error ? (
            <EmptyState icon={BucketIcon} tone="error" title="Não foi possível listar" action={<Button icon={RefreshCw} onClick={() => reload()}>Tentar novamente</Button>}>
              {list.error}
            </EmptyState>
          ) : list.loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Spinner /> Carregando objetos…
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={query ? Search : BucketIcon}
              title={query ? 'Nada com esse prefixo' : prefix ? 'Pasta vazia' : 'Bucket vazio'}
              action={
                canDrop &&
                !query && (
                  <>
                    <Button variant="primary" icon={Upload} onClick={() => fileInput.current?.click()}>
                      Enviar arquivos
                    </Button>
                    <Button icon={FolderPlus} onClick={() => setNewFolder(true)}>
                      Criar pasta
                    </Button>
                  </>
                )
              }
            >
              {query ? 'A busca do S3 é por prefixo: o nome precisa começar com o texto digitado.' : canDrop ? 'Arraste arquivos ou pastas para cá.' : null}
            </EmptyState>
          ) : (
            <div className="max-h-[calc(100vh-19rem)] min-h-40 overflow-auto">
              <ObjectsTable
                entries={entries}
                prefix={prefix}
                versionsMode={versionsMode}
                selected={selected}
                onToggle={toggle}
                onToggleAll={(v) => setSelected(v ? new Set(entries.filter((e) => !(e.kind === 'object' && e.deleteMarker && !versionsMode)).map(entryId)) : new Set())}
                sort={sort}
                onSort={(col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}
                onOpen={open}
                onAction={onAction}
                activeId={drawer ? `o:${drawer.key}\u0000${drawer.versionId ?? ''}` : undefined}
              />
            </div>
          )}

          {/* Rodapé */}
          {!list.error && entries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <span>
                {list.folders.length > 0 && `${formatNumber(list.folders.length)} pasta(s) · `}
                {formatNumber(list.objects.length)} {versionsMode ? 'versão(ões)' : 'objeto(s)'} · {formatBytes(totalBytes)}
                {list.next && ' carregados — há mais'}
              </span>
              <div className="flex-1" />
              {list.next && (
                <>
                  <Button size="xs" onClick={() => fetchPage(list.next, true)} loading={list.loading}>
                    Carregar mais {settings.pageSize}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={loadAll} disabled={list.loading}>
                    Carregar tudo
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {dragDepth > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50/85 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
            <Upload className="size-8" />
            <p className="text-sm font-medium">Solte para enviar a s3://{bucket}/{prefix}</p>
          </div>
        )}
      </Card>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => (setUpload(filesFromInput(e.target.files)), (e.target.value = ''))} />
      <input
        ref={dirInput}
        type="file"
        hidden
        {...({ webkitdirectory: '' } as object)}
        onChange={(e) => (setUpload(filesFromInput(e.target.files)), (e.target.value = ''))}
      />

      <UploadDialog
        open={upload !== null}
        initial={upload ?? []}
        prefix={prefix}
        bucket={bucket}
        client={client}
        onClose={() => setUpload(null)}
        onUploaded={changed}
      />
      <CreateFolderDialog open={newFolder} onClose={() => setNewFolder(false)} client={client} bucket={bucket} prefix={prefix} onCreated={changed} />
      <NewFileDialog
        open={newFile}
        onClose={() => setNewFile(false)}
        client={client}
        bucket={bucket}
        prefix={prefix}
        onCreated={(key) => {
          changed()
          setDrawer({ key })
        }}
      />
      <RenameDialog
        entry={renaming}
        onClose={() => setRenaming(null)}
        actions={actions}
        onDone={(k) => {
          changed()
          if (drawer && renaming && drawer.key === renaming.key && !k.endsWith('/')) setDrawer({ key: k })
        }}
      />
      <DeleteDialog entries={deleting} versioning={versioning} versionsMode={versionsMode} onClose={() => setDeleting(null)} onConfirm={() => deleting && runDelete(deleting)} />
      <CopyMoveDialog state={copyMove} bucket={bucket} prefix={prefix} onClose={() => setCopyMove(null)} actions={actions} onDone={changed} />
      <PresignDialog target={presign} onClose={() => setPresign(null)} actions={actions} bucket={bucket} region={region} />
      <ObjectDrawer
        target={drawer}
        client={client}
        bucket={bucket}
        versioning={versioning}
        actions={actions}
        onClose={() => setDrawer(null)}
        onChanged={changed}
        onRequest={onDrawerRequest}
        onSelectVersion={(versionId) => drawer && setDrawer({ key: drawer.key, versionId })}
      />
    </div>
  )
}
