// Cria buckets de exemplo no LocalStack com objetos variados (pastas, versões, metadados, tags, configurações).
// Uso: npm run seed             → cria o que não existir e grava os objetos
//      npm run seed -- --reset  → esvazia, exclui e recria os buckets de exemplo
//      npm run seed -- --remove → só esvazia e exclui os buckets de exemplo
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { crc32, deflateSync } from 'node:zlib'

try {
  process.loadEnvFile?.('.env')
} catch {
  // sem .env — usa os padrões
}

const endpoint = process.env.LOCALSTACK_URL || 'http://localhost:4566'
const region = process.env.AWS_REGION || 'us-east-1'
const reset = process.argv.includes('--reset')
const remove = process.argv.includes('--remove')

const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  requestChecksumCalculation: 'WHEN_REQUIRED',
})

// PRNG determinístico para dados reproduzíveis
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const pad = (n, w = 2) => String(n).padStart(w, '0')

/* ---------------- geradores de arquivos ---------------- */

/** PNG RGB com gradiente (sem dependências). */
function png(w, h, [r1, g1, b1], [r2, g2, b2]) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h)
      const i = y * (w * 3 + 1) + 1 + x * 3
      const ring = Math.hypot(x - w / 2, y - h / 2) < Math.min(w, h) / 4 ? 40 : 0
      raw[i] = Math.min(255, r1 + (r2 - r1) * t + ring)
      raw[i + 1] = Math.min(255, g1 + (g2 - g1) * t + ring)
      raw[i + 2] = Math.min(255, b1 + (b2 - b1) * t + ring)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** PDF de uma página com algumas linhas de texto. */
function pdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, '\\$&').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const text = [`BT /F1 20 Tf 60 780 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 12 Tf 60 ${740 - i * 18} Td (${esc(l)}) Tj ET`)].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}

const svg = (color, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="16" fill="${color}"/><text x="120" y="70" font-family="sans-serif" font-size="24" fill="white" text-anchor="middle">${label}</text></svg>`

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcos']
const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Recife', 'Salvador']
const EVENTS = ['page_view', 'click', 'signup', 'purchase', 'logout', 'search']

function csv(rows) {
  const cell = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

/* ---------------- definição dos buckets ---------------- */

const put = (Bucket, Key, Body, extra = {}) =>
  s3.send(new PutObjectCommand({ Bucket, Key, Body, ...(Body === '' ? { ContentLength: 0 } : {}), ...extra }))

const buckets = [
  {
    name: 'app-uploads',
    tags: [
      { Key: 'projeto', Value: 'portal' },
      { Key: 'ambiente', Value: 'dev' },
    ],
    async setup(b) {
      await s3.send(new PutBucketVersioningCommand({ Bucket: b, VersioningConfiguration: { Status: 'Enabled' } }))
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: b,
          CORSConfiguration: {
            CORSRules: [
              { AllowedHeaders: ['*'], AllowedMethods: ['GET', 'PUT', 'POST'], AllowedOrigins: ['http://localhost:3000'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3000 },
            ],
          },
        }),
      )
    },
    async fill(b) {
      const colors = [
        [[99, 102, 241], [168, 85, 247]],
        [[16, 185, 129], [20, 184, 166]],
        [[244, 63, 94], [251, 146, 60]],
        [[14, 165, 233], [59, 130, 246]],
      ]
      for (let i = 1; i <= 12; i++) {
        const [a, c] = colors[i % colors.length]
        await put(b, `avatars/usuario-${pad(i, 3)}.png`, png(128, 128, a, c), {
          ContentType: 'image/png',
          CacheControl: 'max-age=86400',
          Metadata: { 'usuario-id': String(1000 + i), origem: pick(['web', 'mobile']) },
          Tagging: `categoria=avatar&revisado=${i % 3 === 0 ? 'nao' : 'sim'}`,
        })
      }
      await put(b, 'banners/hero.png', png(1200, 400, [30, 41, 59], [99, 102, 241]), { ContentType: 'image/png' })
      await put(b, 'banners/logo.svg', svg('#10b981', 'S3 Explorer'), { ContentType: 'image/svg+xml' })

      for (const [i, name] of ['contrato-2026-001', 'nota-fiscal-8841', 'proposta-comercial'].entries()) {
        await put(
          b,
          `documentos/${name}.pdf`,
          pdf(name.replace(/-/g, ' ').toUpperCase(), [
            'Documento de exemplo gerado pelo npm run seed.',
            `Cliente: ${FIRST[i]} Silva`,
            `Cidade: ${CITIES[i]}`,
            `Valor: R$ ${(1234.5 * (i + 1)).toFixed(2)}`,
          ]),
          { ContentType: 'application/pdf', Metadata: { confidencial: i === 0 ? 'sim' : 'nao' } },
        )
      }

      // config/settings.json com 4 versões
      for (let v = 1; v <= 4; v++) {
        await put(
          b,
          'config/settings.json',
          JSON.stringify({ versao: v, tema: v % 2 ? 'claro' : 'escuro', recursos: { upload: true, limiteMB: 10 * v, beta: v >= 3 }, atualizadoPor: FIRST[v] }, null, 2),
          { ContentType: 'application/json' },
        )
      }
      await put(b, 'config/feature-flags.yaml', 'novo_checkout: true\nbusca_v2: false\nlimite_upload_mb: 50\n', { ContentType: 'application/yaml' })

      // Arquivo excluído: fica só um marcador de exclusão (recuperável pela aba de versões)
      await put(b, 'temporario/rascunho.txt', 'Este arquivo foi excluído, mas a versão anterior continua guardada.\n', { ContentType: 'text/plain; charset=utf-8' })
      await s3.send(new DeleteObjectCommand({ Bucket: b, Key: 'temporario/rascunho.txt' }))

      await put(b, 'LEIA-ME.md', '# app-uploads\n\nBucket **versionado** de exemplo.\n\n- `avatars/`: imagens PNG com metadados e tags\n- `documentos/`: PDFs\n- `config/settings.json`: 4 versões\n- `temporario/rascunho.txt`: excluído (veja "Versões")\n', {
        ContentType: 'text/markdown; charset=utf-8',
      })
    },
  },
  {
    name: 'static-site',
    tags: [{ Key: 'projeto', Value: 'site-institucional' }],
    async setup(b) {
      await s3.send(new PutBucketWebsiteCommand({ Bucket: b, WebsiteConfiguration: { IndexDocument: { Suffix: 'index.html' }, ErrorDocument: { Key: 'erro.html' } } }))
      await s3.send(
        new PutBucketPolicyCommand({
          Bucket: b,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{ Sid: 'PublicRead', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${b}/*` }],
          }),
        }),
      )
    },
    async fill(b) {
      await put(
        b,
        'index.html',
        '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8" />\n  <title>Site de exemplo</title>\n  <link rel="stylesheet" href="assets/estilo.css" />\n</head>\n<body>\n  <h1>Olá do S3!</h1>\n  <img src="assets/logo.svg" alt="logo" />\n  <script src="assets/app.js"></script>\n</body>\n</html>\n',
        { ContentType: 'text/html; charset=utf-8', CacheControl: 'no-cache' },
      )
      await put(b, 'erro.html', '<!doctype html><html lang="pt-BR"><body><h1>404 — página não encontrada</h1></body></html>\n', { ContentType: 'text/html; charset=utf-8' })
      await put(b, 'assets/estilo.css', 'body { font-family: system-ui, sans-serif; margin: 4rem; color: #18181b; }\nh1 { color: #10b981; }\n', {
        ContentType: 'text/css',
        CacheControl: 'max-age=31536000, immutable',
      })
      await put(b, 'assets/app.js', "document.querySelector('h1').addEventListener('click', () => alert('Servido pelo S3'))\n", {
        ContentType: 'text/javascript',
        CacheControl: 'max-age=31536000, immutable',
      })
      await put(b, 'assets/logo.svg', svg('#6366f1', 'Meu site'), { ContentType: 'image/svg+xml' })
      await put(b, 'robots.txt', 'User-agent: *\nAllow: /\n', { ContentType: 'text/plain' })
    },
  },
  {
    name: 'data-lake',
    tags: [
      { Key: 'projeto', Value: 'analytics' },
      { Key: 'dono', Value: 'time-dados' },
    ],
    async setup(b) {
      await s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: b,
          LifecycleConfiguration: {
            Rules: [
              { ID: 'expira-tmp', Status: 'Enabled', Filter: { Prefix: 'tmp/' }, Expiration: { Days: 7 } },
              { ID: 'arquiva-raw', Status: 'Enabled', Filter: { Prefix: 'raw/' }, Transitions: [{ Days: 30, StorageClass: 'STANDARD_IA' }, { Days: 180, StorageClass: 'GLACIER' }] },
            ],
          },
        }),
      )
    },
    async fill(b) {
      // ~450 arquivos particionados, para testar paginação e a busca por prefixo
      const jobs = []
      for (let day = 1; day <= 30; day++) {
        for (let part = 0; part < 15; part++) {
          const lines = Array.from({ length: int(20, 60) }, (_, i) =>
            JSON.stringify({
              id: `${day}-${part}-${i}`,
              evento: pick(EVENTS),
              usuario: `u${int(1, 500)}`,
              cidade: pick(CITIES),
              ts: new Date(Date.UTC(2026, 8, day, int(0, 23), int(0, 59))).toISOString(),
              valor: rand() < 0.2 ? Number((rand() * 500).toFixed(2)) : null,
            }),
          ).join('\n')
          jobs.push(() =>
            put(b, `raw/eventos/ano=2026/mes=09/dia=${pad(day)}/parte-${pad(part, 4)}.jsonl`, lines + '\n', { ContentType: 'application/x-ndjson' }),
          )
        }
      }
      for (let i = 0; i < jobs.length; i += 25) await Promise.all(jobs.slice(i, i + 25).map((j) => j()))

      const header = ['id', 'nome', 'cidade', 'pedidos', 'total_gasto', 'ultimo_pedido']
      const rows = Array.from({ length: 300 }, (_, i) => [
        i + 1,
        `${pick(FIRST)} ${pick(['Silva', 'Souza', 'Lima', 'Costa'])}`,
        pick(CITIES),
        int(1, 40),
        (rand() * 5000).toFixed(2),
        new Date(Date.UTC(2026, int(0, 8), int(1, 28))).toISOString().slice(0, 10),
      ])
      await put(b, 'processed/clientes.csv', csv([header, ...rows]), { ContentType: 'text/csv; charset=utf-8' })
      await put(
        b,
        'processed/resumo-mensal.json',
        JSON.stringify(
          Array.from({ length: 9 }, (_, m) => ({ mes: `2026-${pad(m + 1)}`, eventos: int(8000, 20000), compras: int(300, 900), receita: Number((rand() * 90000).toFixed(2)) })),
          null,
          2,
        ),
        { ContentType: 'application/json' },
      )
      await put(b, 'tmp/job-123.lock', '', { ContentType: 'application/octet-stream' })
      await put(b, 'tmp/extracao-parcial.csv', csv([header, ...rows.slice(0, 20)]), { ContentType: 'text/csv' })
      // Binário maior (6 MB) para testar prévia hexadecimal e download
      const big = Buffer.alloc(6 * 1024 * 1024)
      for (let i = 0; i < big.length; i += 4) big.writeUInt32LE((rand() * 4294967295) >>> 0, i)
      await put(b, 'backups/dump-2026-09-25.bin', big, { ContentType: 'application/octet-stream', StorageClass: 'STANDARD_IA' })
      await put(b, 'pasta-vazia/', '')
    },
  },
  {
    name: 'logs-archive',
    tags: [{ Key: 'retencao', Value: '1-ano' }],
    async setup(b) {
      await s3.send(new PutBucketEncryptionCommand({ Bucket: b, ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] } }))
    },
    async fill(b) {
      const services = ['api', 'worker', 'auth']
      const levels = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR', 'DEBUG']
      for (const svc of services) {
        for (let d = 20; d <= 28; d++) {
          const lines = Array.from({ length: int(50, 120) }, () => {
            const t = new Date(Date.UTC(2026, 8, d, int(0, 23), int(0, 59), int(0, 59)))
            return `${t.toISOString()} ${pick(levels).padEnd(5)} [${svc}] ${pick(['requisição concluída', 'cache miss', 'token renovado', 'timeout no upstream', 'fila vazia', 'retry 1/3'])} (${int(3, 900)} ms)`
          }).join('\n')
          await put(b, `${svc}/2026/09/${pad(d)}/${svc}.log`, lines + '\n', {
            ContentType: 'text/plain; charset=utf-8',
            StorageClass: d < 23 ? 'GLACIER' : d < 26 ? 'STANDARD_IA' : 'STANDARD',
          })
        }
      }
      await put(b, 'LEIA-ME.txt', 'Logs com criptografia padrão SSE-S3 e classes de armazenamento variadas (GLACIER, STANDARD_IA, STANDARD).\n', {
        ContentType: 'text/plain; charset=utf-8',
      })
    },
  },
]

/* ---------------- execução ---------------- */

async function emptyAndDelete(b) {
  let keyMarker
  let versionMarker
  for (;;) {
    const r = await s3.send(new ListObjectVersionsCommand({ Bucket: b, KeyMarker: keyMarker, VersionIdMarker: versionMarker }))
    const objs = [...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])].map((v) => ({ Key: v.Key, VersionId: v.VersionId }))
    for (let i = 0; i < objs.length; i += 1000)
      await s3.send(new DeleteObjectsCommand({ Bucket: b, Delete: { Objects: objs.slice(i, i + 1000), Quiet: true } }))
    if (!r.IsTruncated) break
    keyMarker = r.NextKeyMarker
    versionMarker = r.NextVersionIdMarker
  }
  await s3.send(new DeleteBucketCommand({ Bucket: b }))
}

async function main() {
  console.log(`LocalStack: ${endpoint} (${region})`)
  let existing
  try {
    existing = new Set(((await s3.send(new ListBucketsCommand({}))).Buckets ?? []).map((b) => b.Name))
  } catch (e) {
    console.error(`\nNão foi possível conectar ao LocalStack em ${endpoint}: ${e.message}`)
    console.error('Suba o LocalStack (docker compose --profile localstack up -d) ou ajuste LOCALSTACK_URL no .env.')
    process.exit(1)
  }

  if (remove) {
    for (const { name } of buckets) {
      if (!existing.has(name)) continue
      process.stdout.write(`• ${name}: excluindo… `)
      await emptyAndDelete(name)
      console.log('ok')
    }
    console.log('\nBuckets de exemplo removidos.')
    return
  }

  for (const def of buckets) {
    const b = def.name
    if (existing.has(b)) {
      if (!reset) {
        console.log(`• ${b}: já existe (use --reset para recriar)`)
        continue
      }
      process.stdout.write(`• ${b}: excluindo… `)
      await emptyAndDelete(b)
      console.log('ok')
    }
    process.stdout.write(`• ${b}: criando… `)
    await s3.send(new CreateBucketCommand({ Bucket: b }))
    if (def.tags?.length) await s3.send(new PutBucketTaggingCommand({ Bucket: b, Tagging: { TagSet: def.tags } }))
    await def.setup?.(b)
    await def.fill(b)
    console.log('ok')
  }
  console.log('\nPronto. Abra o S3 Explorer e navegue pelos buckets.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
