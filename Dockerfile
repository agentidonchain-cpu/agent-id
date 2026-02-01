# Agent007 - Dockerfile
# Multi-stage build for production-ready container

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

# Add non-root user for security
RUN addgroup -g 1001 -S agent007 && \
    adduser -S agent007 -u 1001 -G agent007

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=agent007:agent007 /app/dist ./dist
COPY --from=builder --chown=agent007:agent007 /app/node_modules ./node_modules
COPY --from=builder --chown=agent007:agent007 /app/package.json ./

# Copy database files
COPY --chown=agent007:agent007 database ./database

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER agent007

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/index.js"]

# =============================================================================
# DEVELOPMENT STAGE
# =============================================================================
FROM node:20-alpine AS development

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src
COPY database ./database

# Set environment
ENV NODE_ENV=development
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start with hot reload
CMD ["npm", "run", "dev"]
