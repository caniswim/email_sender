from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from datetime import datetime
import cgi
from urllib.parse import parse_qs, urlparse
from sender import EmailDispatcher
from scheduler import EmailScheduler

class WebHandler(SimpleHTTPRequestHandler):
    # Armazena os agendamentos em memória
    schedules = []
    
    @classmethod
    def init_scheduler(cls):
        """Inicializa o scheduler de emails"""
        cls.scheduler = EmailScheduler(cls.schedules)
        cls.scheduler.start()
    
    def do_GET(self):
        if self.path == '/email_stats.json':
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
        
        elif self.path == '/list_templates':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
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
            
        elif self.path == '/schedules':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(self.schedules).encode())
            return
        
        return SimpleHTTPRequestHandler.do_GET(self)
    
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        if self.path == '/send_test':
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
        
        elif self.path == '/schedule_test':
            try:
                # Adiciona o agendamento à lista
                schedule_id = len(self.schedules) + 1
                schedule = {
                    'id': schedule_id,
                    'type': 'test',
                    'template': data['template'],
                    'email': data['email'],
                    'name': data['name'],
                    'subject': data['subject'],
                    'preview': data['preview'],
                    'datetime': data['datetime'],
                    'status': 'pendente'
                }
                self.schedules.append(schedule)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'schedule': schedule}).encode())
                return
            
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
                return
        
        elif self.path == '/schedule':
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
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
                return
            
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
                return

def run_server(port=8000):
    server_address = ('', port)
    WebHandler.init_scheduler()  # Inicia o scheduler antes de iniciar o servidor
    httpd = HTTPServer(server_address, WebHandler)
    print(f"Servidor rodando em http://localhost:{port}")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server() 
    run_server() 