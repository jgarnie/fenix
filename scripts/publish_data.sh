#!/usr/bin/env bash
# Publica los datos generados en el repo jgarnie/fenix-data (GitHub Pages).
# Sube un único commit que reemplaza al anterior, así el historial no acumula
# copias de grid.bin.gz ni de las imágenes cada vez que se regeneran.
#
#   public/data/        → vallduixo/data/
#   public/bejis/data/  → bejis/data/
#
# Uso: scripts/publish_data.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="https://github.com/jgarnie/fenix-data.git"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/vallduixo" "$TMP/bejis"
cp -R "$ROOT/public/data" "$TMP/vallduixo/data"
cp -R "$ROOT/public/bejis/data" "$TMP/bejis/data"
touch "$TMP/.nojekyll"
cat > "$TMP/README.md" <<'EOF'
# fenix-data

Datos de los mapas de [fenix](https://github.com/jgarnie/fenix), generados con `scripts/build_data.py` y `scripts/trees.py`
y publicados con `scripts/publish_data.sh`. Este repo solo guarda la última versión (un único commit).
EOF

cd "$TMP"
git init -q -b main
git add -A
git commit -q -m "Datos generados ($(date +%Y-%m-%d))"
git push -q --force "$REPO" main
echo "Publicado en https://jgarnie.github.io/fenix-data/"
