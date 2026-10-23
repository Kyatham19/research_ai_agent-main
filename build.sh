#!/usr/bin/env bash
# Build script for Render / Railway / Cloud deployment
set -o errexit

echo "==> Building frontend assets..."
cd frontend
npm install
npm run build
cd ..

echo "==> Installing Python dependencies..."
cd backend
pip install -r requirements.txt
cd ..

echo "==> Build complete!"
