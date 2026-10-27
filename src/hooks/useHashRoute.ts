import { useCallback, useEffect, useState } from 'react'

export type BucketTab = 'objects' | 'overview' | 'properties' | 'permissions' | 'management'

const TABS: BucketTab[] = ['objects', 'overview', 'properties', 'permissions', 'management']

export interface Route {
  bucket?: string
  tab: BucketTab
  /** Pasta atual na aba de objetos */
  prefix: string
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'buckets' && parts[1]) {
    const tab = TABS.find((t) => t === parts[2]) ?? 'objects'
    const prefix = new URLSearchParams(query).get('prefix') ?? ''
    return { bucket: decodeURIComponent(parts[1]), tab, prefix }
  }
  return { tab: 'objects', prefix: '' }
}

export function routeHref(bucket?: string, tab: BucketTab = 'objects', prefix = ''): string {
  if (!bucket) return '#/'
  const q = prefix && tab === 'objects' ? `?${new URLSearchParams({ prefix })}` : ''
  return `#/buckets/${encodeURIComponent(bucket)}/${tab}${q}`
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const navigate = useCallback((bucket?: string, tab: BucketTab = 'objects', prefix = '') => {
    window.location.hash = routeHref(bucket, tab, prefix)
  }, [])

  return { route, navigate }
}

export type Navigate = ReturnType<typeof useHashRoute>['navigate']
