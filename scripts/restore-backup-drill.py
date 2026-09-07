#!/usr/bin/env python3
"""Restore an encrypted backup ONLY into a disposable database in the named local Docker lab."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup-database.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
CONTAINER = 'supabase_db_vmp-five-role-hardening'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--archive', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    backup.private_file(args.config)
    backup.private_file(args.archive)
    config = json.loads(args.config.read_text())
    key = Path(config['key_file'])
    backup.validate_key(key)
    directory = backup.validate_directory(config['backup_dir'])
    if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        raise ValueError('Restore temporary directory must be owner-only')
    receipt_path = args.archive.with_suffix('').with_suffix('.json')
    backup.private_file(receipt_path)
    receipt = json.loads(receipt_path.read_text())
    with args.archive.open('rb') as encrypted:
        digest = hashlib.file_digest(encrypted, 'sha256').hexdigest()
    if digest != receipt['sha256']:
        raise ValueError('Archive checksum mismatch')
    # A fixed local container/socket, never a URL or production environment variable.
    base = ['docker', 'exec', '-i', CONTAINER]
    database = 'vmp_backup_drill_' + secrets.token_hex(8)
    def psql(db, sql):
        return backup.run(base + ['psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', db,
                                 '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=sql.encode(), stdout=subprocess.PIPE).stdout.decode().strip()
    identity = psql('postgres', "select current_database()='postgres' and current_setting('server_version_num')::int between 170000 and 179999 and exists(select 1 from public.system_config where key='five_role_test_fixture' and value='true'::jsonb);")
    if identity != 't':
        raise ValueError('Refusing non-fixture local database server')
    created = False
    try:
        with tempfile.TemporaryDirectory(prefix='.restore-', dir=directory) as temp:
            archive = Path(temp) / 'database.dump'
            with archive.open('xb') as output:
                backup.run(['gpg', '--batch', '--pinentry-mode', 'loopback', '--passphrase-file', str(key),
                            '--decrypt', str(args.archive)], stdout=output)
            psql('postgres', f'create database {database} template template0;')
            created = True
            psql(database, '''drop schema public cascade;
create schema extensions;
create extension vector with schema extensions;
create extension unaccent with schema extensions;
create extension pg_trgm with schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;''')
            with archive.open('rb') as source:
                backup.run(base + ['pg_restore', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', database,
                                   '--no-owner', '--no-acl', '--exit-on-error'], stdin=source, stdout=subprocess.DEVNULL)
            table_count = int(psql(database, "select count(*) from pg_tables where schemaname in ('public','auth','storage');"))
            if table_count < 1:
                raise ValueError('Restored archive contains no application tables')
            # No row values leave the disposable database; verify all tables can be read.
            psql(database, "do $$ declare r record; n bigint; begin for r in select schemaname,tablename from pg_tables where schemaname in ('public','auth','storage') loop execute format('select count(*) from %I.%I',r.schemaname,r.tablename) into n; end loop; end $$;")
            result = {'archive': args.archive.name, 'restored_tables': table_count,
                      'restore_verified': True, 'target': 'disposable local PostgreSQL 17 database',
                      'limitations': 'Owner/ACL restoration and storage object bytes are not exercised'}
    finally:
        if created:
            try:
                psql('postgres', f'drop database {database} with (force);')
            except Exception:
                print(f'LOCAL LAB CLEANUP REQUIRED: {CONTAINER} database {database}. No success receipt written.')
                raise
    result['disposable_database_removed'] = True
    output = args.archive.with_suffix('').with_suffix('.restore.json')
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('Restore drill failed; production was not a restore target. Sensitive diagnostics suppressed.')
        raise SystemExit(1)
