# guest-autogrow

Self-healing de disco: quando um disco (XFS de disco inteiro, ex.: `/dev/sdb`) é
redimensionado no Proxmox, uma regra udev dispara um serviço systemd que roda
`xfs_growfs` no ponto de montagem — sem reboot, sem intervenção.

## Arquivos
- `o4p-autogrow` → `/usr/local/sbin/o4p-autogrow` (script; recebe o device, ex.: `sdb`)
- `o4p-autogrow@.service` → unit systemd oneshot (instanciada por device)
- `99-o4p-autogrow.rules` → regra udev que dispara no evento `change` do bloco
- `install.sh` → instalador (roda dentro da VM, como root)

## Instalação
Dentro da VM (como root): `./install.sh`.

Só cobre **disco inteiro** sd*/vd* XFS. Root particionado/LVM não é tocado.
