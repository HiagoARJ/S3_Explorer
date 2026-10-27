import { useMemo, useRef, type KeyboardEvent } from 'react'

/** Valida JSON e devolve a mensagem de erro com a linha, se houver. */
export function jsonError(text: string): string | null {
  if (!text.trim()) return null
  try {
    JSON.parse(text)
    return null
  } catch (e) {
    const msg = (e as Error).message
    const pos = Number(msg.match(/position (\d+)/)?.[1])
    if (Number.isFinite(pos)) {
      const line = text.slice(0, pos).split('\n').length
      return `Linha ${line}: ${msg}`
    }
    return msg
  }
}

export function formatJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2)
}

/**
 * Textarea com numeração de linhas, Tab para indentar e fonte monoespaçada.
 * Leve de propósito: os objetos editados aqui são textos pequenos (políticas, CORS, arquivos de texto).
 */
export function CodeEditor({
  value,
  onChange,
  readOnly,
  invalid,
  minRows = 12,
  maxHeight = '60vh',
  placeholder,
  wrap = false,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  invalid?: boolean
  minRows?: number
  maxHeight?: string
  placeholder?: string
  wrap?: boolean
}) {
  const gutter = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => Math.max(value.split('\n').length, minRows), [value, minRows])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || readOnly) return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: end } = el
    const next = value.slice(0, s) + '  ' + value.slice(end)
    onChange?.(next)
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
  }

  return (
    <div
      className={`flex overflow-hidden rounded-lg border bg-zinc-50 font-mono text-[12.5px] leading-5 dark:bg-zinc-950 ${
        invalid ? 'border-rose-400 dark:border-rose-500/60' : 'border-zinc-200 dark:border-zinc-800'
      }`}
      style={{ maxHeight }}
    >
      {!wrap && (
        <div
          ref={gutter}
          aria-hidden
          className="shrink-0 overflow-hidden border-r border-zinc-200 bg-zinc-100/70 px-2 py-2 text-right text-zinc-400 select-none dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-600"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
        }}
        readOnly={readOnly}
        spellCheck={false}
        placeholder={placeholder}
        rows={minRows}
        wrap={wrap ? 'soft' : 'off'}
        className="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2 text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
        style={{ height: `calc(${lines} * 1.25rem + 1rem)`, maxHeight }}
      />
    </div>
  )
}
