#!/bin/sh
# Instala o self-healing de auto-grow no guest. Requer root. Rodar dentro da VM.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
install -m 0755 "$here/o4p-autogrow" /usr/local/sbin/o4p-autogrow
install -m 0644 "$here/o4p-autogrow@.service" /etc/systemd/system/o4p-autogrow@.service
install -m 0644 "$here/99-o4p-autogrow.rules" /etc/udev/rules.d/99-o4p-autogrow.rules
systemctl daemon-reload
udevadm control --reload-rules
echo "o4p-autogrow instalado"
