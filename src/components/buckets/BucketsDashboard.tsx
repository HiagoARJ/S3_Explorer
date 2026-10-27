import { Calculator, Files, Globe, HardDrive, Plus, RefreshCw, Search, Trash2, Unplug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { computeStats, getStatsEntry, statsKey, useStatsVersion } from '../../hooks/useBucketStats'
import { useBuckets } from '../../hooks/useBuckets'
import { useSettings } from '../../hooks/useSettings'
import { formatBytes, formatDateShort, formatNumber, relativeTime } from '../../lib/format'
import { BucketIcon } from '../../lib/icons'
import { Button, IconButton } from '../ui/Button'
import { Input } from '../ui/Form'
import { Card, EmptyState, Spinner } from '../ui/Misc'
import { BucketDangerDialog } from './BucketDangerDialog'

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

async function mapLimit<T>(arr: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (i < arr.length) await fn(arr[i++])
    }),
  )
}

export function BucketsDashboard({
  onOpen,
  onCreateBucket,
  onOpenSettings,
}: {
  onOpen: (name: string) => void
  onCreateBucket: () => void
  onOpenSettings: () => void
}) {
  const { buckets, loading, error, refresh, lastLoadedAt, clientForBucket } = useBuckets()
  const { connection, readOnly } = useSettings()
  const isAws = connection.kind === 'aws'
  const [q, setQ] = useState('')
  const [computing, setComputing] = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)
  useStatsVersion()

  const key = (b: string) => statsKey(connection.id, b)

  const computeAll = async (onlyMissing: boolean) => {
    setComputing(true)
    const list = buckets.filter((b) => !onlyMissing || !getStatsEntry(key(b.name)))
    await mapLimit(list, 3, async (b) => computeStats(key(b.name), await clientForBucket(b.name), b.name))
    setComputing(false)
  }

  // Fora da AWS os buckets costumam ser pequenos: calcula o uso automaticamente
  useEffect(() => {
    if (!isAws && buckets.length) void computeAll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, isAws])

  const totals = buckets.reduce(
    (acc, b) => {
      const s = getStatsEntry(key(b.name))?.stats
      if (s) {
        acc.objects += s.objects
        acc.bytes += s.bytes
        acc.known++
      }
      return acc
    },
    { objects: 0, bytes: 0, known: 0 },
  )
  const regions = new Set(buckets.map((b) => b.region).filter(Boolean))

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? buckets.filter((b) => b.name.toLowerCase().includes(s)) : buckets
  }, [buckets, q])

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <Card>
          <EmptyState
            icon={Unplug}
            tone="error"
            title={`${connection.name} indisponível`}
            action={
              <>
                <Button icon={RefreshCw} onClick={() => refresh()} loading={loading}>
                  Tentar novamente
                </Button>
                <Button variant="ghost" onClick={onOpenSettings}>
                  Configurar conexão
                </Button>
              </>
            }
          >
            <p>{error}</p>
            {!isAws && (
              <pre className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-left font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                docker compose up -d{'\n'}npm run seed
              </pre>
            )}
          </EmptyState>
        </Card>
      </div>
    )
  }

  const partial = totals.known < buckets.length

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Buckets</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Buckets S3 em <span className="font-medium text-zinc-700 dark:text-zinc-300">{connection.name}</span>
            {isAws && <> · {connection.region}</>}
            {lastLoadedAt && <> · atualizado {relativeTime(lastLoadedAt)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={Calculator} onClick={() => computeAll(false)} loading={computing} disabled={!buckets.length}>
            {isAws ? 'Calcular uso' : 'Recalcular uso'}
          </Button>
          <Button icon={RefreshCw} onClick={() => refresh()} loading={loading}>
            Atualizar
          </Button>
          <Button variant="primary" icon={Plus} onClick={onCreateBucket} disabled={readOnly} title={readOnly ? 'Conexão somente leitura' : undefined}>
            Criar bucket
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={BucketIcon} label="Buckets" value={formatNumber(buckets.length)} />
        <Stat
          icon={Files}
          label="Objetos"
          value={totals.known ? formatNumber(totals.objects) : '—'}
          sub={partial ? (totals.known ? `em ${totals.known} de ${buckets.length} buckets` : 'use "Calcular uso"') : undefined}
        />
        <Stat
          icon={HardDrive}
          label="Tamanho total"
          value={totals.known ? formatBytes(totals.bytes) : '—'}
          sub={partial && totals.known ? 'parcial' : undefined}
        />
        <Stat
          icon={Globe}
          label="Regiões"
          value={regions.size ? formatNumber(regions.size) : '—'}
          sub={regions.size ? [...regions].slice(0, 3).join(' · ') : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">
            Todos os buckets <span className="font-normal text-zinc-400">({filtered.length})</span>
          </h2>
          <Input icon={Search} inputSize="sm" placeholder="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64" />
        </div>

        {loading && buckets.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Spinner /> Carregando buckets…
          </div>
        ) : buckets.length === 0 ? (
          <EmptyState
            icon={BucketIcon}
            title="Nenhum bucket encontrado"
            action={
              !readOnly && (
                <Button variant="primary" icon={Plus} onClick={onCreateBucket}>
                  Criar bucket
                </Button>
              )
            }
          >
            {isAws ? (
              <>Nenhum bucket visível com estas credenciais.</>
            ) : (
              <>
                Crie um bucket ou popule dados de exemplo com{' '}
                <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">npm run seed</code>.
              </>
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">Região</th>
                  <th className="px-4 py-2.5 font-medium">Criado em</th>
                  <th className="px-4 py-2.5 text-right font-medium">Objetos</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tamanho</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {filtered.map((b) => {
                  const e = getStatsEntry(key(b.name))
                  const s = e?.stats
                  const pending = e?.loading
                  return (
                    <tr key={b.name} onClick={() => onOpen(b.name)} className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400">
                          <BucketIcon className="size-4 opacity-70" />
                          {b.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-zinc-500 dark:text-zinc-400">{b.region ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400" title={b.createdAt?.toISOString()}>
                        {formatDateShort(b.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s ? formatNumber(s.objects) : pending ? <Spinner className="ml-auto size-3.5 text-zinc-400" /> : '—'}
                        {s && pending && <span className="ml-1 text-zinc-400">…</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s ? formatBytes(s.bytes) : e?.error ? <span className="text-rose-500" title={e.error}>erro</span> : '—'}</td>
                      <td className="px-2 py-3 text-right">
                        {!readOnly && (
                          <IconButton
                            icon={Trash2}
                            label="Excluir bucket"
                            size="xs"
                            tone="danger"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setToDelete(b.name)
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toDelete && (
        <BucketDangerDialog bucket={toDelete} mode="delete" open onClose={() => setToDelete(null)} onDone={() => setToDelete(null)} />
      )}
    </div>
  )
}
