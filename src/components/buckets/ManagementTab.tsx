import type { LifecycleRule, NotificationConfiguration, S3Client } from '@aws-sdk/client-s3'
import { BellRing, Recycle } from 'lucide-react'
import {
  deleteBucketLifecycle,
  getBucketLifecycle,
  getBucketNotifications,
  putBucketLifecycle,
  putBucketNotifications,
} from '../../lib/api'
import { Badge } from '../ui/Misc'
import { JsonConfigCard } from './JsonConfigCard'

function ruleSummary(r: LifecycleRule): string {
  const parts: string[] = []
  const f = r.Filter
  const prefix = f?.Prefix ?? f?.And?.Prefix ?? r.Prefix
  parts.push(prefix ? `prefixo "${prefix}"` : 'bucket inteiro')
  if (r.Expiration?.Days) parts.push(`expira em ${r.Expiration.Days} d`)
  if (r.Expiration?.ExpiredObjectDeleteMarker) parts.push('limpa marcadores órfãos')
  for (const t of r.Transitions ?? []) parts.push(`→ ${t.StorageClass} em ${t.Days} d`)
  if (r.NoncurrentVersionExpiration?.NoncurrentDays) parts.push(`versões antigas expiram em ${r.NoncurrentVersionExpiration.NoncurrentDays} d`)
  if (r.AbortIncompleteMultipartUpload?.DaysAfterInitiation) parts.push(`multipart incompleto: ${r.AbortIncompleteMultipartUpload.DaysAfterInitiation} d`)
  return parts.join(' · ')
}

export function ManagementTab({ client, bucket }: { client: S3Client; bucket: string }) {
  return (
    <div className="grid gap-5">
      <JsonConfigCard<LifecycleRule[]>
        title="Regras de ciclo de vida"
        icon={Recycle}
        description="Expiração e transição automática de objetos entre classes de armazenamento."
        load={() => getBucketLifecycle(client, bucket)}
        save={(v) => putBucketLifecycle(client, bucket, v)}
        remove={() => deleteBucketLifecycle(client, bucket)}
        validate={(v) =>
          !Array.isArray(v) || !v.length
            ? 'Informe uma lista (array) com ao menos uma regra.'
            : v.some((r) => !r.Status)
              ? 'Toda regra precisa de "Status" ("Enabled" ou "Disabled").'
              : null
        }
        summary={(v) => (
          <ul className="space-y-1.5">
            {v.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={r.Status === 'Enabled' ? 'green' : 'neutral'}>{r.Status === 'Enabled' ? 'ativa' : 'desativada'}</Badge>
                <span className="font-medium">{r.ID || `Regra ${i + 1}`}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{ruleSummary(r)}</span>
              </li>
            ))}
          </ul>
        )}
        templates={[
          {
            label: 'Excluir objetos de tmp/ após 7 dias',
            value: [{ ID: 'expira-tmp', Status: 'Enabled', Filter: { Prefix: 'tmp/' }, Expiration: { Days: 7 } }],
          },
          {
            label: 'Mover para IA (30 d) e Glacier (90 d)',
            value: [
              {
                ID: 'arquivar',
                Status: 'Enabled',
                Filter: { Prefix: '' },
                Transitions: [
                  { Days: 30, StorageClass: 'STANDARD_IA' },
                  { Days: 90, StorageClass: 'GLACIER' },
                ],
              },
            ],
          },
          {
            label: 'Expirar versões antigas após 30 dias',
            value: [
              {
                ID: 'versoes-antigas',
                Status: 'Enabled',
                Filter: { Prefix: '' },
                NoncurrentVersionExpiration: { NoncurrentDays: 30 },
                Expiration: { ExpiredObjectDeleteMarker: true },
              },
            ],
          },
          {
            label: 'Cancelar uploads multipart incompletos (7 d)',
            value: [{ ID: 'multipart-incompleto', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }],
          },
        ]}
      />

      <JsonConfigCard<NotificationConfiguration>
        title="Notificações de eventos"
        icon={BellRing}
        description="Envia eventos (ObjectCreated, ObjectRemoved…) para SQS, SNS, Lambda ou EventBridge."
        emptyText="Nenhuma notificação configurada."
        load={async () => {
          const n = await getBucketNotifications(client, bucket)
          const has =
            !!n.QueueConfigurations?.length || !!n.TopicConfigurations?.length || !!n.LambdaFunctionConfigurations?.length || !!n.EventBridgeConfiguration
          return has ? n : null
        }}
        save={(v) => putBucketNotifications(client, bucket, v)}
        remove={() => putBucketNotifications(client, bucket, {})}
        summary={(v) => (
          <div className="flex flex-wrap gap-1.5">
            {v.QueueConfigurations?.map((q, i) => (
              <Badge key={`q${i}`} tone="violet">
                SQS · {q.QueueArn?.split(':').pop()} · {q.Events?.join(', ')}
              </Badge>
            ))}
            {v.TopicConfigurations?.map((t, i) => (
              <Badge key={`t${i}`} tone="sky">
                SNS · {t.TopicArn?.split(':').pop()} · {t.Events?.join(', ')}
              </Badge>
            ))}
            {v.LambdaFunctionConfigurations?.map((l, i) => (
              <Badge key={`l${i}`} tone="amber">
                Lambda · {l.LambdaFunctionArn?.split(':').pop()} · {l.Events?.join(', ')}
              </Badge>
            ))}
            {v.EventBridgeConfiguration && <Badge tone="indigo">EventBridge</Badge>}
          </div>
        )}
        templates={[
          {
            label: 'SQS ao criar objetos (uploads/)',
            value: {
              QueueConfigurations: [
                {
                  Id: 'novos-uploads',
                  QueueArn: 'arn:aws:sqs:us-east-1:000000000000:minha-fila',
                  Events: ['s3:ObjectCreated:*'],
                  Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'uploads/' }] } },
                },
              ],
            },
          },
          {
            label: 'SNS ao excluir objetos',
            value: {
              TopicConfigurations: [{ Id: 'exclusoes', TopicArn: 'arn:aws:sns:us-east-1:000000000000:meu-topico', Events: ['s3:ObjectRemoved:*'] }],
            },
          },
          { label: 'Enviar tudo ao EventBridge', value: { EventBridgeConfiguration: {} } },
        ]}
      />
    </div>
  )
}
