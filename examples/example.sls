install_nginx:
  pkg.installed:
    - name: nginx

/etc/nginx/nginx.conf:
  file.managed:
    - source: salt://nginx/files/nginx.conf
    - user: root
    - group: root
    - mode: '0644'

nginx_service:
  service.running:
    - name: nginx
    - enable: true
    - watch:
      - file: /etc/nginx/nginx.conf