import time
from datetime import datetime
import pytz
import threading
from sender import EmailDispatcher

class EmailScheduler:
    def __init__(self, schedules):
        self.schedules = schedules
        self.dispatcher = EmailDispatcher()
        self.timezone = pytz.timezone('America/Sao_Paulo')
        self.running = False
        self.thread = None
    
    def start(self):
        """Inicia o scheduler em uma thread separada"""
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._run)
            self.thread.daemon = True
            self.thread.start()
    
    def stop(self):
        """Para o scheduler"""
        self.running = False
        if self.thread:
            self.thread.join()
    
    def _run(self):
        """Loop principal do scheduler"""
        while self.running:
            now = datetime.now(self.timezone)
            
            # Verifica todos os agendamentos pendentes
            for schedule in self.schedules:
                if schedule['status'] != 'pendente':
                    continue
                
                try:
                    # Converte a string de data para datetime com fuso horário
                    schedule_time = datetime.fromisoformat(schedule['datetime'].replace(' ', 'T'))
                    if schedule_time.tzinfo is None:
                        # Se a data não tem fuso horário, adiciona
                        schedule_time = self.timezone.localize(schedule_time)
                    else:
                        # Se já tem fuso horário, converte para São Paulo
                        schedule_time = schedule_time.astimezone(self.timezone)
                    
                    if schedule_time <= now:
                        self._process_schedule(schedule)
                except Exception as e:
                    print(f"Erro ao processar data do agendamento: {e}")
                    schedule['status'] = 'erro'
                    schedule['error'] = str(e)
            
            # Aguarda 1 minuto antes da próxima verificação
            time.sleep(60)
    
    def _process_schedule(self, schedule):
        """Processa um agendamento"""
        try:
            schedule['status'] = 'enviando'
            
            # Converte o horário de envio para o fuso horário correto
            horario_envio = datetime.fromisoformat(schedule['datetime'].replace(' ', 'T'))
            if horario_envio.tzinfo is None:
                horario_envio = self.timezone.localize(horario_envio)
            horario_envio = horario_envio.strftime('%Y-%m-%d %H:%M:%S')
            
            if schedule['type'] == 'test':
                # Cria arquivo CSV temporário para email de teste
                with open('teste_email.csv', 'w') as f:
                    f.write("EMAIL,NOME\n")
                    f.write(f"{schedule['email']},{schedule['name']}")
                
                # Envia o email de teste
                result = self.dispatcher.enviar_emails(
                    lista_emails_path='teste_email.csv',
                    template_path=f"templates/{schedule['template']}",
                    horario_envio=horario_envio,
                    assunto=schedule['subject'],
                    remetente='Blazee <contato@useblazee.com.br>'
                )
                
                # Remove o arquivo temporário
                import os
                os.remove('teste_email.csv')
            
            else:  # type == 'mass'
                # Envia email em massa
                result = self.dispatcher.enviar_emails(
                    lista_emails_path='lista_completa.csv',
                    template_path=f"templates/{schedule['template']}",
                    horario_envio=horario_envio,
                    assunto=schedule['subject'],
                    remetente='Blazee <contato@useblazee.com.br>'
                )
            
            schedule['status'] = 'concluido' if result else 'erro'
        
        except Exception as e:
            schedule['status'] = 'erro'
            schedule['error'] = str(e) 