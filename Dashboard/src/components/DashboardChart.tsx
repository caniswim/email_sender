import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { format, isAfter, isBefore, differenceInHours, addHours, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatCurrency, parseCurrency } from '../lib/utils'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { usePeriod } from './DashboardHeader'
import { useOrders } from './OrdersContext'

interface ChartData {
  date: string
  value: number
  orders: number
  rawDate: Date
}

export function DashboardChart() {
  const { selectedPeriod } = usePeriod()
  const { selectedTab } = useOrders()
  const [data, setData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    const periodStart = selectedPeriod.startDate()
    const periodEnd = selectedPeriod.endDate()

    // Calcula o número de pontos no gráfico baseado na duração do período
    const hoursBetween = Math.max(1, differenceInHours(periodEnd, periodStart))
    const daysBetween = differenceInDays(periodEnd, periodStart)
    
    // Se o período for maior que 2 dias, usa pontos por dia
    // Se for menor, usa pontos por hora
    const useHourlyPoints = daysBetween <= 2
    const numberOfPoints = useHourlyPoints 
      ? Math.min(24, hoursBetween) 
      : Math.min(24, daysBetween)

    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const rawData = snapshot.val()
      if (!rawData) {
        setLoading(false)
        return
      }

      const sessions = Object.values(rawData) as any[]
      const chartData: ChartData[] = []

      // Cria pontos no gráfico em intervalos regulares
      const interval = useHourlyPoints 
        ? hoursBetween / numberOfPoints
        : (hoursBetween / numberOfPoints) * 24

      for (let i = 0; i <= numberOfPoints; i++) {
        const pointDate = addHours(periodStart, i * interval)
        if (pointDate > periodEnd) break

        const pointSessions = sessions.filter(session => {
          if (!session.lastUpdate) return false
          const orderDate = new Date(session.lastUpdate)
          const nextPoint = i < numberOfPoints ? addHours(periodStart, (i + 1) * interval) : periodEnd
          
          const isPaid = session.order?.order_status === 'paid'
          return (
            session.order &&
            isAfter(orderDate, pointDate) &&
            isBefore(orderDate, nextPoint) &&
            (selectedTab === 'orders' || (selectedTab === 'paid' && isPaid))
          )
        })

        const value = pointSessions.reduce((acc, session) => {
          const total = parseCurrency(session.cart?.total || '0')
          return acc + total
        }, 0)

        // Formata a data baseado no período
        const dateFormat = useHourlyPoints ? 'HH:mm' : 'dd/MM'
        
        chartData.push({
          date: format(pointDate, dateFormat, { locale: ptBR }),
          value: Number(value.toFixed(2)),
          orders: pointSessions.length,
          rawDate: pointDate
        })
      }

      setData(chartData)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [selectedPeriod, selectedTab])

  if (loading) {
    return (
      <div className="bg-card animate-pulse h-[200px] rounded-lg" />
    )
  }

  return (
    <div className="h-[200px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
            dy={10}
          />
          
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
            dx={-10}
            tickFormatter={(value) => `R$ ${formatCurrency(value)}`}
          />
          
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              
              const value = payload[0]?.value as number
              const orders = payload[0]?.payload?.orders as number
              const rawDate = payload[0]?.payload?.rawDate as Date
              
              // Formata a data no tooltip com mais detalhes
              const tooltipDate = format(rawDate, "dd/MM/yyyy HH:mm", { locale: ptBR })
              
              return (
                <div className="bg-popover p-3 rounded-lg border border-border shadow-lg">
                  <p className="font-medium">
                    {tooltipDate}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Valor: R$ {formatCurrency(value ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pedidos: {orders ?? 0}
                  </p>
                </div>
              )
            }}
          />
          
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#colorValue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
} 