#!/bin/bash
set -e

echo "=== AP Trainer setup ==="

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "Download it from https://nodejs.org (LTS version) then re-run this script."
  exit 1
fi

NODE_VER=$(node -v)
echo "Node.js $NODE_VER found."

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Download samples
echo ""
echo "Downloading audio samples (~30 MB)..."
bash download-samples.sh

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start the app:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5173 in your browser."
