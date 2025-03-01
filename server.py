from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from datetime import datetime
from urllib.parse import parse_qs, urlparse
from sender import EmailDispatcher
from scheduler import EmailScheduler
import pandas as pd
from pathlib import Path
import re

class WebHandler(SimpleHTTPRequestHandler):
    # Atributos de classe
    schedules = []
    lists_dir = Path('lists')
    _lists_cache = {}
    _last_cache_update = 0
    cache_ttl = 30  # tempo em segundos
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dispatcher = EmailDispatcher()
        self.scheduler = EmailScheduler(self.schedules)
        
        # Garante que o diretório lists existe
        self.lists_dir.mkdir(exist_ok=True)

    @classmethod
    def init_scheduler(cls):
        """Inicializa o scheduler de emails"""
        cls.scheduler = EmailScheduler(cls.schedules)
        cls.scheduler.start()
        
        # Garante que o diretório lists existe
        cls.lists_dir.mkdir(exist_ok=True)
        print(f"Diretório de listas inicializado em: {cls.lists_dir.absolute()}")
    
    def do_GET(self):
        try:
            if self.path == '/api/lists':
                print("Requisição recebida para /api/lists")
                print(f"Diretório de listas: {self.lists_dir.absolute()}")
                response = self.handle_request(self.path)
                if response:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    print(f"Enviando listas: {json.dumps(response)}")
                    self.wfile.write(json.dumps(response).encode())
                return
            elif self.path.startswith('/unsubscribe'):
                response = self.handle_unsubscribe_request(self.path)
                return
            elif self.path.startswith('/api/preview_list/'):
                response = self.handle_request(self.path)
            elif self.path == '/api/stats':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                
                try:
                    with open('email_stats.json', 'r') as f:
                        stats = json.load(f)
                except FileNotFoundError:
                    stats = {
                        'total': 0,
                        'enviados': 0,
                        'falhas': 0,
                        'invalidos': 0,
                        'status': 'aguardando',
                        'inicio': None,
                        'fim': None,
                        'erros': []
                    }
                
                self.wfile.write(json.dumps(stats).encode())
                return
            elif self.path == '/schedules':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(self.schedules).encode())
                return
            elif self.path == '/list_templates':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                templates = []
                try:
                    for arquivo in os.listdir('templates'):
                        if arquivo.endswith('.html'):
                            templates.append(arquivo)
                except Exception as e:
                    print(f"Erro ao listar templates: {str(e)}")
                
                self.wfile.write(json.dumps(sorted(templates)).encode())
                return
            else:
                # Serve arquivos estáticos
                super().do_GET()
                return
                
            if response:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            print(f"Erro no GET: {e}")
            self.send_error(500)
    
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            response = None
            
            if self.path == '/api/select_list':
                response = self.handle_request(self.path, 'POST', data)
            elif self.path == '/unsubscribe':
                # Processa solicitação de descadastro via POST
                if 'email' in data:
                    email = data['email']
                    
                    # Verifica se o email é válido
                    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
                        self.send_response(400)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            'success': False,
                            'message': 'Email inválido'
                        }).encode())
                        return
                    
                    # Adiciona o email à blacklist
                    import sqlite3
                    conn = sqlite3.connect('email_blacklist.db')
                    cursor = conn.cursor()
                    
                    # Verifica se o email já está na blacklist
                    cursor.execute("SELECT email FROM invalid_emails WHERE email = ?", (email,))
                    if cursor.fetchone():
                        # Email já está na blacklist
                        conn.close()
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            'success': True,
                            'message': 'Email já estava descadastrado'
                        }).encode())
                        return
                    
                    # Adiciona o email à blacklist
                    cursor.execute(
                        "INSERT INTO invalid_emails (email, reason) VALUES (?, ?)",
                        (email, "Descadastro voluntário via API")
                    )
                    conn.commit()
                    conn.close()
                    
                    # Retorna uma resposta de sucesso
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'message': 'Email descadastrado com sucesso'
                    }).encode())
                    return
                else:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': False,
                        'message': 'Email não fornecido'
                    }).encode())
                    return
            elif self.path == '/api/send_test':
                try:
                    dispatcher = EmailDispatcher()
                    
                    # Cria arquivo CSV temporário
                    with open('teste_email.csv', 'w') as f:
                        f.write("EMAIL,NOME\n")
                        f.write(f"{data['email']},{data['name']}")
                    
                    # Envia o email
                    result = dispatcher.enviar_emails(
                        lista_emails_path='teste_email.csv',
                        template_path=os.path.join('templates', data['template']),
                        horario_envio=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        assunto=data['subject'],
                        remetente='Blazee <contato@useblazee.com.br>'
                    )
                    
                    # Remove o arquivo temporário
                    os.remove('teste_email.csv')
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    
                    response = {'success': result}
                    if not result:
                        response['error'] = 'Erro ao enviar email'
                    
                    self.wfile.write(json.dumps(response).encode())
                    return
                
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
                    return
            elif self.path == '/api/schedule':
                try:
                    print(f"\n=== Novo agendamento recebido ===")
                    print(f"Data/Hora: {data.get('datetime')}")
                    print(f"Template: {data.get('template')}")
                    print(f"Lista: {data.get('list_name')}")
                    
                    if not data.get('list_name'):
                        error_msg = 'Nome da lista não fornecido'
                        print(f"Erro: {error_msg}")
                        self.send_error_response(error_msg)
                        return
                    
                    file_path = self.lists_dir / data['list_name']
                    if not file_path.exists():
                        error_msg = 'Lista não encontrada'
                        print(f"Erro: {error_msg} ({file_path})")
                        self.send_error_response(error_msg)
                        return
                    
                    print(f"Verificando lista: {file_path}")
                    
                    # Lê a lista selecionada
                    try:
                        # Verifica encoding do arquivo
                        with open(file_path, 'rb') as f:
                            raw_data = f.read(1024)
                            encoding = 'utf-8'
                            try:
                                import chardet
                                detected = chardet.detect(raw_data)
                                if detected['confidence'] > 0.7:
                                    encoding = detected['encoding']
                                    print(f"Encoding detectado: {encoding}")
                            except ImportError:
                                print("Módulo chardet não encontrado, usando UTF-8")
                        
                        df = pd.read_csv(file_path, encoding=encoding)
                        print(f"Lista carregada com sucesso: {len(df)} emails")
                        
                        # Valida as colunas necessárias
                        required_columns = {'EMAIL', 'NOME'}
                        columns = {col.upper() for col in df.columns}
                        if not required_columns.issubset(columns):
                            missing = required_columns - columns
                            error_msg = f"Colunas obrigatórias ausentes: {missing}"
                            print(f"Erro: {error_msg}")
                            self.send_error_response(error_msg)
                            return
                        
                    except Exception as e:
                        error_msg = f"Erro ao ler lista: {str(e)}"
                        print(f"Erro: {error_msg}")
                        self.send_error_response(error_msg)
                        return
                    
                    # Valida o template
                    template_path = Path('templates') / data['template']
                    if not template_path.exists():
                        error_msg = 'Template não encontrado'
                        print(f"Erro: {error_msg} ({template_path})")
                        self.send_error_response(error_msg)
                        return
                    
                    # Cria o agendamento
                    schedule_id = len(self.schedules) + 1
                    schedule = {
                        'id': schedule_id,
                        'type': 'mass',
                        'template': data['template'],
                        'subject': data['subject'],
                        'preview': data.get('preview', ''),
                        'datetime': data['datetime'],
                        'status': 'pendente',
                        'list_path': str(file_path),
                        'total_emails': len(df),
                        'created_at': datetime.now().isoformat()
                    }
                    
                    self.schedules.append(schedule)
                    print(f"Agendamento criado com sucesso: ID {schedule_id}")
                    print(f"Total de emails: {len(df)}")
                    print(f"Data/Hora agendada: {data['datetime']}")
                    
                    # Envia resposta de sucesso
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    response = {
                        'status': 'success',
                        'schedule': schedule
                    }
                    self.wfile.write(json.dumps(response).encode())
                    return
                    
                except Exception as e:
                    error_msg = f"Erro ao criar agendamento: {str(e)}"
                    print(f"Erro crítico: {error_msg}")
                    self.send_error_response(error_msg)
                    return
            elif self.path.startswith('/cancel_schedule/'):
                try:
                    schedule_id = int(self.path.split('/')[-1])
                    for schedule in self.schedules:
                        if schedule['id'] == schedule_id and schedule['status'] == 'pendente':
                            schedule['status'] = 'cancelado'
                            break
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True}).encode())
                    return
                
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
                    return
            
            if response:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())
            else:
                self.send_error(404)
                
        except Exception as e:
            print(f"Erro no POST: {e}")
            self.send_error(500)

    def get_list_info(self, file_path):
        try:
            current_time = datetime.now().timestamp()
            cache_key = str(file_path)
            
            # Verifica se tem no cache e se ainda é válido
            if (cache_key in self._lists_cache and 
                current_time - self._last_cache_update < self.cache_ttl):
                print(f"Usando cache para {file_path.name}")
                cached_info = self._lists_cache[cache_key]
                # Retorna apenas informações essenciais do cache
                return {
                    'name': cached_info['name'],
                    'count': cached_info['count'],
                    'modified': cached_info['modified']
                }
            
            print(f"Lendo arquivo {file_path.name}")
            
            # Verifica se o arquivo existe
            if not file_path.exists():
                print(f"Arquivo não encontrado: {file_path}")
                return None
            
            # Lê o arquivo CSV com detecção de encoding
            with open(file_path, 'rb') as f:
                raw_data = f.read()
                encoding = 'utf-8'
                try:
                    import chardet
                    detected = chardet.detect(raw_data)
                    if detected['confidence'] > 0.7:
                        encoding = detected['encoding']
                        print(f"Encoding detectado para {file_path.name}: {encoding}")
                except ImportError:
                    print("Módulo chardet não encontrado, usando UTF-8")
                except Exception as e:
                    print(f"Erro ao detectar encoding: {str(e)}, usando UTF-8")

            # Tenta ler o CSV
            try:
                df = pd.read_csv(file_path, encoding=encoding)
            except UnicodeDecodeError:
                print(f"Erro de encoding, tentando com latin1 para {file_path.name}")
                df = pd.read_csv(file_path, encoding='latin1')
            except Exception as e:
                print(f"Erro ao ler CSV {file_path.name}: {str(e)}")
                return None
            
            # Verifica e padroniza as colunas
            required_columns = {'EMAIL', 'NOME'}
            columns = {col.upper() for col in df.columns}
            
            if not required_columns.issubset(columns):
                missing = required_columns - columns
                print(f"Colunas ausentes em {file_path.name}: {missing}")
                return None
            
            # Cria o objeto de informações (versão completa para cache)
            full_info = {
                'name': file_path.name,
                'count': len(df),
                'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                'columns': list(df.columns),
                'encoding': encoding
            }
            
            # Atualiza o cache da classe com informações completas
            self.__class__._lists_cache[cache_key] = full_info
            self.__class__._last_cache_update = current_time
            
            # Retorna apenas informações essenciais
            info = {
                'name': full_info['name'],
                'count': full_info['count'],
                'modified': full_info['modified']
            }
            
            print(f"Arquivo {file_path.name} processado com sucesso")
            return info
            
        except Exception as e:
            print(f"Erro ao processar {file_path}: {str(e)}")
            return None

    def handle_request(self, path, method='GET', data=None):
        if path == '/api/lists' and method == 'GET':
            try:
                lists = []
                print(f"Buscando arquivos CSV em: {self.lists_dir.absolute()}")
                
                # Verifica se o diretório existe
                if not self.lists_dir.exists():
                    print("Diretório de listas não encontrado. Criando...")
                    self.lists_dir.mkdir(exist_ok=True)
                
                # Lista todos os arquivos CSV
                csv_files = sorted(self.lists_dir.glob('*.csv'))
                print(f"Arquivos CSV encontrados: {[f.name for f in csv_files]}")
                
                for file in csv_files:
                    print(f"Processando arquivo: {file}")
                    try:
                        info = self.get_list_info(file)
                        if info:
                            lists.append(info)
                            print(f"Lista processada com sucesso: {info['name']}")
                        else:
                            print(f"Arquivo ignorado (formato inválido): {file}")
                    except Exception as e:
                        print(f"Erro ao processar arquivo {file}: {str(e)}")
                        continue
                
                print(f"Total de listas válidas encontradas: {len(lists)}")
                return {'status': 'success', 'data': lists}
            except Exception as e:
                error_msg = f"Erro ao listar arquivos: {str(e)}"
                print(error_msg)
                return {'status': 'error', 'message': error_msg}

        elif path.startswith('/api/preview_list/') and method == 'GET':
            try:
                list_name = path.split('/')[-1]
                file_path = self.lists_dir / list_name
                if not file_path.exists():
                    return {'status': 'error', 'message': 'Lista não encontrada'}
                
                # Verifica se tem no cache
                cache_key = str(file_path)
                if cache_key in self._lists_cache:
                    encoding = self._lists_cache[cache_key].get('encoding', 'utf-8')
                else:
                    # Detecta encoding se não estiver em cache
                    with open(file_path, 'rb') as f:
                        raw_data = f.read(1024)  # Lê apenas o início do arquivo
                        encoding = 'utf-8'
                        try:
                            import chardet
                            detected = chardet.detect(raw_data)
                            if detected['confidence'] > 0.7:
                                encoding = detected['encoding']
                        except:
                            pass

                # Lê apenas as primeiras linhas do arquivo
                df = pd.read_csv(file_path, encoding=encoding, nrows=5)
                preview_rows = df.to_dict('records')
                
                return {
                    'status': 'success',
                    'preview': preview_rows,
                    'total_rows': sum(1 for _ in open(file_path, encoding=encoding))
                }
            except Exception as e:
                error_msg = f"Erro ao gerar preview: {str(e)}"
                print(error_msg)
                return {'status': 'error', 'message': error_msg}

        elif path == '/api/select_list' and method == 'POST':
            try:
                list_name = data.get('list_name')
                if not list_name:
                    return {'status': 'error', 'message': 'Nome da lista não fornecido'}
                
                file_path = self.lists_dir / list_name
                if not file_path.exists():
                    return {'status': 'error', 'message': 'Lista não encontrada'}
                
                # Armazena a lista selecionada para uso posterior
                self.selected_list = str(file_path)
                return {'status': 'success', 'message': 'Lista selecionada com sucesso'}
            except Exception as e:
                return {'status': 'error', 'message': str(e)}

        elif path == '/api/schedule' and method == 'POST':
            try:
                print(f"\n=== Novo agendamento recebido ===")
                print(f"Data/Hora: {data.get('datetime')}")
                print(f"Template: {data.get('template')}")
                print(f"Lista: {data.get('list_name')}")
                
                if not data.get('list_name'):
                    error_msg = 'Nome da lista não fornecido'
                    print(f"Erro: {error_msg}")
                    self.send_error_response(error_msg)
                    return
                
                file_path = self.lists_dir / data['list_name']
                if not file_path.exists():
                    error_msg = 'Lista não encontrada'
                    print(f"Erro: {error_msg} ({file_path})")
                    self.send_error_response(error_msg)
                    return
                
                print(f"Verificando lista: {file_path}")
                
                # Lê a lista selecionada
                try:
                    # Verifica encoding do arquivo
                    with open(file_path, 'rb') as f:
                        raw_data = f.read(1024)
                        encoding = 'utf-8'
                        try:
                            import chardet
                            detected = chardet.detect(raw_data)
                            if detected['confidence'] > 0.7:
                                encoding = detected['encoding']
                                print(f"Encoding detectado: {encoding}")
                        except ImportError:
                            print("Módulo chardet não encontrado, usando UTF-8")
                    
                    df = pd.read_csv(file_path, encoding=encoding)
                    print(f"Lista carregada com sucesso: {len(df)} emails")
                    
                    # Valida as colunas necessárias
                    required_columns = {'EMAIL', 'NOME'}
                    columns = {col.upper() for col in df.columns}
                    if not required_columns.issubset(columns):
                        missing = required_columns - columns
                        error_msg = f"Colunas obrigatórias ausentes: {missing}"
                        print(f"Erro: {error_msg}")
                        self.send_error_response(error_msg)
                        return
                    
                except Exception as e:
                    error_msg = f"Erro ao ler lista: {str(e)}"
                    print(f"Erro: {error_msg}")
                    self.send_error_response(error_msg)
                    return
                
                # Valida o template
                template_path = Path('templates') / data['template']
                if not template_path.exists():
                    error_msg = 'Template não encontrado'
                    print(f"Erro: {error_msg} ({template_path})")
                    self.send_error_response(error_msg)
                    return
                
                # Cria o agendamento
                schedule_id = len(self.schedules) + 1
                schedule = {
                    'id': schedule_id,
                    'type': 'mass',
                    'template': data['template'],
                    'subject': data['subject'],
                    'preview': data.get('preview', ''),
                    'datetime': data['datetime'],
                    'status': 'pendente',
                    'list_path': str(file_path),
                    'total_emails': len(df),
                    'created_at': datetime.now().isoformat()
                }
                
                self.schedules.append(schedule)
                print(f"Agendamento criado com sucesso: ID {schedule_id}")
                print(f"Total de emails: {len(df)}")
                print(f"Data/Hora agendada: {data['datetime']}")
                
                # Envia resposta de sucesso
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    'status': 'success',
                    'schedule': schedule
                }
                self.wfile.write(json.dumps(response).encode())
                return
                
            except Exception as e:
                error_msg = f"Erro ao criar agendamento: {str(e)}"
                print(f"Erro crítico: {error_msg}")
                self.send_error_response(error_msg)
                return

    def send_error_response(self, message):
        self.send_response(400)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'error', 'message': message}).encode())

    def handle_unsubscribe_request(self, path):
        """Processa solicitações de descadastro de emails"""
        try:
            # Extrai o ID da URL
            parsed_url = urlparse(path)
            params = parse_qs(parsed_url.query)
            
            # Verifica se o email foi fornecido
            if 'email' in params:
                email = params['email'][0]
                
                # Verifica se o email é válido
                if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
                    self.send_response(400)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(self.get_unsubscribe_error_page("Email inválido").encode())
                    return
                
                # Adiciona o email à blacklist
                import sqlite3
                conn = sqlite3.connect('email_blacklist.db')
                cursor = conn.cursor()
                
                # Verifica se o email já está na blacklist
                cursor.execute("SELECT email FROM invalid_emails WHERE email = ?", (email,))
                if cursor.fetchone():
                    # Email já está na blacklist
                    conn.close()
                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(self.get_unsubscribe_success_page(email).encode())
                    return
                
                # Adiciona o email à blacklist
                cursor.execute(
                    "INSERT INTO invalid_emails (email, reason) VALUES (?, ?)",
                    (email, "Descadastro voluntário")
                )
                conn.commit()
                conn.close()
                
                # Retorna uma página de sucesso
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(self.get_unsubscribe_success_page(email).encode())
                return
            else:
                # Se não houver email, exibe um formulário para o usuário inserir o email
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(self.get_unsubscribe_form().encode())
                return
                
        except Exception as e:
            print(f"Erro ao processar descadastro: {str(e)}")
            self.send_response(500)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(self.get_unsubscribe_error_page(str(e)).encode())
            return

    def get_unsubscribe_form(self):
        """Retorna o HTML do formulário de descadastro"""
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Descadastro de Lista de Emails</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    background-color: #f9f9f9;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #444;
                    margin-bottom: 20px;
                }
                form {
                    margin-top: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                }
                input[type="email"] {
                    width: 100%;
                    padding: 10px;
                    margin-bottom: 20px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    box-sizing: border-box;
                }
                button {
                    background-color: #e74c3c;
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                }
                button:hover {
                    background-color: #c0392b;
                }
                .footer {
                    margin-top: 20px;
                    font-size: 12px;
                    color: #777;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Descadastro de Lista de Emails</h1>
                <p>Para se descadastrar da nossa lista de emails, por favor, insira seu endereço de email abaixo:</p>
                
                <form action="/unsubscribe" method="get">
                    <label for="email">Seu Email:</label>
                    <input type="email" id="email" name="email" required placeholder="seu@email.com">
                    <button type="submit">Descadastrar</button>
                </form>
                
                <div class="footer">
                    <p>Se você tiver alguma dúvida, entre em contato conosco pelo email: contato@useblazee.com.br</p>
                </div>
            </div>
        </body>
        </html>
        """

    def get_unsubscribe_success_page(self, email):
        """Retorna o HTML da página de sucesso de descadastro"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Descadastro Concluído</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    background-color: #f9f9f9;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    text-align: center;
                }}
                h1 {{
                    color: #444;
                    margin-bottom: 20px;
                }}
                .success-icon {{
                    color: #2ecc71;
                    font-size: 48px;
                    margin-bottom: 20px;
                }}
                .email {{
                    font-weight: bold;
                    color: #555;
                    background-color: #f5f5f5;
                    padding: 5px 10px;
                    border-radius: 3px;
                }}
                .footer {{
                    margin-top: 30px;
                    font-size: 12px;
                    color: #777;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✓</div>
                <h1>Descadastro Concluído</h1>
                <p>O email <span class="email">{email}</span> foi removido com sucesso da nossa lista de emails.</p>
                <p>Você não receberá mais emails de marketing da nossa parte.</p>
                
                <div class="footer">
                    <p>Se você tiver alguma dúvida, entre em contato conosco pelo email: contato@useblazee.com.br</p>
                </div>
            </div>
        </body>
        </html>
        """

    def get_unsubscribe_error_page(self, error_message):
        """Retorna o HTML da página de erro de descadastro"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Erro no Descadastro</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    background-color: #f9f9f9;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    text-align: center;
                }}
                h1 {{
                    color: #e74c3c;
                    margin-bottom: 20px;
                }}
                .error-icon {{
                    color: #e74c3c;
                    font-size: 48px;
                    margin-bottom: 20px;
                }}
                .error-message {{
                    color: #555;
                    background-color: #f5f5f5;
                    padding: 10px;
                    border-radius: 3px;
                    margin-bottom: 20px;
                }}
                .button {{
                    display: inline-block;
                    background-color: #3498db;
                    color: white;
                    text-decoration: none;
                    padding: 10px 15px;
                    border-radius: 4px;
                    margin-top: 10px;
                }}
                .button:hover {{
                    background-color: #2980b9;
                }}
                .footer {{
                    margin-top: 30px;
                    font-size: 12px;
                    color: #777;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="error-icon">✗</div>
                <h1>Erro no Descadastro</h1>
                <p>Ocorreu um erro ao processar sua solicitação de descadastro:</p>
                <div class="error-message">{error_message}</div>
                <p>Por favor, tente novamente ou entre em contato com nosso suporte.</p>
                <a href="/unsubscribe" class="button">Tentar Novamente</a>
                
                <div class="footer">
                    <p>Se você tiver alguma dúvida, entre em contato conosco pelo email: contato@useblazee.com.br</p>
                </div>
            </div>
        </body>
        </html>
        """

    @staticmethod
    def check_email_blacklist(email):
        """Verifica se um email está na blacklist"""
        try:
            import sqlite3
            conn = sqlite3.connect('email_blacklist.db')
            cursor = conn.cursor()
            
            # Verifica se o email está na blacklist
            cursor.execute("SELECT email FROM invalid_emails WHERE email = ?", (email,))
            result = cursor.fetchone() is not None
            conn.close()
            
            return result
        except Exception as e:
            print(f"Erro ao verificar blacklist: {str(e)}")
            return False

def run_server(port=8000):
    server_address = ('', port)
    print(f"\n=== Iniciando servidor em http://localhost:{port} ===")
    
    # Inicializa o scheduler
    print("Inicializando scheduler...")
    WebHandler.init_scheduler()
    
    # Cria e inicia o servidor
    print("Criando servidor HTTP...")
    httpd = HTTPServer(server_address, WebHandler)
    print(f"Servidor pronto! Acesse http://localhost:{port}")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server() 