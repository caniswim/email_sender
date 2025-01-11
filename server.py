from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from datetime import datetime
from urllib.parse import parse_qs, urlparse
from sender import EmailDispatcher
from scheduler import EmailScheduler
import pandas as pd
from pathlib import Path

class WebHandler(SimpleHTTPRequestHandler):
    # Armazena os agendamentos em memória
    schedules = []
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dispatcher = EmailDispatcher()
        self.scheduler = EmailScheduler(self.schedules)
        self.lists_dir = Path('lists')
        self.lists_dir.mkdir(exist_ok=True)
        self._lists_cache = {}
        self._last_cache_update = 0
        self.cache_ttl = 30  # tempo em segundos

    @classmethod
    def init_scheduler(cls):
        """Inicializa o scheduler de emails"""
        cls.scheduler = EmailScheduler(cls.schedules)
        cls.scheduler.start()
    
    def do_GET(self):
        try:
            if self.path == '/api/lists':
                print("Requisição recebida para /api/lists")
                response = self.handle_request(self.path)
                if response:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    print(f"Enviando listas: {json.dumps(response)}")
                    self.wfile.write(json.dumps(response).encode())
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
                    # Adiciona o agendamento à lista
                    schedule_id = len(self.schedules) + 1
                    schedule = {
                        'id': schedule_id,
                        'type': 'mass',
                        'template': data['template'],
                        'subject': data['subject'],
                        'preview': data['preview'],
                        'datetime': data['datetime'],
                        'status': 'pendente'
                    }
                    self.schedules.append(schedule)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True, 'schedule': schedule}).encode())
                    return
                
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
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
                return self._lists_cache[cache_key]
            
            # Lê o arquivo CSV com detecção de encoding
            with open(file_path, 'rb') as f:
                raw_data = f.read()
                encoding = 'utf-8'
                try:
                    import chardet
                    detected = chardet.detect(raw_data)
                    if detected['confidence'] > 0.7:
                        encoding = detected['encoding']
                except ImportError:
                    pass

            df = pd.read_csv(file_path, encoding=encoding)
            
            # Verifica e padroniza as colunas
            required_columns = {'EMAIL', 'NOME'}
            columns = {col.upper() for col in df.columns}
            
            if not required_columns.issubset(columns):
                missing = required_columns - columns
                print(f"Aviso: Colunas ausentes em {file_path.name}: {missing}")
                return None
            
            info = {
                'name': file_path.name,
                'count': len(df),
                'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                'columns': list(df.columns),
                'preview': df.head(3).to_dict('records')
            }
            
            # Atualiza o cache
            self._lists_cache[cache_key] = info
            self._last_cache_update = current_time
            
            return info
        except Exception as e:
            print(f"Erro ao ler lista {file_path}: {e}")
            return None

    def handle_request(self, path, method='GET', data=None):
        if path == '/api/lists' and method == 'GET':
            try:
                lists = []
                print(f"Buscando arquivos CSV em: {self.lists_dir}")
                for file in sorted(self.lists_dir.glob('*.csv')):
                    print(f"Processando arquivo: {file}")
                    info = self.get_list_info(file)
                    if info:
                        lists.append(info)
                print(f"Total de listas encontradas: {len(lists)}")
                return {'status': 'success', 'data': lists}
            except Exception as e:
                print(f"Erro ao listar arquivos: {str(e)}")
                return {'status': 'error', 'message': str(e)}

        elif path.startswith('/api/preview_list/') and method == 'GET':
            try:
                list_name = path.split('/')[-1]
                file_path = self.lists_dir / list_name
                if not file_path.exists():
                    return {'status': 'error', 'message': 'Lista não encontrada'}
                
                df = pd.read_csv(file_path)
                preview_rows = df.head(10).to_dict('records')
                return {'status': 'success', 'rows': preview_rows}
            except Exception as e:
                return {'status': 'error', 'message': str(e)}

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
                if not hasattr(self, 'selected_list'):
                    return {'status': 'error', 'message': 'Nenhuma lista selecionada'}
                
                # Lê a lista selecionada
                df = pd.read_csv(self.selected_list)
                
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
                    'list_path': self.selected_list,
                    'total_emails': len(df)
                }
                
                self.schedules[schedule_id] = schedule
                return {'status': 'success', 'schedule': schedule}
                
            except Exception as e:
                return {'status': 'error', 'message': str(e)}

def run_server(port=8000):
    server_address = ('', port)
    WebHandler.init_scheduler()  # Inicia o scheduler antes de iniciar o servidor
    httpd = HTTPServer(server_address, WebHandler)
    print(f"Servidor rodando em http://localhost:{port}")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server() 
    run_server() 