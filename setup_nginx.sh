#!/bin/bash

# Verifica se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo "Por favor, execute como root (sudo ./setup_nginx.sh)"
    exit 1
fi

# Instala o Nginx se não estiver instalado
if ! command -v nginx &> /dev/null; then
    echo "Instalando Nginx..."
    apt-get update
    apt-get install -y nginx
fi

# Cria o arquivo de configuração do site
cat > /etc/nginx/sites-available/email.blazee.com.br << 'EOL'
server {
    listen 80;
    listen [::]:80;
    server_name email.blazee.com.br;

    # Redireciona HTTP para HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name email.blazee.com.br;

    # Configurações SSL
    ssl_certificate /etc/letsencrypt/live/email.blazee.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/email.blazee.com.br/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Configurações de segurança SSL modernas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (descomente se você tiver certeza)
    # add_header Strict-Transport-Security "max-age=63072000" always;

    # Configurações de proxy para a aplicação Python
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Configurações de timeout
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Configurações de segurança adicionais
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval';" always;

    # Logs
    access_log /var/log/nginx/email.blazee.com.br.access.log;
    error_log /var/log/nginx/email.blazee.com.br.error.log;
}
EOL

# Cria link simbólico para habilitar o site
ln -sf /etc/nginx/sites-available/email.blazee.com.br /etc/nginx/sites-enabled/

# Instala o Certbot se não estiver instalado
if ! command -v certbot &> /dev/null; then
    echo "Instalando Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi

# Obtém o certificado SSL
echo "Obtendo certificado SSL..."
certbot --nginx -d email.blazee.com.br --non-interactive --agree-tos --email contato@useblazee.com.br

# Testa a configuração do Nginx
echo "Testando configuração do Nginx..."
nginx -t

# Reinicia o Nginx
echo "Reiniciando Nginx..."
systemctl restart nginx

echo "Configuração concluída!"
echo "Agora você pode acessar a aplicação em https://email.blazee.com.br" 