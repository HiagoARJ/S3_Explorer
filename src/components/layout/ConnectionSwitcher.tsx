import { Check, ChevronsUpDown, Cloud, Lock, Settings2 } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { KIND_LABEL } from '../../lib/connections'
import { MenuItem, MenuLabel, Popover } from '../ui/Misc'
import { Tooltip } from '../ui/Tooltip'
import { KIND_ICON } from './ConnectionsDialog'

export function ConnectionSwitcher({
  onSwitched,
  onManage,
  onAddAws,
  compact,
}: {
  onSwitched: () => void
  onManage: () => void
  onAddAws: () => void
  /** Menu recolhido: mostra só o ícone da conexão. */
  compact?: boolean
}) {
  const { connections, connection, setActiveConnection } = useSettings()
  const Icon = KIND_ICON[connection.kind]

  return (
    <Popover
      align="left"
      width={compact ? 'w-64' : 'w-full'}
      trigger={({ toggle, open }) =>
        compact ? (
          <Tooltip label={`${connection.name} · ${KIND_LABEL[connection.kind]} · ${connection.region}`} disabled={open}>
            <button
              onClick={toggle}
              aria-label={`Conexão: ${connection.name}`}
              className={`focus-ring relative flex size-10 items-center justify-center rounded-xl border transition-colors ${
                open
                  ? 'border-indigo-300 bg-white dark:border-indigo-500/40 dark:bg-zinc-800/80'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
              } ${connection.kind === 'aws' ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}
            >
              <Icon className="size-4" />
              {connection.readOnly && (
                <Lock className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-white p-0.5 text-amber-500 dark:bg-zinc-900" />
              )}
            </button>
          </Tooltip>
        ) : (
        <button
          onClick={toggle}
          className={`focus-ring flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
            open
              ? 'border-indigo-300 bg-white dark:border-indigo-500/40 dark:bg-zinc-800/80'
              : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
          }`}
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
              connection.kind === 'aws'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1 truncate text-[13px] font-medium">
              <span className="truncate">{connection.name}</span>
              {connection.readOnly && <Lock className="size-3 shrink-0 text-amber-500" />}
            </span>
            <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {KIND_LABEL[connection.kind]} · {connection.region}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-zinc-400" />
        </button>
        )
      }
    >
      {(close) => (
        <>
          <MenuLabel>Conexões</MenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {connections.map((c) => {
              const CIcon = KIND_ICON[c.kind]
              const active = c.id === connection.id
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    close()
                    if (!active) {
                      setActiveConnection(c.id)
                      onSwitched()
                    }
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <CIcon className={`size-4 shrink-0 ${c.kind === 'aws' ? 'text-amber-500' : 'text-indigo-500'}`} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px]">{c.name}</span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {KIND_LABEL[c.kind]} · {c.region}
                      {c.readOnly && ' · leitura'}
                    </span>
                  </span>
                  {active && <Check className="size-4 shrink-0 text-indigo-500" />}
                </button>
              )
            })}
          </div>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <MenuItem icon={Cloud} onClick={() => (close(), onAddAws())}>
            Adicionar conta AWS
          </MenuItem>
          <MenuItem icon={Settings2} onClick={() => (close(), onManage())}>
            Gerenciar conexões
          </MenuItem>
        </>
      )}
    </Popover>
  )
}
