# Deployment Guide - Prisma Migrations

## Overview

When deploying to production, you need to:
1. **Generate Prisma Client** - Creates TypeScript types from your schema
2. **Run Migrations** - Applies database schema changes

## Important Commands

### Development (Local)
```bash
# Create and apply migration
npm run prisma:migrate:dev --name migration_name

# Generate Prisma Client
npm run prisma:generate
```

### Production (Live Database)
```bash
# Apply pending migrations (does NOT create new migrations)
npm run prisma:migrate:deploy

# Generate Prisma Client
npm run prisma:generate
```

**⚠️ NEVER use `prisma migrate dev` in production!** It can cause data loss.

## Deployment Options

### Option 1: Pre-build Scripts (Recommended)

The `package.json` already includes:
- `postinstall`: Runs `prisma generate` after `npm install`
- `prebuild`: Runs `prisma generate` before `npm run build`
- `db:migrate`: Runs both migration and generate

**Deployment flow:**
```bash
npm install          # Automatically runs prisma generate
npm run build        # Automatically runs prisma generate again
npm run db:migrate   # Apply migrations to production DB
npm run start:prod   # Start the application
```

### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (runs prisma generate via postinstall)
RUN npm ci --only=production

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
```

### Option 3: CI/CD Pipeline (GitHub Actions, GitLab CI, etc.)

Example GitHub Actions workflow:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate Prisma Client
        run: npm run prisma:generate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Run migrations
        run: npm run prisma:migrate:deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Build
        run: npm run build
      
      - name: Deploy to server
        # Your deployment steps here
```

### Option 4: Manual Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Generating Prisma Client..."
npx prisma generate

echo "Running migrations..."
npx prisma migrate deploy

echo "Building application..."
npm run build

echo "Starting application..."
npm run start:prod
```

Make it executable: `chmod +x deploy.sh`

## Environment Variables

Ensure your production `.env` has:
```env
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
```

## Best Practices

1. **Always test migrations locally first** with `prisma migrate dev`
2. **Use `prisma migrate deploy` in production** (not `dev`)
3. **Generate Prisma Client before building** (already configured)
4. **Run migrations before starting the app** in production
5. **Backup your database** before running migrations in production
6. **Use transaction rollback** for critical migrations

## Troubleshooting

### Migration fails in production
- Check database connection string
- Verify migrations are committed to git
- Ensure database user has migration permissions

### Prisma Client not found
- Run `npm run prisma:generate` manually
- Check `postinstall` script is working
- Verify `generated/prisma` directory exists

