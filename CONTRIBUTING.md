# Contribuindo

Obrigado por ajudar. Este guia explica como preparar o ambiente, quais convenções o projeto segue e o que checar antes de abrir um PR.

## Ambiente

1. Instale o Node 20.19+ (recomendado: `fnm use 24`) e o Docker.
2. Suba um LocalStack com S3. Pode ser um que você já tenha ou o do compose:
   ```bash
   docker compose --profile localstack up -d localstack
   ```
3. Instale as dependências e rode:
   ```bash
   npm install
   npm run dev     # http://localhost:5174
   npm run seed    # buckets de exemplo (opcional)
   ```

Se o seu LocalStack não estiver em `http://localhost:4566`, copie `.env.example` para `.env` e ajuste.

## Onde mexer

| Quero mudar… | Arquivo |
|---|---|
| criação do cliente S3 e roteamento pelos proxies | `src/lib/client.ts` |
| chamadas ao S3 (listar, enviar, copiar, configurações de bucket) | `src/lib/api.ts` |
| conexões salvas e credenciais | `src/lib/connections.ts`, `src/hooks/useSettings.tsx` |
| proxies `/localstack` e `/aws-s3` | `vite.config.ts` (dev) e `nginx/default.conf.template` (Docker), mantenha os dois iguais |
| painel e abas do bucket | `src/components/buckets/` |
| navegação, tabela e painel do objeto | `src/components/objects/` |
| prévia de arquivos e tipos MIME | `src/components/objects/ObjectPreview.tsx`, `src/lib/mime.ts` |
| envios, cópias e ZIPs em andamento | `src/hooks/useTransfers.tsx`, `src/components/layout/TransfersPanel.tsx` |
| componentes base | `src/components/ui/` (são os mesmos do DynamoDB e do SES Explorer: mantenha em sincronia) |
| buckets de exemplo | `scripts/seed.mjs` |

## Convenções

- **Português** na interface, nos comentários, nas mensagens de erro e nos commits.
- **Chaves chegam ao S3 como o SDK assinou.** Os proxies não decodificam o caminho e removem o cabeçalho `Origin`. Qualquer mudança neles precisa continuar funcionando com chaves que têm espaço, `+`, `%` e acentos.
- **O proxy `/aws-s3` só aceita hosts do S3 da AWS.** Não afrouxe a validação de host: sem ela o app vira um proxy aberto.
- **Somente leitura é respeitado em todo lugar.** Ações que gravam (enviar, editar, excluir, mudar configuração) precisam checar o modo somente leitura da conexão.
- **Credenciais não saem do navegador.** Nada de logar, enviar para outro serviço ou gravar a secret fora do que o README descreve.

## Antes de abrir o PR

```bash
npm run build                  # tsc -b (tipos estritos) + vite build
docker compose build           # a imagem continua compilando
```

Teste o fluxo afetado com dados reais: `npm run seed -- --reset` cria buckets com versões, marcadores de exclusão, metadados, tags, CORS, política, ciclo de vida e muitos objetos para paginação. Se a mudança depender de um caso que o seed não cobre, inclua no seed.

## Commits e PRs

- Uma mudança por PR, com descrição do que e do porquê. O modelo do PR já traz a lista de checagem.
- Mudança visual? Anexe screenshots no claro e no escuro.
- Atualize o [CHANGELOG.md](CHANGELOG.md), na seção da próxima versão, e o README quando a mudança afetar o uso.
