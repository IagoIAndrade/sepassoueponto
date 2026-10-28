# ---------- Build ----------
FROM node:22-slim AS build
WORKDIR /app

# Bun só para instalar as dependências a partir do bun.lock
COPY --from=oven/bun:1.2.19 /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

# Variáveis públicas (VITE_*) são embutidas no JS do navegador durante o build,
# por isso precisam existir aqui como build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

RUN node node_modules/vite/bin/vite.js build

# ---------- Runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# A saída do nitro é autocontida (não precisa de node_modules)
COPY --from=build /app/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
