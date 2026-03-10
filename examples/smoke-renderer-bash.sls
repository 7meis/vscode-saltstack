#!bash
set -eu

service_name="nginx"
echo "starting ${service_name}"
if [ -f /etc/os-release ]; then
  cat /etc/os-release
fi