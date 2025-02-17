import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ProductData {
  id: string
  name: string
  quantity: number
  revenue: number
  image?: {
    url: string
  }
}

export function ProductAnalytics() {
  const [data, setData] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkoutRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(checkoutRef, (snapshot) => {
      const sessions = snapshot.val()
      if (!sessions) {
        setData([])
        setLoading(false)
        return
      }

      const products: { [key: string]: ProductData } = {}

      Object.values(sessions).forEach((session: any) => {
        session.cart?.items?.forEach((item: any) => {
          if (!products[item.id]) {
            products[item.id] = {
              id: item.id,
              name: item.name,
              quantity: 0,
              revenue: 0,
              image: item.image
            }
          }
          products[item.id].quantity += item.quantity
          products[item.id].revenue += parseFloat(item.totalPrice)
        })
      })

      const sortedData = Object.values(products)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)

      setData(sortedData)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="bg-card p-6 rounded-xl border border-border">
      <h2 className="text-xl font-semibold mb-6">Produtos Mais Vendidos</h2>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis yAxisId="left" className="text-muted-foreground" />
            <YAxis yAxisId="right" orientation="right" className="text-muted-foreground" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const data = payload[0].payload as ProductData
                return (
                  <div className="bg-popover p-4 rounded-lg border border-border shadow-lg">
                    {data.image && (
                      <img
                        src={data.image.url}
                        alt={data.name}
                        className="w-20 h-20 object-cover rounded-lg mb-2"
                      />
                    )}
                    <p className="font-medium mb-1">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Quantidade: {data.quantity}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Receita: R$ {data.revenue.toFixed(2)}
                    </p>
                  </div>
                )
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="quantity"
              name="Quantidade"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              name="Receita (R$)"
              fill="hsl(var(--secondary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
} 