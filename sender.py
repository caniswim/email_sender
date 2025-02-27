import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import pytz
import time
import csv
import logging
import re
from pathlib import Path
from tenacity import retry, stop_after_attempt, wait_exponential
import socket
import dkim
import uuid
from email.utils import formatdate, make_msgid
import os
import json
import sqlite3

class EmailDispatcher:
    def __init__(self):
        self.setup_logging()
        self.timezone = pytz.timezone('America/Sao_Paulo')
        
        # Configurações anti-spam
        self.rate_limit = 8  # 8 emails por segundo
        self.batch_size = 250  # Lotes de 250 emails
        self.batch_interval = 1  # 1 segundo entre lotes
        
        # Configuração do servidor SMTP
        self.smtp_config = {
            'host': 'localhost',
            'port': 25,
            'timeout': 30
        }
        
        self.domain = 'useblazee.com.br'
        self.hostname = self.domain
        
        # Configurações DKIM
        self.dkim_config = {
            'domain': self.domain,
            'selector': 'default',
            'private_key_path': '/etc/dkim/private.key'
        }
        
        # Email padrão para unsubscribe
        self.unsubscribe_email = 'unsubscribe@useblazee.com.br'
        
        # Estatísticas de envio
        self.stats = {
            'total': 0,
            'enviados': 0,
            'falhas': 0,
            'invalidos': 0,
            'status': 'aguardando',
            'inicio': None,
            'fim': None,
            'erros': []
        }
        
        # Carrega a chave privada DKIM
        try:
            with open(self.dkim_config['private_key_path'], 'rb') as f:
                self.dkim_key = f.read()
            self.logger.info("Chave DKIM carregada com sucesso")
        except FileNotFoundError:
            self.logger.warning("Chave DKIM não encontrada. Emails serão enviados sem assinatura DKIM.")
            self.dkim_key = None

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('email_dispatcher.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def validar_email(self, email):
        """Valida se um email está em formato correto"""
        if not email:
            return False
        
        # Validação básica de formato
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return re.match(pattern, email) is not None

    def validar_arquivos(self, lista_emails_path, template_path):
        for arquivo in [lista_emails_path, template_path]:
            if not Path(arquivo).is_file():
                raise FileNotFoundError(f"Arquivo não encontrado: {arquivo}")

    def carregar_template(self, template_path):
        """Carrega o template HTML do email"""
        try:
            if not os.path.exists(template_path):
                self.logger.error(f"Template não encontrado: {template_path}")
                return None
            
            with open(template_path, 'r', encoding='utf-8') as f:
                template = f.read()
            
            self.logger.info(f"Template carregado com sucesso: {template_path}")
            return template
            
        except Exception as e:
            self.logger.error(f"Erro ao carregar template: {str(e)}")
            return None

    def extrair_primeiro_nome(self, nome_completo):
        """Extrai o primeiro nome de um nome completo."""
        return nome_completo.split()[0]

    def adicionar_headers_anti_spam(self, msg, destinatario):
        """Adiciona headers anti-spam ao email"""
        msg['Date'] = formatdate(localtime=True)
        msg['Message-ID'] = make_msgid(domain=self.hostname)
        
        # Headers de autenticação e rastreamento
        msg['X-Mailer'] = f"Python/{'.'.join(map(str, __import__('sys').version_info[:3]))}"
        msg['X-Sender'] = msg['From']
        msg['X-Receiver'] = destinatario
        
        # Headers de conformidade
        msg['Precedence'] = 'bulk'
        msg['Auto-Submitted'] = 'auto-generated'
        
        # Headers de autenticação SPF e DKIM
        msg['Authentication-Results'] = f"spf=pass smtp.mailfrom={msg['From']}"
        
        return msg

    def preparar_email(self, destinatario, nome, assunto, template, remetente):
        if not self.validar_email(destinatario):
            raise ValueError(f"Email inválido: {destinatario}")

        msg = MIMEMultipart('alternative')
        
        # Headers básicos
        msg['From'] = remetente
        msg['To'] = destinatario
        msg['Subject'] = assunto.replace('{primeiro_nome}', self.extrair_primeiro_nome(nome))
        
        # Adiciona headers anti-spam
        msg = self.adicionar_headers_anti_spam(msg, destinatario)
        
        # Headers de conformidade para unsubscribe
        unsubscribe_id = str(uuid.uuid4())
        unsubscribe_url = f'https://email.blazee.com.br/unsubscribe?email={destinatario}'
        msg['List-Unsubscribe'] = f'<{unsubscribe_url}>, <mailto:unsubscribe@{self.hostname}?subject=unsubscribe>'
        msg['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
        
        # Prepara o corpo do email
        primeiro_nome = self.extrair_primeiro_nome(nome)
        corpo_email = template.replace('{nome}', nome)\
                             .replace('{primeiro_nome}', primeiro_nome)\
                             .replace('{{ unsubscribe }}', unsubscribe_url)
        
        # Adiciona versão texto e HTML
        msg.attach(MIMEText(self.strip_tags(corpo_email), 'plain'))
        msg.attach(MIMEText(corpo_email, 'html'))

        # Assina com DKIM se disponível
        if self.dkim_key:
            headers = [
                'From', 'To', 'Subject', 'Date', 'Message-ID',
                'X-Mailer', 'List-Unsubscribe', 'List-Unsubscribe-Post'
            ]
            try:
                sig = dkim.sign(
                    message=msg.as_bytes(),
                    selector=self.dkim_config['selector'].encode(),
                    domain=self.dkim_config['domain'].encode(),
                    privkey=self.dkim_key,
                    include_headers=headers
                )
                msg['DKIM-Signature'] = sig[len('DKIM-Signature: '):].decode()
                self.logger.debug(f"Email assinado com DKIM para {destinatario}")
            except Exception as e:
                self.logger.error(f"Erro ao assinar email com DKIM: {str(e)}")

        return msg

    def strip_tags(self, html):
        """Remove tags HTML para criar versão texto do email"""
        clean = re.compile('<.*?>')
        return re.sub(clean, '', html)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def enviar_email_com_retry(self, server, msg, destinatario):
        try:
            server.send_message(msg)
            self.logger.info(f"Email enviado com sucesso para {destinatario}")
            time.sleep(1 / self.rate_limit)
        except Exception as e:
            self.logger.error(f"Erro ao enviar para {destinatario}: {str(e)}")
            raise

    def atualizar_estatisticas(self, tipo, erro=None):
        """Atualiza as estatísticas de envio"""
        if tipo == 'enviado':
            self.stats['enviados'] += 1
        elif tipo == 'falha':
            self.stats['falhas'] += 1
            if erro:
                self.stats['erros'].append(erro)
        elif tipo == 'invalido':
            self.stats['invalidos'] += 1
        
        # Salva as estatísticas em um arquivo JSON
        self.salvar_estatisticas()

    def salvar_estatisticas(self, stats):
        """Salva as estatísticas de envio em um arquivo JSON"""
        try:
            with open('email_stats.json', 'w') as f:
                json.dump(stats, f)
        except Exception as e:
            self.logger.error(f"Erro ao salvar estatísticas: {str(e)}")

    def dividir_em_lotes(self, df, tamanho_lote):
        """Divide um DataFrame em lotes de tamanho especificado"""
        for i in range(0, len(df), tamanho_lote):
            yield df.iloc[i:i+tamanho_lote]

    def enviar_emails(self, lista_emails_path, template_path, horario_envio, assunto, remetente):
        """Envia emails para uma lista de destinatários"""
        try:
            # Carrega a lista de emails
            df = self.carregar_lista_emails(lista_emails_path)
            if df is None or len(df) == 0:
                self.logger.error("Lista de emails vazia ou inválida")
                return False
            
            # Carrega o template
            template = self.carregar_template(template_path)
            if not template:
                self.logger.error(f"Falha ao carregar template: {template_path}")
                return False
            
            # Verifica se o horário de envio já passou
            horario = datetime.strptime(horario_envio, '%Y-%m-%d %H:%M:%S')
            horario = self.timezone.localize(horario)
            agora = datetime.now(self.timezone)
            
            if horario > agora:
                self.logger.info(f"Agendamento para {horario_envio}, aguardando...")
                return True
            
            # Inicializa estatísticas
            stats = {
                'total': len(df),
                'enviados': 0,
                'falhas': 0,
                'invalidos': 0,
                'blacklist': 0,
                'status': 'enviando',
                'inicio': datetime.now().isoformat(),
                'fim': None,
                'erros': []
            }
            self.salvar_estatisticas(stats)
            
            # Carrega a chave DKIM
            self.carregar_dkim()
            
            # Conecta ao servidor SMTP
            with smtplib.SMTP(self.smtp_config['host'], self.smtp_config['port'], timeout=self.smtp_config['timeout']) as servidor:
                # Processa em lotes para evitar sobrecarga
                for i, chunk in enumerate(self.dividir_em_lotes(df, self.batch_size)):
                    if i > 0:
                        self.logger.info(f"Aguardando {self.batch_interval}s antes do próximo lote...")
                        time.sleep(self.batch_interval)
                    
                    self.logger.info(f"Processando lote {i+1}/{(len(df) // self.batch_size) + 1} ({len(chunk)} emails)")
                    
                    for idx, row in chunk.iterrows():
                        try:
                            email = row['EMAIL'].strip()
                            nome = row.get('NOME', '').strip()
                            
                            # Verifica se o email é válido
                            if not self.validar_email(email):
                                self.logger.warning(f"Email inválido: {email}")
                                stats['invalidos'] += 1
                                continue
                            
                            # Verifica se o email está na blacklist
                            conn = sqlite3.connect('email_blacklist.db')
                            cursor = conn.cursor()
                            cursor.execute("SELECT email FROM invalid_emails WHERE email = ?", (email,))
                            if cursor.fetchone():
                                conn.close()
                                self.logger.info(f"Email na blacklist: {email}")
                                stats['blacklist'] += 1
                                continue
                            conn.close()
                            
                            # Envia o email
                            self.enviar_email(email, nome, assunto, template, remetente)
                            stats['enviados'] += 1
                            
                            # Controle de taxa para evitar bloqueios anti-spam
                            time.sleep(1 / self.rate_limit)
                            
                        except Exception as e:
                            self.logger.error(f"Erro ao enviar para {email}: {str(e)}")
                            stats['falhas'] += 1
                            stats['erros'].append(f"{email}: {str(e)}")
                        
                        # Atualiza estatísticas a cada 10 emails
                        if (stats['enviados'] + stats['falhas'] + stats['invalidos'] + stats['blacklist']) % 10 == 0:
                            self.salvar_estatisticas(stats)
            
            # Finaliza estatísticas
            stats['status'] = 'concluido'
            stats['fim'] = datetime.now().isoformat()
            self.salvar_estatisticas(stats)
            
            self.logger.info(f"Envio concluído: {stats['enviados']} enviados, {stats['falhas']} falhas, {stats['invalidos']} inválidos, {stats['blacklist']} na blacklist")
            return True
            
        except Exception as e:
            self.logger.error(f"Erro no processo de envio: {str(e)}")
            
            # Atualiza estatísticas com erro
            try:
                with open('email_stats.json', 'r') as f:
                    stats = json.load(f)
                
                stats['status'] = 'erro'
                stats['fim'] = datetime.now().isoformat()
                stats['erros'].append(str(e))
                
                with open('email_stats.json', 'w') as f:
                    json.dump(stats, f)
            except:
                pass
                
            return False

    def enviar_email(self, email, nome, assunto, template, remetente):
        """Envia um único email"""
        try:
            # Prepara o email
            msg = self.preparar_email(
                destinatario=email,
                nome=nome,
                assunto=assunto,
                template=template,
                remetente=remetente
            )
            
            # Envia o email
            with smtplib.SMTP(self.smtp_config['host'], self.smtp_config['port'], timeout=self.smtp_config['timeout']) as servidor:
                servidor.send_message(msg)
            
            self.logger.info(f"Email enviado com sucesso para {email}")
            return True
        except Exception as e:
            self.logger.error(f"Erro ao enviar email para {email}: {str(e)}")
            raise

    def carregar_dkim(self):
        """Carrega a chave DKIM para assinatura de emails"""
        try:
            if os.path.exists(self.dkim_config['private_key_path']):
                with open(self.dkim_config['private_key_path'], 'rb') as f:
                    self.dkim_key = f.read()
                self.logger.info("Chave DKIM carregada com sucesso")
            else:
                self.logger.warning(f"Arquivo de chave DKIM não encontrado: {self.dkim_config['private_key_path']}")
                self.dkim_key = None
        except Exception as e:
            self.logger.error(f"Erro ao carregar chave DKIM: {str(e)}")
            self.dkim_key = None
    
    def carregar_lista_emails(self, lista_emails_path):
        """Carrega e valida a lista de emails"""
        try:
            if not os.path.exists(lista_emails_path):
                self.logger.error(f"Lista de emails não encontrada: {lista_emails_path}")
                return None
            
            # Detecta o encoding do arquivo
            encoding = 'utf-8'
            try:
                import chardet
                with open(lista_emails_path, 'rb') as f:
                    raw_data = f.read(1024)  # Lê apenas o início do arquivo
                    detected = chardet.detect(raw_data)
                    if detected['confidence'] > 0.7:
                        encoding = detected['encoding']
                        self.logger.info(f"Encoding detectado: {encoding}")
            except ImportError:
                self.logger.warning("Módulo chardet não encontrado, usando UTF-8")
            except Exception as e:
                self.logger.warning(f"Erro ao detectar encoding: {str(e)}, usando UTF-8")
            
            # Carrega o CSV
            df = pd.read_csv(lista_emails_path, encoding=encoding)
            
            # Verifica se as colunas necessárias existem
            required_columns = {'EMAIL'}
            columns = {col.upper() for col in df.columns}
            if not required_columns.issubset(columns):
                missing = required_columns - columns
                self.logger.error(f"Colunas obrigatórias ausentes: {missing}")
                return None
            
            # Padroniza os nomes das colunas
            df.columns = [col.upper() for col in df.columns]
            
            # Garante que a coluna NOME existe
            if 'NOME' not in df.columns:
                df['NOME'] = ''
            
            # Remove linhas com emails vazios
            df = df[df['EMAIL'].notna() & (df['EMAIL'] != '')]
            
            self.logger.info(f"Lista de emails carregada com sucesso: {len(df)} emails")
            return df
            
        except Exception as e:
            self.logger.error(f"Erro ao carregar lista de emails: {str(e)}")
            return None

if __name__ == "__main__":
    dispatcher = EmailDispatcher()
    
    lista_emails_path = 'lista_completa.csv'
    template_path = 'template.html'
    horario_envio = '2025-01-04 08:00:00'
    assunto = 'Seu assunto aqui'
    remetente = 'contato@useblazee.com.br'

    try:
        dispatcher.enviar_emails(
            lista_emails_path=lista_emails_path,
            template_path=template_path,
            horario_envio=horario_envio,
            assunto=assunto,
            remetente=remetente
        )
    except Exception as e:
        logging.error(f"Erro fatal na execução: {str(e)}")