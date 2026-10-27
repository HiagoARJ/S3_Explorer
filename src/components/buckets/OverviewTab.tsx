import type { S3Client } from '@aws-sdk/client-s3'
import { ArrowDownWideNarrow, BarChart3, Calculator, Copy, FileStack, Files, Folder, FolderTree, HardDrive, Info, Layers, Ruler, Square } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { cancelStats, computeStats, statsKey, useStatsEntry } from '../../hooks/useBucketStats'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { copyText, formatBytes, formatDateTime, formatNumber, relativeTime } from '../../lib/format'
import { objectArn, parentPrefix, s3Uri } from '../../lib/paths'
import type { Tally } from '../../lib/types'
import { Button } from '../ui/Button'
import { Card, CardHeader, DetailRow, EmptyState, ProgressBar } from '../ui/Misc'

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Files; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </Card>
  )
}

/** Ranking horizontal de um só tom: cada linha já traz rótulo e valores em texto (funciona como tabela). */
function BarList({
  rows,
  onClick,
  empty = 'Nada para mostrar.',
}: {
  rows: { label: ReactNode; title: string; bytes: number; count?: number }[]
  onClick?: (i: number) => void
  empty?: string
}) {
  if (!rows.length) return <p className="px-4 py-6 text-center text-xs text-zinc-500">{empty}</p>
  const max = Math.max(...rows.map((r) => r.bytes), 1)
  return (
    <ul className="space-y-1 p-2">
      {rows.map((r, i) => {
        const Tag = onClick ? 'button' : 'div'
        return (
          <li key={r.title}>
            <Tag
              onClick={onClick ? () => onClick(i) : undefined}
              title={`${r.title} — ${formatBytes(r.bytes)}${r.count !== undefined ? ` · ${formatNumber(r.count)} objeto(s)` : ''}`}
              className={`relative flex w-full items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                onClick ? 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50' : ''
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-y-0.5 left-0 rounded-r bg-indigo-500/12 dark:bg-indigo-400/15"
                style={{ width: `${Math.max(2, (r.bytes / max) * 100)}%` }}
              />
              <span className="relative min-w-0 flex-1 truncate font-mono text-[12.5px]">{r.label}</span>
              {r.count !== undefined && <span className="relative shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{formatNumber(r.count)}</span>}
              <span className="relative w-20 shrink-0 text-right text-xs font-medium tabular-nums">{formatBytes(r.bytes)}</span>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}

function top(rec: Record<string, Tally>, n: number) {
  return Object.entries(rec)
    .sort((a, b) => b[1].bytes - a[1].bytes || b[1].count - a[1].count)
    .slice(0, n)
}

export function OverviewTab({
  client,
  bucket,
  region,
  bucketUrl,
  onOpenPrefix,
}: {
  client: S3Client
  bucket: string
  region: string
  bucketUrl: string
  onOpenPrefix: (prefix: string) => void
}) {
  const { connection } = useSettings()
  const toast = useToast()
  const key = statsKey(connection.id, bucket)
  const entry = useStatsEntry(key)
  const s = entry?.stats

  useEffect(() => {
    if (!entry && connection.kind !== 'aws') void computeStats(key, client, bucket)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const copy = async (label: string, text: string) => {
    if (await copyText(text)) toast('success', `${label} copiado`, text)
  }
  const CopyBtn = ({ label, text }: { label: string; text: string }) => (
    <button onClick={() => copy(label, text)} className="ml-1.5 inline-flex align-middle text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title={`Copiar ${label}`}>
      <Copy className="size-3.5" />
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {entry?.loading
            ? 'Listando o bucket para somar objetos e tamanhos…'
            : entry?.at
              ? `Calculado ${relativeTime(entry.at)} listando todos os objetos (versões anteriores não entram na conta).`
              : 'O S3 não informa o tamanho de um bucket: é preciso listar todos os objetos.'}
        </p>
        <div className="flex gap-2">
          {entry?.loading && (
            <Button size="sm" icon={Square} onClick={() => cancelStats(key)}>
              Parar
            </Button>
          )}
          <Button size="sm" variant={s ? 'secondary' : 'primary'} icon={Calculator} loading={entry?.loading} onClick={() => computeStats(key, client, bucket)}>
            {s ? 'Recalcular' : 'Calcular uso'}
          </Button>
        </div>
      </div>
      {entry?.loading && <ProgressBar value={0} indeterminate />}
      {entry?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{entry.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Files} label="Objetos" value={s ? formatNumber(s.objects) : '—'} sub={s && !s.complete ? 'contando…' : undefined} />
        <Stat icon={HardDrive} label="Tamanho total" value={s ? formatBytes(s.bytes) : '—'} />
        <Stat icon={Ruler} label="Tamanho médio" value={s && s.objects ? formatBytes(Math.round(s.bytes / s.objects)) : '—'} />
        <Stat icon={Folder} label="Marcadores de pasta" value={s ? formatNumber(s.folders) : '—'} sub="objetos vazios terminados em /" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Detalhes" icon={Info} />
          <dl className="divide-y divide-zinc-100 px-4 dark:divide-zinc-800/70">
            <DetailRow label="Nome" mono>
              {bucket}
            </DetailRow>
            <DetailRow label="Região" mono>
              {region}
            </DetailRow>
            <DetailRow label="URI" mono>
              {s3Uri(bucket)}
              <CopyBtn label="URI" text={s3Uri(bucket)} />
            </DetailRow>
            <DetailRow label="ARN" mono>
              {objectArn(bucket)}
              <CopyBtn label="ARN" text={objectArn(bucket)} />
            </DetailRow>
            <DetailRow label="URL" mono>
              {bucketUrl}
              <CopyBtn label="URL" text={bucketUrl} />
            </DetailRow>
            {s?.newest && (
              <DetailRow label="Última alteração">
                {formatDateTime(s.newest.date)}
                <span className="block truncate font-mono text-[11px] text-zinc-500">{s.newest.key}</span>
              </DetailRow>
            )}
            {s?.oldest && (
              <DetailRow label="Objeto mais antigo">
                {formatDateTime(s.oldest.date)}
                <span className="block truncate font-mono text-[11px] text-zinc-500">{s.oldest.key}</span>
              </DetailRow>
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Classes de armazenamento" icon={Layers} description="Tamanho e quantidade por classe" />
          {s ? (
            <BarList rows={top(s.byStorageClass, 10).map(([k, v]) => ({ label: k, title: k, bytes: v.bytes, count: v.count }))} empty="Bucket vazio." />
          ) : (
            <EmptyState icon={BarChart3} title="Uso não calculado" />
          )}
        </Card>

        <Card>
          <CardHeader title="Pastas de primeiro nível" icon={FolderTree} description="Clique para abrir" />
          {s ? (
            (() => {
              const rows = top(s.topPrefixes, 12)
              return (
                <BarList
                  rows={rows.map(([k, v]) => ({ label: k, title: k, bytes: v.bytes, count: v.count }))}
                  onClick={(i) => onOpenPrefix(rows[i][0] === '(raiz)' ? '' : rows[i][0])}
                  empty="Bucket vazio."
                />
              )
            })()
          ) : (
            <EmptyState icon={BarChart3} title="Uso não calculado" />
          )}
        </Card>

        <Card>
          <CardHeader title="Por extensão" icon={FileStack} />
          {s ? (
            <BarList rows={top(s.byExtension, 12).map(([k, v]) => ({ label: k === '(sem extensão)' ? k : `.${k}`, title: k, bytes: v.bytes, count: v.count }))} empty="Bucket vazio." />
          ) : (
            <EmptyState icon={BarChart3} title="Uso não calculado" />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Maiores objetos" icon={ArrowDownWideNarrow} description="Clique para abrir a pasta" />
          {s ? (
            <BarList
              rows={s.largest.map((o) => ({ label: o.key, title: o.key, bytes: o.size }))}
              onClick={(i) => onOpenPrefix(parentPrefix(s.largest[i].key))}
              empty="Bucket vazio."
            />
          ) : (
            <EmptyState icon={BarChart3} title="Uso não calculado" />
          )}
        </Card>
      </div>
    </div>
  )
}
