import time
from datetime import datetime
import pytz
import threading
from sender import EmailDispatcher
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import os

class EmailScheduler:
    def __init__(self, schedules):
        self.schedules = schedules
        self.dispatcher = EmailDispatcher()
        self.timezone = pytz.timezone('America/Sao_Paulo')
        self.running = False
        self.thread = None
        
        # Configurações de otimização
        self.max_workers = 4  # Número de threads para envio
        self.batch_size = 1000  # Tamanho de cada lote
        self.thread_pool = ThreadPoolExecutor(max_workers=self.max_workers)
    
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
        self.thread_pool.shutdown(wait=True)
    
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
                        schedule_time = self.timezone.localize(schedule_time)
                    else:
                        schedule_time = schedule_time.astimezone(self.timezone)
                    
                    if schedule_time <= now:
                        self._process_schedule(schedule)
                except Exception as e:
                    print(f"Erro ao processar data do agendamento: {e}")
                    schedule['status'] = 'erro'
                    schedule['error'] = str(e)
            
            time.sleep(60)
    
    def _process_batch(self, batch_df, template_path, horario_envio, assunto, remetente):
        """Processa um lote de emails"""
        # Cria um arquivo temporário para o lote
        batch_file = f'temp_batch_{threading.get_ident()}.csv'
        try:
            batch_df.to_csv(batch_file, index=False)
            return self.dispatcher.enviar_emails(
                lista_emails_path=batch_file,
                template_path=template_path,
                horario_envio=horario_envio,
                assunto=assunto,
                remetente=remetente
            )
        finally:
            # Limpa o arquivo temporário
            if os.path.exists(batch_file):
                os.remove(batch_file)
    
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
                # Para emails de teste, mantém o processamento simples
                with open('teste_email.csv', 'w') as f:
                    f.write("EMAIL,NOME\n")
                    f.write(f"{schedule['email']},{schedule['name']}")
                
                result = self.dispatcher.enviar_emails(
                    lista_emails_path='teste_email.csv',
                    template_path=f"templates/{schedule['template']}",
                    horario_envio=horario_envio,
                    assunto=schedule['subject'],
                    remetente='Blazee <contato@useblazee.com.br>'
                )
                
                os.remove('teste_email.csv')
                schedule['status'] = 'concluido' if result else 'erro'
            
            else:  # type == 'mass'
                # Processa em lotes usando múltiplas threads
                df = pd.read_csv('lista_completa.csv')
                total_rows = len(df)
                futures = []
                
                # Divide em lotes e submete para o pool de threads
                for start in range(0, total_rows, self.batch_size):
                    end = min(start + self.batch_size, total_rows)
                    batch_df = df.iloc[start:end]
                    
                    future = self.thread_pool.submit(
                        self._process_batch,
                        batch_df,
                        f"templates/{schedule['template']}",
                        horario_envio,
                        schedule['subject'],
                        'Blazee <contato@useblazee.com.br>'
                    )
                    futures.append(future)
                
                # Aguarda todos os lotes terminarem
                results = [future.result() for future in futures]
                schedule['status'] = 'concluido' if all(results) else 'erro'
        
        except Exception as e:
            schedule['status'] = 'erro'
            schedule['error'] = str(e)
            print(f"Erro no processamento do agendamento: {e}") 