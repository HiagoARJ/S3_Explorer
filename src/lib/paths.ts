/** Utilitários de chaves e "pastas" (prefixos terminados em "/"). */

export function isFolderKey(key: string): boolean {
  return key.endsWith('/')
}

/** Último segmento da chave (para pastas, sem a barra final). */
export function baseName(key: string): string {
  const k = key.endsWith('/') ? key.slice(0, -1) : key
  const i = k.lastIndexOf('/')
  return i >= 0 ? k.slice(i + 1) : k
}

/** Prefixo pai ("a/b/c.txt" → "a/b/", "a/b/" → "a/", "a" → ""). */
export function parentPrefix(key: string): string {
  const k = key.endsWith('/') ? key.slice(0, -1) : key
  const i = k.lastIndexOf('/')
  return i >= 0 ? k.slice(0, i + 1) : ''
}

export function extension(key: string): string {
  const name = baseName(key)
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Garante a barra final em prefixos não vazios. */
export function normalizePrefix(p: string): string {
  const t = p.replace(/^\/+/, '')
  return t && !t.endsWith('/') ? t + '/' : t
}

export function joinKey(prefix: string, name: string): string {
  return normalizePrefix(prefix) + name.replace(/^\/+/, '')
}

/** Segmentos do prefixo para breadcrumbs: "a/b/" → [{name:"a",prefix:"a/"},{name:"b",prefix:"a/b/"}] */
export function prefixCrumbs(prefix: string): { name: string; prefix: string }[] {
  const parts = prefix.split('/').filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '')
  const out: { name: string; prefix: string }[] = []
  let acc = ''
  for (const p of parts) {
    acc += p + '/'
    out.push({ name: p || '(vazio)', prefix: acc })
  }
  return out
}

/** Regras de nomes de bucket (https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html). */
export function validateBucketName(name: string): string | null {
  if (name.length < 3 || name.length > 63) return 'Use de 3 a 63 caracteres.'
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name))
    return 'Use só letras minúsculas, números, pontos e hífens, começando e terminando com letra ou número.'
  if (name.includes('..')) return 'Não use dois pontos seguidos.'
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return 'O nome não pode ser um endereço IP.'
  if (/^(xn--|sthree-|amzn-s3-demo-)/.test(name) || /(-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/.test(name))
    return 'Prefixo ou sufixo reservado pela AWS.'
  return null
}

/** URI s3://bucket/chave */
export function s3Uri(bucket: string, key = ''): string {
  return `s3://${bucket}/${key}`
}

export function objectArn(bucket: string, key = ''): string {
  return key ? `arn:aws:s3:::${bucket}/${key}` : `arn:aws:s3:::${bucket}`
}

/** Codifica a chave para URLs, preservando as barras. */
export function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}
