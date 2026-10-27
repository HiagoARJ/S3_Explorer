import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from './Button'
import { Input } from './Form'

export interface KV {
  key: string
  value: string
}

/** Lista editável de pares chave/valor (tags, metadados). */
export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Chave',
  valuePlaceholder = 'Valor',
  keyPrefix,
  addLabel = 'Adicionar',
  max,
  readOnly,
}: {
  items: KV[]
  onChange: (items: KV[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** Mostrado antes do campo de chave (ex.: "x-amz-meta-"). */
  keyPrefix?: string
  addLabel?: string
  max?: number
  readOnly?: boolean
}) {
  const set = (i: number, patch: Partial<KV>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const dupes = new Set(items.map((i) => i.key.trim()).filter((k, i, arr) => k && arr.indexOf(k) !== i))

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center">
            {keyPrefix && (
              <span className="flex h-8 items-center rounded-l-lg border border-r-0 border-zinc-200 bg-zinc-50 px-2 font-mono text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                {keyPrefix}
              </span>
            )}
            <Input
              inputSize="sm"
              value={it.key}
              onChange={(e) => set(i, { key: e.target.value })}
              placeholder={keyPlaceholder}
              invalid={dupes.has(it.key.trim())}
              readOnly={readOnly}
              className={`flex-1 font-mono ${keyPrefix ? '[&_input]:rounded-l-none' : ''}`}
            />
          </div>
          <Input
            inputSize="sm"
            value={it.value}
            onChange={(e) => set(i, { value: e.target.value })}
            placeholder={valuePlaceholder}
            readOnly={readOnly}
            className="flex-1"
          />
          {!readOnly && (
            <IconButton icon={Trash2} label="Remover" tone="danger" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          )}
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-zinc-500 dark:text-zinc-400">Nenhum item.</p>}
      {!readOnly && (
        <Button
          size="xs"
          variant="ghost"
          icon={Plus}
          disabled={max !== undefined && items.length >= max}
          onClick={() => onChange([...items, { key: '', value: '' }])}
        >
          {addLabel}
          {max !== undefined && <span className="text-zinc-400">({items.length}/{max})</span>}
        </Button>
      )}
      {dupes.size > 0 && <p className="text-xs text-rose-600 dark:text-rose-400">Há chaves repetidas.</p>}
    </div>
  )
}

export function kvToRecord(items: KV[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of items) if (key.trim()) out[key.trim()] = value
  return out
}

export function recordToKv(r?: Record<string, string>): KV[] {
  return Object.entries(r ?? {}).map(([key, value]) => ({ key, value }))
}

export function kvHasDupes(items: KV[]): boolean {
  const keys = items.map((i) => i.key.trim()).filter(Boolean)
  return new Set(keys).size !== keys.length
}
