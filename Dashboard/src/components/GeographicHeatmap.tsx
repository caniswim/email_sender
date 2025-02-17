import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface RegionData {
  region: string
  sessions: number
  revenue: number
  averageCart: number
  conversionRate: number
  peakHour: number
  devices: {
    mobile: number
    desktop: number
    tablet: number
  }
  resolutions: {
    [key: string]: number
  }
  products: {
    [key: string]: {
      quantity: number
      revenue: number
      image?: string
    }
  }
}

export function GeographicHeatmap() {
  const [data, setData] = useState<RegionData[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'revenue' | 'sessions' | 'conversion'>('revenue')

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const sessions = snapshot.val()
      if (!sessions) {
        setData([])
        setLoading(false)
        return
      }

      const regionMap = new Map<string, RegionData>()

      Object.values(sessions).forEach((session: any) => {
        if (!session.location?.region) return

        const region = session.location.region
        if (!regionMap.has(region)) {
          regionMap.set(region, {
            region,
            sessions: 0,
            revenue: 0,
            averageCart: 0,
            conversionRate: 0,
            peakHour: 0,
            devices: { mobile: 0, desktop: 0, tablet: 0 },
            resolutions: {},
            products: {}
          })
        }

        const regionData = regionMap.get(region)!
        regionData.sessions++

        // Calcular receita e média do carrinho
        if (session.cart?.total) {
          regionData.revenue += Number(session.cart.total.replace(',', '.'))
          regionData.averageCart = regionData.revenue / regionData.sessions
        }

        // Registrar resolução de tela
        if (session.screenResolution) {
          regionData.resolutions[session.screenResolution] = 
            (regionData.resolutions[session.screenResolution] || 0) + 1
        }

        // Registrar produtos
        session.cart?.items?.forEach((item: any) => {
          if (!regionData.products[item.id]) {
            regionData.products[item.id] = {
              quantity: 0,
              revenue: 0,
              image: item.image?.url
            }
          }
          regionData.products[item.id].quantity += item.quantity
          regionData.products[item.id].revenue += Number(item.totalPrice.replace(',', '.'))
        })

        // Calcular horário de pico
        const hour = new Date(session.startTime).getHours()
        regionData.peakHour = hour // Simplificado para exemplo
      })

      const formattedData = Array.from(regionMap.values())
        .sort((a, b) => b.revenue - a.revenue)

      setData(formattedData)
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
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-xl border border-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Análise Geográfica</h2>
          <select
            className="px-4 py-2 rounded-lg bg-background border border-border"
            value={view}
            onChange={(e) => setView(e.target.value as any)}
          >
            <option value="revenue">Receita</option>
            <option value="sessions">Sessões</option>
            <option value="conversion">Conversão</option>
          </select>
        </div>
        
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="region" className="text-muted-foreground" />
              <YAxis className="text-muted-foreground" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const data = payload[0].payload as RegionData
                  return (
                    <div className="bg-popover p-4 rounded-lg border border-border shadow-lg">
                      <p className="font-medium mb-2">{data.region}</p>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Receita: R$ {Number(data.revenue).toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Sessões: {data.sessions}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Média: R$ {data.averageCart.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Horário de Pico: {data.peakHour}h
                        </p>
                      </div>
                      {/* Top 3 produtos da região */}
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-sm font-medium mb-2">Produtos Populares:</p>
                        <div className="flex gap-2">
                          {Object.entries(data.products)
                            .sort((a, b) => b[1].quantity - a[1].quantity)
                            .slice(0, 3)
                            .map(([id, product]) => (
                              product.image && (
                                <img
                                  key={id}
                                  src={product.image}
                                  alt="Produto popular"
                                  className="w-12 h-12 object-cover rounded-lg"
                                />
                              )
                            ))}
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
              <Legend />
              <Bar
                dataKey={view === 'revenue' ? 'revenue' : view === 'sessions' ? 'sessions' : 'conversionRate'}
                name={view === 'revenue' ? 'Receita (R$)' : view === 'sessions' ? 'Sessões' : 'Taxa de Conversão'}
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="averageCart"
                name="Ticket Médio (R$)"
                stroke="hsl(var(--secondary))"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Análise de Dispositivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-xl border border-border">
          <h3 className="text-lg font-semibold mb-4">Resoluções Mais Comuns</h3>
          <div className="space-y-3">
            {data.map(region => (
              <div key={region.region} className="space-y-2">
                <p className="font-medium">{region.region}</p>
                <div className="space-y-1">
                  {Object.entries(region.resolutions)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([resolution, count]) => (
                      <div key={resolution} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{resolution}</span>
                        <span>{count} sessões</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border">
          <h3 className="text-lg font-semibold mb-4">Produtos Populares por Região</h3>
          <div className="space-y-4">
            {data.map(region => (
              <div key={region.region} className="space-y-2">
                <p className="font-medium">{region.region}</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {Object.entries(region.products)
                    .sort((a, b) => b[1].quantity - a[1].quantity)
                    .slice(0, 4)
                    .map(([id, product]) => (
                      product.image && (
                        <div key={id} className="flex-shrink-0">
                          <img
                            src={product.image}
                            alt="Produto"
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                          <p className="text-xs text-muted-foreground mt-1 text-center">
                            {product.quantity}x
                          </p>
                        </div>
                      )
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 