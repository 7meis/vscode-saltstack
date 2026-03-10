{% raw %}
{{ this_should_render_as_plain_text_not_active_jinja }}
{% endraw %}

{# This Jinja comment should hide {{ grains.id }} and {% if x %} #}

show_raw_and_comment_regions:
  test.show_notification:
    - text: "raw/comment highlighting smoke test"
    - require_in:
      - test: after_raw_section

after_raw_section:
  test.succeed_without_changes:
    - name: raw and comment regions finished cleanly