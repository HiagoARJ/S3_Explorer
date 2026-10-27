import type { S3Client } from '@aws-sdk/client-s3'
import { Copy, Eraser, Files, Info, Link2, MoreHorizontal, Settings2, ShieldCheck, Trash2, Unplug, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { invalidateStats, statsKey } from '../../hooks/useBucketStats'
import { useBuckets } from '../../hooks/useBuckets'
import type { BucketTab, Navigate } from '../../hooks/useHashRoute'
import { useSettings } from '../../hooks/useSettings'
import { useToast } from '../../hooks/useToast'
import { getVersioning } from '../../lib/api'
import { copyText, formatDateTime } from '../../lib/format'
import { objectArn, s3Uri } from '../../lib/paths'
import { ObjectsBrowser } from '../objects/ObjectsBrowser'
import { Button } from '../ui/Button'
import { Badge, Card, EmptyState, MenuItem, MenuLabel, Popover, Spinner, Tabs } from '../ui/Misc'
import { BucketDangerDialog } from './BucketDangerDialog'
import { ManagementTab } from './ManagementTab'
import { OverviewTab } from './OverviewTab'
import { PermissionsTab } from './PermissionsTab'
import { PropertiesTab } from './PropertiesTab'

export function BucketView({ bucket, tab, prefix, navigate }: { bucket: string; tab: BucketTab; prefix: string; navigate: Navigate }) {
  const { buckets, loading, error, clientForBucket, resolveRegion } = useBuckets()
  const { connection, readOnly } = useSettings()
  const toast = useToast()
  const [client, setClient] = useState<S3Client | null>(null)
  const [region, setRegion] = useState<string>('')
  const [versioning, setVersioning] = useState<string | null>(null)
  const [danger, setDanger] = useState<'empty' | 'delete' | null>(null)
  const [nonce, setNonce] = useState(0)

  const info = buckets.find((b) => b.name === bucket)
  const known = !!info

  useEffect(() => {
    let alive = true
    setClient(null)
    void Promise.all([clientForBucket(bucket), resolveRegion(bucket)]).then(([c, r]) => {
      if (!alive) return
      setClient(c)
      setRegion(r)
    })
    return () => {
      alive = false
    }
  }, [bucket, clientForBucket, resolveRegion])

  const reloadVersioning = () => {
    if (!client) return
    getVersioning(client, bucket)
      .then((v) => setVersioning(v.status))
      .catch(() => setVersioning(null))
  }
  useEffect(reloadVersioning, [client, bucket]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <div className="p-6">
        <Card>
          <EmptyState icon={Unplug} tone="error" title="Sem conexão">
            {error}
          </EmptyState>
        </Card>
      </div>
    )

  if (!client || (loading && !known))
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
        <Spinner /> Carregando bucket…
      </div>
    )

  const copy = async (label: string, text: string) => {
    if (await copyText(text)) toast('success', `${label} copiado`, text)
  }

  const onDataChanged = () => invalidateStats(statsKey(connection.id, bucket))

  const bucketUrl =
    connection.kind === 'aws'
      ? `https://${bucket}.s3.${region}.amazonaws.com`
      : `${(connection.publicEndpoint || connection.endpoint).replace(/\/+$/, '')}/${bucket}`

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-tight">{bucket}</h1>
            {versioning === 'Enabled' && <Badge tone="green">versionado</Badge>}
            {versioning === 'Suspended' && <Badge tone="amber">versionamento suspenso</Badge>}
            {!known && !loading && (
              <Badge tone="amber" title="O bucket não aparece no ListBuckets desta conexão">
                fora da lista
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">{region}</span>
            {info?.createdAt && <span>Criado em {formatDateTime(info.createdAt)}</span>}
            <button onClick={() => copy('URI', s3Uri(bucket))} className="font-mono hover:text-zinc-900 dark:hover:text-zinc-100" title="Copiar URI">
              {s3Uri(bucket)}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Popover
            width="w-64"
            trigger={({ toggle }) => (
              <Button size="sm" icon={MoreHorizontal} onClick={toggle}>
                Ações
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Copiar</MenuLabel>
                <MenuItem icon={Copy} onClick={() => (close(), copy('URI', s3Uri(bucket)))}>
                  URI do S3
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => (close(), copy('ARN', objectArn(bucket)))}>
                  ARN
                </MenuItem>
                <MenuItem icon={Link2} onClick={() => (close(), copy('URL', bucketUrl))}>
                  URL do bucket
                </MenuItem>
                {!readOnly && (
                  <>
                    <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                    <MenuItem icon={Eraser} danger onClick={() => (close(), setDanger('empty'))}>
                      Esvaziar bucket
                    </MenuItem>
                    <MenuItem icon={Trash2} danger onClick={() => (close(), setDanger('delete'))}>
                      Excluir bucket
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Popover>
        </div>
      </div>

      <Tabs<BucketTab>
        value={tab}
        onChange={(t) => navigate(bucket, t, t === 'objects' ? prefix : '')}
        items={[
          { id: 'objects', label: 'Objetos', icon: Files },
          { id: 'overview', label: 'Visão geral', icon: Info },
          { id: 'properties', label: 'Propriedades', icon: Settings2 },
          { id: 'permissions', label: 'Permissões', icon: ShieldCheck },
          { id: 'management', label: 'Gerenciamento', icon: Workflow },
        ]}
      />

      {tab === 'objects' && (
        <ObjectsBrowser
          key={`${bucket}:${nonce}`}
          client={client}
          bucket={bucket}
          region={region}
          prefix={prefix}
          versioning={versioning}
          onPrefixChange={(p) => navigate(bucket, 'objects', p)}
          onDataChanged={onDataChanged}
        />
      )}
      {tab === 'overview' && <OverviewTab client={client} bucket={bucket} region={region} bucketUrl={bucketUrl} onOpenPrefix={(p) => navigate(bucket, 'objects', p)} />}
      {tab === 'properties' && <PropertiesTab client={client} bucket={bucket} onVersioningChanged={reloadVersioning} />}
      {tab === 'permissions' && <PermissionsTab client={client} bucket={bucket} />}
      {tab === 'management' && <ManagementTab client={client} bucket={bucket} />}

      {danger && (
        <BucketDangerDialog
          bucket={bucket}
          mode={danger}
          open
          onClose={() => setDanger(null)}
          onDone={() => {
            onDataChanged()
            if (danger === 'delete') navigate()
            else setNonce((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
