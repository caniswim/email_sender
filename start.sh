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
    echo "Python 3 não encontrado. Por favor, instale o Python 3."
    exit 1
fi

# Ativa ou cria o ambiente virtual
echo "Verificando ambiente virtual..."
if [ ! -d "venv" ]; then
    echo "Criando ambiente virtual..."
    python3 -m venv venv
fi
source venv/bin/activate

# Verifica se as dependências Python já estão instaladas
echo "Verificando dependências Python..."
if ! python3 -c "import pandas" 2>/dev/null; then
    echo "Instalando dependências Python..."
    pip install --no-cache-dir \
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
fi

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

# Verifica se a pasta lists existe e cria se necessário
if [ ! -d "lists" ]; then
    echo "Criando pasta 'lists'..."
    mkdir -p lists
fi

# Verifica se existem arquivos CSV na pasta lists
if [ ! "$(ls -A lists/*.csv 2>/dev/null)" ]; then
    echo "Aviso: Nenhum arquivo .csv encontrado na pasta 'lists'."
    echo "Coloque seus arquivos CSV na pasta 'lists'."
fi

# Verifica e ajusta permissões dos arquivos
touch email_dispatcher.log email_stats.json
chmod 666 email_dispatcher.log email_stats.json

if [ "$MODE" = "tui" ]; then
    echo "Iniciando interface TUI..."
    python3 tui.py
else
    # Inicia o servidor web
    echo "Iniciando servidor web..."
    echo "Acesse http://localhost:8000 para usar o sistema"
    python3 server.py
fi 