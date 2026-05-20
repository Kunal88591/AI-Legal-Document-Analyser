FROM node:20 AS build
WORKDIR /repo

COPY package.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN npm install --legacy-peer-deps

COPY apps/frontend ./apps/frontend
COPY packages/shared-types ./packages/shared-types

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm --workspace apps/frontend run build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80

