#!/usr/bin/env python3
"""Private encrypted logical backup. No database writes; see operations runbook."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlparse, unquote

IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.158'

def private_file(path):
    info = Path(path).lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Expected an owner-only regular file')

def validate_key(path):
    private_file(path)
    value = Path(path).read_bytes()
    if not re.fullmatch(rb'(?:[a-fA-F0-9]{2}){32,128}\n?', value):
        raise ValueError('Key must be one line of at least 64 hex characters')

def connection(url, project):
    u = urlparse(url)
    if not re.fullmatch(r'[a-z0-9]+', project):
        raise ValueError('Invalid expected project')
    username = unquote(u.username or '')
    if (u.scheme not in ('postgres', 'postgresql') or not u.password
        or not u.hostname or u.path != '/postgres'
        or u.query or u.fragment
        or not ((username == 'postgres' and u.hostname == 'db.' + project + '.supabase.co')
                    or (username == 'postgres.' + project and re.fullmatch(r'[a-z0-9-]+\.pooler\.supabase\.com', u.hostname)))):
        raise ValueError('Database connection does not match expected project')
    return {**os.environ, 'PGHOST': u.hostname, 'PGPORT': str(u.port or 5432),
            'PGUSER': username, 'PGPASSWORD': unquote(u.password), 'PGDATABASE': 'postgres',
            'PGCONNECT_TIMEOUT': '10', 'PGSSLMODE': 'require'}

def run(args, **kwargs):
    # Never print stderr: database and encryption clients may echo secrets or rows.
    result = subprocess.run(args, stderr=subprocess.PIPE, timeout=900, **kwargs)
    if result.returncode:
        raise RuntimeError('Backup command failed; sensitive diagnostic output suppressed')
    return result

def pg_command(program, *args):
    cmd = ['docker', 'run', '--rm', '--network', 'host']
    for key in ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGCONNECT_TIMEOUT', 'PGSSLMODE'):
        cmd += ['-e', key]
    return cmd + [IMAGE, program, *args]

def validate_directory(directory):
    resolved = Path(directory).resolve()
    if any((parent / '.git').exists() for parent in (resolved, *resolved.parents)):
        raise ValueError('Backups must be stored outside any Git checkout')
    return resolved

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    private_file(args.config)
    config = json.loads(args.config.read_text())
    source = Path(config['env_file'])
    # The existing workspace env may have broader permissions; never copy it or log its content.
    values = dict(line.split('=', 1) for line in source.read_text().splitlines()
                  if '=' in line and not line.lstrip().startswith('#'))
    env = connection(values['SUPABASE_DB_URL'].strip().strip('\"\''), config['expected_project'])
    directory = validate_directory(config['backup_dir'])
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.is_symlink() or directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        raise ValueError('Backup directory must be owner-only')
    key = Path(config['key_file'])
    validate_key(key)
    with (directory / '.backup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        version = run(pg_command('psql', '-X', '-At', '-c', 'show server_version_num'), env=env, stdout=subprocess.PIPE).stdout.decode().strip()
        if not version.isdigit() or not 170000 <= int(version) < 180000:
            raise ValueError('Backup client is pinned for PostgreSQL 17')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
        destination = directory / stamp
        with tempfile.TemporaryDirectory(prefix='.pending-', dir=directory) as temp:
            plain = Path(temp) / 'database.dump'
            snapshot = Path(temp) / 'snapshot'
            snapshot.mkdir(mode=0o700)
            encrypted = snapshot / 'backup.dump.gpg'
            with plain.open('xb') as output:
                run(pg_command('pg_dump', '-Fc', '-n', 'public', '-n', 'auth', '-n', 'storage', '--lock-wait-timeout=30000'), env=env, stdout=output)
            # Listing validates custom-format archive before encryption.
            with plain.open('rb') as source_dump:
                run(['docker', 'run', '--rm', '-i', IMAGE, 'pg_restore', '--list'], stdin=source_dump, stdout=subprocess.DEVNULL)
            run(['gpg', '--batch', '--yes', '--pinentry-mode', 'loopback', '--passphrase-file', str(key),
                 '--symmetric', '--cipher-algo', 'AES256', '--output', str(encrypted), str(plain)], stdout=subprocess.DEVNULL)
            # Authentication and plaintext comparison prove the encrypted artifact is recoverable now.
            recovered = Path(temp) / 'verify.dump'
            with recovered.open('xb') as output:
                run(['gpg', '--batch', '--pinentry-mode', 'loopback', '--passphrase-file', str(key), '--decrypt', str(encrypted)], stdout=output)
            if digest(plain) != digest(recovered):
                raise RuntimeError('Encryption round trip mismatch')
            receipt = {'created_at': stamp, 'server_version_num': int(version), 'schemas': ['public', 'auth', 'storage'],
                       'encrypted_bytes': encrypted.stat().st_size, 'sha256': digest(encrypted),
                       'encryption_verified': True, 'scope': 'Logical schemas and rows; storage object bytes and platform configuration excluded'}
            pending_manifest = snapshot / 'backup.json'
            pending_manifest.write_text(json.dumps(receipt, indent=2) + '\n')
            # Publish archive and receipt together; interrupted work remains .pending-* only.
            snapshot.rename(destination)
        print(json.dumps({'backup': str(destination.relative_to(directory) / 'backup.dump.gpg'), 'bytes': receipt['encrypted_bytes'], 'encryption_verified': True}))

if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('Backup failed; no success reported. Check private configuration, connectivity, disk and Docker.', file=sys.stderr)
        sys.exit(1)
