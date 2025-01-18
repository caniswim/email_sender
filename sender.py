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
        padrao = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(padrao, email))

    def validar_arquivos(self, lista_emails_path, template_path):
        for arquivo in [lista_emails_path, template_path]:
            if not Path(arquivo).is_file():
                raise FileNotFoundError(f"Arquivo não encontrado: {arquivo}")

    def carregar_template(self, template_path):
        try:
            with open(template_path, 'r', encoding='utf-8') as file:
                template = file.read()
            return template
        except Exception as e:
            self.logger.error(f"Erro ao carregar template: {str(e)}")
            raise

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
        unsubscribe_url = f'https://seusite.com/unsubscribe?id={unsubscribe_id}'
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

    def salvar_estatisticas(self):
        """Salva as estatísticas em um arquivo JSON"""
        try:
            with open('email_stats.json', 'w') as f:
                json.dump(self.stats, f)
        except Exception as e:
            self.logger.error(f"Erro ao salvar estatísticas: {str(e)}")

    def enviar_emails(self, lista_emails_path, template_path, horario_envio, assunto, remetente):
        try:
            # Reseta as estatísticas
            self.stats = {
                'total': 0,
                'enviados': 0,
                'falhas': 0,
                'invalidos': 0,
                'status': 'iniciando',
                'inicio': datetime.now().isoformat(),
                'fim': None,
                'erros': []
            }
            
            # Verifica se os arquivos existem
            if not os.path.exists(lista_emails_path):
                raise FileNotFoundError(f"Lista de emails não encontrada: {lista_emails_path}")
            
            if not os.path.exists(template_path):
                raise FileNotFoundError(f"Template não encontrado: {template_path}")
            
            # Carrega e valida a lista de emails
            df = pd.read_csv(lista_emails_path)
            self.stats['total'] = len(df)
            
            # Lista para armazenar emails inválidos
            emails_invalidos = []
            for _, row in df.iterrows():
                if not self.validar_email(row['EMAIL']):
                    emails_invalidos.append({
                        'email': row['EMAIL'],
                        'motivo': 'Email inválido'
                    })
                    self.atualizar_estatisticas('invalido')
            
            # Remove emails inválidos do DataFrame
            df = df[~df['EMAIL'].isin([e['email'] for e in emails_invalidos])]
            
            # Carrega o template
            template = self.carregar_template(template_path)
            
            # Conecta ao servidor SMTP
            with smtplib.SMTP(host=self.smtp_config['host'], 
                            port=self.smtp_config['port'], 
                            timeout=self.smtp_config['timeout']) as server:
                
                self.stats['status'] = 'enviando'
                self.salvar_estatisticas()
                
                # Processa em lotes
                for i in range(0, len(df), self.batch_size):
                    batch = df.iloc[i:i+self.batch_size]
                    
                    for _, row in batch.iterrows():
                        try:
                            msg = self.preparar_email(
                                destinatario=row['EMAIL'],
                                nome=row.get('NOME', ''),
                                assunto=assunto,
                                template=template,
                                remetente=remetente
                            )
                            
                            self.enviar_email_com_retry(server, msg, row['EMAIL'])
                            self.atualizar_estatisticas('enviado')
                            
                        except Exception as e:
                            erro = f"Erro ao enviar email para {row['EMAIL']}: {str(e)}"
                            print(erro)
                            self.atualizar_estatisticas('falha', erro)
                    
                    # Pausa entre lotes
                    time.sleep(self.batch_interval)
                
                self.stats['status'] = 'concluido'
                self.stats['fim'] = datetime.now().isoformat()
                self.salvar_estatisticas()
                
                return True
                
        except Exception as e:
            erro = f"Erro crítico no envio em massa: {str(e)}"
            print(erro)
            self.stats['status'] = 'erro'
            self.stats['fim'] = datetime.now().isoformat()
            self.atualizar_estatisticas('falha', erro)
            self.salvar_estatisticas()
            return False

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