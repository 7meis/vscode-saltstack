# Owner: unassigned
include:
  - deploy.docker

##Define locations of nextcloud directories
{% set nextcloudlocation = pillar['nextcloud']['location'] -%}
{% set nc_project = nextcloudlocation.split('/')[-1] -%}
{% set apps = '/apps' -%}
{% set config = '/config' -%}
{% set data = '/data' -%}
{% set main = '/main' -%}
{% set mariadb = '/mariadb' -%}
{% set rediscache = '/rediscache' -%}

##Get host/customer specific values from host role
{% set NEXTCLOUD_TRUSTED_DOMAINS = pillar['nextcloud']['trusted_domains'] -%}
{% set NEXTCLOUD_URL_DOMAIN = pillar['nextcloud']['trusted_domains'].split(' ')[0] -%}
{% set NEXTCLOUD_SMTP_HOST = pillar['nextcloud']['smtp_host'] -%}
{% set NEXTCLOUD_MAIL_FROM = pillar['nextcloud']['mail_from'] -%}
{% set NEXTCLOUD_MAIL_DOMAIN = pillar['nextcloud']['mail_domain'] -%}
{% set NEXTCLOUD_PHONE_REGION = pillar['nextcloud']['default_phone_region'] -%}
{% set NEXTCLOUD_TRUSTED_PROXIES = pillar['nextcloud']['trusted_proxies'] or salt['network.interface_ip']('enp1s0') -%}
{% set NEXTCLOUD_SKELETON_DIRECTORY = pillar['nextcloud']['skeleton_directory'] -%}
{% set NEXTCLOUD_TEMPLATE_DIRECTORY = pillar['nextcloud']['template_directory'] -%}
{% set appapi_daemon_name = pillar['nextcloud'].get('appapi_daemon_name', 'appapi-harp') %}
{% set appapi_compute_device = pillar['nextcloud'].get('appapi_compute_device', 'cpu') %}
{% set NPM_ADMIN_EMAIL = pillar['nextcloud'].get('npm', {}).get('admin_email', 'tm-system@wagner.ch') %}
{% set NPM_FORWARD_HOST = pillar['nextcloud'].get('npm', {}).get('forward_host', 'app') %}
{% set NPM_FORWARD_PORT = pillar['nextcloud'].get('npm', {}).get('forward_port', 80) %}
{% set NPM_FORWARD_SCHEME = pillar['nextcloud'].get('npm', {}).get('forward_scheme', 'http') %}

##Get variables from nextcloud role
{% set nextcloudlocation = pillar['nextcloud']['location'] -%}
{% set mariadb_version = pillar['nextcloud']['mariadb_version'] -%}
{% set nextcloud_version = pillar['nextcloud']['nextcloud_version'] -%}
{% set redis_version = pillar['nextcloud']['redis_version'] -%}
{% set nextcloud_maintenancewindow = pillar['nextcloud']['maintenance_window_start'] -%}

##Get secrets from salt-vault
{% set fqdn = grains['id'] %}
{% set MYSQL_ROOT_PASSWORD = salt['vault'].read_secret('salt/minion/' + fqdn, 'MYSQL_ROOT_PASSWORD') %}
{% set MYSQL_Database_PASSWORD = salt['vault'].read_secret('salt/minion/' + fqdn, 'MYSQL_Database_PASSWORD') %}
{% set NEXTCLOUD_ADMIN_PASSWORD = salt['vault'].read_secret('salt/minion/' + fqdn, 'NEXTCLOUD_ADMIN_PASSWORD') %}
{% set REDIS_HOST_PASSWORD = salt['vault'].read_secret('salt/minion/' + fqdn, 'REDIS_HOST_PASSWORD') %}
{% set HARP_SHARED_KEY = salt['vault'].read_secret('salt/minion/' + fqdn, 'HARP_SHARED_KEY') %}
{% set NPM_ADMIN_PASSWORD = salt['vault'].read_secret('salt/minion/' + fqdn, 'NPM_ADMIN_PASSWORD') %}
{% set NC_CERT_PEM = salt['vault'].read_secret('salt/minion/' + fqdn, 'NC_CERT_PEM') %}

##Escape $ signs for Docker Compose ($ is treated as variable interpolation, $$ is a literal $)
{% set MYSQL_ROOT_PASSWORD_ESC = MYSQL_ROOT_PASSWORD | replace('$', '$$') %}
{% set MYSQL_Database_PASSWORD_ESC = MYSQL_Database_PASSWORD | replace('$', '$$') %}
{% set NEXTCLOUD_ADMIN_PASSWORD_ESC = NEXTCLOUD_ADMIN_PASSWORD | replace('$', '$$') %}
{% set REDIS_HOST_PASSWORD_ESC = REDIS_HOST_PASSWORD | replace('$', '$$') %}
{% set HARP_SHARED_KEY_ESC = HARP_SHARED_KEY | replace('$', '$$') %}
{% set NPM_ADMIN_PASSWORD_ESC = NPM_ADMIN_PASSWORD | replace('$', '$$') %}


{% set directories = [
  {'path': nextcloudlocation, 'user': 'root', 'group': 'root', 'mode': '755'},
  {'path': nextcloudlocation ~ apps, 'user': '33', 'group': '33', 'mode': '755'},
  {'path': nextcloudlocation ~ config, 'user': '33', 'group': '33', 'mode': '755'},
  {'path': nextcloudlocation ~ data, 'user': '33', 'group': '33', 'mode': '770'},
  {'path': nextcloudlocation ~ main, 'user': '33', 'group': '33', 'mode': '755'},
  {'path': nextcloudlocation ~ mariadb, 'user': '999', 'group': '999', 'mode': '755'},
  {'path': nextcloudlocation ~ rediscache, 'user': '999', 'group': 'root', 'mode': '755'}
] %}

# Create directories
{% for dir in directories %}
{{ dir.path }}:
  file.directory:
    - user: {{ dir.user }}
    - group: {{ dir.group }}
    - dir_mode: {{ dir.mode }}
    - makedirs: True
{% endfor %}

create_compose:
  file.managed:
    - name: '{{ nextcloudlocation }}/compose.yaml'
    - source: salt://deploy/nextcloud/docker-compose.yml.jinja
    - template: jinja
    - user: root
    - group: root
    - mode: 644
    - replace: true
    - context:
        nextcloudlocation: '{{ nextcloudlocation }}'
        mariadb: '{{ mariadb }}'
        rediscache: '{{ rediscache }}'
        main: '{{ main }}'
        config: '{{ config }}'
        data: '{{ data }}'
        apps: '{{ apps }}'
        mariadb_version: '{{ mariadb_version }}'
        nextcloud_version: '{{ nextcloud_version }}'
        redis_version: '{{ redis_version }}'
        appapi_daemon_name: '{{ appapi_daemon_name }}'
        MYSQL_ROOT_PASSWORD_ESC: '{{ MYSQL_ROOT_PASSWORD_ESC | replace("'", "''") }}'
        MYSQL_Database_PASSWORD_ESC: '{{ MYSQL_Database_PASSWORD_ESC | replace("'", "''") }}'
        NEXTCLOUD_ADMIN_PASSWORD_ESC: '{{ NEXTCLOUD_ADMIN_PASSWORD_ESC | replace("'", "''") }}'
        REDIS_HOST_PASSWORD_ESC: '{{ REDIS_HOST_PASSWORD_ESC | replace("'", "''") }}'
        HARP_SHARED_KEY_ESC: '{{ HARP_SHARED_KEY_ESC | replace("'", "''") }}'
        NPM_ADMIN_EMAIL: '{{ NPM_ADMIN_EMAIL }}'
        NPM_ADMIN_PASSWORD_ESC: '{{ NPM_ADMIN_PASSWORD_ESC | replace("'", "''") }}'
        NEXTCLOUD_TRUSTED_PROXIES: '{{ NEXTCLOUD_TRUSTED_PROXIES | replace("'", "''") }}'

set_host_entry:
  file.replace:
    - name: /etc/hosts
    - pattern: '^.*\s{{ NEXTCLOUD_URL_DOMAIN }}\s*$'
    - repl: '{{ NEXTCLOUD_TRUSTED_PROXIES }} {{ NEXTCLOUD_URL_DOMAIN }}'
    - append_if_not_found: True
    - require:
      - file: create_compose

startup:
  cmd.run:
    - name: docker compose up -d
    - cwd: {{ nextcloudlocation }}
    - require:
      - file: set_host_entry

##Wait until Nextcloud's HTTP endpoint reports installed
wait_for_nextcloud_installed:
  cmd.run:
    - name: |
        timeout 300 sh -c '
          until curl -sf http://localhost:8080/status.php 2>/dev/null | grep -q "\"installed\":true"; do
            sleep 5
          done
        '
    - cwd: {{ nextcloudlocation }}
    - require:
      - cmd: startup

##Deploy drop-in config file — Nextcloud auto-loads all *.config.php from config/
set_additional_config:
  file.managed:
    - name: '{{ nextcloudlocation }}{{ config }}/custom.config.php'
    - source: salt://deploy/nextcloud/nextcloud_custom.config.php.jinja
    - template: jinja
    - user: www-data
    - group: www-data
    - mode: '640'
    - context:
        nextcloud_maintenancewindow: {{ nextcloud_maintenancewindow }}
        NEXTCLOUD_TRUSTED_PROXIES: '{{ NEXTCLOUD_TRUSTED_PROXIES | replace("'", "''") }}'
        NEXTCLOUD_URL_DOMAIN: '{{ NEXTCLOUD_URL_DOMAIN | replace("'", "''") }}'
        NEXTCLOUD_PHONE_REGION: '{{ NEXTCLOUD_PHONE_REGION | replace("'", "''") }}'
        NEXTCLOUD_SMTP_HOST: '{{ (NEXTCLOUD_SMTP_HOST or '') | replace("'", "''") }}'
        NEXTCLOUD_MAIL_FROM: '{{ NEXTCLOUD_MAIL_FROM | replace("'", "''") }}'
        NEXTCLOUD_MAIL_DOMAIN: '{{ NEXTCLOUD_MAIL_DOMAIN | replace("'", "''") }}'
        NEXTCLOUD_SKELETON_DIRECTORY: '{{ NEXTCLOUD_SKELETON_DIRECTORY | replace("'", "''") }}'
        NEXTCLOUD_TEMPLATE_DIRECTORY: '{{ NEXTCLOUD_TEMPLATE_DIRECTORY | replace("'", "''") }}'
        REDIS_HOST_PASSWORD: '{{ REDIS_HOST_PASSWORD | replace("'", "''") }}'
        NEXTCLOUD_TRUSTED_DOMAINS: '{{ NEXTCLOUD_TRUSTED_DOMAINS | replace("'", "''") }}'
    - require:
      - cmd: wait_for_nextcloud_installed

restart_app:
  cmd.run:
    - name: docker compose down && docker compose up -d
    - cwd: {{ nextcloudlocation }}
    - onchanges:
      - file: set_additional_config
      - file: create_compose
    - require:
      - cmd: startup

##Install the AppAPI app inside Nextcloud if it is not already present
ensure_appapi_installed:
  cmd.run:
    - name: docker compose exec --user www-data -T app php occ app:install app_api
    - unless: "docker compose exec --user www-data -T app php occ app:list 2>/dev/null | grep -q 'app_api'"
    - cwd: {{ nextcloudlocation }}
    - require:
      - cmd: restart_app

configure_appapi_daemon:
  cmd.run:
    - name: |
        docker compose exec --user www-data -T app php occ app_api:daemon:register \
            --net="$(basename "$(pwd)")_default" \
            --haproxy_password="${HAPROXY_PASSWORD}" \
            --harp \
            --harp_shared_key="${HAPROXY_PASSWORD}" \
            --harp_frp_address="{{ appapi_daemon_name }}:8782" \
            --harp_docker_socket_port="24000" \
            --set-default \
            --compute_device="cpu" \
            "{{ appapi_daemon_name }}" "AppAPI Harp Proxy" \
            docker-install http "{{ appapi_daemon_name }}:8780" "https://{{ NEXTCLOUD_URL_DOMAIN }}"
    - unless: "docker compose exec --user www-data -T app php occ app_api:daemon:list 2>/dev/null | grep -q '{{ appapi_daemon_name }}'"
    - env:
      - HAPROXY_PASSWORD: "{{ HARP_SHARED_KEY }}"
    - cwd: {{ nextcloudlocation }}
    - require:
      - cmd: ensure_appapi_installed

db_try_upgrade:
  cmd.run:
    - name: docker compose exec --user www-data -T app php occ upgrade
    - cwd: {{ nextcloudlocation }}
    - onchanges:
      - file: create_compose
    - require:
      - cmd: configure_appapi_daemon

##Run after fresh install or version upgrade (onchanges: create_compose triggers when
## the Nextcloud image version changes). Both commands are idempotent and safe to run.
db_add_missing_indices:
  cmd.run:
    - name: docker compose exec --user www-data -T app php occ db:add-missing-indices
    - cwd: {{ nextcloudlocation }}
    - onchanges:
      - file: create_compose
    - require:
      - cmd: db_try_upgrade

maintenance_repair:
  cmd.run:
    - name: docker compose exec --user www-data -T app php occ maintenance:repair --include-expensive
    - cwd: {{ nextcloudlocation }}
    - onchanges:
      - file: create_compose
    - require:
      - cmd: db_add_missing_indices

##Run cron.php once immediately after deployment so background jobs fire right away
run_initial_cron:
  cmd.run:
    - name: docker compose exec -d -u www-data -T app php /var/www/html/cron.php
    - cwd: {{ nextcloudlocation }}
    - onchanges:
      - file: create_compose
    - require:
      - cmd: maintenance_repair

##Add system cron job on the host to process Nextcloud background jobs every 5 minutes
nextcloud_cron_job:
  cron.present:
    - name: docker exec -u www-data {{ nc_project }}-app-1 php /var/www/html/cron.php
    - user: root
    - identifier: nextcloud-background-cron
    - minute: '*/5'
    - require:
      - cmd: run_initial_cron

clean_log:
  file.absent:
    - name: '{{ nextcloudlocation }}{{ data }}/nextcloud.log'
    - require:
      - cmd: startup

##Write combined PEM (cert + intermediate + key) from Vault to a temp file for NPM upload
npm_ssl_pem_file:
  file.managed:
    - name: /tmp/npm_fullpem.pem
    - mode: '600'
    - contents: |
        {{ NC_CERT_PEM | indent(8) }}
    - require:
      - cmd: startup

##Deploy the NPM configuration script (rendered from Jinja with credentials)
deploy_npm_config_script:
  file.managed:
    - name: /tmp/configure_npm.sh
    - source: salt://deploy/nextcloud/configure_npm.sh.jinja
    - template: jinja
    - mode: '750'
    - context:
        npm_admin_email: '{{ NPM_ADMIN_EMAIL }}'
        npm_admin_password: '{{ NPM_ADMIN_PASSWORD | replace("'", "''") }}'
        nextcloud_domain: '{{ NEXTCLOUD_URL_DOMAIN }}'
        npm_forward_host: '{{ NPM_FORWARD_HOST }}'
        npm_forward_port: {{ NPM_FORWARD_PORT }}
        npm_forward_scheme: '{{ NPM_FORWARD_SCHEME }}'
        appapi_daemon_name: '{{ appapi_daemon_name }}'
        nextcloud_location: '{{ nextcloudlocation }}'
    - require:
      - file: npm_ssl_pem_file

##Wait for NPM API
wait_for_npm_api:
  cmd.run:
    - name: |
        timeout 30 sh -c '
          until curl -s -o /dev/null -w "%{http_code}" \
            http://localhost:81/api/nginx/proxy-hosts 2>/dev/null \
            | grep -q "^4"; do
            sleep 3
          done
        '
    - require:
      - file: deploy_npm_config_script

##Create proxy host in NPM via API (idempotent — skips if host already exists)
configure_npm_proxy:
  cmd.run:
    - name: /tmp/configure_npm.sh
    - require:
      - cmd: wait_for_npm_api

##Clean up sensitive temp files
cleanup_npm_script:
  file.absent:
    - name: /tmp/configure_npm.sh
    - require:
      - cmd: configure_npm_proxy

cleanup_npm_pem:
  file.absent:
    - name: /tmp/npm_fullpem.pem
    - require:
      - cmd: configure_npm_proxy