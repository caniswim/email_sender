import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

const ESTADOS = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins'
}

export function GeographicAnalytics() {
  const [stateData, setStateData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkoutRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(checkoutRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const stateStats = Object.values(data).reduce((acc: Record<string, { pedidos: number, receita: number }>, session: any) => {
          const state = session.addressData?.state
          if (state) {
            if (!acc[state]) {
              acc[state] = { pedidos: 0, receita: 0 }
            }
            acc[state].pedidos++
            if (session.cart?.total) {
              acc[state].receita += session.cart.total
            }
          }
          return acc
        }, {})

        const formattedData = Object.entries(stateStats)
          .map(([state, stats]) => ({
            estado: ESTADOS[state as keyof typeof ESTADOS] || state,
            pedidos: stats.pedidos,
            receita: Number(stats.receita.toFixed(2))
          }))
          .sort((a, b) => b.receita - a.receita)

        setStateData(formattedData)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="bg-card p-6 rounded-lg shadow-sm h-[400px] flex items-center justify-center">
        <div className="text-muted-foreground">Carregando dados...</div>
      </div>
    )
  }

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Distribuição Geográfica</h2>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stateData}
            margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis type="number" />
            <YAxis
              dataKey="estado"
              type="category"
              width={100}
              className="text-xs"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(24, 24, 27, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number, name: string) => [
                name === 'receita' ? `R$ ${value.toFixed(2)}` : value,
                name === 'receita' ? 'Receita' : 'Pedidos'
              ]}
            />
            <Legend />
            <Bar
              dataKey="pedidos"
              fill="#8884d8"
              name="Pedidos"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="receita"
              fill="#82ca9d"
              name="Receita (R$)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
} 