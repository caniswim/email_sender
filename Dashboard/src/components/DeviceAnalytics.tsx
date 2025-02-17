import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { Monitor, Smartphone, Tablet } from 'lucide-react'

interface DeviceData {
  name: string
  value: number
  icon: React.ReactNode
}

interface ResolutionData {
  resolution: string
  count: number
  percentage: number
}

export function DeviceAnalytics() {
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [resolutionData, setResolutionData] = useState<ResolutionData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setLoading(false)
        return
      }

      const sessions = Object.values(data) as any[]
      const deviceMap = new Map<string, number>()
      const resolutionMap = new Map<string, number>()
      let totalSessions = 0

      sessions.forEach((session) => {
        totalSessions++

        // Análise de dispositivos
        const userAgent = session.userAgent?.toLowerCase() || ''
        let deviceType = 'desktop'

        if (userAgent.includes('mobile')) {
          deviceType = 'mobile'
        } else if (userAgent.includes('tablet')) {
          deviceType = 'tablet'
        }

        deviceMap.set(deviceType, (deviceMap.get(deviceType) || 0) + 1)

        // Análise de resoluções
        if (session.screenResolution) {
          resolutionMap.set(
            session.screenResolution,
            (resolutionMap.get(session.screenResolution) || 0) + 1
          )
        }
      })

      // Formatar dados de dispositivos
      const formattedDeviceData: DeviceData[] = [
        {
          name: 'Desktop',
          value: (deviceMap.get('desktop') || 0),
          icon: <Monitor className="w-4 h-4" />
        },
        {
          name: 'Mobile',
          value: (deviceMap.get('mobile') || 0),
          icon: <Smartphone className="w-4 h-4" />
        },
        {
          name: 'Tablet',
          value: (deviceMap.get('tablet') || 0),
          icon: <Tablet className="w-4 h-4" />
        }
      ]

      // Formatar dados de resolução
      const formattedResolutionData: ResolutionData[] = Array.from(resolutionMap.entries())
        .map(([resolution, count]) => ({
          resolution,
          count,
          percentage: (count / totalSessions) * 100
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      setDeviceData(formattedDeviceData)
      setResolutionData(formattedResolutionData)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))']

  if (loading) {
    return (
      <div className="bg-card p-6 rounded-xl border border-border h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Distribuição de Dispositivos */}
      <div className="bg-card p-6 rounded-xl border border-border">
        <h3 className="text-lg font-semibold mb-6">Distribuição por Dispositivo</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={deviceData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {deviceData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const data = payload[0].payload as DeviceData
                  return (
                    <div className="bg-popover p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        {data.icon}
                        <span className="font-medium">{data.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {data.value} sessões ({((data.value / deviceData.reduce((acc, curr) => acc + curr.value, 0)) * 100).toFixed(1)}%)
                      </p>
                    </div>
                  )
                }}
              />
              <Legend
                content={({ payload }) => (
                  <div className="flex justify-center gap-6 mt-4">
                    {payload?.map((entry: any, index) => (
                      <div key={`legend-${index}`} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <div className="flex items-center gap-1">
                          {deviceData[index].icon}
                          <span className="text-sm">{entry.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resoluções mais comuns */}
      <div className="bg-card p-6 rounded-xl border border-border">
        <h3 className="text-lg font-semibold mb-6">Resoluções Mais Comuns</h3>
        <div className="space-y-4">
          {resolutionData.map((resolution) => (
            <div key={resolution.resolution} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">{resolution.resolution}</span>
                <span className="text-sm text-muted-foreground">
                  {resolution.count} sessões ({resolution.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${resolution.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 