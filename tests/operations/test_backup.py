import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('backup', Path(__file__).parents[2] / 'scripts/backup-database.py')
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)

class BackupSafety(unittest.TestCase):
    def test_wrong_project_refused(self):
        with self.assertRaises(ValueError):
            backup.connection('postgresql://postgres.other:secret@pool.example:5432/postgres', 'expected')
    def test_encoded_credentials_and_tls(self):
        env = backup.connection('postgresql://postgres.expected:p%40ss@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres', 'expected')
        self.assertEqual(env['PGPASSWORD'], 'p@ss')
        self.assertEqual(env['PGSSLMODE'], 'require')
    def test_non_postgres_refused(self):
        with self.assertRaises(ValueError):
            backup.connection('https://postgres.expected:p@pool.example/postgres', 'expected')
    def test_expected_user_wrong_host_refused(self):
        with self.assertRaises(ValueError):
            backup.connection('postgresql://postgres.expected:secret@attacker.example/postgres', 'expected')
    def test_direct_host_wrong_user_refused(self):
        with self.assertRaises(ValueError):
            backup.connection('postgresql://attacker:secret@db.expected.supabase.co/postgres', 'expected')
    def test_backup_inside_repo_refused(self):
        with self.assertRaises(ValueError):
            backup.validate_directory(Path(__file__).parents[2] / '.private-backup')
    def test_key_effective_first_line(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'key'
            p.write_bytes(b'x\n' + b'a' * 96)
            p.chmod(0o600)
            with self.assertRaises(ValueError):
                backup.validate_key(p)
            p.write_text('ab' * 32 + '\n')
            backup.validate_key(p)
            p.write_bytes(b'\0' * 64)
            with self.assertRaises(ValueError):
                backup.validate_key(p)
    def test_key_permissions(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'key'
            p.write_text('secret')
            p.chmod(0o644)
            with self.assertRaises(ValueError):
                backup.private_file(p)
            p.chmod(0o600)
            backup.private_file(p)
    def test_symlink_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'key'
            p.write_text('secret')
            p.chmod(0o600)
            link = Path(d) / 'link'
            link.symlink_to(p)
            with self.assertRaises(ValueError):
                backup.private_file(link)

if __name__ == '__main__':
    unittest.main()
