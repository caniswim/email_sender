#!/bin/bash

# Configurar OpenDKIM
cat > /etc/opendkim.conf << 'EOL'
Syslog                  yes
UMask                   002
Domain                  useblazee.com.br
KeyFile                 /etc/dkim/private.key
Selector                default
Socket                  inet:8891@localhost
PidFile                 /var/run/opendkim/opendkim.pid
TrustAnchorFile        /usr/share/dns/root.key
UserID                 opendkim:opendkim
EOL

# Criar diretório para chaves DKIM
mkdir -p /etc/dkim
chmod 755 /etc/dkim

# Gerar novas chaves DKIM
opendkim-genkey -b 2048 -d useblazee.com.br -D /etc/dkim -s default -v

# Ajustar permissões
chown -R opendkim:opendkim /etc/dkim
chmod 600 /etc/dkim/private.key

# Configurar Postfix para usar OpenDKIM
postconf -e "milter_protocol = 2"
postconf -e "milter_default_action = accept"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"

# Reiniciar serviços
systemctl restart opendkim
systemctl restart postfix

# Mostrar a chave pública para configurar no DNS
echo "Configure o seguinte registro TXT no DNS:"
echo "default._domainkey.useblazee.com.br TXT"
cat /etc/dkim/default.txt 