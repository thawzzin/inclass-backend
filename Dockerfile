FROM --platform=linux/amd64 node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN DIRECT_URL=postgresql://unused:unused@localhost:5432/unused?sslmode=require pnpm prisma:generate \
    && pnpm build \
    && pnpm prune --prod

FROM --platform=linux/amd64 node:24-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]
