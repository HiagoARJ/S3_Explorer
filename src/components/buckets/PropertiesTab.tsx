import type { ObjectLockConfiguration, S3Client, ServerSideEncryption, WebsiteConfiguration } from '@aws-sdk/client-s3'
import { GitBranch, Globe, KeyRound, LockKeyhole, Save, Tags, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import {
  deleteBucketEncryption,
  deleteBucketWebsite,
  describeError,
  getBucketEncryption,
  getBucketTags,
  getBucketWebsite,
  getObjectLock,
  getVersioning,
  putBucketEncryption,
  putBucketTags,
  putBucketWebsite,
  setVersioning,
} from '../../lib/api'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Checkbox, Field, Input, Select } from '../ui/Form'
import { KeyValueEditor, kvHasDupes, type KV } from '../ui/KeyValueEditor'
import { Badge, Card, CardHeader, DetailRow, Segmented, Spinner } from '../ui/Misc'

/** Carrega um valor do bucket e expõe estado de carregamento/erro. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const reload = async () => {
    try {
      setData(await fn())
      setError(null)
    } catch (e) {
      setError(describeError(e))
    }
  }
  useEffect(() => {
    setData(undefined)
    void reload()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload, loading: data === undefined && !error }
}

function Body({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (error) return <p className="p-4 text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
  if (loading)
    return (
      <p className="flex items-center gap-2 p-4 text-xs text-zinc-500">
        <Spinner className="size-3.5" /> Carregando…
      </p>
    )
  return <div className="space-y-3 p-4">{children}</div>
}

function useSaver() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true)
    try {
      await fn()
      toast('success', ok)
      return true
    } catch (e) {
      toast('error', fail, describeError(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/* ---------------- versionamento ---------------- */

function VersioningCard({ client, bucket, onChanged }: { client: S3Client; bucket: string; onChanged: () => void }) {
  const { readOnly } = useSettings()
  const v = useLoad(() => getVersioning(client, bucket), [client, bucket])
  const { busy, run } = useSaver()
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const status = v.data?.status

  const change = async (next: 'Enabled' | 'Suspended') => {
    if (await run(() => setVersioning(client, bucket, next), next === 'Enabled' ? 'Versionamento ativado' : 'Versionamento suspenso', 'Falha ao alterar o versionamento')) {
      setConfirmSuspend(false)
      await v.reload()
      onChanged()
    }
  }

  return (
    <Card>
      <CardHeader
        title="Versionamento"
        icon={GitBranch}
        description="Mantém versões anteriores ao sobrescrever ou excluir objetos."
        actions={
          status && (
            <Badge tone={status === 'Enabled' ? 'green' : status === 'Suspended' ? 'amber' : 'neutral'}>
              {status === 'Enabled' ? 'ativado' : status === 'Suspended' ? 'suspenso' : 'nunca ativado'}
            </Badge>
          )
        }
      />
      <Body loading={v.loading} error={v.error}>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
          {status === 'Enabled'
            ? 'Cada alteração cria uma nova versão; excluir um objeto só adiciona um marcador de exclusão. Veja as versões na aba Objetos, botão "Versões".'
            : status === 'Suspended'
              ? 'Novos objetos não ganham versões, mas as versões antigas continuam guardadas.'
              : 'Sobrescrever ou excluir um objeto o apaga de vez.'}
        </p>
        {!readOnly && (
          <div className="flex justify-end gap-2">
            {status === 'Enabled' ? (
              <Button size="sm" onClick={() => setConfirmSuspend(true)} loading={busy}>
                Suspender
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => change('Enabled')} loading={busy}>
                Ativar versionamento
              </Button>
            )}
          </div>
        )}
      </Body>
      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => change('Suspended')}
        busy={busy}
        title="Suspender versionamento"
        confirmLabel="Suspender"
      >
        Um bucket versionado nunca volta a ficar sem versionamento, só suspenso. As versões existentes continuam guardadas (e cobradas na AWS).
      </ConfirmDialog>
    </Card>
  )
}

/* ---------------- criptografia ---------------- */

function EncryptionCard({ client, bucket }: { client: S3Client; bucket: string }) {
  const { readOnly } = useSettings()
  const enc = useLoad(() => getBucketEncryption(client, bucket), [client, bucket])
  const { busy, run } = useSaver()
  const [algo, setAlgo] = useState<'none' | 'AES256' | 'aws:kms'>('none')
  const [kmsKey, setKmsKey] = useState('')
  const [bucketKey, setBucketKey] = useState(true)

  const current = enc.data?.[0]?.ApplyServerSideEncryptionByDefault
  useEffect(() => {
    if (enc.data === undefined) return
    setAlgo(current?.SSEAlgorithm === 'aws:kms' || current?.SSEAlgorithm === 'aws:kms:dsse' ? 'aws:kms' : current?.SSEAlgorithm === 'AES256' ? 'AES256' : 'none')
    setKmsKey(current?.KMSMasterKeyID ?? '')
    setBucketKey(enc.data?.[0]?.BucketKeyEnabled ?? true)
  }, [enc.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const ok =
      algo === 'none'
        ? await run(() => deleteBucketEncryption(client, bucket), 'Criptografia padrão removida', 'Falha ao remover a criptografia')
        : await run(
            () =>
              putBucketEncryption(client, bucket, [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: algo as ServerSideEncryption,
                    KMSMasterKeyID: algo === 'aws:kms' && kmsKey.trim() ? kmsKey.trim() : undefined,
                  },
                  BucketKeyEnabled: algo === 'aws:kms' ? bucketKey : undefined,
                },
              ]),
            'Criptografia padrão salva',
            'Falha ao salvar a criptografia',
          )
    if (ok) await enc.reload()
  }

  return (
    <Card>
      <CardHeader
        title="Criptografia padrão"
        icon={KeyRound}
        description="Aplicada a objetos novos enviados sem cabeçalho de criptografia."
        actions={current && <Badge tone="green">{current.SSEAlgorithm === 'AES256' ? 'SSE-S3' : 'SSE-KMS'}</Badge>}
      />
      <Body loading={enc.loading} error={enc.error}>
        <Segmented
          value={algo}
          onChange={(v) => !readOnly && setAlgo(v)}
          options={[
            { value: 'none', label: 'Nenhuma' },
            { value: 'AES256', label: 'SSE-S3 (AES-256)' },
            { value: 'aws:kms', label: 'SSE-KMS' },
          ]}
        />
        {algo === 'aws:kms' && (
          <>
            <Field label="Chave KMS (ARN ou ID)" hint="Vazio = chave gerenciada pela AWS (aws/s3).">
              <Input value={kmsKey} onChange={(e) => setKmsKey(e.target.value)} className="font-mono" readOnly={readOnly} />
            </Field>
            <Checkbox checked={bucketKey} onChange={setBucketKey} label="S3 Bucket Key (reduz chamadas ao KMS)" />
          </>
        )}
        {!readOnly && (
          <div className="flex justify-end">
            <Button size="sm" variant="primary" icon={Save} onClick={save} loading={busy}>
              Salvar
            </Button>
          </div>
        )}
      </Body>
    </Card>
  )
}

/* ---------------- tags ---------------- */

function TagsCard({ client, bucket }: { client: S3Client; bucket: string }) {
  const { readOnly } = useSettings()
  const tags = useLoad(() => getBucketTags(client, bucket), [client, bucket])
  const { busy, run } = useSaver()
  const [draft, setDraft] = useState<KV[]>([])
  useEffect(() => {
    if (tags.data) setDraft(tags.data.map((t) => ({ key: t.Key ?? '', value: t.Value ?? '' })))
  }, [tags.data])

  const original = JSON.stringify((tags.data ?? []).map((t) => [t.Key, t.Value]))
  const dirty = JSON.stringify(draft.filter((d) => d.key.trim()).map((d) => [d.key.trim(), d.value])) !== original

  return (
    <Card>
      <CardHeader title="Tags" icon={Tags} description="Pares chave/valor para custos, automação e controle de acesso." actions={tags.data && <Badge>{tags.data.length}</Badge>} />
      <Body loading={tags.loading} error={tags.error}>
        <KeyValueEditor items={draft} onChange={setDraft} addLabel="Adicionar tag" max={50} readOnly={readOnly} />
        {!readOnly && (
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={!dirty || busy} onClick={() => tags.data && setDraft(tags.data.map((t) => ({ key: t.Key ?? '', value: t.Value ?? '' })))}>
              Descartar
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Save}
              loading={busy}
              disabled={!dirty || kvHasDupes(draft)}
              onClick={async () => {
                const list = draft.filter((d) => d.key.trim()).map((d) => ({ Key: d.key.trim(), Value: d.value }))
                if (await run(() => putBucketTags(client, bucket, list), 'Tags salvas', 'Falha ao salvar as tags')) await tags.reload()
              }}
            >
              Salvar
            </Button>
          </div>
        )}
      </Body>
    </Card>
  )
}

/* ---------------- site estático ---------------- */

function WebsiteCard({ client, bucket }: { client: S3Client; bucket: string }) {
  const { readOnly, connection } = useSettings()
  const web = useLoad(async () => ({ cfg: await getBucketWebsite(client, bucket) }), [client, bucket])
  const { busy, run } = useSaver()
  const [mode, setMode] = useState<'off' | 'host' | 'redirect'>('off')
  const [index, setIndex] = useState('index.html')
  const [errorDoc, setErrorDoc] = useState('')
  const [redirectHost, setRedirectHost] = useState('')
  const [redirectProto, setRedirectProto] = useState<'' | 'http' | 'https'>('')

  const cfg = web.data?.cfg
  useEffect(() => {
    if (!web.data) return
    setMode(!cfg ? 'off' : cfg.RedirectAllRequestsTo ? 'redirect' : 'host')
    setIndex(cfg?.IndexDocument?.Suffix ?? 'index.html')
    setErrorDoc(cfg?.ErrorDocument?.Key ?? '')
    setRedirectHost(cfg?.RedirectAllRequestsTo?.HostName ?? '')
    setRedirectProto((cfg?.RedirectAllRequestsTo?.Protocol as 'http' | 'https') ?? '')
  }, [web.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    let ok: boolean
    if (mode === 'off') ok = await run(() => deleteBucketWebsite(client, bucket), 'Hospedagem de site desativada', 'Falha ao desativar')
    else {
      const next: WebsiteConfiguration =
        mode === 'redirect'
          ? { RedirectAllRequestsTo: { HostName: redirectHost.trim(), Protocol: redirectProto || undefined } }
          : { IndexDocument: { Suffix: index.trim() || 'index.html' }, ErrorDocument: errorDoc.trim() ? { Key: errorDoc.trim() } : undefined, RoutingRules: cfg?.RoutingRules }
      ok = await run(() => putBucketWebsite(client, bucket, next), 'Hospedagem de site salva', 'Falha ao salvar')
    }
    if (ok) await web.reload()
  }

  const url =
    connection.kind === 'aws'
      ? `http://${bucket}.s3-website-${connection.region}.amazonaws.com`
      : `http://${bucket}.s3-website.localhost.localstack.cloud:4566`

  return (
    <Card>
      <CardHeader
        title="Hospedagem de site estático"
        icon={Globe}
        description="Serve o bucket como site (index e página de erro)."
        actions={cfg ? <Badge tone="green">ativa</Badge> : web.data ? <Badge>desativada</Badge> : null}
      />
      <Body loading={web.loading} error={web.error}>
        <Segmented
          value={mode}
          onChange={(v) => !readOnly && setMode(v)}
          options={[
            { value: 'off', label: 'Desativada' },
            { value: 'host', label: 'Hospedar site' },
            { value: 'redirect', label: 'Redirecionar' },
          ]}
        />
        {mode === 'host' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Documento de índice">
              <Input value={index} onChange={(e) => setIndex(e.target.value)} className="font-mono" readOnly={readOnly} />
            </Field>
            <Field label="Documento de erro (opcional)">
              <Input value={errorDoc} onChange={(e) => setErrorDoc(e.target.value)} className="font-mono" placeholder="error.html" readOnly={readOnly} />
            </Field>
          </div>
        )}
        {mode === 'redirect' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Host de destino">
              <Input value={redirectHost} onChange={(e) => setRedirectHost(e.target.value)} className="font-mono" placeholder="www.exemplo.com" readOnly={readOnly} />
            </Field>
            <Field label="Protocolo">
              <Select value={redirectProto} onChange={(e) => setRedirectProto(e.target.value as '' | 'http' | 'https')}>
                <option value="">o mesmo</option>
                <option value="http">http</option>
                <option value="https">https</option>
              </Select>
            </Field>
          </div>
        )}
        {cfg && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Endereço: <span className="font-mono">{url}</span>
            {connection.kind !== 'aws' && ' (padrão do LocalStack)'}
          </p>
        )}
        {!readOnly && (
          <div className="flex justify-end gap-2">
            {cfg && mode !== 'off' && (
              <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setMode('off')}>
                Desativar
              </Button>
            )}
            <Button size="sm" variant="primary" icon={Save} onClick={save} loading={busy} disabled={mode === 'redirect' && !redirectHost.trim()}>
              Salvar
            </Button>
          </div>
        )}
      </Body>
    </Card>
  )
}

/* ---------------- object lock ---------------- */

function ObjectLockCard({ client, bucket }: { client: S3Client; bucket: string }) {
  const lock = useLoad(async () => ({ cfg: (await getObjectLock(client, bucket)) as ObjectLockConfiguration | null }), [client, bucket])
  const cfg = lock.data?.cfg
  const ret = cfg?.Rule?.DefaultRetention
  return (
    <Card>
      <CardHeader
        title="Object Lock"
        icon={LockKeyhole}
        description="Retenção WORM. Só pode ser ligado na criação do bucket."
        actions={cfg?.ObjectLockEnabled === 'Enabled' ? <Badge tone="green">ativado</Badge> : lock.data ? <Badge>desativado</Badge> : null}
      />
      <Body loading={lock.loading} error={lock.error}>
        {cfg?.ObjectLockEnabled === 'Enabled' ? (
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            <DetailRow label="Retenção padrão">{ret ? `${ret.Mode} · ${ret.Days ? `${ret.Days} dia(s)` : `${ret.Years} ano(s)`}` : 'nenhuma'}</DetailRow>
          </dl>
        ) : (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Este bucket não foi criado com Object Lock.</p>
        )}
      </Body>
    </Card>
  )
}

export function PropertiesTab({ client, bucket, onVersioningChanged }: { client: S3Client; bucket: string; onVersioningChanged: () => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <VersioningCard client={client} bucket={bucket} onChanged={onVersioningChanged} />
      <EncryptionCard client={client} bucket={bucket} />
      <TagsCard client={client} bucket={bucket} />
      <WebsiteCard client={client} bucket={bucket} />
      <ObjectLockCard client={client} bucket={bucket} />
    </div>
  )
}
