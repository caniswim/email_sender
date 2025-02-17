import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { isAfter, isBefore } from 'date-fns'
import { usePeriod } from './DashboardHeader'
import { formatCurrency, parseCurrency } from '../lib/utils'

interface LiveMetrics {
  activeSessions: number
  abandonedCarts: number
  abandonedValue: number
  averageTicket: number
}

export function LiveMetrics() {
  const { selectedPeriod } = usePeriod()
  const [metrics, setMetrics] = useState<LiveMetrics>({
    activeSessions: 0,
    abandonedCarts: 0,
    abandonedValue: 0,
    averageTicket: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    const periodStart = selectedPeriod.startDate()
    const periodEnd = selectedPeriod.endDate()

    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setLoading(false)
        return
      }

      const sessions = Object.values(data) as any[]
      let activeSessions = 0
      let abandonedValue = 0
      let abandonedCarts = 0
      let totalOrdersValue = 0
      let totalOrders = 0

      sessions.forEach((session: any) => {
        if (!session.lastUpdate) return

        const sessionDate = new Date(session.lastUpdate)
        
        // Verifica se a sessão está dentro do período selecionado
        if (isAfter(sessionDate, periodStart) && isBefore(sessionDate, periodEnd)) {
          // Sessões ativas (últimos 30 minutos)
          const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
          if (sessionDate > thirtyMinutesAgo) {
            activeSessions++
          }

          // Carrinhos abandonados (sem nó order)
          if (!session.order && session.cart?.items) {
            abandonedCarts++
            // Soma o valor total dos itens do carrinho
            session.cart.items.forEach((item: any) => {
              abandonedValue += parseCurrency(item.totalPrice)
            })
          }

          // Pedidos para cálculo do ticket médio
          if (session.order) {
            totalOrders++
            totalOrdersValue += parseCurrency(session.cart?.total || '0')
          }
        }
      })

      setMetrics({
        activeSessions,
        abandonedCarts,
        abandonedValue: Number(abandonedValue.toFixed(2)),
        averageTicket: totalOrders > 0 ? Number((totalOrdersValue / totalOrders).toFixed(2)) : 0
      })

      setLoading(false)
    })

    return () => unsubscribe()
  }, [selectedPeriod])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card animate-pulse h-[120px] rounded-lg" />
        <div className="bg-card animate-pulse h-[120px] rounded-lg" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-sm text-muted-foreground">Ao vivo</p>
        </div>
        
        <p className="text-2xl font-bold">
          {metrics.activeSessions}
        </p>
        <p className="text-sm text-muted-foreground">
          Clientes agora na sua loja
        </p>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border">
        <p className="text-sm text-muted-foreground mb-2">
          Carrinhos abandonados
        </p>
        
        <p className="text-2xl font-bold">
          R$ {formatCurrency(metrics.abandonedValue)}
        </p>
        <p className="text-sm text-muted-foreground">
          {metrics.abandonedCarts} carrinhos
        </p>
      </div>

      <div className="col-span-2 bg-card p-4 rounded-lg border border-border">
        <p className="text-sm text-muted-foreground mb-2">
          Ticket médio
        </p>
        
        <p className="text-2xl font-bold">
          R$ {formatCurrency(metrics.averageTicket)}
        </p>
      </div>
    </div>
  )
} 