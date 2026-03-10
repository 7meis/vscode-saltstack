# Smoke test: leading comments with Jinja-like text must stay comments.
# {{ grains.id }}
# {% if grains['os_family'] == 'Debian' %}

{% if grains['os_family'] == 'Debian' %}
install_nginx:
  pkg.installed:
    - name: nginx
    - version: {{ pillar.get('nginx:version', 'latest') }}

nginx_service:
  service.running:
    - name: nginx
    - enable: true
{% else %}
install_httpd:
  pkg.installed:
    - name: httpd
{% endif %}

