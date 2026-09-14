"""Create a project-isolated PostgreSQL cluster and untracked development secrets."""
from pathlib import Path
import os
import secrets
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
local = root / '.local'
local.mkdir(exist_ok=True)
envfile = root / '.env.local'
if not envfile.exists():
    envfile.write_text('DJANGO_DEBUG=true\nDJANGO_SECRET_KEY=' + secrets.token_urlsafe(48) + '\nPGHOST=127.0.0.1\nPGPORT=55432\nPGDATABASE=marine\nPGUSER=marine\nPGPASSWORD=' + secrets.token_urlsafe(36) + '\n', encoding='utf-8')
values = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line and not line.startswith('#'))
pgbin = Path(os.environ.get('PG_BIN', str(Path(shutil.which('psql') or 'D:/Program Files/PostgreSQL/18/bin/psql.exe').parent)))
data = local / 'postgres'
if not (data / 'PG_VERSION').exists():
    pw = local / 'init-password.tmp'
    pw.write_text(values['PGPASSWORD'], encoding='utf-8')
    try:
        subprocess.run([str(pgbin / 'initdb.exe'), '-D', str(data), '-U', values['PGUSER'], '--pwfile', str(pw), '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'], check=True)
    finally:
        pw.unlink(missing_ok=True)
if subprocess.run([str(pgbin / 'pg_ctl.exe'), '-D', str(data), 'status'], capture_output=True).returncode != 0:
    # Hidden detached process on Windows; wait for readiness via pg_isready.
    subprocess.Popen([str(pgbin / 'postgres.exe'), '-D', str(data), '-p', values['PGPORT'], '-h', '127.0.0.1'], stdout=(local / 'postgres.log').open('a'), stderr=subprocess.STDOUT, creationflags=0x08000000 if os.name == 'nt' else 0)
    import time
    for _ in range(40):
        if subprocess.run([str(pgbin / 'pg_isready.exe'), '-h', '127.0.0.1', '-p', values['PGPORT']], capture_output=True).returncode == 0:
            break
        time.sleep(.25)
env = {**os.environ, **{k: v for k, v in values.items() if k.startswith('PG')}}
found = subprocess.run([str(pgbin / 'psql.exe'), '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='marine'"], env=env, capture_output=True, text=True, check=True).stdout
if '1' not in found:
    subprocess.run([str(pgbin / 'createdb.exe'), 'marine'], env=env, check=True)
print('Local PostgreSQL ready on 127.0.0.1:' + values['PGPORT'] + '; secrets stored in app/.env.local (not printed).')
