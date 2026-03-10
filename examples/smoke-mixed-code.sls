# Create directories
{% for dir in directories %}
{{ dir.path }}:
  file.directory:
    - user: {{ dir.user }}
    - group: {{ dir.group }}
    - dir_mode: {{ dir.mode }}
    - makedirs: True
{% endfor %}

set_host_entry:
  file.replace:
    - name: /etc/hosts
    - pattern: '^.*\s{{ NEXTCLOUD_URL_DOMAIN }}\s*$'
    - repl: {{ NEXTCLOUD_TRUSTED_PROXIES }} {{ NEXTCLOUD_URL_DOMAIN }}
    - append_if_not_found: True
    - require:
      - file: create_compose

startup:
  cmd.run:
    - name: docker compose up -d
    - cwd: {{ nextcloudlocation }}
    - require:
      - file: set_host_entry