#!/bin/sh
# Выкладка сайта на хостинг reg.ru (жизньсвет.рф) по SSH-ключу.
# Берёт файлы из последнего коммита (git archive HEAD), поэтому незакоммиченные правки не уходят.
# Прошлая версия сайта остаётся на сервере в ~/backup/site-<дата>.
#
# Запуск из корня репозитория:  sh deploy/regru-upload.sh
# Ключ и адрес можно переопределить: REGRU_KEY=~/.ssh/другой_ключ REGRU_HOST=user@host sh deploy/regru-upload.sh
set -eu

HOST=${REGRU_HOST:-u3709122@server214.hosting.reg.ru}
KEY=${REGRU_KEY:-$HOME/.ssh/lifelight_reghost}
SITE=www/xn--b1agbee5a2ak0g.xn--p1ai   # жизньсвет.рф в punycode
FILES="index.html style.css mobile.css app.js config.js metrika.js favicon.svg assets"
STAMP=$(date +%Y%m%d-%H%M%S)

git archive --format=tar HEAD $FILES | gzip | ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "
  set -e
  rm -rf ~/deploy-new
  mkdir -p ~/deploy-new ~/backup
  tar -xzf - -C ~/deploy-new
  rm -f ~/deploy-new/assets/*-source.png ~/deploy-new/assets/font-source.css
  chmod 755 ~/deploy-new
  if [ -d ~/$SITE ]; then mv ~/$SITE ~/backup/site-$STAMP; fi
  mv ~/deploy-new ~/$SITE
  echo \"Готово: версия $(git rev-parse --short HEAD), прошлая сохранена в ~/backup/site-$STAMP\"
"
