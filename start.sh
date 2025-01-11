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
echo "Ativando ambiente virtual..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Instala as dependências
echo "Instalando dependências..."
pip install --upgrade pip
pip install pandas pytz dkimpy tenacity

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