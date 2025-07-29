#!/bin/bash
echo "window.ENV = { SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };" > env.js
mkdir -p public
cp index.html public/
cp app.js public/
cp env.js public/