'''
generate_snippets uses the local Salt Python APIs to list available state
modules and functions, then syncs missing snippet entries into this extension.

If a snippet file has been hand edited, the script only adds missing keys and
does not overwrite existing snippet definitions.
'''

import argparse
import json
import os
import sys


DEFAULT_MINION_CONFIG = '/etc/salt/minion'
FUNCTION_BLACKLIST = {'mod_watch'}


def _gen_snippet(state_name, state_functions):
    '''
    Builds up and returns basic snippet definition for a given state
    '''
    snippets = {}
    for function in state_functions:
        key = '{}.{}'.format(state_name, function)
        snippets[key] = {
            'prefix': '{}:'.format(key),
            'body': ['{}:'.format(key), '$0'],
            'description': '{}:'.format(key),
        }
    return snippets


def _get_state_name(json_path):
    '''
    Returns just the state name from a string like ./snippets/test.json
    Used for sorting the snippet list in package.json
    '''
    state_name = json_path['path'][11:-5]
    return state_name


def _read_json(path):
    with open(path, 'r', encoding='utf-8') as json_file:
        return json.load(json_file)


def _write_json(path, data):
    with open(path, 'w', encoding='utf-8') as json_file:
        json.dump(data, json_file, indent='\t')
        json_file.write('\n')


def _add_all_snippets(states):
    '''
    Ensures package.json is updated with all generated state snippet paths
    '''
    state_paths = ['./snippets/{}.json'.format(state) for state in states]
    data = _read_json('package.json')
    configured_snippets = []
    snippet_data = data['contributes']['snippets']
    for current_snippet in snippet_data:
        current_path = current_snippet['path']
        configured_snippets.append(current_path)
    needed_snippets = sorted(set(state_paths).difference(set(configured_snippets)))
    if needed_snippets:
        for new_snippet_path in needed_snippets:
            print('Adding support for {} completion'.format(new_snippet_path))
            new_snippet = {'language': 'sls', 'path': new_snippet_path}
            data['contributes']['snippets'].append(new_snippet)
        snippet_data = data['contributes']['snippets']
        snippet_data.sort(key=_get_state_name)
        data['contributes']['snippets'] = snippet_data
        _write_json('package.json', data)
    else:
        print('All states present in package.json')


def _normalize_state_info(state_info):
    '''
    Normalizes different Salt return formats into {state: [function, ...]}.
    '''
    if not isinstance(state_info, dict):
        raise TypeError('Expected state info mapping, got {}'.format(type(state_info).__name__))

    normalized = {}
    for state_name, functions in state_info.items():
        if isinstance(functions, dict):
            raw_functions = list(functions.keys())
        elif isinstance(functions, (list, tuple, set)):
            raw_functions = list(functions)
        elif functions is None:
            raw_functions = []
        else:
            raise TypeError(
                'Expected a list/dict of functions for state {!r}, got {}'.format(
                    state_name, type(functions).__name__
                )
            )

        normalized[str(state_name)] = sorted({str(function) for function in raw_functions if function})

    return normalized


def _build_state_info_from_function_list(states, state_functions):
    '''
    Rebuilds {state: [function, ...]} from sys.list_state_* style APIs.
    '''
    state_info = {str(state): [] for state in states}

    for function in state_functions:
        if not function or '.' not in function:
            continue
        state_name, function_name = function.split('.', 1)
        state_info.setdefault(state_name, []).append(function_name)

    return {
        state_name: sorted(set(functions))
        for state_name, functions in state_info.items()
    }


def _load_salt_deps():
    try:
        import salt.client
        import salt.config
        import salt.loader
    except ImportError as exc:
        raise RuntimeError(
            'Salt Python modules could not be imported. Run this script with the '
            'Salt bundled Python or with an interpreter where the salt package is installed.'
        ) from exc
    return salt.client, salt.config, salt.loader


def _build_minion_opts(config_path, local_mode=False):
    _, salt_config, _ = _load_salt_deps()
    minion_opts = salt_config.minion_config(config_path)
    if local_mode:
        minion_opts['file_client'] = 'local'
    return minion_opts


def _load_state_info_via_baredoc(config_path, local_mode=False):
    salt_client, _, _ = _load_salt_deps()
    minion_opts = _build_minion_opts(config_path, local_mode=local_mode)
    caller = salt_client.Caller(mopts=minion_opts)
    state_info = caller.cmd('baredoc.list_states', names_only=True)
    normalized = _normalize_state_info(state_info)
    if not normalized:
        raise RuntimeError('baredoc.list_states returned no states')
    return normalized


def _load_state_info_via_loader(config_path, local_mode=False):
    _, _, salt_loader = _load_salt_deps()
    minion_opts = _build_minion_opts(config_path, local_mode=local_mode)
    salt_utils = salt_loader.utils(minion_opts)
    salt_mods = salt_loader.minion_mods(minion_opts, utils=salt_utils)

    states = salt_mods['sys.list_state_modules']()
    state_functions = salt_mods['sys.list_state_functions']()
    state_info = _build_state_info_from_function_list(states, state_functions)
    if not state_info:
        raise RuntimeError('sys.list_state_modules/sys.list_state_functions returned no states')
    return state_info


def _load_state_info(config_path, local_mode=False, strategy='auto'):
    errors = []

    if strategy in ('auto', 'baredoc'):
        try:
            state_info = _load_state_info_via_baredoc(config_path, local_mode=local_mode)
            return state_info, 'baredoc.list_states'
        except Exception as exc:  # pragma: no cover - exercised via fallback tests
            errors.append('baredoc.list_states failed: {}'.format(exc))
            if strategy == 'baredoc':
                raise

    if strategy in ('auto', 'loader'):
        try:
            state_info = _load_state_info_via_loader(config_path, local_mode=local_mode)
            return state_info, 'sys.list_state_*'
        except Exception as exc:
            errors.append('sys.list_state_* failed: {}'.format(exc))

    raise RuntimeError('Could not load Salt state information. {}'.format(' | '.join(errors)))


def _sync_snippet_files(state_info):
    any_updates = False

    for state_name in sorted(state_info.keys()):
        state_path = os.path.join('snippets', state_name + '.json')
        current_functions = sorted(set(state_info[state_name]).difference(FUNCTION_BLACKLIST))
        snippets = _gen_snippet(state_name, current_functions)

        if not os.path.exists(state_path):
            print('Generating basic {}'.format(state_path))
            _write_json(state_path, snippets)
            any_updates = True
            continue

        data_updated = False
        data = _read_json(state_path)
        for key, snippet in snippets.items():
            if key not in data:
                any_updates = True
                data_updated = True
                data[key] = snippet
                print('Updated {} for {}'.format(key, state_name))
        if data_updated:
            _write_json(state_path, data)

    if not any_updates:
        print('No changes made to snippet files')

    _add_all_snippets(sorted(state_info.keys()))
    return any_updates


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Generate or update Salt state snippets from the local Salt installation.'
    )
    parser.add_argument(
        '--config',
        default=DEFAULT_MINION_CONFIG,
        help='Path to the Salt minion config file (default: %(default)s)',
    )
    parser.add_argument(
        '--local',
        action='store_true',
        help='Set file_client=local, similar to salt-call --local',
    )
    parser.add_argument(
        '--strategy',
        choices=('auto', 'baredoc', 'loader'),
        default='auto',
        help='How to query Salt state information (default: %(default)s)',
    )
    args = parser.parse_args(argv)

    state_info, source = _load_state_info(
        args.config,
        local_mode=args.local,
        strategy=args.strategy,
    )
    print('Loaded {} Salt states via {}'.format(len(state_info), source))
    _sync_snippet_files(state_info)
    return 0


if __name__ == '__main__':
    sys.exit(main())
