#!/usr/bin/env bash
set -euo pipefail

: "${PV_SOURCE:?PV_SOURCE is required}"
: "${PV_APP_ROOT:?PV_APP_ROOT is required}"
: "${PV_VERSION:?PV_VERSION is required}"
: "${PV_SERVICE_COMMAND:?PV_SERVICE_COMMAND is required}"
: "${PV_HEALTH_COMMAND:?PV_HEALTH_COMMAND is required}"
: "${PV_EVIDENCE:?PV_EVIDENCE is required}"
PV_HEALTH_ATTEMPTS=${PV_HEALTH_ATTEMPTS:-30}
PV_HEALTH_INTERVAL=${PV_HEALTH_INTERVAL:-1}
PV_POST_DEPLOY_COMMAND=${PV_POST_DEPLOY_COMMAND:-true}
[[ "$PV_HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || { echo 'invalid health attempts' >&2; exit 2; }
[[ "$PV_HEALTH_INTERVAL" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo 'invalid health interval' >&2; exit 2; }

[[ "$PV_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+]g[0-9a-f]{12})?$ ]] || { echo 'invalid version' >&2; exit 2; }
[[ -d "$PV_SOURCE/dist" && -d "$PV_SOURCE/apps/server" && -d "$PV_SOURCE/apps/admin-server" && -d "$PV_SOURCE/shared" && -f "$PV_SOURCE/package.json" ]] || { echo 'incomplete source' >&2; exit 2; }
source_version=$(node -p "require(process.argv[1]).version" "$PV_SOURCE/package.json")
release_version=${PV_VERSION%%+g*}
[[ "$source_version" == "$release_version" ]] || { echo 'package version mismatch' >&2; exit 2; }
grep -Fq "app.mjs?v=$release_version" "$PV_SOURCE/dist/index.html" || { echo 'asset version mismatch' >&2; exit 2; }

releases="$PV_APP_ROOT/releases"
current="$PV_APP_ROOT/current"
candidate="$releases/pass-vault-v2-linux-$PV_VERSION"
temporary="$candidate.tmp.$$"
old_target=''
health=false
rolled_back=false
status=FAIL
mkdir -p "$releases" "$(dirname "$PV_EVIDENCE")"
if [[ -L "$current" ]]; then old_target=$(readlink -f "$current"); elif [[ -e "$current" ]]; then echo 'current must be a symlink' >&2; exit 2; fi

write_evidence(){
  local at
  at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{\n  "at": "%s",\n  "version": "%s",\n  "status": "%s",\n  "health": %s,\n  "rolledBack": %s\n}\n' "$at" "$PV_VERSION" "$status" "$health" "$rolled_back" >"$PV_EVIDENCE"
  chmod 0600 "$PV_EVIDENCE"
}
rollback(){
  if [[ -n "$old_target" && -d "$old_target" ]]; then
    ln -s "$old_target" "$current.rollback.$$"
    mv -Tf "$current.rollback.$$" "$current"
    if bash -c "$PV_SERVICE_COMMAND"; then
      rolled_back=true
    else
      status=ROLLBACK_FAILED
      rolled_back=false
    fi
  else
    status=ROLLBACK_FAILED
  fi
  write_evidence
}
trap 'rm -rf "$temporary"' EXIT

rm -rf "$temporary"
mkdir -p "$temporary/apps"
cp -a "$PV_SOURCE/dist" "$temporary/dist"
cp -a "$PV_SOURCE/apps/server" "$temporary/apps/server"
cp -a "$PV_SOURCE/apps/admin-server" "$temporary/apps/admin-server"
cp -a "$PV_SOURCE/shared" "$temporary/shared"
cp -a "$PV_SOURCE/package.json" "$temporary/package.json"
[[ ! -f "$PV_SOURCE/package-lock.json" ]] || cp -a "$PV_SOURCE/package-lock.json" "$temporary/package-lock.json"
if [[ -f "$temporary/package-lock.json" ]]; then
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$temporary"
fi
find "$temporary" -type d -exec chmod 0755 {} +
find "$temporary" -type f -exec chmod 0644 {} +
chown -R "$(id -u):$(id -g)" "$temporary"
for asset in index.html theme-init.js app.mjs style.css app-shell.css; do [[ -r "$temporary/dist/$asset" ]] || { echo "missing asset: $asset" >&2; rollback; exit 1; }; done
if [[ -e "$candidate" ]]; then echo "release already exists: $candidate" >&2; exit 2; fi
mv "$temporary" "$candidate"
ln -s "$candidate" "$current.next.$$"
mv -Tf "$current.next.$$" "$current"
if ! bash -c "$PV_SERVICE_COMMAND"; then rollback; exit 1; fi
for ((attempt=1;attempt<=PV_HEALTH_ATTEMPTS;attempt++)); do
  if bash -c "$PV_HEALTH_COMMAND"; then
    health=true
    if bash -c "$PV_POST_DEPLOY_COMMAND"; then
      status=PASS
      write_evidence
      exit 0
    fi
    health=false
    rollback
    exit 1
  fi
  (( attempt == PV_HEALTH_ATTEMPTS )) || sleep "$PV_HEALTH_INTERVAL"
done
rollback
exit 1
