import io
import unittest
from contextlib import redirect_stdout
from unittest import mock

import generate_snippets


class NormalizeStateInfoTests(unittest.TestCase):
    def test_normalizes_names_only_mapping(self):
        state_info = generate_snippets._normalize_state_info(
            {'file': ['managed', 'directory', 'managed'], 'pkg': ('installed',)}
        )

        self.assertEqual(state_info['file'], ['directory', 'managed'])
        self.assertEqual(state_info['pkg'], ['installed'])

    def test_normalizes_doc_mapping(self):
        state_info = generate_snippets._normalize_state_info(
            {'service': {'running': 'doc', 'dead': 'doc'}}
        )

        self.assertEqual(state_info['service'], ['dead', 'running'])

    def test_rejects_invalid_top_level_type(self):
        with self.assertRaises(TypeError):
            generate_snippets._normalize_state_info(['file.managed'])


class LoaderFallbackTests(unittest.TestCase):
    def test_builds_state_info_from_sys_lists(self):
        state_info = generate_snippets._build_state_info_from_function_list(
            ['file', 'pkg'],
            ['file.managed', 'file.directory', 'pkg.installed', 'cmd.run'],
        )

        self.assertEqual(state_info['file'], ['directory', 'managed'])
        self.assertEqual(state_info['pkg'], ['installed'])
        self.assertEqual(state_info['cmd'], ['run'])

    def test_auto_strategy_falls_back_to_loader(self):
        with mock.patch.object(
            generate_snippets,
            '_load_state_info_via_baredoc',
            side_effect=RuntimeError('baredoc unavailable'),
        ), mock.patch.object(
            generate_snippets,
            '_load_state_info_via_loader',
            return_value={'file': ['managed']},
        ):
            state_info, source = generate_snippets._load_state_info(
                '/etc/salt/minion',
                strategy='auto',
            )

        self.assertEqual(source, 'sys.list_state_*')
        self.assertEqual(state_info, {'file': ['managed']})


class CliTests(unittest.TestCase):
    def test_help_exits_cleanly_without_importing_salt(self):
        with redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as context:
                generate_snippets.main(['--help'])

        self.assertEqual(context.exception.code, 0)


if __name__ == '__main__':
    unittest.main()