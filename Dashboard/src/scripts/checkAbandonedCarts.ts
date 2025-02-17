import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, update, set } from 'firebase/database'
import fetch from 'node-fetch'

// URLs hardcoded
const FIREBASE_DATABASE_URL = 'https://blazee-products-default-rtdb.firebaseio.com/'
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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'

// Configurações
const ABANDONED_TIMEOUT = process.argv.includes('--test') ? 10_000 : 20 * 60 * 1000 // 20 minutos ou 10 segundos em modo teste
const isTestMode = process.argv.includes('--test')
const DEBUG = process.argv.includes('--debug')

// Inicializa Firebase
const app = initializeApp({ databaseURL: FIREBASE_DATABASE_URL })
const db = getDatabase(app)

// Cache para evitar notificações duplicadas
const notifiedSessions = new Set<string>()

// Contador de verificações
let checkCount = 0

// Função para formatar moeda
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

// Função para formatar data
function formatDate(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Função para debug
function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`\n[🔍 DEBUG] ${message}`)
    if (data) {
      console.log(JSON.stringify(data, null, 2))
    }
    console.log('--------------------------------------------------')
  }
}

// Função para enviar notificação para o Slack
async function sendSlackNotification(session: any) {
  const { contact, cart, startTime, id } = session
  
  if (notifiedSessions.has(id)) {
    return
  }

  const items = cart?.items?.map((item: any) => 
    `• ${item.quantity}x ${item.name} (${formatCurrency(Number(item.totalPrice))})`
  ).join('\n') || 'Nenhum item no carrinho'

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛒 Carrinho Abandonado Detectado!'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Cliente:*\n${contact?.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Telefone:*\n${contact?.phone}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Itens do Carrinho:*\n${items}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total:*\n${formatCurrency(Number(cart?.total))}`
          },
          {
            type: 'mrkdwn',
            text: `*Início da Sessão:*\n<!date^${Math.floor(startTime / 1000)}^{date_pretty} às {time}|${new Date(startTime).toISOString()}>`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Localização:*\n${session.location?.city}, ${session.location?.region}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '💬 Enviar WhatsApp'
            },
            url: `https://wa.me/55${contact?.phone?.replace(/\D/g, '')}`,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🛒 Link do Carrinho'
            },
            url: cart?.recoveryUrl || '',
            style: 'primary'
          }
        ]
      }
    ]
  }

  console.log('\n[📝 Preparando Notificação]')
  console.log('--------------------------------------------------')
  console.log(`ID do Carrinho: ${id}`)
  console.log(`Cliente: ${contact?.name}`)
  console.log(`Telefone: ${contact?.phone}`)
  console.log(`Total: ${formatCurrency(Number(cart?.total))}`)
  console.log('\nItens do Carrinho:')
  cart?.items?.forEach((item: any) => {
    console.log(`- ${item.quantity}x ${item.name} (${formatCurrency(Number(item.totalPrice))})`)
  })
  console.log('--------------------------------------------------')

  try {
    console.log('[🚀 Enviando notificação para o Slack...]')
    
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (response.ok) {
      notifiedSessions.add(id)
      console.log('[✅ Notificação enviada com sucesso!]')

      // Adiciona o marcador na Firebase
      const sessionRef = ref(db, `checkout_sessions/${id}`)
      await update(sessionRef, {
        notifications: {
          abandoned_cart: {
            sent_at: new Date().toISOString()
          }
        }
      })
      console.log('[✅ Marcador adicionado na Firebase]')
    } else {
      console.error('[❌ Erro ao enviar notificação]', await response.text())
    }
  } catch (error) {
    console.error('[❌ Erro ao enviar notificação]', error)
  }
}

// Função principal que monitora os carrinhos
function monitorAbandonedCarts() {
  const startTime = new Date()
  console.log(`\n[🚀 Iniciando Monitor de Carrinhos Abandonados - ${formatDate(startTime)}]`)
  console.log('--------------------------------------------------')
  console.log('Firebase URL:', FIREBASE_DATABASE_URL)
  console.log('Slack Webhook configurado:', SLACK_WEBHOOK_URL ? '✅' : '❌')
  console.log(`Modo de teste: ${isTestMode ? '✅' : '❌'}`)
  console.log(`Modo debug: ${DEBUG ? '✅' : '❌'}`)
  console.log(`Tempo para abandono: ${isTestMode ? '10 segundos' : '20 minutos'}`)
  console.log('--------------------------------------------------\n')
  console.log('[👀 Monitorando carrinhos em tempo real...]\n')
  
  const checkoutRef = ref(db, 'checkout_sessions')
  
  onValue(checkoutRef, (snapshot) => {
    checkCount++
    const data = snapshot.val()
    
    debugLog('Dados recebidos do Firebase:', data)
    
    if (!data) {
      console.log('[❌ Nenhum dado recebido do Firebase]')
      return
    }

    const now = new Date()
    const timeoutLimit = new Date(now.getTime() - ABANDONED_TIMEOUT)
    let activeCartsCount = 0
    let abandonedCartsCount = 0
    let totalSessions = 0
    let sessionsWithCustomer = 0

    Object.entries(data).forEach(([id, session]: [string, any]) => {
      totalSessions++
      debugLog(`Analisando sessão ${id}:`, session)

      // Verifica se tem os dados necessários
      if (!session.contact?.name || !session.contact?.phone) {
        debugLog(`Sessão ${id} ignorada: Sem dados do cliente`, {
          name: session.contact?.name,
          phone: session.contact?.phone
        })
        return
      }

      sessionsWithCustomer++
      
      // Verifica se a sessão está ativa
      const isActive = session.activity?.is_active || false
      const lastActivityTime = session.activity?.last_activity 
        ? new Date(session.activity.last_activity)
        : new Date(session.lastUpdate)
      
      debugLog(`Status da sessão ${id}:`, {
        isActive,
        lastActivityTime: formatDate(lastActivityTime)
      })

      // Se a sessão está ativa, reseta contagem
      if (isActive) {
        debugLog(`Sessão ${id} está ativa, ignorando contagem de abandono`)
        activeCartsCount++
        return
      }

      // Carrinho ativo se não está finalizado e tem atualização recente
      if (session.currentStep !== 'success' && !session.order) {
        // Verifica se é um carrinho abandonado
        if (
          lastActivityTime < timeoutLimit && // Passou do tempo limite desde última atividade
          !notifiedSessions.has(id) && // Não foi notificado ainda
          !session.notifications?.abandoned_cart && // Não tem marcador de notificação na Firebase
          !isActive // Sessão está inativa
        ) {
          abandonedCartsCount++
          
          console.log(`\n[🔍 Verificação #${checkCount} - ${formatDate(now)}]`)
          console.log('--------------------------------------------------')
          console.log(`[❗] Carrinho abandonado detectado:`)
          console.log(`- ID: ${id}`)
          console.log(`- Cliente: ${session.contact?.name}`)
          console.log(`- Telefone: ${session.contact?.phone}`)
          console.log(`- Última atividade: ${formatDate(lastActivityTime)}`)
          console.log(`- Tempo inativo: ${Math.floor((now.getTime() - lastActivityTime.getTime()) / 1000 / 60)} minutos`)
          console.log(`- Total: ${formatCurrency(Number(session.cart?.total))}`)
          console.log('--------------------------------------------------')
          
          // Marca a notificação no Firebase antes de enviar
          const notificationRef = ref(db, `checkout_sessions/${id}/notifications`)
          set(notificationRef, {
            abandoned_cart: true,
            notified_at: now.toISOString()
          })
          
          sendSlackNotification({ ...session, id })
          notifiedSessions.add(id)
        } else if (!notifiedSessions.has(id) && !session.notifications?.abandoned_cart && !isActive) {
          const timeElapsed = now.getTime() - lastActivityTime.getTime()
          const timeLeft = ABANDONED_TIMEOUT - timeElapsed
          const minutesLeft = isTestMode 
            ? Math.floor(timeLeft / 1000)
            : Math.floor(timeLeft / 60000)
          
          console.log(`[⏳] Carrinho ${id} - ${session.contact?.name}`)
          console.log(`    Tempo inativo: ${minutesLeft} ${isTestMode ? 'segundos' : 'minutos'}`)
        }
      } else {
        debugLog(`Carrinho ${id} ignorado: ${session.currentStep === 'success' ? 'Finalizado' : 'Tem pedido criado'} (currentStep = ${session.currentStep}, order = ${session.order ? 'Sim' : 'Não'})`)
      }
    })

    // Log de status a cada verificação em modo debug ou a cada 10 em modo normal
    if (DEBUG || checkCount % 10 === 0) {
      console.log(`\n[📊 Status - Verificação #${checkCount}]`)
      console.log('--------------------------------------------------')
      console.log(`Total de sessões: ${totalSessions}`)
      console.log(`Sessões com cliente: ${sessionsWithCustomer}`)
      console.log(`Carrinhos ativos: ${activeCartsCount}`)
      console.log(`Carrinhos abandonados: ${abandonedCartsCount}`)
      console.log(`Notificações enviadas: ${notifiedSessions.size}`)
      console.log('--------------------------------------------------\n')
    }
  })
}

// Inicia o monitoramento
monitorAbandonedCarts()

// Mantém o processo rodando
process.on('SIGINT', () => {
  const endTime = new Date()
  console.log(`\n[👋 Encerrando Monitor de Carrinhos Abandonados - ${formatDate(endTime)}]`)
  console.log('--------------------------------------------------')
  console.log(`Total de verificações: ${checkCount}`)
  console.log(`Total de notificações enviadas: ${notifiedSessions.size}`)
  console.log('--------------------------------------------------')
  process.exit(0)
}) 