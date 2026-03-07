#!/bin/bash
# Script para limpiar archivos de desarrollo creados por Docker

echo "🧹 Limpiando archivos de desarrollo..."

# Eliminar directorio .next si existe y tiene permisos de root
if [ -d ".next" ]; then
  echo "Eliminando .next (puede requerir sudo)..."
  sudo rm -rf .next 2>/dev/null || rm -rf .next
fi

# Eliminar otros archivos temporales si existen
[ -d ".turbo" ] && rm -rf .turbo
[ -f ".next.lock" ] && rm -f .next.lock

echo "✅ Limpieza completada"
