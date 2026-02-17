FROM node:22-slim

# Install system dependencies
# python3, make, g++ are often needed for native modules and for the python static server fallback
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy package files first
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Expose the API port
EXPOSE 4000

# Start the server
CMD ["pnpm", "start"]

