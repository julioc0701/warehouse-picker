#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "======================================================="
echo "         SISTEMA DE PUBLICACAO PARA PRODUCAO"
echo "======================================================="
echo
echo "Railway usa branch: nvs-production"
echo
echo "Este script vai:"
echo "  1. Salvar mudancas na branch atual"
echo "  2. Enviar branch main para GitHub"
echo "  3. Criar/atualizar branch nvs-production local"
echo "  4. Fazer push --force para nvs-production"
echo "  5. Voltar para main"
echo
echo "ATENCAO: push --force altera branch de producao."
read -r -p "> Voce testou localmente e quer PUBLICAR agora? [S/N]: " confirm
case "$confirm" in
  S|s) ;;
  *)
    echo "Publicacao cancelada."
    exit 0
    ;;
esac

echo
echo "[1/5] Salvando codigo atual..."
git add .
if ! git commit -m "Auto-save antes de publicar"; then
  echo "Nenhuma mudanca pendente para commitar. Seguindo."
fi

echo
echo "[2/5] Atualizando backup da branch main..."
git push origin main

echo
echo "[3/5] Preparando branch de producao..."
git checkout -B nvs-production

echo
echo "[4/5] Enviando para Railway via nvs-production..."
git push origin nvs-production --force

echo
echo "[5/5] Retornando para main..."
git checkout main

echo
echo "======================================================="
echo "PUBLICACAO CONCLUIDA. Railway iniciara novo build."
echo "======================================================="
