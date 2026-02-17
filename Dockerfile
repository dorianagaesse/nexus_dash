FROM node:18-bullseye AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
ARG DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
