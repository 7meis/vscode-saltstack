
{% if grains['os_family'] == 'Windows' %}
  {% set base_dir = 'C:\\salt-debug' %}
  {% set conf_dir = base_dir ~ '\\conf' %}
  {% set separator = '\\' %}
{% else %}
  {% set base_dir = '/root/salt-debug' %}
  {% set conf_dir = base_dir ~ '/conf' %}
  {% set separator = '/' %}
{% endif %}

# 1. Verzeichnisstruktur anlegen
create_debug_dirs:
  file.directory:
    - names:
      - {{ base_dir }}
      - {{ conf_dir }}
      - {{ base_dir }}{{ separator }}salt
      - {{ base_dir }}{{ separator }}pillar
    - makedirs: True
    {% if grains['os_family'] != 'Windows' %}
    - mode: 700
    {% endif %}

# 2. Lokale Minion-Konfiguration (Masterless Setup)
create_local_config:
  file.managed:
    - name: {{ conf_dir }}{{ separator }}minion
    - contents: |
        file_client: local
        file_roots:
          base:
            - {{ base_dir }}{{ separator }}salt
        pillar_roots:
          base:
            - {{ base_dir }}{{ separator }}pillar

# 3. Test-State Datei
create_test_sls:
  file.managed:
    - name: {{ base_dir }}{{ separator }}salt{{ separator }}test.sls
    - contents: |
        debug_output:
          test.configurable_test_setting:
            - name: "Salt-Debug auf {{ grains['os'] }} aktiv"
            - result: True
            - comment: "Lokale Ausführung unter {{ base_dir }} erfolgreich!"

# 4. Test-Pillar Datei
create_test_pillar:
  file.managed:
    - name: {{ base_dir }}{{ separator }}pillar{{ separator }}test.sls
    - contents: |
        debug_status: "Lokal geladen"