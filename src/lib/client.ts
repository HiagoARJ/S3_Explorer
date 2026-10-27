import { S3Client } from '@aws-sdk/client-s3'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import type { HttpHandlerOptions } from '@smithy/types'
import { connectionEndpoint, type Connection } from './connections'

/** Endpoints relativos (ex.: "/localstack") passam pelo proxy do Vite/nginx. */
export function resolveEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (trimmed.startsWith('/')) return window.location.origin + trimmed
  return trimmed
}

/** https://host/caminho?query → <origem do app>/aws-s3/host/caminho?query */
export function toAwsProxyUrl(url: string): string {
  const u = new URL(url)
  return `${window.location.origin}/aws-s3/${u.host}${u.pathname}${u.search}`
}

/**
 * Envia as requisições da AWS pelo proxy do app. O S3 não responde CORS para ListBuckets
 * e várias operações de bucket; aqui a requisição já está assinada para o host real,
 * e só o destino muda (o proxy repassa host e caminho sem alterar nada).
 */
class AwsProxyHandler extends FetchHttpHandler {
  override handle(request: Parameters<FetchHttpHandler['handle']>[0], options?: HttpHandlerOptions) {
    const { protocol, hostname, port } = window.location
    const proxied = request.clone()
    proxied.path = `/aws-s3/${request.hostname}${request.path}`
    proxied.protocol = protocol
    proxied.hostname = hostname
    proxied.port = port ? Number(port) : undefined
    return super.handle(proxied, options)
  }
}

/** `direct`: sem o proxy do app (usado só para gerar URLs pré-assinadas da AWS). */
export function createClient(c: Connection, region?: string, direct = false): S3Client {
  const endpoint = connectionEndpoint(c)
  const isAws = c.kind === 'aws'
  return new S3Client({
    ...(endpoint ? { endpoint: resolveEndpoint(endpoint) } : {}),
    region: region || c.region || 'us-east-1',
    credentials: {
      accessKeyId: c.accessKeyId || (isAws ? '' : 'test'),
      secretAccessKey: c.secretAccessKey || (isAws ? '' : 'test'),
      ...(c.sessionToken.trim() ? { sessionToken: c.sessionToken.trim() } : {}),
    },
    // LocalStack/MinIO não resolvem subdomínios de bucket (bucket.localhost)
    forcePathStyle: !isAws,
    // Buckets da AWS em outra região: o SDK refaz a chamada na região certa
    followRegionRedirects: true,
    // Checksums só quando a operação exige (DeleteObjects etc.) — evita incompatibilidades com emuladores
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
    ...(isAws && !direct ? { requestHandler: new AwsProxyHandler() } : {}),
  })
}

/** Cliente para gerar URLs pré-assinadas que funcionam fora do app. */
export function createPublicClient(c: Connection, region?: string): S3Client {
  if (c.kind === 'aws') return createClient(c, region, true)
  const endpoint = (c.publicEndpoint || c.endpoint).trim()
  return createClient({ ...c, endpoint }, region)
}
