import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react'
import { extension } from './paths'

const TYPES: Record<string, string> = {
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/plain',
  tsx: 'text/plain',
  jsx: 'text/plain',
  json: 'application/json',
  ndjson: 'application/x-ndjson',
  jsonl: 'application/x-ndjson',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  toml: 'application/toml',
  ini: 'text/plain',
  env: 'text/plain',
  sh: 'text/x-shellscript',
  py: 'text/x-python',
  java: 'text/x-java',
  go: 'text/plain',
  rs: 'text/plain',
  sql: 'application/sql',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  zip: 'application/zip',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  parquet: 'application/vnd.apache.parquet',
  avro: 'application/avro',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  wasm: 'application/wasm',
}

export function guessContentType(key: string, fallback = 'application/octet-stream'): string {
  return TYPES[extension(key)] ?? fallback
}

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'json' | 'csv' | 'none'

const TEXT_EXT = new Set([
  'txt', 'log', 'md', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'xml', 'yaml', 'yml', 'toml', 'ini',
  'env', 'sh', 'py', 'java', 'go', 'rs', 'sql', 'svg', 'conf', 'cfg', 'properties', 'gitignore', 'dockerfile',
  'tf', 'hcl', 'graphql', 'gql', 'proto', 'bat', 'ps1', 'kt', 'rb', 'php', 'c', 'h', 'cpp', 'cs', 'swift', 'vue',
])

export function previewKind(key: string, contentType?: string): PreviewKind {
  const ext = extension(key)
  const ct = (contentType || '').toLowerCase().split(';')[0].trim()
  if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl' || ct === 'application/json' || ct.endsWith('+json')) return 'json'
  if (ext === 'csv' || ext === 'tsv' || ct === 'text/csv') return 'csv'
  if (ext === 'svg' || ct === 'image/svg+xml') return 'image'
  if (ct.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'].includes(ext)) return 'image'
  if (ct.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video'
  if (ct.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (
    ct.startsWith('text/') ||
    TEXT_EXT.has(ext) ||
    ['application/xml', 'application/yaml', 'application/x-yaml', 'application/javascript', 'application/sql', 'application/toml'].includes(ct)
  )
    return 'text'
  return 'none'
}

/** Texto que pode ser editado direto no app. */
export function isEditable(key: string, contentType?: string): boolean {
  const k = previewKind(key, contentType)
  return k === 'text' || k === 'json' || k === 'csv'
}

export function fileIcon(key: string, contentType?: string): { icon: LucideIcon; color: string } {
  const ext = extension(key)
  const k = previewKind(key, contentType)
  if (k === 'image') return { icon: FileImage, color: 'text-fuchsia-500' }
  if (k === 'video') return { icon: FileVideo, color: 'text-rose-500' }
  if (k === 'audio') return { icon: FileAudio, color: 'text-orange-500' }
  if (k === 'pdf') return { icon: FileText, color: 'text-red-500' }
  if (k === 'json') return { icon: FileJson, color: 'text-amber-500' }
  if (k === 'csv' || ['xlsx', 'xls', 'parquet', 'avro'].includes(ext)) return { icon: FileSpreadsheet, color: 'text-emerald-500' }
  if (['zip', 'gz', 'tgz', 'tar', '7z', 'rar'].includes(ext)) return { icon: FileArchive, color: 'text-yellow-600' }
  if (k === 'text' && !['txt', 'log', 'md'].includes(ext)) return { icon: FileCode, color: 'text-sky-500' }
  if (k === 'text') return { icon: FileText, color: 'text-zinc-500' }
  return { icon: File, color: 'text-zinc-400' }
}
