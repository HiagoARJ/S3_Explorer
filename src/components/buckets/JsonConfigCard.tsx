import { Braces, Copy, FileCode2, Pencil, RefreshCw, Save, Trash2, Wand2, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { describeError } from '../../lib/api'
import { copyText } from '../../lib/format'
import { Button, IconButton } from '../ui/Button'
import { CodeEditor, formatJson, jsonError } from '../ui/CodeEditor'
import { ConfirmDialog } from '../ui/Dialog'
import { Badge, Card, CardHeader, MenuItem, Popover, Spinner } from '../ui/Misc'

export interface JsonTemplate {
  label: string
  value: unknown
}

/**
 * Configuração do bucket editada como JSON (mesmo formato da API/CLI da AWS).
 * `load` devolve null quando a configuração não existe.
 */
export function JsonConfigCard<T>({
  title,
  icon,
  description,
  load,
  save,
  remove,
  templates = [],
  summary,
  validate,
  docsHint,
  emptyText = 'Não configurado.',
}: {
  title: string
  icon: LucideIcon
  description?: ReactNode
  load: () => Promise<T | null>
  save: (value: T) => Promise<void>
  remove?: () => Promise<void>
  templates?: JsonTemplate[]
  summary?: (value: T) => ReactNode
  validate?: (value: T) => string | null
  docsHint?: ReactNode
  emptyText?: string
}) {
  const { readOnly } = useSettings()
  const toast = useToast()
  const [value, setValue] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setValue(await load())
    } catch (e) {
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
    // `load` muda a cada render do pai; o bucket/cliente já estão no closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const editing = text !== null
  const syntaxError = editing ? jsonError(text) : null
  const pretty = value === null ? '' : JSON.stringify(value, null, 2)

  const startEdit = (initial?: unknown) => {
    setSaveError(null)
    setText(initial !== undefined ? JSON.stringify(initial, null, 2) : pretty || (templates[0] ? JSON.stringify(templates[0].value, null, 2) : '{}'))
  }

  const doSave = async () => {
    if (text === null || syntaxError) return
    const parsed = JSON.parse(text) as T
    const v = validate?.(parsed)
    if (v) return setSaveError(v)
    setSaving(true)
    setSaveError(null)
    try {
      await save(parsed)
      toast('success', `${title} salvo`)
      setText(null)
      await reload()
    } catch (e) {
      setSaveError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const doRemove = async () => {
    if (!remove) return
    setSaving(true)
    try {
      await remove()
      toast('success', `${title} removido`)
      setConfirmRemove(false)
      setText(null)
      await reload()
    } catch (e) {
      toast('error', `Falha ao remover ${title.toLowerCase()}`, describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const templatePicker = templates.length > 0 && !readOnly && (
    <Popover
      width="w-72"
      trigger={({ toggle }) => (
        <Button size="xs" variant="ghost" icon={Wand2} onClick={toggle}>
          Modelos
        </Button>
      )}
    >
      {(close) =>
        templates.map((t) => (
          <MenuItem key={t.label} icon={FileCode2} onClick={() => (close(), startEdit(t.value))}>
            {t.label}
          </MenuItem>
        ))
      }
    </Popover>
  )

  return (
    <Card>
      <CardHeader
        title={title}
        icon={icon}
        description={description}
        actions={
          <>
            {!loading && !loadError && (value === null ? <Badge>não configurado</Badge> : <Badge tone="green">configurado</Badge>)}
            <IconButton icon={RefreshCw} label="Recarregar" size="xs" onClick={reload} loading={loading} />
          </>
        }
      />
      <div className="space-y-3 p-4">
        {loading && value === null ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Spinner className="size-3.5" /> Carregando…
          </p>
        ) : loadError ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{loadError}</p>
        ) : editing ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {templatePicker}
              <Button size="xs" variant="ghost" icon={Braces} disabled={!!syntaxError} onClick={() => setText(formatJson(text))}>
                Formatar
              </Button>
              {docsHint && <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">{docsHint}</span>}
            </div>
            <CodeEditor value={text} onChange={setText} invalid={!!syntaxError} minRows={14} />
            {(syntaxError || saveError) && <p className="text-[13px] text-rose-600 dark:text-rose-400">{syntaxError ?? saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setText(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" icon={Save} onClick={doSave} loading={saving} disabled={!!syntaxError}>
                Salvar
              </Button>
            </div>
          </>
        ) : value === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[13px] text-zinc-500 dark:text-zinc-400">{emptyText}</p>
            {templatePicker}
            {!readOnly && (
              <Button size="sm" icon={Pencil} onClick={() => startEdit()}>
                Configurar
              </Button>
            )}
          </div>
        ) : (
          <>
            {summary?.(value)}
            <div className="relative">
              <CodeEditor value={pretty} readOnly minRows={3} maxHeight="40vh" />
              <IconButton
                icon={Copy}
                label="Copiar JSON"
                size="xs"
                className="absolute top-1.5 right-1.5 bg-white/80 dark:bg-zinc-900/80"
                onClick={async () => (await copyText(pretty)) && toast('success', 'JSON copiado')}
              />
            </div>
            {!readOnly && (
              <div className="flex justify-end gap-2">
                {remove && (
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setConfirmRemove(true)}>
                    Remover
                  </Button>
                )}
                <Button size="sm" icon={Pencil} onClick={() => startEdit()}>
                  Editar
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={doRemove}
        busy={saving}
        title={`Remover ${title.toLowerCase()}`}
        confirmLabel="Remover"
      >
        A configuração atual será apagada do bucket.
      </ConfirmDialog>
    </Card>
  )
}
