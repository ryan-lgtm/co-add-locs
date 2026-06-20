#!/bin/bash

# Ensure we're in the script's directory
cd "$(dirname "$0")"

echo "🏔️  Colorado Sucks. Let's Add Locations. 🏔️"
echo "Checking dependencies..."

if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node.js to use this application."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting application..."
npm start
