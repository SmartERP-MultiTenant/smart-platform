# ==========================================
# 1. Dependencies & Build Stage (Node.js 20 Alpine)
# ==========================================
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies needed for node-gyp and native builds if any
RUN apk add --no-cache libc6-compat

# Allocate 4GB heap memory for Next.js build
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (legacy-peer-deps for React 18/Next 15 ecosystem packages)
RUN npm ci --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Set dummy env vars required during Next.js SSG / build time
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXTAUTH_SECRET=build-time-temporary-secret-32-chars-long
ENV APP_URL=http://localhost:4002
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy

# Build Next.js application
RUN npx next build

# ==========================================
# 2. Production Runner Stage
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4002

RUN apk add --no-cache libc6-compat

# Copy production files
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/next.config.js ./
COPY --from=build /app/next-i18next.config.js ./
COPY --from=build /app/locales ./locales
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4002

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
