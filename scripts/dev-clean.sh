#!/bin/bash
# Script para limpiar archivos de desarrollo creados por Docker

echo "🧹 Limpiando archivos de desarrollo..."

if [ -d ".next" ]; then
  rm -rf .next 2>/dev/null || sudo rm -rf .next
fi

[ -d ".turbo" ] && rm -rf .turbo

echo "✅ Limpieza completada"
