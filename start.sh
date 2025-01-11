#!/bin/bash

# Função para exibir ajuda
show_help() {
    echo "Uso: ./start.sh [OPÇÃO]"
    echo "Inicia o sistema de envio de emails."
    echo ""
    echo "Opções:"
    echo "  --tui    Inicia o sistema em modo TUI (Interface de Texto)"
    echo "  --help   Exibe esta mensagem de ajuda"
    echo ""
    echo "Se nenhuma opção for fornecida, inicia o sistema em modo web."
}

# Processa os argumentos da linha de comando
MODE="web"
for arg in "$@"; do
    case $arg in
        --tui)
            MODE="tui"
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Opção desconhecida: $arg"
            show_help
            exit 1
            ;;
    esac
done

echo "=== Inicializando Sistema de Envio de Emails ==="

# Verifica se o Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "Python 3 não encontrado. Instalando..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Instala dependências do sistema necessárias
echo "Instalando dependências do sistema..."
sudo apt-get update
sudo apt-get install -y \
    python3-dev \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-setuptools \
    python3-wheel \
    python3-psutil

# Ativa ou cria o ambiente virtual
echo "Ativando ambiente virtual..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Instala as dependências Python
echo "Instalando dependências Python..."
pip install --upgrade pip
pip install \
    pandas \
    pytz \
    dkimpy \
    tenacity \
    psutil \
    python-dateutil \
    requests \
    chardet \
    urllib3 \
    certifi \
    idna \
    numpy \
    six \
    python-dotenv

# Verifica se a pasta templates existe
if [ ! -d "templates" ]; then
    echo "Pasta 'templates' não encontrada!"
    echo "Certifique-se que a pasta 'templates' existe no diretório atual."
    exit 1
fi

# Verifica se existem templates HTML na pasta
if [ ! "$(ls -A templates/*.html 2>/dev/null)" ]; then
    echo "Nenhum arquivo .html encontrado na pasta 'templates'!"
    echo "Certifique-se que existem templates HTML na pasta 'templates'."
    exit 1
fi

# Verifica e cria diretório DKIM se não existir
if [ ! -d "/etc/dkim" ]; then
    echo "Criando diretório DKIM..."
    sudo mkdir -p /etc/dkim
fi

# Verifica se a chave DKIM existe e tem as permissões corretas
if [ ! -f "/etc/dkim/private.key" ]; then
    echo "Chave DKIM não encontrada em /etc/dkim/private.key"
    echo "Execute o script setup_dkim.sh primeiro para configurar o DKIM."
    exit 1
fi

# Verifica as permissões da chave DKIM
if [ "$(stat -c %a /etc/dkim/private.key)" != "600" ]; then
    echo "Ajustando permissões da chave DKIM..."
    sudo chmod 600 /etc/dkim/private.key
fi

# Verifica e ajusta permissões dos arquivos de log
touch email_dispatcher.log
chmod 666 email_dispatcher.log

# Verifica e ajusta permissões do arquivo de estatísticas
touch email_stats.json
chmod 666 email_stats.json

if [ "$MODE" = "tui" ]; then
    echo "Iniciando interface TUI..."
    python3 tui.py
else
    # Cria links simbólicos para os arquivos da interface web
    ln -sf app.html index.html
    ln -sf dashboard.html dashboard.html

    # Inicia o servidor web
    echo "Iniciando servidor web..."
    echo "Acesse http://localhost:8000 para usar o sistema"
    python3 server.py
fi 