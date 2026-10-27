# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.29-alpine
# O template é processado com envsubst na inicialização do container (LOCALSTACK_UPSTREAM, DNS_RESOLVER).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# host:porta do LocalStack (sem http://)
ENV LOCALSTACK_UPSTREAM=host.docker.internal:4566
# DNS usado pelo proxy /aws-s3 (127.0.0.11 = DNS interno do Docker Compose)
ENV DNS_RESOLVER=127.0.0.11
EXPOSE 80
