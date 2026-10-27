import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  FileArchive,
  Folder,
  FolderOpen,
  Link2,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { formatBytes, formatDateShort, formatDateTime } from '../../lib/format'
import { fileIcon } from '../../lib/mime'
import { baseName, extension } from '../../lib/paths'
import { entryId, type Entry } from '../../lib/types'
import { IconButton } from '../ui/Button'
import { Checkbox } from '../ui/Form'
import { Badge, MenuItem, Popover } from '../ui/Misc'

export type SortCol = 'name' | 'size' | 'modified' | 'class'
export interface SortState {
  col: SortCol
  dir: 'asc' | 'desc'
}

export type RowAction = 'open' | 'download' | 'zip' | 'presign' | 'copy' | 'move' | 'rename' | 'delete'

export function ObjectsTable({
  entries,
  prefix,
  versionsMode,
  selected,
  onToggle,
  onToggleAll,
  sort,
  onSort,
  onOpen,
  onAction,
  activeId,
}: {
  entries: Entry[]
  prefix: string
  versionsMode: boolean
  selected: Set<string>
  onToggle: (e: Entry, shift: boolean) => void
  onToggleAll: (v: boolean) => void
  sort: SortState
  onSort: (col: SortCol) => void
  onOpen: (e: Entry) => void
  onAction: (a: RowAction, e: Entry) => void
  activeId?: string
}) {
  const { settings, readOnly } = useSettings()
  const compact = settings.density === 'compact'
  const cell = compact ? 'px-3 py-1' : 'px-3 py-2'
  const selectable = entries.filter((e) => !(e.kind === 'object' && e.deleteMarker && !versionsMode))
  const allSelected = selectable.length > 0 && selectable.every((e) => selected.has(entryId(e)))
  const someSelected = selectable.some((e) => selected.has(entryId(e)))

  const Th = ({ col, label, right, w = '' }: { col: SortCol; label: string; right?: boolean; w?: string }) => (
    <th className={`${cell} font-medium ${w} ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${sort.col === col ? 'text-zinc-900 dark:text-zinc-100' : ''}`}>
        {label}
        {sort.col === col && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-zinc-900/95">
        <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className={`${cell} w-8`}>
            <Checkbox checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} />
          </th>
          <Th col="name" label="Nome" />
          <th className={`${cell} hidden w-20 text-left font-medium md:table-cell`}>Tipo</th>
          <Th col="size" label="Tamanho" right w="w-24" />
          <Th col="modified" label="Modificado" w="hidden w-36 sm:table-cell" />
          <th className={`${cell} hidden w-44 text-left font-medium lg:table-cell`}>
            <button onClick={() => onSort('class')} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
              Classe
              {sort.col === 'class' && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
            </button>
          </th>
          {versionsMode && <th className={`${cell} w-44 text-left font-medium`}>Versão</th>}
          <th className={`${cell} w-10`} />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {entries.map((e, i) => {
          const id = entryId(e)
          const isSel = selected.has(id)
          const rel = e.key.startsWith(prefix) ? e.key.slice(prefix.length) : e.key
          const prev = entries[i - 1]
          // Em modo versões, repete o nome só na primeira linha de cada chave
          const repeat = versionsMode && e.kind === 'object' && prev?.kind === 'object' && prev.key === e.key
          const marker = e.kind === 'object' && e.deleteMarker
          const { icon: Icon, color } = e.kind === 'folder' ? { icon: Folder, color: 'text-amber-500' } : fileIcon(e.key)
          return (
            <tr
              key={id}
              onClick={() => onOpen(e)}
              className={`group cursor-pointer transition-colors ${
                isSel ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : activeId === id ? 'bg-zinc-100/70 dark:bg-zinc-800/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
              } ${marker ? 'text-zinc-400' : ''}`}
            >
              <td className={cell} onClick={(ev) => ev.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => {}}
                  onClick={(ev) => onToggle(e, ev.shiftKey)}
                  className="size-4 cursor-pointer rounded accent-indigo-600"
                  aria-label={`Selecionar ${rel}`}
                />
              </td>
              <td className={`${cell} max-w-0`}>
                <span className={`flex min-w-0 items-center gap-2 ${repeat ? 'pl-6 opacity-60' : ''}`}>
                  {!repeat && <Icon className={`size-4 shrink-0 ${marker ? 'text-zinc-400' : color}`} />}
                  <span className={`truncate ${e.kind === 'folder' ? 'font-medium text-indigo-600 dark:text-indigo-400' : ''} ${marker ? 'line-through' : ''}`} title={e.key}>
                    {repeat ? '↳ versão anterior' : rel || baseName(e.key) || '(vazio)'}
                  </span>
                  {e.kind === 'object' && versionsMode && e.isLatest && !marker && <Badge tone="green">atual</Badge>}
                  {marker && <Badge tone="rose">excluído</Badge>}
                </span>
              </td>
              <td className={`${cell} hidden text-xs text-zinc-500 md:table-cell dark:text-zinc-400`}>
                {e.kind === 'folder' ? 'Pasta' : extension(e.key) || '—'}
              </td>
              <td className={`${cell} text-right text-[13px] whitespace-nowrap tabular-nums`}>{e.kind === 'folder' || marker ? '—' : formatBytes(e.size)}</td>
              <td className={`${cell} hidden text-[13px] whitespace-nowrap text-zinc-500 sm:table-cell dark:text-zinc-400`} title={e.kind === 'object' ? formatDateTime(e.lastModified) : undefined}>
                {e.kind === 'object' ? formatDateShort(e.lastModified) : '—'}
              </td>
              <td className={`${cell} hidden text-xs text-zinc-500 lg:table-cell dark:text-zinc-400`}>
                {e.kind === 'object' && !marker ? (e.storageClass ?? 'STANDARD') : '—'}
              </td>
              {versionsMode && (
                <td className={`${cell} max-w-40 truncate font-mono text-[11px] text-zinc-500`} title={e.kind === 'object' ? e.versionId : undefined}>
                  {e.kind === 'object' ? (e.versionId ?? '—') : ''}
                </td>
              )}
              <td className={`${cell} text-right`} onClick={(ev) => ev.stopPropagation()}>
                <Popover
                  width="w-52"
                  trigger={({ toggle, open }) => (
                    <IconButton
                      icon={MoreHorizontal}
                      label="Ações"
                      size="xs"
                      onClick={toggle}
                      className={open ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                    />
                  )}
                >
                  {(close) => {
                    const act = (a: RowAction) => () => {
                      close()
                      onAction(a, e)
                    }
                    if (e.kind === 'folder')
                      return (
                        <>
                          <MenuItem icon={FolderOpen} onClick={act('open')}>
                            Abrir
                          </MenuItem>
                          <MenuItem icon={FileArchive} onClick={act('zip')}>
                            Baixar como ZIP
                          </MenuItem>
                          <MenuItem icon={Copy} onClick={act('copy')}>
                            Copiar para…
                          </MenuItem>
                          {!readOnly && (
                            <>
                              <MenuItem icon={MoveRight} onClick={act('move')}>
                                Mover para…
                              </MenuItem>
                              <MenuItem icon={Pencil} onClick={act('rename')}>
                                Renomear
                              </MenuItem>
                              <MenuItem icon={Trash2} danger onClick={act('delete')}>
                                Excluir pasta
                              </MenuItem>
                            </>
                          )}
                        </>
                      )
                    return (
                      <>
                        {!marker && (
                          <>
                            <MenuItem icon={Eye} onClick={act('open')}>
                              Abrir detalhes
                            </MenuItem>
                            <MenuItem icon={Download} onClick={act('download')}>
                              Baixar
                            </MenuItem>
                            <MenuItem icon={Link2} onClick={act('presign')}>
                              Link pré-assinado
                            </MenuItem>
                            <MenuItem icon={Copy} onClick={act('copy')}>
                              Copiar para…
                            </MenuItem>
                          </>
                        )}
                        {!readOnly && (
                          <>
                            {!versionsMode && (
                              <>
                                <MenuItem icon={MoveRight} onClick={act('move')}>
                                  Mover para…
                                </MenuItem>
                                <MenuItem icon={Pencil} onClick={act('rename')}>
                                  Renomear
                                </MenuItem>
                              </>
                            )}
                            <MenuItem icon={Trash2} danger onClick={act('delete')}>
                              {versionsMode ? (marker ? 'Remover marcador' : 'Excluir versão') : 'Excluir'}
                            </MenuItem>
                          </>
                        )}
                      </>
                    )
                  }}
                </Popover>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
