FROM node:20-alpine
# iptables: chỉ dùng khi tập dượt 1 máy để mô phỏng "rút mạng" một máy
RUN apk add --no-cache iptables
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY router.mjs ./
EXPOSE 5432 5433 8008
CMD ["node", "router.mjs"]
