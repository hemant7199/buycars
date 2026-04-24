# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL will be injected at build time via --build-arg or Render env
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ─── Stage 2: Python backend + serve frontend static ─────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend into a static folder the backend can serve
COPY --from=frontend-build /app/frontend/dist ./static

# Expose port (Render injects PORT env var)
EXPOSE 5000

# Serve with gunicorn
CMD ["sh", "-c", "python -c 'import app; app.init_db()' && gunicorn app:app --bind 0.0.0.0:${PORT:-5000} --workers 2 --timeout 60"]
