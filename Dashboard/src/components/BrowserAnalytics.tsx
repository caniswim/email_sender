import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

interface BrowserStats {
  name: string
  count: number
  percentage: number
  icon: string
}

const BROWSER_ICONS = {
  chrome: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
      <circle cx="50" cy="50" r="45" fill="#4285F4"/>
      <circle cx="50" cy="50" r="15.5" fill="#fff"/>
      <path d="M50 34.5c8.5 0 15.5 7 15.5 15.5s-7 15.5-15.5 15.5-15.5-7-15.5-15.5 7-15.5 15.5-15.5m0-3c-10.2 0-18.5 8.3-18.5 18.5s8.3 18.5 18.5 18.5 18.5-8.3 18.5-18.5-8.3-18.5-18.5-18.5z" fill="#4285F4"/>
      <path d="M84.5 50h-37l18.5-32h-32c-17.7 0-32 14.3-32 32s14.3 32 32 32c15.5 0 28.4-11 31.3-25.5L84.5 50z" fill="#EA4335"/>
      <path d="M66 18l18.5 32H84L65.5 18H66z" fill="#FBBC05"/>
      <path d="M65.3 56.5C62.4 71 49.5 82 34 82 16.3 82 2 67.7 2 50h32l31.3 6.5z" fill="#34A853"/>
    </svg>
  ),
  firefox: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
      <circle cx="50" cy="50" r="45" fill="#FF9500"/>
      <path d="M50 5C25.2 5 5 25.2 5 50s20.2 45 45 45 45-20.2 45-45S74.8 5 50 5zm0 80c-19.3 0-35-15.7-35-35s15.7-35 35-35 35 15.7 35 35-15.7 35-35 35z" fill="#E66000"/>
      <path d="M50 20c-16.6 0-30 13.4-30 30s13.4 30 30 30 30-13.4 30-30-13.4-30-30-30zm0 50c-11 0-20-9-20-20s9-20 20-20 20 9 20 20-9 20-20 20z" fill="#FF9500"/>
    </svg>
  ),
  safari: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
      <circle cx="50" cy="50" r="45" fill="#0FB5EE"/>
      <path d="M50 5C25.2 5 5 25.2 5 50s20.2 45 45 45 45-20.2 45-45S74.8 5 50 5zm0 80c-19.3 0-35-15.7-35-35s15.7-35 35-35 35 15.7 35 35-15.7 35-35 35z" fill="#000"/>
      <path d="M65 35L35 65M35 35l30 30" stroke="#fff" strokeWidth="2"/>
      <circle cx="50" cy="50" r="3" fill="#fff"/>
    </svg>
  ),
  edge: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
      <circle cx="50" cy="50" r="45" fill="#0078D7"/>
      <path d="M50 5C25.2 5 5 25.2 5 50s20.2 45 45 45 45-20.2 45-45S74.8 5 50 5zm0 80c-19.3 0-35-15.7-35-35s15.7-35 35-35 35 15.7 35 35-15.7 35-35 35z" fill="#0078D7"/>
      <path d="M33 33c9.4-9.4 24.6-9.4 34 0s9.4 24.6 0 34-24.6 9.4-34 0" stroke="#fff" strokeWidth="2" fill="none"/>
    </svg>
  ),
  other: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
      <circle cx="50" cy="50" r="45" fill="#757575"/>
      <path d="M50 5C25.2 5 5 25.2 5 50s20.2 45 45 45 45-20.2 45-45S74.8 5 50 5zm0 80c-19.3 0-35-15.7-35-35s15.7-35 35-35 35 15.7 35 35-15.7 35-35 35z" fill="#757575"/>
      <circle cx="35" cy="50" r="5" fill="#fff"/>
      <circle cx="50" cy="50" r="5" fill="#fff"/>
      <circle cx="65" cy="50" r="5" fill="#fff"/>
    </svg>
  )
}

export function BrowserAnalytics() {
  const [browserStats, setBrowserStats] = useState<BrowserStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkoutRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(checkoutRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const browserCounts: Record<string, number> = Object.values(data).reduce((acc: Record<string, number>, session: any) => {
          const userAgent = session.userAgent?.toLowerCase() || ''
          let browser = 'other'

          if (userAgent.includes('chrome')) {
            browser = 'chrome'
          } else if (userAgent.includes('firefox')) {
            browser = 'firefox'
          } else if (userAgent.includes('safari')) {
            browser = 'safari'
          } else if (userAgent.includes('edg')) {
            browser = 'edge'
          }

          acc[browser] = (acc[browser] || 0) + 1
          return acc
        }, {})

        const total = Object.values(browserCounts).reduce((a, b) => a + b, 0)
        
        const stats: BrowserStats[] = Object.entries(browserCounts).map(([name, count]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          count,
          percentage: Math.round((count / total) * 100),
          icon: name
        })).sort((a, b) => b.percentage - a.percentage)

        setBrowserStats(stats)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="bg-card p-6 rounded-lg shadow-sm h-[300px] flex items-center justify-center">
        <div className="text-muted-foreground">Carregando dados...</div>
      </div>
    )
  }

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <h2 className="text-lg font-semibold mb-6">Sessões por Navegador</h2>
      <div className="space-y-4">
        {browserStats.map((browser) => (
          <div key={browser.name} className="flex items-center gap-4">
            <div className="p-2 bg-background rounded-lg">
              {BROWSER_ICONS[browser.icon as keyof typeof BROWSER_ICONS]}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">{browser.name}</span>
                <span>{browser.percentage}%</span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${browser.percentage}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 