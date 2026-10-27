import { Plug, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings, type Settings as S } from '../../hooks/useSettings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Select } from '../ui/Form'
import { Segmented } from '../ui/Misc'

export const EXPIRY_OPTIONS = [
  { value: 300, label: '5 minutos' },
  { value: 900, label: '15 minutos' },
  { value: 3600, label: '1 hora' },
  { value: 6 * 3600, label: '6 horas' },
  { value: 24 * 3600, label: '1 dia' },
  { value: 7 * 24 * 3600, label: '7 dias (máximo)' },
]

export function SettingsDialog({
  open,
  onClose,
  onManageConnections,
}: {
  open: boolean
  onClose: () => void
  onManageConnections: () => void
}) {
  const { settings, update } = useSettings()
  const [draft, setDraft] = useState<S>(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  const set = (patch: Partial<S>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Preferências"
      description="Aparência e comportamento do navegador de objetos."
      icon={Settings}
      footer={
        <>
          <Button
            variant="ghost"
            icon={Plug}
            className="mr-auto"
            onClick={() => {
              onClose()
              onManageConnections()
            }}
          >
            Gerenciar conexões
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => {
              update(draft)
              onClose()
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tema">
          <Segmented
            value={draft.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
            ]}
          />
        </Field>
        <Field label="Densidade da lista">
          <Segmented
            value={draft.density}
            onChange={(density) => set({ density })}
            options={[
              { value: 'compact', label: 'Compacta' },
              { value: 'comfortable', label: 'Confortável' },
            ]}
          />
        </Field>
        <Field label="Objetos por página" hint="O S3 devolve no máximo 1000 por requisição.">
          <Select value={draft.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })}>
            {[50, 100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Validade padrão dos links pré-assinados">
          <Select value={draft.presignExpires} onChange={(e) => set({ presignExpires: Number(e.target.value) })}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  )
}
