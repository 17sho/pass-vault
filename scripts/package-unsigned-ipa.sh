#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-build/PassVault.xcarchive}"
OUTPUT_DIR="${2:-build/artifacts}"
APP_PATH="$ARCHIVE_PATH/Products/Applications/PassVault.app"
IPA_PATH="$OUTPUT_DIR/PassVault-unsigned.ipa"

if [[ ! -d "$APP_PATH" ]]; then
  echo "error: app not found at $APP_PATH" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR/Payload"
mkdir -p "$OUTPUT_DIR/Payload"
cp -R "$APP_PATH" "$OUTPUT_DIR/Payload/PassVault.app"
(
  cd "$OUTPUT_DIR"
  zip -qry "$(basename "$IPA_PATH")" Payload
  shasum -a 256 "$(basename "$IPA_PATH")" > "$(basename "$IPA_PATH").sha256"
)
rm -rf "$OUTPUT_DIR/Payload"
echo "$IPA_PATH"
