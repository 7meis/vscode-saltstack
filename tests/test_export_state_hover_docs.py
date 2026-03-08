import unittest
from unittest import mock

from scripts import export_state_hover_docs


class NormalizeStateHoverDocsTests(unittest.TestCase):
    def test_normalizes_state_docs_and_filters_non_function_keys(self):
        state_docs = export_state_hover_docs._normalize_state_docs(
            {
                'file.managed': ' Manage a file.\n\nKeep ownership in sync. ',
                'file': 'module-level docs should be ignored',
            }
        )

        self.assertEqual(
            state_docs,
            {'file.managed': 'Manage a file.\n\nKeep ownership in sync.'},
        )

    def test_normalizes_state_arguments_from_baredoc_shape(self):
        state_arguments = export_state_hover_docs._normalize_state_arguments(
            {
                'file': [
                    {'managed': {'name': None, 'source': None}},
                    {'absent': {'name': None}},
                ],
                'service': {'running': {'name': None, 'enable': False}},
            }
        )

        self.assertEqual(state_arguments['file.managed'], ['name', 'source'])
        self.assertEqual(state_arguments['file.absent'], ['name'])
        self.assertEqual(state_arguments['service.running'], ['name', 'enable'])


class BuildStateHoverDocsTests(unittest.TestCase):
    def test_combines_docs_and_arguments(self):
        with mock.patch.object(
            export_state_hover_docs,
            '_load_state_docs',
            return_value=({'file.managed': 'Manage a file.'}, 'baredoc.state_docs'),
        ), mock.patch.object(
            export_state_hover_docs,
            '_load_state_arguments_via_baredoc',
            return_value=({'file.managed': ['name', 'source']}, 'baredoc.list_states'),
        ):
            payload = export_state_hover_docs.build_state_hover_docs('/etc/salt/minion')

        self.assertEqual(payload['_meta']['docSource'], 'baredoc.state_docs')
        self.assertEqual(payload['_meta']['argumentSource'], 'baredoc.list_states')
        self.assertEqual(payload['entries']['file.managed']['doc'], 'Manage a file.')
        self.assertEqual(payload['entries']['file.managed']['args'], ['name', 'source'])

    def test_argument_loading_failure_is_non_fatal(self):
        with mock.patch.object(
            export_state_hover_docs,
            '_load_state_docs',
            return_value=({'service.running': 'Ensure a service is running.'}, 'sys.state_doc'),
        ), mock.patch.object(
            export_state_hover_docs,
            '_load_state_arguments_via_baredoc',
            side_effect=RuntimeError('not available'),
        ):
            payload = export_state_hover_docs.build_state_hover_docs('/etc/salt/minion')

        self.assertEqual(payload['_meta']['argumentSource'], 'unavailable')
        self.assertEqual(
            payload['entries']['service.running'],
            {'doc': 'Ensure a service is running.'},
        )


if __name__ == '__main__':
    unittest.main()