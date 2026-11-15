# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="TanStack"

# TanStack app lives here
WORKDIR /app

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Vite and Nitro are dev dependencies, so install them before the production env is set.
COPY bun.lock package-lock.json package.json ./
ENV NODE_ENV=development
RUN bun install --frozen-lockfile

# Copy application code
COPY . .

# Build the listening server at .output/server/index.mjs
ENV NITRO_PRESET=bun
RUN bun run build && test -f .output/server/index.mjs

# Final stage for app image
FROM base

# Copy built application and the installed modules the server entry imports
COPY --from=build /app /app

# Fly routes to this port. Nitro listens on PORT and binds HOST.
ENV PORT=8080
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
EXPOSE 8080
CMD [ "bun", ".output/server/index.mjs" ]
