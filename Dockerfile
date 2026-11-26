FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
