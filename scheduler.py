import time
from datetime import datetime
import pytz
import threading
from sender import EmailDispatcher
import pandas as pd
import os
import psutil
import sqlite3
from pathlib import Path

class EmailScheduler:
    def __init__(self, schedules):
        self.schedules = schedules
        self.dispatcher = EmailDispatcher()
        self.timezone = pytz.timezone('America/Sao_Paulo')
        self.running = False
        self.thread = None
        
        # Configurações de otimização
        self.batch_size = 250  # Lotes menores para melhor controle
        self.pause_between_emails = 0.05  # 50ms entre cada email do lote
        self.pause_between_batches = 10  # 10 segundos entre lotes
        self.memory_threshold = 75  # Limite mais conservador de memória
        
        # Banco de dados é opcional
        self.db_enabled = False
        self.conn = None
        try:
            self.init_database()
            self.db_enabled = True
        except Exception as e:
            print(f"Aviso: Banco de dados desativado - {e}")
            print("O sistema continuará funcionando sem armazenar emails inválidos")
    
    def init_database(self):
        """Inicializa o banco de dados SQLite"""
        try:
            db_path = Path('email_blacklist.db')
            self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
            cursor = self.conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS invalid_emails (
                    email TEXT PRIMARY KEY,
                    reason TEXT,
                    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    campaign_id TEXT
                )
            ''')
            self.conn.commit()
        except Exception as e:
            raise Exception(f"Erro ao inicializar banco de dados: {e}")
    
    def add_invalid_email(self, email, reason, campaign_id=None):
        """Tenta adicionar um email à lista de inválidos"""
        if not self.db_enabled:
            return
            
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                'INSERT OR REPLACE INTO invalid_emails (email, reason, campaign_id) VALUES (?, ?, ?)',
                (email, reason, campaign_id)
            )
            self.conn.commit()
            print(f"Email {email} adicionado à blacklist: {reason}")
        except Exception as e:
            print(f"Aviso: Não foi possível adicionar email à blacklist - {e}")
    
    def is_email_invalid(self, email):
        """Verifica se um email está na lista de inválidos"""
        if not self.db_enabled:
            return False
            
        try:
            cursor = self.conn.cursor()
            cursor.execute('SELECT 1 FROM invalid_emails WHERE email = ?', (email,))
            return cursor.fetchone() is not None
        except Exception as e:
            print(f"Aviso: Erro ao verificar email na blacklist - {e}")
            return False
    
    def filter_invalid_emails(self, df):
        """Tenta remover emails inválidos do DataFrame"""
        if not self.db_enabled:
            return df
            
        try:
            cursor = self.conn.cursor()
            cursor.execute('SELECT email FROM invalid_emails')
            invalid_emails = {row[0] for row in cursor.fetchall()}
            
            if not invalid_emails:
                return df
            
            initial_count = len(df)
            df = df[~df['EMAIL'].isin(invalid_emails)]
            filtered_count = initial_count - len(df)
            
            if filtered_count > 0:
                print(f"Removidos {filtered_count} emails inválidos da lista")
            
            return df
        except Exception as e:
            print(f"Aviso: Erro ao filtrar emails inválidos - {e}")
            print("Continuando com a lista completa")
            return df
    
    def check_system_resources(self):
        """Verifica recursos do sistema"""
        memory_percent = psutil.virtual_memory().percent
        return memory_percent < self.memory_threshold
    
    def process_with_rate_limit(self, batch_df, template_path, horario_envio, assunto, remetente, campaign_id=None):
        """Processa um lote com controle de taxa"""
        batch_file = f'temp_batch_{threading.get_ident()}.csv'
        try:
            if not self.check_system_resources():
                print("Sistema sobrecarregado, aguardando recursos...")
                time.sleep(60)
                return False
            
            for idx, row in batch_df.iterrows():
                email = row['EMAIL']
                
                # Tenta verificar se o email é inválido, mas continua mesmo se falhar
                try:
                    if self.is_email_invalid(email):
                        print(f"Pulando email inválido: {email}")
                        continue
                except Exception:
                    pass
                
                single_email_df = pd.DataFrame([row])
                single_email_df.to_csv(batch_file, index=False)
                
                result = self.dispatcher.enviar_emails(
                    lista_emails_path=batch_file,
                    template_path=template_path,
                    horario_envio=horario_envio,
                    assunto=assunto,
                    remetente=remetente
                )
                
                if not result:
                    print(f"Falha ao enviar email para {email}")
                    # Tenta adicionar à blacklist, mas continua mesmo se falhar
                    try:
                        if hasattr(self.dispatcher, 'last_error') and 'invalid' in str(self.dispatcher.last_error).lower():
                            self.add_invalid_email(email, str(self.dispatcher.last_error), campaign_id)
                    except Exception:
                        pass
                    return False
                
                time.sleep(self.pause_between_emails)
            
            time.sleep(self.pause_between_batches)
            return True
            
        finally:
            if os.path.exists(batch_file):
                os.remove(batch_file)
    
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
    
    def _process_schedule(self, schedule):
        """Processa um agendamento"""
        try:
            schedule['status'] = 'enviando'
            campaign_id = schedule.get('id', str(int(time.time())))
            
            horario_envio = datetime.fromisoformat(schedule['datetime'].replace(' ', 'T'))
            if horario_envio.tzinfo is None:
                horario_envio = self.timezone.localize(horario_envio)
            horario_envio = horario_envio.strftime('%Y-%m-%d %H:%M:%S')
            
            if schedule['type'] == 'test':
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
                if not result and hasattr(self.dispatcher, 'last_error'):
                    self.add_invalid_email(schedule['email'], str(self.dispatcher.last_error), campaign_id)
                schedule['status'] = 'concluido' if result else 'erro'
            
            else:  # type == 'mass'
                df = pd.read_csv('lista_completa.csv')
                # Remove emails inválidos antes de começar
                df = self.filter_invalid_emails(df)
                total_rows = len(df)
                success = True
                
                for start in range(0, total_rows, self.batch_size):
                    end = min(start + self.batch_size, total_rows)
                    batch_df = df.iloc[start:end]
                    
                    result = self.process_with_rate_limit(
                        batch_df,
                        f"templates/{schedule['template']}",
                        horario_envio,
                        schedule['subject'],
                        'Blazee <contato@useblazee.com.br>',
                        campaign_id
                    )
                    
                    if not result:
                        print(f"Falha no lote {start}-{end}, pausando...")
                        time.sleep(60)
                        success = False
                        break
                    
                    progress = (end / total_rows) * 100
                    print(f"Progresso: {progress:.1f}% ({end}/{total_rows})")
                
                schedule['status'] = 'concluido' if success else 'erro'
        
        except Exception as e:
            schedule['status'] = 'erro'
            schedule['error'] = str(e)
            print(f"Erro no processamento do agendamento: {e}")
    
    def __del__(self):
        """Tenta fechar a conexão com o banco de dados ao destruir o objeto"""
        if self.db_enabled and self.conn:
            try:
                self.conn.close()
            except Exception:
                pass 