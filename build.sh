#!/bin/bash
# Create env.js with fallback key if environment variable is not set
if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "window.ENV = { SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5bm9ienZiaHNkbmZuZmVlY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMzAwNzYsImV4cCI6MjA2NzkwNjA3Nn0.-OBS5v4zMtlmMD-qtkom8tqPhYNyVCnIrJWolNbtG5A' };" > env.js
else
    echo "window.ENV = { SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };" > env.js
fi
mkdir -p public
cp index.html public/
cp app.js public/
cp env.js public/