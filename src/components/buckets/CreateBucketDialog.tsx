import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBuckets } from '../../hooks/useBuckets'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { createBucket, describeError } from '../../lib/api'
import { AWS_REGIONS } from '../../lib/connections'
import { validateBucketName } from '../../lib/paths'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Checkbox, Field, Input, Select } from '../ui/Form'
import { KeyValueEditor, kvHasDupes, type KV } from '../ui/KeyValueEditor'

export function CreateBucketDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const { connection, clientFor } = useSettings()
  const { refresh, names } = useBuckets()
  const toast = useToast()
  const [name, setName] = useState('')
  const [region, setRegion] = useState(connection.region)
  const [versioning, setVersioning] = useState(false)
  const [objectLock, setObjectLock] = useState(false)
  const [tags, setTags] = useState<KV[]>([])
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setRegion(connection.region)
    setVersioning(false)
    setObjectLock(false)
    setTags([])
    setTouched(false)
    setError(null)
  }, [open, connection.region])

  const nameError = validateBucketName(name) ?? (names.includes(name) ? 'Já existe um bucket com esse nome.' : null)
  const tagsError = kvHasDupes(tags) ? 'Há tags repetidas.' : null

  const submit = async () => {
    setTouched(true)
    if (nameError || tagsError) return
    setBusy(true)
    setError(null)
    try {
      await createBucket(clientFor(region), {
        name,
        region,
        versioning,
        objectLock,
        tags: tags.filter((t) => t.key.trim()).map((t) => ({ Key: t.key.trim(), Value: t.value })),
      })
      toast('success', 'Bucket criado', name)
      await refresh()
      onCreated(name)
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
      icon={Plus}
      title="Criar bucket"
      description={connection.kind === 'aws' ? 'Nomes de bucket são globais: ninguém na AWS pode ter outro igual.' : `Em ${connection.name}.`}
      footer={
        <>
          {error && <p className="mr-auto max-w-md text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Plus} onClick={submit} loading={busy}>
            Criar bucket
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Nome do bucket" error={touched && name ? nameError : null} hint="Minúsculas, números, pontos e hífens (3 a 63 caracteres).">
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value.toLowerCase())
              setTouched(true)
            }}
            placeholder="meu-bucket"
            className="font-mono"
            invalid={touched && !!name && !!nameError}
          />
        </Field>

        <Field label="Região" hint={connection.kind === 'aws' ? undefined : 'No LocalStack a região é só informativa.'}>
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            {!AWS_REGIONS.some((r) => r.id === region) && <option value={region}>{region}</option>}
            {AWS_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
          <Checkbox
            checked={versioning || objectLock}
            onChange={setVersioning}
            label={
              <span>
                <b className="font-medium">Versionamento</b>
                <span className="text-zinc-500 dark:text-zinc-400"> — guarda versões anteriores ao sobrescrever ou excluir</span>
              </span>
            }
          />
          <Checkbox
            checked={objectLock}
            onChange={setObjectLock}
            label={
              <span>
                <b className="font-medium">Object Lock</b>
                <span className="text-zinc-500 dark:text-zinc-400"> — permite reter objetos (WORM). Liga o versionamento e não pode ser desfeito</span>
              </span>
            }
          />
        </div>

        <Field label="Tags (opcional)" error={touched ? tagsError : null}>
          <KeyValueEditor items={tags} onChange={setTags} addLabel="Adicionar tag" max={50} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
