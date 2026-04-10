FROM node:20-bullseye AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci \
  --fetch-retries=5 \
  --fetch-retry-factor=2 \
  --fetch-retry-mintimeout=20000 \
  --fetch-retry-maxtimeout=120000

COPY . .
ARG DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
ARG DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
ARG RESEND_API_KEY=ci-placeholder-resend-key
ARG AGENT_TOKEN_SIGNING_SECRET=ci-placeholder-agent-token-signing-secret-0123456789
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL
ENV RESEND_API_KEY=$RESEND_API_KEY
ENV AGENT_TOKEN_SIGNING_SECRET=$AGENT_TOKEN_SIGNING_SECRET

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
