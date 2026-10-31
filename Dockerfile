# Veyloria Online: builds the web game and runs the server that hosts it on one port
# (the game page, the WebSocket and /healthz). Put it behind HTTPS on any Docker host so
# players can open the URL in a browser; the browser uses wss:// automatically.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Accounts, guilds and the market are saved here: mount a persistent volume on /data.
ENV PORT=7171 HOST=0.0.0.0 VEYLORIA_DATA=/data
VOLUME ["/data"]
EXPOSE 7171
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/run-ts.mjs", "./server/main.ts"]
