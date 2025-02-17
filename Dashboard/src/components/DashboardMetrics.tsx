import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { isAfter, isBefore } from 'date-fns'
import { usePeriod } from './DashboardHeader'
import { formatCurrency, parseCurrency } from '../lib/utils'
import { useOrders } from './OrdersContext'

interface OrderMetrics {
  totalOrders: number
  totalRevenue: number
  orderCount: number
  previousRevenue: number
  previousOrders: number
}

export function DashboardMetrics() {
  const { selectedPeriod } = usePeriod()
  const { selectedTab, setSelectedTab } = useOrders()
  const [metrics, setMetrics] = useState<OrderMetrics>({
    totalOrders: 0,
    totalRevenue: 0,
    orderCount: 0,
    previousRevenue: 0,
    previousOrders: 0
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    const currentPeriodStart = selectedPeriod.startDate()
    const currentPeriodEnd = selectedPeriod.endDate()
    
    // Calcula o período anterior com a mesma duração
    const previousPeriodEnd = new Date(currentPeriodStart)
    const duration = currentPeriodEnd.getTime() - currentPeriodStart.getTime()
    const previousPeriodStart = new Date(previousPeriodEnd.getTime() - duration)

    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setLoading(false)
        return
      }

      const sessions = Object.values(data) as any[]
      let currentRevenue = 0
      let currentOrders = 0
      let previousRevenue = 0
      let previousOrders = 0

      sessions.forEach((session: any) => {
        if (!session.lastUpdate) return

        const orderDate = new Date(session.lastUpdate)
        const orderTotal = parseCurrency(session.cart?.total || '0')

        if (session.order) {
          const isPaid = session.order.order_status === 'paid'
          
          // Verifica se está no período atual
          if (isAfter(orderDate, currentPeriodStart) && isBefore(orderDate, currentPeriodEnd)) {
            if (selectedTab === 'orders' || (selectedTab === 'paid' && isPaid)) {
              currentRevenue += orderTotal
              currentOrders++
            }
          }
          // Verifica se está no período anterior
          else if (isAfter(orderDate, previousPeriodStart) && isBefore(orderDate, previousPeriodEnd)) {
            if (selectedTab === 'orders' || (selectedTab === 'paid' && isPaid)) {
              previousRevenue += orderTotal
              previousOrders++
            }
          }
        }
      })

      setMetrics({
        totalOrders: currentOrders,
        totalRevenue: Number(currentRevenue.toFixed(2)),
        orderCount: currentOrders,
        previousRevenue: Number(previousRevenue.toFixed(2)),
        previousOrders
      })

      setLoading(false)
    })

    return () => unsubscribe()
  }, [selectedPeriod, selectedTab])

  const revenueChange = metrics.previousRevenue > 0
    ? ((metrics.totalRevenue - metrics.previousRevenue) / metrics.previousRevenue) * 100
    : 0

  const ordersChange = metrics.previousOrders > 0
    ? ((metrics.orderCount - metrics.previousOrders) / metrics.previousOrders) * 100
    : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            className="flex-1 h-12 bg-card animate-pulse rounded-lg"
          />
          <button
            className="flex-1 h-12 bg-card animate-pulse rounded-lg"
          />
        </div>
        <div className="bg-card animate-pulse h-[200px] rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedTab('orders')}
          className={`
            flex-1 px-4 py-3 rounded-lg font-medium transition-colors
            ${selectedTab === 'orders'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent/50'
            }
          `}
        >
          Pedidos realizados
        </button>
        <button
          onClick={() => setSelectedTab('paid')}
          className={`
            flex-1 px-4 py-3 rounded-lg font-medium transition-colors
            ${selectedTab === 'paid'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent/50'
            }
          `}
        >
          Pedidos pagos
        </button>
      </div>

      <div className="bg-background/50 py-4">
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">
              R$ {formatCurrency(metrics.totalRevenue)}
            </p>
            <p className={`text-sm ${revenueChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {revenueChange >= 0 ? '↑' : '↓'} {Math.abs(revenueChange).toFixed(2)}% (+ R$ {formatCurrency(Math.abs(metrics.totalRevenue - metrics.previousRevenue))})
            </p>
          </div>

          <div className="flex items-baseline gap-2">
            <div className="flex items-baseline gap-1 text-sm text-muted-foreground">
              <p>
                {metrics.orderCount}
              </p>
              <p>
                pedidos
              </p>
            </div>
            <p className={`text-sm ${ordersChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {ordersChange >= 0 ? '↑' : '↓'} {Math.abs(ordersChange).toFixed(2)}% (+{Math.abs(metrics.orderCount - metrics.previousOrders)})
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 