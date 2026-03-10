#
{%- set package_name = salt["pillar.get"]("ntp:package", "ntp") %}
{%- set service_name = salt["pillar.get"]("ntp:service", "ntp") %}

examples.ntp.install-pkg:
  pkg.installed:
    - name: {{ package_name }}

examples.ntp.configure:
  file.managed:
    - name: /etc/ntp.conf
    - source: salt://{{ slspath }}/files/ntp.conf
    - template: jinja
    - user: root
    - group: root
    - mode: '0640'

examples.ntp.enable-service:
  service.running:
    - name: {{ service_name }}
    - enable: True
    - watch_any:
      - pkg: examples.ntp.install-pkg
      - file: examples.ntp.configure
