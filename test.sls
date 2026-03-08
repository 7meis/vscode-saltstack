/etc/nginx/lua/check_group.lua:
  file.managed:
    - source: salt://templates/linux/etc/nginx/lua/check_group.lua
    - makedirs: True
{% set groups = ['admin', 'editor'] %}
# Vhost Konfiguration aus Template
nginx_vhost_config:
  file.managed:
    - name: /etc/nginx/sites-available/vuepress.conf
    - source: salt://templates/linux/etc/nginx/sites-available/vuepress_oidc.j2
    - template: jinja
    - watch_in:
      - service: nginx_service

# Symlink aktivieren
nginx_vhost_enable:
  file.symlink:
    - name: /etc/nginx/sites-enabled/vuepress.conf
    - target: /etc/nginx/sites-available/vuepress.conf