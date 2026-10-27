import { ListBucketsCommand } from '@aws-sdk/client-s3'
import {
  CircleCheck,
  CircleX,
  ClipboardPaste,
  Cloud,
  Container,
  Eye,
  EyeOff,
  Lock,
  Plug,
  PlugZap,
  Plus,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { describeError } from '../../lib/api'
import { createClient } from '../../lib/client'
import {
  AWS_REGIONS,
  connectionTarget,
  DEFAULT_CONNECTION_ID,
  DEFAULT_LOCALSTACK,
  KIND_LABEL,
  newConnection,
  type Connection,
  type ConnectionKind,
} from '../../lib/connections'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Checkbox, Field, Input, Select } from '../ui/Form'
import { Badge, Segmented } from '../ui/Misc'

export const KIND_ICON: Record<ConnectionKind, LucideIcon> = {
  localstack: Container,
  aws: Cloud,
  custom: Server,
}

/**
 * Extrai credenciais de textos colados:
 * - JSON do `aws configure export-credentials` / `aws sts assume-role` / `get-session-token`
 * - linhas `export AWS_ACCESS_KEY_ID=...`, `$Env:AWS_...="..."`, `set AWS_...=...`, `aws_access_key_id = ...`
 */
export function parseCredentials(text: string): Partial<Pick<Connection, 'accessKeyId' | 'secretAccessKey' | 'sessionToken' | 'region'>> {
  const out: Partial<Pick<Connection, 'accessKeyId' | 'secretAccessKey' | 'sessionToken' | 'region'>> = {}
  try {
    const j = JSON.parse(text)
    const src = j.Credentials ?? j
    if (src.AccessKeyId) out.accessKeyId = src.AccessKeyId
    if (src.SecretAccessKey) out.secretAccessKey = src.SecretAccessKey
    if (src.SessionToken) out.sessionToken = src.SessionToken
    return out
  } catch {
    // não é JSON
  }
  const pick = (names: string[]) => {
    for (const n of names) {
      const m = text.match(new RegExp(`${n}\\s*[=:]\\s*["']?([^"'\\s]+)`, 'i'))
      if (m) return m[1]
    }
    return undefined
  }
  const ak = pick(['AWS_ACCESS_KEY_ID', 'aws_access_key_id'])
  const sk = pick(['AWS_SECRET_ACCESS_KEY', 'aws_secret_access_key'])
  const st = pick(['AWS_SESSION_TOKEN', 'aws_session_token'])
  const rg = pick(['AWS_REGION', 'AWS_DEFAULT_REGION', 'region'])
  if (ak) out.accessKeyId = ak
  if (sk) out.secretAccessKey = sk
  if (st) out.sessionToken = st
  if (rg) out.region = rg
  return out
}

function validate(c: Connection): string | null {
  if (!c.name.trim()) return 'Dê um nome à conexão.'
  if (c.kind !== 'aws' && !c.endpoint.trim()) return 'Informe o endpoint.'
  if (c.kind !== 'aws' && !/^(\/|https?:\/\/)/.test(c.endpoint.trim()))
    return 'O endpoint deve começar com http://, https:// ou "/" (proxy).'
  if (c.kind !== 'aws' && c.publicEndpoint.trim() && !/^https?:\/\//.test(c.publicEndpoint.trim()))
    return 'A URL pública deve começar com http:// ou https://.'
  if (c.kind === 'aws' && (!c.accessKeyId.trim() || !c.secretAccessKey.trim()))
    return 'Informe a Access Key ID e a Secret Access Key.'
  return null
}

export function ConnectionsDialog({
  open,
  onClose,
  initialNew,
  onActivated,
}: {
  open: boolean
  onClose: () => void
  /** Abre já com uma nova conexão desse tipo. */
  initialNew?: ConnectionKind
  onActivated: () => void
}) {
  const { connections, connection: active, saveConnection, deleteConnection, setActiveConnection } = useSettings()
  const [draft, setDraft] = useState<Connection>(active)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const select = (c: Connection, fresh = false) => {
    setDraft(c)
    setIsNew(fresh)
    setError(null)
    setTest(null)
    setShowSecret(false)
    setPasteOpen(false)
    setConfirmDelete(false)
  }

  useEffect(() => {
    if (!open) return
    if (initialNew) select(newConnection(initialNew), true)
    else select(active)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Connection>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
    setTest(null)
  }

  const changeKind = (kind: ConnectionKind) => {
    const tpl = newConnection(kind)
    set({
      kind,
      endpoint: tpl.endpoint,
      publicEndpoint: tpl.publicEndpoint,
      readOnly: tpl.readOnly,
      rememberSecret: tpl.rememberSecret,
      ...(kind === 'aws'
        ? draft.accessKeyId === 'test'
          ? { accessKeyId: '', secretAccessKey: '' }
          : {}
        : !draft.accessKeyId || draft.accessKeyId === 'test' || draft.accessKeyId === 'minioadmin'
          ? { accessKeyId: tpl.accessKeyId, secretAccessKey: tpl.secretAccessKey }
          : {}),
      ...(draft.name === KIND_LABEL[draft.kind] || ['AWS', 'LocalStack', 'MinIO'].includes(draft.name)
        ? { name: tpl.name }
        : {}),
    })
  }

  const runTest = async () => {
    const err = validate(draft)
    if (err) return setError(err)
    setTesting(true)
    setTest(null)
    try {
      const res = await createClient(draft).send(new ListBucketsCommand({}))
      const n = res.Buckets?.length ?? 0
      setTest({ ok: true, msg: `Conectado — ${n} bucket(s) visível(is).` })
    } catch (e) {
      setTest({ ok: false, msg: describeError(e, connectionTarget(draft)) })
    } finally {
      setTesting(false)
    }
  }

  const save = (activate: boolean) => {
    const err = validate(draft)
    if (err) return setError(err)
    const c = { ...draft, name: draft.name.trim(), endpoint: draft.endpoint.trim(), accessKeyId: draft.accessKeyId.trim() }
    saveConnection(c)
    setIsNew(false)
    setDraft(c)
    if (activate) {
      setActiveConnection(c.id)
      onActivated()
      onClose()
    }
  }

  const applyPaste = () => {
    const parsed = parseCredentials(pasteText)
    if (!parsed.accessKeyId && !parsed.secretAccessKey) {
      setError('Não encontrei credenciais no texto colado.')
      return
    }
    set(parsed)
    setPasteOpen(false)
    setPasteText('')
  }

  const isDefault = draft.id === DEFAULT_CONNECTION_ID
  const isActive = draft.id === active.id && !isNew
  const regionKnown = AWS_REGIONS.some((r) => r.id === draft.region)
  const list = isNew ? [...connections, draft] : connections

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={Plug}
      title="Conexões"
      description="Cadastre contas AWS, LocalStacks ou outros serviços compatíveis com S3 (MinIO, Ceph…) e alterne entre eles."
      footer={
        <>
          {error && <p className="mr-auto max-w-md text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
          <Button onClick={onClose}>Fechar</Button>
          <Button icon={Save} onClick={() => save(false)}>
            Salvar
          </Button>
          <Button variant="primary" icon={PlugZap} onClick={() => save(true)}>
            {isActive ? 'Salvar e reconectar' : 'Salvar e conectar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[250px_1fr]">
        {/* lista */}
        <div className="space-y-1.5">
          {list.map((c) => {
            const Icon = KIND_ICON[c.kind]
            const selected = c.id === draft.id
            const shown = selected ? draft : c
            return (
              <button
                key={c.id}
                onClick={() => !selected && select(c)}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50'
                }`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${c.kind === 'aws' ? 'text-amber-500' : 'text-indigo-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{shown.name || 'Sem nome'}</span>
                  <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {KIND_LABEL[shown.kind]} · {shown.region}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.id === active.id && !(isNew && selected) && <Badge tone="green">ativa</Badge>}
                    {c.id === DEFAULT_CONNECTION_ID && <Badge>padrão</Badge>}
                    {shown.readOnly && (
                      <Badge tone="amber" icon={Lock}>
                        leitura
                      </Badge>
                    )}
                    {isNew && selected && <Badge tone="indigo">nova</Badge>}
                  </span>
                </span>
              </button>
            )
          })}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button size="sm" icon={Cloud} onClick={() => select(newConnection('aws'), true)}>
              AWS
            </Button>
            <Button size="sm" icon={Plus} onClick={() => select(newConnection('localstack'), true)}>
              Outra
            </Button>
          </div>
        </div>

        {/* formulário */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Nome">
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex.: AWS Dev" />
            </Field>
            <Field label="Tipo">
              {isDefault ? (
                <div className="flex h-9 items-center gap-2 text-sm text-zinc-500">
                  <Container className="size-4" /> LocalStack (padrão)
                </div>
              ) : (
                <Segmented
                  value={draft.kind}
                  onChange={changeKind}
                  options={[
                    { value: 'aws', label: 'AWS', icon: Cloud },
                    { value: 'localstack', label: 'LocalStack', icon: Container },
                    { value: 'custom', label: 'Outro', icon: Server },
                  ]}
                />
              )}
            </Field>
          </div>

          {draft.kind === 'aws' ? (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                As chamadas saem do navegador pelo proxy do app (<span className="font-mono">/aws-s3</span>) para{' '}
                <span className="font-mono">s3.{draft.region}.amazonaws.com</span>, porque o S3 não libera CORS para listar buckets.
                Prefira credenciais temporárias (SSO/STS) ou um usuário IAM com permissões mínimas. O modo{' '}
                <b>somente leitura</b> vem ligado para evitar alterações acidentais.
              </p>
            </div>
          ) : (
            <Field
              label="Endpoint"
              hint={
                <>
                  <code className="font-mono">/localstack</code> usa o proxy do app (sem CORS) e aponta para{' '}
                  <code className="font-mono">LOCALSTACK_URL</code>. URLs diretas (ex.:{' '}
                  <code className="font-mono">http://localhost:4566</code>) precisam aceitar CORS.
                </>
              }
            >
              <Input value={draft.endpoint} onChange={(e) => set({ endpoint: e.target.value })} className="font-mono" />
            </Field>
          )}

          {draft.kind !== 'aws' && (
            <Field
              label="URL pública (links pré-assinados)"
              hint="Usada nos links que você compartilha: outros programas não enxergam o proxy do app. Vazio = usa o endpoint acima."
            >
              <Input
                value={draft.publicEndpoint}
                onChange={(e) => set({ publicEndpoint: e.target.value })}
                className="font-mono"
                placeholder="http://localhost:4566"
              />
            </Field>
          )}

          <Field label="Região">
            <Select value={draft.region} onChange={(e) => set({ region: e.target.value })}>
              {!regionKnown && <option value={draft.region}>{draft.region}</option>}
              {AWS_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Credenciais</span>
              {draft.kind === 'aws' && (
                <Button size="xs" variant="ghost" icon={ClipboardPaste} onClick={() => setPasteOpen((v) => !v)}>
                  Colar credenciais
                </Button>
              )}
            </div>
            {pasteOpen && (
              <div className="mb-3 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Cole a saída de <code className="font-mono">aws configure export-credentials --profile &lt;perfil&gt;</code>, de{' '}
                  <code className="font-mono">aws sts assume-role</code> ou variáveis <code className="font-mono">AWS_*</code>.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950"
                  placeholder={'{"AccessKeyId": "...", "SecretAccessKey": "...", "SessionToken": "..."}'}
                />
                <div className="flex justify-end">
                  <Button size="xs" variant="primary" onClick={applyPaste}>
                    Preencher
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={<span className="text-xs text-zinc-500">Access Key ID</span>}>
                <Input
                  value={draft.accessKeyId}
                  onChange={(e) => set({ accessKeyId: e.target.value })}
                  className="font-mono"
                  autoComplete="off"
                  placeholder={draft.kind === 'aws' ? 'AKIA… / ASIA…' : draft.kind === 'custom' ? 'minioadmin' : 'test'}
                />
              </Field>
              <Field label={<span className="text-xs text-zinc-500">Secret Access Key</span>}>
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={draft.secretAccessKey}
                  onChange={(e) => set({ secretAccessKey: e.target.value })}
                  className="font-mono"
                  autoComplete="new-password"
                  right={
                    <IconButton
                      icon={showSecret ? EyeOff : Eye}
                      label={showSecret ? 'Ocultar' : 'Mostrar'}
                      size="xs"
                      onClick={() => setShowSecret((v) => !v)}
                    />
                  }
                />
              </Field>
            </div>
            {draft.kind === 'aws' && (
              <Field
                className="mt-3"
                label={<span className="text-xs text-zinc-500">Session Token (opcional — credenciais temporárias)</span>}
              >
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={draft.sessionToken}
                  onChange={(e) => set({ sessionToken: e.target.value })}
                  className="font-mono"
                  autoComplete="off"
                />
              </Field>
            )}
          </div>

          <div className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
            <Checkbox
              checked={draft.readOnly}
              onChange={(readOnly) => set({ readOnly })}
              label={
                <span>
                  <b className="font-medium">Somente leitura</b>
                  <span className="text-zinc-500 dark:text-zinc-400"> — bloqueia enviar, editar e excluir objetos, buckets e configurações</span>
                </span>
              }
            />
            <Checkbox
              checked={draft.rememberSecret}
              onChange={(rememberSecret) => set({ rememberSecret })}
              label={
                <span>
                  <b className="font-medium">Lembrar a secret neste navegador</b>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {draft.rememberSecret
                      ? ' — salva em texto puro no localStorage'
                      : ' — fica só nesta sessão e é apagada ao fechar o navegador'}
                  </span>
                </span>
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={PlugZap} onClick={runTest} loading={testing}>
              Testar conexão
            </Button>
            {test && (
              <span
                className={`flex items-center gap-1.5 text-[13px] ${test.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
              >
                {test.ok ? <CircleCheck className="size-4 shrink-0" /> : <CircleX className="size-4 shrink-0" />}
                {test.msg}
              </span>
            )}
            <div className="flex-1" />
            {isDefault ? (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => set({ ...DEFAULT_LOCALSTACK })}>
                Restaurar padrão
              </Button>
            ) : (
              !isNew &&
              (confirmDelete ? (
                <span className="flex items-center gap-1.5 text-[13px]">
                  Excluir esta conexão?
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => {
                      deleteConnection(draft.id)
                      if (isActive) onActivated()
                      select(connections.find((c) => c.id === DEFAULT_CONNECTION_ID) ?? DEFAULT_LOCALSTACK)
                    }}
                  >
                    Excluir
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Excluir conexão
                </Button>
              ))
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
