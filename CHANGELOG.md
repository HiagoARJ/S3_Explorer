# Changelog

As mudanças relevantes de cada versão ficam registradas aqui. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [1.0.0] - 2026-09-29

Primeira versão, na mesma stack do DynamoDB Explorer: Vite, React 19, TypeScript e Tailwind CSS v4.

### Adicionado
- **Conexões**: LocalStack padrão, contas AWS (com colagem de credenciais e modo somente leitura) e serviços compatíveis com S3, como MinIO.
- Proxies `/localstack` e `/aws-s3` no Vite e no nginx, para contornar o CORS sem alterar a assinatura das requisições.
- **Buckets**: painel com estatísticas, criação com validação de nome, esvaziar e excluir (incluindo versões), e as abas Visão geral, Propriedades, Permissões e Gerenciamento.
- **Objetos**: navegação por pastas, busca por prefixo, listagem plana, paginação, versões, envio de arquivos e pastas com multipart, download direto ou em ZIP, copiar, mover, renomear e excluir em lote.
- Links pré-assinados de GET e PUT.
- Painel do objeto com detalhes, prévia (imagem, vídeo, áudio, PDF, texto, JSON, CSV e hexdump), edição de texto, propriedades, tags e versões.
- Painel de transferências, paleta de comandos (Ctrl K), menu lateral recolhível (Ctrl B), tema claro/escuro/sistema e densidade.
- Imagem Docker com nginx e script `npm run seed` com buckets de exemplo.
