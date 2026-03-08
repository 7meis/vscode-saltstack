'''
Generate Salt state hover documentation for the VS Code extension.

The data source is the locally available Salt Python APIs.
'''

import argparse
import datetime
import json
import os
import sys


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import generate_snippets  # noqa: E402


def _normalize_docstring(docstring):
    if not docstring:
        return ''

    lines = str(docstring).replace('\r\n', '\n').strip().split('\n')
    normalized = []
    blank_line = False
    for line in lines:
        stripped = line.rstrip()
        if not stripped:
            if normalized and not blank_line:
                normalized.append('')
            blank_line = True
            continue
        normalized.append(stripped)
        blank_line = False
    return '\n'.join(normalized).strip()


def _normalize_state_docs(raw_state_docs):
    if not isinstance(raw_state_docs, dict):
        raise TypeError('Expected state docs mapping, got {}'.format(type(raw_state_docs).__name__))

    normalized = {}
    for function_name, docstring in raw_state_docs.items():
        if not isinstance(function_name, str) or '.' not in function_name:
            continue
        normalized_doc = _normalize_docstring(docstring)
        if normalized_doc:
            normalized[function_name] = normalized_doc
    return normalized


def _normalize_argument_names(argument_data):
    if argument_data is None:
        return []
    if isinstance(argument_data, dict):
        raw_names = argument_data.keys()
    elif isinstance(argument_data, (list, tuple, set)):
        raw_names = argument_data
    else:
        return []
    return [str(name) for name in raw_names if name]


def _normalize_state_arguments(raw_state_info):
    if not isinstance(raw_state_info, dict):
        raise TypeError('Expected state argument mapping, got {}'.format(type(raw_state_info).__name__))

    normalized = {}
    for state_name, function_data in raw_state_info.items():
        if isinstance(function_data, dict):
            iterable = function_data.items()
        elif isinstance(function_data, (list, tuple)):
            iterable = []
            for item in function_data:
                if isinstance(item, dict):
                    iterable.extend(item.items())
        else:
            continue

        for function_name, argument_data in iterable:
            full_name = '{}.{}'.format(state_name, function_name)
            normalized[full_name] = _normalize_argument_names(argument_data)

    return normalized


def _create_caller(config_path, local_mode=False):
    salt_client, _, _ = generate_snippets._load_salt_deps()
    minion_opts = generate_snippets._build_minion_opts(config_path, local_mode=local_mode)
    return salt_client.Caller(mopts=minion_opts)


def _load_state_docs_via_baredoc(config_path, local_mode=False):
    caller = _create_caller(config_path, local_mode=local_mode)
    return _normalize_state_docs(caller.cmd('baredoc.state_docs')), 'baredoc.state_docs'


def _load_state_docs_via_sys(config_path, local_mode=False):
    caller = _create_caller(config_path, local_mode=local_mode)
    return _normalize_state_docs(caller.cmd('sys.state_doc')), 'sys.state_doc'


def _load_state_docs(config_path, local_mode=False, strategy='auto'):
    errors = []

    if strategy in ('auto', 'baredoc'):
        try:
            return _load_state_docs_via_baredoc(config_path, local_mode=local_mode)
        except Exception as exc:
            errors.append('baredoc.state_docs failed: {}'.format(exc))
            if strategy == 'baredoc':
                raise

    if strategy in ('auto', 'sys'):
        try:
            return _load_state_docs_via_sys(config_path, local_mode=local_mode)
        except Exception as exc:
            errors.append('sys.state_doc failed: {}'.format(exc))

    raise RuntimeError('Could not load Salt state documentation. {}'.format(' | '.join(errors)))


def _load_state_arguments_via_baredoc(config_path, local_mode=False):
    caller = _create_caller(config_path, local_mode=local_mode)
    data = caller.cmd('baredoc.list_states', names_only=False)
    return _normalize_state_arguments(data), 'baredoc.list_states'


def build_state_hover_docs(config_path, local_mode=False, strategy='auto'):
    state_docs, doc_source = _load_state_docs(config_path, local_mode=local_mode, strategy=strategy)

    try:
        state_arguments, argument_source = _load_state_arguments_via_baredoc(
            config_path,
            local_mode=local_mode,
        )
    except Exception:
        state_arguments = {}
        argument_source = 'unavailable'

    entries = {}
    for function_name in sorted(set(state_docs.keys()).union(state_arguments.keys())):
        entry = {}
        if function_name in state_docs:
            entry['doc'] = state_docs[function_name]
        if state_arguments.get(function_name):
            entry['args'] = state_arguments[function_name]
        entries[function_name] = entry

    return {
        '_meta': {
            'argumentSource': argument_source,
            'configPath': config_path,
            'docSource': doc_source,
            'generatedAt': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
            'localMode': local_mode,
            'strategy': strategy,
        },
        'entries': entries,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Export Salt state documentation and arguments for VS Code hover support.'
    )
    parser.add_argument(
        '--config',
        default=generate_snippets.DEFAULT_MINION_CONFIG,
        help='Path to the Salt minion config file (default: %(default)s)',
    )
    parser.add_argument(
        '--local',
        action='store_true',
        help='Set file_client=local, similar to salt-call --local',
    )
    parser.add_argument(
        '--strategy',
        choices=('auto', 'baredoc', 'sys'),
        default='auto',
        help='How to query Salt state docs (default: %(default)s)',
    )
    parser.add_argument(
        '--output',
        default='-',
        help='Where to write the JSON payload. Use - for stdout (default: %(default)s)',
    )
    args = parser.parse_args(argv)

    payload = build_state_hover_docs(
        args.config,
        local_mode=args.local,
        strategy=args.strategy,
    )

    rendered = json.dumps(payload, indent=2, sort_keys=True)
    if args.output == '-':
        print(rendered)
    else:
        with open(args.output, 'w', encoding='utf-8') as output_file:
            output_file.write(rendered)
            output_file.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())