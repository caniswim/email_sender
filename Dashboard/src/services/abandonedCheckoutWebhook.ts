import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface CheckoutSession {
  id: string
  startTime: number
  lastUpdate: number
  currentStep: string
  contact: {
    name: string
    phone: string
    email: string
    cpf: string
  }
  cart: {
    items: Array<{
      id: number
      name: string
      quantity: number
      totalPrice: string
      unitPrice: string
      variationId: number
      image: {
        url: string
        srcset: string
      }
    }>
    itemCount: number
    total: string
    subtotal: string
    recoveryUrl: string
  }
  address: {
    cep: string
    city: string
    complement: string
    neighborhood: string
    number: string
    state: string
    street: string
    lastUpdate: number
  }
  location: {
    ip: string
    city: string
    country: string
    region: string
    latitude: number
    longitude: number
  }
  screenResolution: string
  userAgent: string
}

const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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'
const ABANDONED_TIMEOUT = 20 * 60 * 1000 // 20 minutos em milissegundos

// Cache para controlar quais sessões já foram notificadas
const notifiedSessions = new Set<string>()

export function initAbandonedCheckoutWebhook() {
  const checkoutRef = ref(db, 'checkout_sessions')

  onValue(checkoutRef, async (snapshot) => {
    const data = snapshot.val()
    if (!data) return

    const sessions = Object.entries(data).map(([id, session]) => ({
      id,
      ...session as any
    })) as CheckoutSession[]

    const now = new Date()

    // Filtra sessões abandonadas
    const abandonedSessions = sessions.filter(session => {
      const startTime = new Date(session.startTime)
      const timeSinceStart = now.getTime() - startTime.getTime()

      return (
        // Verifica se já passou o tempo limite
        timeSinceStart >= ABANDONED_TIMEOUT &&
        // Verifica se não está no passo final
        session.currentStep !== 'success' &&
        // Verifica se tem nome e telefone
        session.contact?.name &&
        session.contact?.phone &&
        // Verifica se não foi notificado ainda
        !notifiedSessions.has(session.id)
      )
    })

    // Envia notificações para cada sessão abandonada
    for (const session of abandonedSessions) {
      await sendSlackNotification(session)
      notifiedSessions.add(session.id)
    }
  })
}

async function sendSlackNotification(session: CheckoutSession) {
  const startTime = new Date(session.startTime)
  const timeAgo = formatDistanceToNow(startTime, { locale: ptBR, addSuffix: true })
  const whatsappLink = `https://wa.me/55${session.contact?.phone?.replace(/\D/g, '')}`

  const itemsList = session.cart?.items
    .map(item => `• ${item.quantity}x ${item.name} - R$ ${item.totalPrice}`)
    .join('\\n') || 'Nenhum item no carrinho'

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 Checkout Abandonado',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Cliente:* ${session.contact?.name}\\n*Telefone:* ${session.contact?.phone}\\n*Iniciado:* ${timeAgo}\\n*Valor Total:* R$ ${session.cart?.total}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Itens do Carrinho:*\\n${itemsList}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Localização:* ${session.location?.city}, ${session.location?.region}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '💬 Abrir WhatsApp',
              emoji: true
            },
            url: whatsappLink,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🛒 Link do Carrinho',
              emoji: true
            },
            url: session.cart?.recoveryUrl || '',
            style: 'primary'
          }
        ]
      }
    ]
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    })

    if (!response.ok) {
      console.error('Erro ao enviar notificação para o Slack:', await response.text())
    }
  } catch (error) {
    console.error('Erro ao enviar notificação para o Slack:', error)
  }
} 