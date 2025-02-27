#!/bin/bash

# Script para configurar o certificado SSL para email.blazee.com.br

# Verifica se o script está sendo executado como root
if [ "$EUID" -ne 0 ]; then
  echo "Este script precisa ser executado como root"
  exit 1
fi

# Verifica se o certbot está instalado
if ! command -v certbot &> /dev/null; then
    echo "Certbot não está instalado. Instalando..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Obtém o certificado SSL
echo "Obtendo certificado SSL para email.blazee.com.br..."
certbot certonly --nginx -d email.blazee.com.br --agree-tos --email contato@useblazee.com.br --non-interactive

# Verifica se o certificado foi obtido com sucesso
if [ ! -f "/etc/letsencrypt/live/email.blazee.com.br/fullchain.pem" ]; then
    echo "Falha ao obter o certificado SSL"
    exit 1
fi

# Copia o arquivo de configuração do Nginx
echo "Configurando Nginx..."
cp email_blazee_nginx.conf /etc/nginx/sites-available/email.blazee.com.br.conf

# Cria um link simbólico para habilitar o site
ln -sf /etc/nginx/sites-available/email.blazee.com.br.conf /etc/nginx/sites-enabled/

# Testa a configuração do Nginx
nginx -t

# Se a configuração estiver correta, reinicia o Nginx
if [ $? -eq 0 ]; then
    echo "Configuração do Nginx está correta. Reiniciando..."
    systemctl restart nginx
    echo "Configuração concluída com sucesso!"
else
    echo "Configuração do Nginx está incorreta. Verifique o arquivo de configuração."
    exit 1
fi

# Configura a renovação automática do certificado
echo "Configurando renovação automática do certificado..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -

echo "Configuração do SSL concluída com sucesso!" 