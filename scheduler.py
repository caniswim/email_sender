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
    def __init__(self, schedules=None):
        self.schedules = schedules if schedules is not None else []
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
        try:
            if schedule['type'] == 'test':
                # Processa email de teste
                result = self.dispatcher.enviar_email(
                    schedule['email'],
                    schedule['name'],
                    schedule['subject'],
                    schedule['template'],
                    schedule['preview']
                )
                return result
            elif schedule['type'] == 'mass':
                # Processa lista de emails em massa
                df = pd.read_csv(schedule['list_path'])
                
                # Processa em lotes
                batch_size = 250
                total_enviados = 0
                total_falhas = 0
                
                for i in range(0, len(df), batch_size):
                    batch = df.iloc[i:i+batch_size]
                    
                    # Verifica uso de memória antes de processar o lote
                    if psutil.virtual_memory().percent > 75:
                        print("Uso de memória alto, aguardando...")
                        time.sleep(10)
                    
                    # Processa cada email do lote
                    for _, row in batch.iterrows():
                        try:
                            result = self.dispatcher.enviar_email(
                                row['EMAIL'],
                                row.get('NOME', ''),
                                schedule['subject'],
                                schedule['template'],
                                schedule['preview']
                            )
                            
                            if result['success']:
                                total_enviados += 1
                            else:
                                total_falhas += 1
                            
                            # Pausa entre emails
                            time.sleep(0.05)  # 50ms entre emails
                            
                        except Exception as e:
                            print(f"Erro ao enviar email para {row['EMAIL']}: {e}")
                            total_falhas += 1
                    
                    # Pausa entre lotes
                    time.sleep(10)
                
                return {
                    'success': True,
                    'total_enviados': total_enviados,
                    'total_falhas': total_falhas
                }
                
        except Exception as e:
            print(f"Erro ao processar agendamento: {e}")
            return {'success': False, 'error': str(e)}
    
    def __del__(self):
        """Tenta fechar a conexão com o banco de dados ao destruir o objeto"""
        if self.db_enabled and self.conn:
            try:
                self.conn.close()
            except Exception:
                pass 