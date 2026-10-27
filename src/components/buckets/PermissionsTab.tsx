import type { CORSRule, PublicAccessBlockConfiguration, S3Client } from '@aws-sdk/client-s3'
import { Globe2, Lock, Save, ScrollText, ShieldAlert, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import {
  deleteBucketCors,
  deleteBucketPolicy,
  deletePublicAccessBlock,
  describeError,
  getBucketCors,
  getBucketPolicy,
  getPublicAccessBlock,
  putBucketCors,
  putBucketPolicy,
  putPublicAccessBlock,
} from '../../lib/api'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Form'
import { Badge, Card, CardHeader, Spinner } from '../ui/Misc'
import { JsonConfigCard } from './JsonConfigCard'

const PAB_FIELDS: { key: keyof PublicAccessBlockConfiguration; label: string; hint: string }[] = [
  { key: 'BlockPublicAcls', label: 'Bloquear ACLs públicas novas', hint: 'Rejeita PUTs com ACL pública' },
  { key: 'IgnorePublicAcls', label: 'Ignorar ACLs públicas', hint: 'ACLs públicas existentes deixam de valer' },
  { key: 'BlockPublicPolicy', label: 'Bloquear políticas públicas novas', hint: 'Rejeita políticas de bucket que liberem acesso público' },
  { key: 'RestrictPublicBuckets', label: 'Restringir buckets públicos', hint: 'Só serviços da AWS e usuários da conta acessam' },
]

function PublicAccessBlockCard({ client, bucket }: { client: S3Client; bucket: string }) {
  const { readOnly } = useSettings()
  const toast = useToast()
  const [cfg, setCfg] = useState<PublicAccessBlockConfiguration | null | undefined>(undefined)
  const [draft, setDraft] = useState<PublicAccessBlockConfiguration>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const c = await getPublicAccessBlock(client, bucket)
      setCfg(c)
      setDraft(c ?? {})
      setError(null)
    } catch (e) {
      setError(describeError(e))
      setCfg(null)
    }
  }
  useEffect(() => {
    void load()
  }, [client, bucket]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = PAB_FIELDS.some((f) => !!draft[f.key] !== !!cfg?.[f.key])
  const allOn = PAB_FIELDS.every((f) => cfg?.[f.key])

  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast('success', msg)
      await load()
    } catch (e) {
      toast('error', 'Falha ao salvar o bloqueio de acesso público', describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Bloqueio de acesso público"
        icon={Lock}
        description="Impede que ACLs ou políticas tornem o bucket público."
        actions={cfg === undefined ? <Spinner className="size-3.5" /> : allOn ? <Badge tone="green">tudo bloqueado</Badge> : cfg ? <Badge tone="amber">parcial</Badge> : <Badge tone="amber">desligado</Badge>}
      />
      <div className="space-y-3 p-4">
        {error && <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PAB_FIELDS.map((f) => (
            <div key={f.key} className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
              <Checkbox
                checked={!!draft[f.key]}
                onChange={(v) => !readOnly && setDraft((d) => ({ ...d, [f.key]: v }))}
                label={<span className="font-medium">{f.label}</span>}
              />
              <p className="mt-0.5 pl-6 text-xs text-zinc-500 dark:text-zinc-400">{f.hint}</p>
            </div>
          ))}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap justify-end gap-2">
            {cfg && (
              <Button size="sm" variant="danger-ghost" icon={Trash2} loading={busy} onClick={() => run(() => deletePublicAccessBlock(client, bucket), 'Bloqueio removido')}>
                Remover configuração
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setDraft(Object.fromEntries(PAB_FIELDS.map((f) => [f.key, true])))}
              disabled={busy}
            >
              Marcar todos
            </Button>
            <Button size="sm" variant="primary" icon={Save} disabled={!dirty} loading={busy} onClick={() => run(() => putPublicAccessBlock(client, bucket, draft), 'Bloqueio de acesso público salvo')}>
              Salvar
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

interface PolicyDoc {
  Version?: string
  Statement?: { Sid?: string; Effect?: string; Principal?: unknown; Action?: string | string[]; Resource?: string | string[] }[]
}

export function PermissionsTab({ client, bucket }: { client: S3Client; bucket: string }) {
  const arn = `arn:aws:s3:::${bucket}`
  return (
    <div className="grid gap-5">
      <PublicAccessBlockCard client={client} bucket={bucket} />

      <JsonConfigCard<PolicyDoc>
        title="Política do bucket"
        icon={ScrollText}
        description="Política IAM baseada em recurso (JSON)."
        load={async () => {
          const p = await getBucketPolicy(client, bucket)
          return p ? (JSON.parse(p) as PolicyDoc) : null
        }}
        save={(v) => putBucketPolicy(client, bucket, JSON.stringify(v))}
        remove={() => deleteBucketPolicy(client, bucket)}
        validate={(v) => (!v || !Array.isArray(v.Statement) || !v.Statement.length ? 'A política precisa de ao menos um item em "Statement".' : null)}
        summary={(v) => (
          <div className="flex flex-wrap gap-1.5">
            {(v.Statement ?? []).map((s, i) => (
              <Badge key={i} tone={s.Effect === 'Deny' ? 'rose' : 'green'} icon={s.Effect === 'Deny' ? ShieldAlert : undefined}>
                {s.Effect} · {s.Sid || `#${i + 1}`} · {([] as string[]).concat(s.Action ?? []).join(', ')}
              </Badge>
            ))}
          </div>
        )}
        templates={[
          {
            label: 'Leitura pública dos objetos',
            value: {
              Version: '2012-10-17',
              Statement: [{ Sid: 'PublicRead', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `${arn}/*` }],
            },
          },
          {
            label: 'Negar acesso sem HTTPS',
            value: {
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'DenyInsecureTransport',
                  Effect: 'Deny',
                  Principal: '*',
                  Action: 's3:*',
                  Resource: [arn, `${arn}/*`],
                  Condition: { Bool: { 'aws:SecureTransport': 'false' } },
                },
              ],
            },
          },
          {
            label: 'Leitura e escrita para uma role',
            value: {
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'AppReadWrite',
                  Effect: 'Allow',
                  Principal: { AWS: 'arn:aws:iam::000000000000:role/minha-role' },
                  Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                  Resource: `${arn}/*`,
                },
                {
                  Sid: 'AppList',
                  Effect: 'Allow',
                  Principal: { AWS: 'arn:aws:iam::000000000000:role/minha-role' },
                  Action: 's3:ListBucket',
                  Resource: arn,
                },
              ],
            },
          },
        ]}
      />

      <JsonConfigCard<CORSRule[]>
        title="CORS"
        icon={Globe2}
        description="Origens que podem acessar o bucket direto do navegador."
        load={() => getBucketCors(client, bucket)}
        save={(v) => putBucketCors(client, bucket, v)}
        remove={() => deleteBucketCors(client, bucket)}
        validate={(v) =>
          !Array.isArray(v) || !v.length
            ? 'Informe uma lista (array) com ao menos uma regra.'
            : v.some((r) => !r.AllowedMethods?.length || !r.AllowedOrigins?.length)
              ? 'Toda regra precisa de "AllowedMethods" e "AllowedOrigins".'
              : null
        }
        summary={(v) => (
          <div className="flex flex-wrap gap-1.5">
            {v.map((r, i) => (
              <Badge key={i} tone="sky">
                {r.AllowedMethods?.join(' ')} ← {r.AllowedOrigins?.join(', ')}
              </Badge>
            ))}
          </div>
        )}
        templates={[
          {
            label: 'Leitura de qualquer origem',
            value: [{ AllowedHeaders: ['*'], AllowedMethods: ['GET', 'HEAD'], AllowedOrigins: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3000 }],
          },
          {
            label: 'Upload direto do front-end (localhost)',
            value: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
                AllowedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
                ExposeHeaders: ['ETag', 'x-amz-version-id'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        ]}
      />
    </div>
  )
}
