## O que muda

<!-- Descreva a mudança e o porquê. Se fechar uma issue: "Fecha #123". -->

## Como testar

<!-- Passos para reproduzir. Ex.: npm run seed -- --reset, abrir o bucket X, clicar em Y. -->

## Screenshots

<!-- Para mudanças visuais: antes/depois, no tema claro e no escuro. -->

## Checagem

- [ ] `npm run build` passa sem erros de tipo
- [ ] `docker compose build` continua compilando
- [ ] Testado no LocalStack com os buckets do `npm run seed`
- [ ] Mudanças nos proxies feitas no `vite.config.ts` e no `nginx/default.conf.template`
- [ ] Ações que gravam respeitam o modo somente leitura
- [ ] Funciona no tema claro e no escuro
- [ ] CHANGELOG.md e README atualizados, se for o caso
