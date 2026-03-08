nginx_service_is_running:
  module_and_function: service.status
  args:
    - nginx
  assertion: assertTrue
  expected_return: true

nginx_config_exists:
  module_and_function: file.file_exists
  args:
    - /etc/nginx/nginx.conf
  assertion: assertTrue
  expected_return: true