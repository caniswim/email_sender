import os
import sys
from datetime import datetime
import pytz
from sender import EmailDispatcher
import time

# Cores para output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
NC = '\033[0m'  # No Color

def clear_screen():
    os.system('clear' if os.name != 'nt' else 'cls')

def get_input(prompt):
    try:
        return input(prompt)
    except KeyboardInterrupt:
        print("\nOperação cancelada pelo usuário.")
        sys.exit(0)

def get_date_time():
    while True:
        try:
            data = get_input("Digite a data (DD/MM/AAAA): ")
            hora = get_input("Digite a hora (HH:MM): ")
            
            # Converte para o formato correto
            data_hora = datetime.strptime(f"{data} {hora}", "%d/%m/%Y %H:%M")
            
            # Adiciona o timezone de São Paulo
            tz = pytz.timezone('America/Sao_Paulo')
            data_hora = tz.localize(data_hora)
            
            # Converte para o formato esperado pelo EmailDispatcher
            return data_hora.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            print("Formato de data/hora inválido. Tente novamente.")
        except KeyboardInterrupt:
            print("\nOperação cancelada pelo usuário.")
            sys.exit(0)

def menu_principal():
    while True:
        clear_screen()
        print("=== Sistema de Envio de Emails ===")
        print("1. Enviar email de teste")
        print("2. Agendar envio em massa")
        print("3. Sair")
        
        opcao = get_input("\nEscolha uma opção: ")
        
        if opcao == "1":
            enviar_email_teste()
        elif opcao == "2":
            agendar_envio_massa()
        elif opcao == "3":
            print("Saindo...")
            sys.exit(0)
        else:
            input("Opção inválida. Pressione Enter para continuar...")

def get_postfix_logs():
    """Obtém os últimos logs relevantes do Postfix"""
    try:
        with open('/var/log/mail.log', 'r') as f:
            logs = f.readlines()
            # Filtra as últimas 20 linhas que contêm 'gmail' ou 'status='
            relevant_logs = [
                log for log in logs[-50:]
                if 'gmail' in log.lower() or 'status=' in log
            ][-20:]
            return relevant_logs
    except Exception as e:
        return [f"Erro ao ler logs: {str(e)}"]

def mostrar_logs_postfix():
    """Exibe os logs do Postfix de forma simplificada e amigável"""
    clear_screen()
    print("=== Status do Envio ===\n")
    
    logs = get_postfix_logs()
    
    # Pega o último log relevante
    for log in reversed(logs):
        if 'status=sent' in log:
            email_to = next((p[4:-1] for p in log.split() if p.startswith('to=<')), '')
            print(f"{GREEN}✓ Email enviado com sucesso!")
            print(f"  Destinatário: {email_to}")
            print(f"  O email foi entregue e está na caixa de entrada.{NC}")
            break
        elif 'status=bounced' in log:
            email_to = next((p[4:-1] for p in log.split() if p.startswith('to=<')), '')
            print(f"{RED}✗ Não foi possível entregar o email")
            print(f"  Destinatário: {email_to}")
            if 'IPv6' in log:
                print("  Motivo: Problema de configuração do servidor. Entre em contato com o suporte.")
            elif 'authentication' in log:
                print("  Motivo: Email bloqueado por falta de autenticação. Aguarde alguns minutos e tente novamente.")
            else:
                print("  Motivo: Erro na entrega. Verifique o endereço de email e tente novamente.")
            print(f"{NC}")
            break
        elif 'error' in log.lower():
            print(f"{RED}! Ocorreu um erro no sistema")
            print("  Por favor, tente novamente em alguns minutos.")
            print(f"  Se o problema persistir, entre em contato com o suporte.{NC}")
            break

def listar_templates():
    """Lista todos os templates HTML disponíveis na pasta templates"""
    templates = []
    try:
        for arquivo in os.listdir('templates'):
            if arquivo.endswith('.html'):
                templates.append(arquivo)
        return sorted(templates)
    except Exception as e:
        print(f"{RED}Erro ao listar templates: {str(e)}{NC}")
        return []

def selecionar_template():
    """Permite ao usuário selecionar um template da lista"""
    templates = listar_templates()
    
    if not templates:
        print(f"{RED}Nenhum template encontrado na pasta templates{NC}")
        return None
    
    print("\nTemplates disponíveis:")
    for i, template in enumerate(templates, 1):
        print(f"{i}. {template}")
    
    while True:
        try:
            opcao = int(get_input("\nEscolha o template (número): "))
            if 1 <= opcao <= len(templates):
                return os.path.join('templates', templates[opcao-1])
            print("Opção inválida")
        except ValueError:
            print("Por favor, digite um número válido")

def enviar_email_teste():
    clear_screen()
    print("=== Envio de Email de Teste ===")
    
    # Seleciona o template
    template_path = selecionar_template()
    if not template_path:
        input("\nPressione Enter para continuar...")
        return
    
    # Opções de email de teste
    print("\nEscolha o destinatário:")
    print("1. brunnovert98@gmail.com")
    print("2. Digitar outro email")
    
    opcao = get_input("\nEscolha uma opção: ")
    
    if opcao == "1":
        email = "brunnovert98@gmail.com"
        nome = "Brunno"
    elif opcao == "2":
        email = get_input("Digite o email: ")
        nome = get_input("Digite o nome: ")
    else:
        input("Opção inválida. Pressione Enter para continuar...")
        return
    
    # Solicita assunto e preview
    print("\nConfigurações do email:")
    assunto = get_input("Digite o assunto do email: ")
    preview = get_input("Digite o preview do email: ")
    
    # Configuração do envio
    dispatcher = EmailDispatcher()
    
    try:
        # Cria um arquivo CSV temporário com o email de teste
        with open('teste_email.csv', 'w') as f:
            f.write("EMAIL,NOME\n")
            f.write(f"{email},{nome}")
        
        # Prepara o envio
        horario = datetime.now(pytz.timezone('America/Sao_Paulo')).strftime('%Y-%m-%d %H:%M:%S')
        
        print("\nEnviando email de teste...")
        
        dispatcher.enviar_emails(
            lista_emails_path='teste_email.csv',
            template_path=template_path,
            horario_envio=horario,
            assunto=assunto,
            remetente='Blazee <contato@useblazee.com.br>'
        )
        
        # Remove o arquivo temporário
        os.remove('teste_email.csv')
        
        # Aguarda um momento para os logs serem atualizados
        time.sleep(2)
        
        # Mostra os logs do Postfix
        mostrar_logs_postfix()
        
        # Mostra informações do email enviado
        print(f"\n{YELLOW}Detalhes do email enviado:")
        print(f"  De: Blazee <contato@useblazee.com.br>")
        print(f"  Para: {nome} <{email}>")
        print(f"  Assunto: {assunto}")
        print(f"  Template: {os.path.basename(template_path)}")
        print(f"  Preview: {preview}{NC}")
        
        input("\nPressione Enter para continuar...")
    except Exception as e:
        print(f"\n{RED}Erro ao enviar email: {str(e)}{NC}")
        input("\nPressione Enter para continuar...")

def agendar_envio_massa():
    clear_screen()
    print("=== Agendamento de Envio em Massa ===")
    
    # Seleciona o template
    template_path = selecionar_template()
    if not template_path:
        input("\nPressione Enter para continuar...")
        return
    
    # Solicita assunto e preview
    print("\nConfigurações do email:")
    assunto = get_input("Digite o assunto do email: ")
    preview = get_input("Digite o preview do email: ")
    
    # Confirma se quer prosseguir
    print("\nATENÇÃO: Este processo enviará emails para toda a lista (lista_completa.csv).")
    print(f"\nDetalhes do envio:")
    print(f"  Template: {os.path.basename(template_path)}")
    print(f"  Assunto: {assunto}")
    print(f"  Preview: {preview}")
    confirma = get_input("\nDeseja continuar? (s/N): ").lower()
    
    if confirma != 's':
        input("\nOperação cancelada. Pressione Enter para continuar...")
        return
    
    # Obtém data e hora do envio
    print("\nDefina o horário do envio (Horário de São Paulo)")
    horario_envio = get_date_time()
    
    # Confirma o agendamento
    print(f"\nO envio será realizado em: {horario_envio}")
    print(f"Template selecionado: {os.path.basename(template_path)}")
    print(f"Assunto: {assunto}")
    print(f"Preview: {preview}")
    confirma = get_input("\nConfirma o agendamento? (s/N): ").lower()
    
    if confirma != 's':
        input("\nAgendamento cancelado. Pressione Enter para continuar...")
        return
    
    # Realiza o agendamento
    try:
        dispatcher = EmailDispatcher()
        dispatcher.enviar_emails(
            lista_emails_path='lista_completa.csv',
            template_path=template_path,
            horario_envio=horario_envio,
            assunto=assunto,
            remetente='Blazee <contato@useblazee.com.br>'
        )
        
        # Aguarda um momento para os logs serem atualizados
        time.sleep(2)
        
        # Mostra os logs do Postfix
        mostrar_logs_postfix()
        
        input("\nPressione Enter para continuar...")
    except Exception as e:
        print(f"\n{RED}Erro ao agendar envio: {str(e)}{NC}")
        input("\nPressione Enter para continuar...")

if __name__ == "__main__":
    try:
        menu_principal()
    except KeyboardInterrupt:
        print("\nPrograma encerrado pelo usuário.")
        sys.exit(0) 