#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

fail(){ printf 'Pass Vault layout migration failed: %s\n' "$*" >&2; exit 1; }
[[ ${EUID:-$(id -u)} -eq 0 ]] || fail 'run as root'
[[ ${PV_MIGRATION_MAINTENANCE_CONFIRMED:-} == YES ]] || fail 'set PV_MIGRATION_MAINTENANCE_CONFIRMED=YES after the reverse proxy is in maintenance mode'

SOURCE_ROOT=${PV_SOURCE_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}
OLD_APP=${PV_OLD_APP_ROOT:-/opt/pass-vault-v2}
OLD_DATA=${PV_OLD_DATA_ROOT:-/var/lib/pass-vault-v2}
OLD_ENV=${PV_OLD_ENV_FILE:-/etc/pass-vault-v2/pass-vault-v2.env}
NEW_APP=${PV_NEW_APP_ROOT:-/opt/pass-vault}
NEW_DATA=${PV_NEW_DATA_ROOT:-/var/lib/pass-vault}
NEW_CONFIG=${PV_NEW_CONFIG_ROOT:-/etc/pass-vault}
NEW_ENV=${PV_NEW_ENV_FILE:-$NEW_CONFIG/pass-vault.env}
BACKUP_ROOT=${PV_LAYOUT_BACKUP_ROOT:-/var/backups/pass-vault}
OLD_MAIN_UNIT=${PV_OLD_MAIN_UNIT:-pass-vault-v2.service}
OLD_ADMIN_UNIT=${PV_OLD_ADMIN_UNIT:-pass-vault-admin.service}
NEW_MAIN_UNIT=${PV_NEW_MAIN_UNIT:-pass-vault.service}
NEW_ADMIN_UNIT=${PV_NEW_ADMIN_UNIT:-pass-vault-admin.service}
UNIT_DIR=${PV_SYSTEMD_UNIT_DIR:-/etc/systemd/system}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=$BACKUP_ROOT/layout-$STAMP
STOP_ATTEMPTED=0
COMPLETED=0
OLD_MAIN_WAS_ACTIVE=0
OLD_ADMIN_WAS_ACTIVE=0

rollback_on_exit(){
  local status=$?
  if (( status != 0 && STOP_ATTEMPTED && ! COMPLETED )); then
    printf 'Migration failed after shutdown; restoring legacy units and services.\n' >&2
    cp -a -- "$BACKUP_DIR/$OLD_MAIN_UNIT" "$UNIT_DIR/$OLD_MAIN_UNIT" 2>/dev/null || true
    cp -a -- "$BACKUP_DIR/$OLD_ADMIN_UNIT" "$UNIT_DIR/$OLD_ADMIN_UNIT" 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
    (( OLD_MAIN_WAS_ACTIVE )) && systemctl start "$OLD_MAIN_UNIT" 2>/dev/null || true
    (( OLD_ADMIN_WAS_ACTIVE )) && systemctl start "$OLD_ADMIN_UNIT" 2>/dev/null || true
  fi
  return "$status"
}
trap rollback_on_exit EXIT

for command in systemctl systemd-analyze sqlite3 python3 cp install id getent grep; do command -v "$command" >/dev/null || fail "missing command: $command"; done
for path in "$OLD_APP" "$OLD_DATA" "$OLD_ENV" "$SOURCE_ROOT/deploy/pass-vault.service" "$SOURCE_ROOT/deploy/pass-vault-admin.service"; do [[ -e $path ]] || fail "missing source: $path"; done
for path in "$NEW_APP" "$NEW_DATA" "$NEW_CONFIG"; do [[ ! -e $path ]] || fail "destination already exists: $path"; done

APP_USER=$(systemctl show "$OLD_MAIN_UNIT" -p User --value)
[[ -n $APP_USER ]] || fail "$OLD_MAIN_UNIT has no User="
APP_GROUP=$(systemctl show "$OLD_MAIN_UNIT" -p Group --value)
[[ -n $APP_GROUP ]] || APP_GROUP=$(id -gn "$APP_USER")
id "$APP_USER" >/dev/null || fail "service user does not exist: $APP_USER"
getent group "$APP_GROUP" >/dev/null || fail "service group does not exist: $APP_GROUP"

sqlite3 "$OLD_DATA/pass-vault.sqlite" 'PRAGMA quick_check;' | grep -qx ok || fail 'source SQLite quick_check failed'
install -d -o root -g root -m 0700 "$BACKUP_DIR"
OLD_MAIN_FRAGMENT=$(systemctl show "$OLD_MAIN_UNIT" -p FragmentPath --value)
OLD_ADMIN_FRAGMENT=$(systemctl show "$OLD_ADMIN_UNIT" -p FragmentPath --value)
[[ -f $OLD_MAIN_FRAGMENT && -f $OLD_ADMIN_FRAGMENT ]] || fail 'legacy unit fragment missing'
for candidate in "$UNIT_DIR/$NEW_MAIN_UNIT" "$UNIT_DIR/$NEW_ADMIN_UNIT"; do
  if [[ -e $candidate && $candidate != "$OLD_MAIN_FRAGMENT" && $candidate != "$OLD_ADMIN_FRAGMENT" ]]; then
    fail "new unit destination already exists: $candidate"
  fi
done
cp -a -- "$OLD_MAIN_FRAGMENT" "$BACKUP_DIR/$OLD_MAIN_UNIT"
cp -a -- "$OLD_ADMIN_FRAGMENT" "$BACKUP_DIR/$OLD_ADMIN_UNIT"
cp -a -- "$OLD_ENV" "$BACKUP_DIR/"

systemctl is-active --quiet "$OLD_MAIN_UNIT" && OLD_MAIN_WAS_ACTIVE=1 || true
systemctl is-active --quiet "$OLD_ADMIN_UNIT" && OLD_ADMIN_WAS_ACTIVE=1 || true
STOP_ATTEMPTED=1
if ! systemctl stop "$OLD_ADMIN_UNIT" "$OLD_MAIN_UNIT"; then fail 'could not stop legacy services'; fi
for unit in "$OLD_ADMIN_UNIT" "$OLD_MAIN_UNIT"; do systemctl is-active --quiet "$unit" && fail "$unit is still active"; done

# The source remains untouched and is the rollback point until public writes resume.
install -d -o root -g "$APP_GROUP" -m 0750 "$NEW_APP/releases" "$NEW_CONFIG"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$NEW_DATA"
cp -a -- "$OLD_DATA"/. "$NEW_DATA"/
[[ -e "$OLD_APP/node" ]] && cp -a -- "$OLD_APP/node" "$NEW_APP/node"

SRC=$OLD_ENV DST=$NEW_ENV NEW_DATA=$NEW_DATA python3 - <<'PY'
import os, stat, tempfile
src, dst = os.environ['SRC'], os.environ['DST']
updates = {
    'DB_PATH': os.environ['NEW_DATA'] + '/pass-vault.sqlite',
    'ATTACHMENTS_DIR': os.environ['NEW_DATA'] + '/attachments',
    'SHARES_DIR': os.environ['NEW_DATA'] + '/shares',
}
st = os.stat(src)
lines = open(src, encoding='utf-8').read().splitlines()
out, seen = [], set()
for line in lines:
    key = line.split('=', 1)[0] if '=' in line else ''
    if key in updates:
        out.append(f'{key}={updates[key]}'); seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen: out.append(f'{key}={value}')
fd, tmp = tempfile.mkstemp(prefix='.pass-vault.env.', dir=os.path.dirname(dst))
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(out) + '\n'); handle.flush(); os.fsync(handle.fileno())
    os.chown(tmp, st.st_uid, st.st_gid); os.chmod(tmp, stat.S_IMODE(st.st_mode)); os.replace(tmp, dst)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

render_unit(){
  local source=$1 destination=$2
  APP_USER=$APP_USER APP_GROUP=$APP_GROUP NEW_APP=$NEW_APP NEW_DATA=$NEW_DATA NEW_ENV=$NEW_ENV NEW_MAIN_UNIT=$NEW_MAIN_UNIT \
  python3 - "$source" "$destination" <<'PY'
import os, pathlib, sys
src, dst = map(pathlib.Path, sys.argv[1:])
text = src.read_text(encoding='utf-8')
for old, new in {'@APP_USER@':os.environ['APP_USER'],'@APP_GROUP@':os.environ['APP_GROUP'],'@APP_DIR@':os.environ['NEW_APP'],'@DATA_DIR@':os.environ['NEW_DATA'],'@ENV_FILE@':os.environ['NEW_ENV'],'@MAIN_UNIT@':os.environ['NEW_MAIN_UNIT']}.items(): text=text.replace(old,new)
if '@' in '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('#')): raise SystemExit('unresolved unit placeholder')
tmp=dst.with_name('.'+dst.name+'.tmp'); tmp.write_text(text,encoding='utf-8'); os.chmod(tmp,0o644); os.replace(tmp,dst)
PY
}
render_unit "$SOURCE_ROOT/deploy/pass-vault.service" "$UNIT_DIR/$NEW_MAIN_UNIT"
render_unit "$SOURCE_ROOT/deploy/pass-vault-admin.service" "$UNIT_DIR/$NEW_ADMIN_UNIT"
systemd-analyze verify "$UNIT_DIR/$NEW_MAIN_UNIT" "$UNIT_DIR/$NEW_ADMIN_UNIT"
sqlite3 "$NEW_DATA/pass-vault.sqlite" 'PRAGMA quick_check;' | grep -qx ok || fail 'destination SQLite quick_check failed'
[[ -d "$NEW_DATA/attachments" ]] || fail 'destination attachments directory missing'
[[ -d "$NEW_DATA/shares" ]] || fail 'destination shares directory missing'
systemctl daemon-reload
COMPLETED=1
printf 'Migration copy completed. Legacy services remain stopped.\nBackup: %s\nUser: %s Group: %s\nInstall a release, then start and validate the new services before disabling legacy units.\n' "$BACKUP_DIR" "$APP_USER" "$APP_GROUP"
