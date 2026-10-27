import https from 'node:https'
import { defineConfig, loadEnv, type Connect, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Só hosts do S3 da AWS passam pelo proxy /aws-s3 (ex.: s3.us-east-1.amazonaws.com, bucket.s3.sa-east-1.amazonaws.com). */
const AWS_S3_HOST = /^([a-z0-9][a-z0-9.-]*\.)?s3([.-][a-z0-9-]+)*\.amazonaws\.com$/

/**
 * /aws-s3/<host>/<caminho> → https://<host>/<caminho>
 *
 * O S3 não responde CORS para ListBuckets e várias operações de bucket. O SDK assina a requisição
 * para o host real e o app só troca o endereço de destino, então a assinatura continua válida.
 */
function awsS3Proxy(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const m = req.url?.match(/^\/aws-s3\/([^/?]+)(\/.*)?$/)
    if (!m) return next()
    const host = m[1].toLowerCase()
    if (!AWS_S3_HOST.test(host)) {
      res.statusCode = 403
      res.end('Host não permitido pelo proxy do S3.')
      return
    }
    const headers = { ...req.headers, host }
    delete headers.origin
    delete headers.referer
    delete headers.cookie
    const upstream = https.request({ host, path: m[2] || '/', method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers)
      r.pipe(res)
    })
    upstream.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`Falha no proxy para ${host}: ${e.message}`)
    })
    req.pipe(upstream)
  }
  return {
    name: 'aws-s3-proxy',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.LOCALSTACK_URL || 'http://localhost:4566'

  const proxy: Record<string, ProxyOptions> = {
    '/localstack': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/localstack/, '') || '/',
      // Sem o Origin, o LocalStack não aplica a política de CORS (a chamada já é same-origin).
      configure: (p) => {
        p.on('proxyReq', (req) => {
          req.removeHeader('origin')
          req.removeHeader('referer')
        })
      },
    },
  }

  return {
    plugins: [react(), tailwindcss(), awsS3Proxy()],
    server: { port: 5174, proxy },
    build: { chunkSizeWarningLimit: 1200 },
    preview: { port: 4174, proxy },
  }
})
