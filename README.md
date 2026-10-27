# S3 Explorer · LocalStack

> Projeto independente da comunidade, sem afiliação com a LocalStack GmbH nem com a Amazon Web Services. "LocalStack", "AWS" e "Amazon S3" são marcas dos seus respectivos donos e aparecem aqui só para indicar com o que a ferramenta funciona.

Interface web para gerenciar buckets e objetos S3 do LocalStack (e de contas AWS ou serviços compatíveis com S3), no estilo do AWS Console, com melhorias de visualização. É o projeto irmão do DynamoDB Explorer e do [SES Explorer](https://github.com/HiagoARJ/ses_explorer) e usa a mesma base visual.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · lucide-react · AWS SDK v3 (`client-s3`, `lib-storage`, `s3-request-presigner`) · fflate

## Como rodar

### Docker (recomendado)

```bash
docker compose up -d --build   # http://localhost:8081
```

A porta é **8081** porque a 8080 é do DynamoDB Explorer. A imagem compila o app e serve com nginx, que também faz dois proxies:

- `/localstack` → LocalStack do host (`host.docker.internal:4566`). Para outro endereço, defina `DOCKER_LOCALSTACK_UPSTREAM` (formato `host:porta`, sem `http://`) antes do `up`.
- `/aws-s3/<host>` → `https://<host>`, só para hosts do S3 da AWS (veja [Conexões](#conexões-localstack-aws-e-compatíveis)).

Se você ainda não tiver um LocalStack, suba também o do compose. A imagem `localstack/localstack:latest` exige um token de licença:

```bash
# PowerShell: $env:LOCALSTACK_AUTH_TOKEN = "<seu token>"; $env:DOCKER_LOCALSTACK_UPSTREAM = "localstack:4566"
docker compose --profile localstack up -d --build
```

### Desenvolvimento

Requisitos: Node 20.19+ (com fnm: `fnm use 24`).

```bash
npm install
npm run dev          # http://localhost:5174
```

O Vite faz os mesmos proxies do nginx: `/localstack` → `LOCALSTACK_URL` (padrão `http://localhost:4566`) e `/aws-s3`. Para mudar o endereço, crie um `.env` a partir do `.env.example`.

> Os proxies removem o cabeçalho `Origin`. Sem isso, o LocalStack aplica a política de CORS dele e responde **403** para origens como `localhost:8081`. Eles também repassam o caminho sem decodificar, então chaves com espaço, `+`, `%` e acentos chegam ao S3 exatamente como o SDK assinou.

## Conexões (LocalStack, AWS e compatíveis)

O seletor no topo da barra lateral troca de conexão. O **LocalStack** padrão (`/localstack`, `us-east-1`, credenciais `test`) sempre existe e não pode ser excluído, só editado ou restaurado.

- **Adicionar conta AWS**: informe a região e as credenciais. O botão **Colar credenciais** aceita a saída de `aws configure export-credentials --profile <perfil>` e de `aws sts assume-role`, ou variáveis `AWS_*`.
  - O S3 da AWS não libera CORS para `ListBuckets` e várias operações de bucket. Por isso as chamadas passam pelo proxy `/aws-s3` do app: o SDK assina a requisição para o host real e o proxy só entrega, sem alterar nada. O proxy aceita apenas hosts `*.amazonaws.com` do S3.
  - Buckets em outras regiões funcionam: o app descobre a região com `GetBucketLocation` e o SDK segue redirecionamentos de região.
  - Conexões AWS começam em **somente leitura**, que bloqueia enviar, editar e excluir objetos, buckets e configurações. Dá para desligar na própria conexão.
  - A Secret Key e o Session Token ficam só na sessão do navegador (`sessionStorage`), a menos que você marque **Lembrar a secret**. Nesse caso são salvos em texto puro no `localStorage`.
  - Prefira credenciais temporárias (SSO/STS) ou um usuário IAM com permissões mínimas.
- **Outro LocalStack / MinIO / serviço compatível com S3**: informe o endpoint. URLs diretas precisam aceitar CORS. O caminho `/localstack` usa o proxy do app.
- **URL pública (links pré-assinados)**: o proxy `/localstack` só existe dentro do app. Os links que você compartilha são assinados para esta URL (padrão `http://localhost:4566`), então funcionam no `curl`, no navegador ou em outros serviços.
- **Testar conexão** faz um `ListBuckets` com os dados do formulário antes de salvar.

### Dados de exemplo (opcional)

```bash
npm run seed              # cria app-uploads, static-site, data-lake e logs-archive
npm run seed -- --reset   # esvazia, exclui e recria esses buckets
npm run seed -- --remove  # só esvazia e exclui esses buckets
```

| Bucket | O que tem |
|---|---|
| `app-uploads` | versionado; PNGs com metadados e tags, PDFs, `config/settings.json` com 4 versões e um arquivo excluído (marcador de exclusão), CORS |
| `static-site` | site estático (index/erro), política de leitura pública |
| `data-lake` | ~450 arquivos JSONL particionados (paginação e busca por prefixo), CSV, binário de 6 MB, regras de ciclo de vida |
| `logs-archive` | logs em classes GLACIER / STANDARD_IA / STANDARD e criptografia SSE-S3 |

> O seed escreve no LocalStack configurado em `LOCALSTACK_URL`. Ele não toca em buckets com outros nomes.

## Funcionalidades

**Buckets**
- Painel com todos os buckets, região, data de criação, quantidade de objetos e tamanho (calculados listando o bucket; automático no LocalStack e sob demanda na AWS)
- Criar bucket (região, versionamento, Object Lock, tags) com validação das regras de nome
- Esvaziar e excluir, incluindo todas as versões e marcadores de exclusão, com progresso e cancelamento
- **Visão geral**: objetos, tamanho total e médio, distribuição por classe de armazenamento, por extensão e por pasta de primeiro nível, maiores objetos, mais novo e mais antigo, URI/ARN/URL
- **Propriedades**: versionamento (ativar/suspender), criptografia padrão (SSE-S3 / SSE-KMS), tags, hospedagem de site estático (index, erro ou redirecionamento) e status do Object Lock
- **Permissões**: bloqueio de acesso público, política do bucket e CORS, com editor JSON validado e modelos prontos
- **Gerenciamento**: regras de ciclo de vida e notificações de eventos (SQS, SNS, Lambda, EventBridge), com resumo legível e modelos

**Objetos**
- Navegação por pastas com breadcrumbs, busca por prefixo, listagem plana (sem pastas), ordenação e paginação (carregar mais / carregar tudo)
- **Versões**: ver todas as versões e marcadores de exclusão, abrir, baixar, restaurar uma versão antiga ou excluir versões permanentemente
- Enviar arquivos e pastas inteiras (botão ou arrastar e soltar), com multipart automático para arquivos grandes, fila com 3 envios em paralelo, progresso e cancelamento. Opções: pasta de destino, classe de armazenamento, Content-Type, Cache-Control, metadados e tags
- Criar pasta e criar arquivo de texto
- Baixar um objeto (direto, sem passar pela memória) ou vários objetos e pastas como **ZIP**
- Copiar e mover entre pastas e buckets (pastas vão com todo o conteúdo), renomear objetos e pastas, excluir em lote
- **Link pré-assinado** para baixar (GET) ou enviar (PUT), com validade configurável e exemplo de `curl`
- Painel do objeto:
  - **Detalhes**: tamanho, ETag (indica multipart), classe, versão, criptografia, cabeçalhos, metadados, URI/ARN/URL
  - **Prévia**: imagens, vídeo, áudio, PDF, texto, JSON formatado, CSV em tabela e hexdump para binários
  - **Editar**: edição de textos no próprio app, com validação de JSON
  - **Propriedades**: Content-Type, Cache-Control, Content-Disposition, Content-Encoding, Content-Language, classe de armazenamento e metadados do usuário
  - **Tags** e **Versões**

**Geral**
- Painel de transferências com progresso de envios, exclusões, cópias e ZIPs, e aviso ao fechar a aba com operações em andamento
- Tema claro/escuro/sistema e densidade compacta/confortável
- Paleta de comandos com **Ctrl+K**: busca buckets ou abre direto um caminho colado (`s3://bucket/pasta/`)
- Menu lateral redimensionável e recolhível (**Ctrl+B**), igual ao do DynamoDB Explorer

## Estrutura

```
src/
  lib/          cliente S3 (e roteamento pelo proxy da AWS), chamadas de API, tipos MIME, caminhos e formatação
  hooks/        configurações/conexões, lista de buckets, estatísticas, transferências, rota por hash e toasts
  components/
    layout/     barra lateral, barra superior, conexões, preferências, paleta de comandos e painel de transferências
    buckets/    painel, visão do bucket e abas (visão geral, propriedades, permissões, gerenciamento)
    objects/    navegador de objetos, tabela, painel do objeto, prévia, envio e diálogos
    ui/         componentes base (botões, formulários, diálogos, editor de código, chave/valor etc.)
nginx/default.conf.template
scripts/seed.mjs  buckets de exemplo
```

## Limitações conhecidas

- O ZIP é montado na memória do navegador. Acima de 2 GB o app pede confirmação.
- Copiar ou mover objetos acima de 5 GB exige cópia multipart, que o app não faz. Use a CLI (`aws s3 cp`) nesses casos.
- A busca do S3 é só por prefixo: o nome precisa começar com o texto digitado.

Para contribuir, veja o [CONTRIBUTING.md](CONTRIBUTING.md). O histórico de versões está no [CHANGELOG.md](CHANGELOG.md).
