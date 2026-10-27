const nf = new Intl.NumberFormat('pt-BR')

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—'
  return nf.format(n)
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[i]}`
}

export function formatDateTime(d: Date | undefined | null): string {
  if (!d) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' })
}

export function formatDateShort(d: Date | undefined | null): string {
  if (!d) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function relativeTime(d: Date): string {
  const diff = (d.getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month')
  return rtf.format(Math.round(diff / (86400 * 365)), 'year')
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
  const m = Math.floor(s / 60)
  return `${m} min ${Math.round(s % 60)} s`
}

/** Remove as aspas que o S3 coloca no ETag. */
export function cleanEtag(etag?: string): string {
  return etag ? etag.replace(/^"|"$/g, '') : ''
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadFile(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: mime }))
}

/** Baixa pelo navegador (a URL precisa ser da mesma origem para o atributo download valer). */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
