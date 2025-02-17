import { createContext, useContext, useState } from 'react'

export interface Period {
  id: string
  label: string
  startDate: () => Date
  endDate: () => Date
}

const periods: Period[] = [
  {
    id: 'today',
    label: 'Hoje',
    startDate: () => new Date(new Date().setHours(0, 0, 0, 0)),
    endDate: () => new Date()
  },
  {
    id: 'yesterday',
    label: 'Ontem',
    startDate: () => {
      const date = new Date()
      date.setDate(date.getDate() - 1)
      return new Date(date.setHours(0, 0, 0, 0))
    },
    endDate: () => {
      const date = new Date()
      date.setDate(date.getDate() - 1)
      return new Date(date.setHours(23, 59, 59, 999))
    }
  },
  {
    id: 'last7days',
    label: 'Últimos 7 dias',
    startDate: () => {
      const date = new Date()
      date.setDate(date.getDate() - 7)
      return new Date(date.setHours(0, 0, 0, 0))
    },
    endDate: () => new Date()
  },
  {
    id: 'currentMonth',
    label: 'Mês atual',
    startDate: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: () => new Date()
  },
  {
    id: 'lastMonth',
    label: 'Mês passado',
    startDate: () => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    endDate: () => new Date(new Date().getFullYear(), new Date().getMonth(), 0)
  }
]

interface PeriodContextType {
  selectedPeriod: Period
  setSelectedPeriodById: (id: string) => void
}

export const PeriodContext = createContext<PeriodContextType>({
  selectedPeriod: periods[0],
  setSelectedPeriodById: () => {}
})

export function usePeriod() {
  return useContext(PeriodContext)
}

export function DashboardHeader() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(periods[0])

  const setSelectedPeriodById = (id: string) => {
    const period = periods.find(p => p.id === id)
    if (period) {
      setSelectedPeriod(period)
    }
  }

  return (
    <PeriodContext.Provider value={{ selectedPeriod, setSelectedPeriodById }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">BZ</h1>
          <h2 className="text-lg font-medium">VISÃO GERAL</h2>
        </div>

        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {periods.map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriodById(period.id)}
              className={`
                px-4 py-2 rounded-full whitespace-nowrap transition-colors
                ${selectedPeriod.id === period.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent/50'
                }
              `}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>
    </PeriodContext.Provider>
  )
} 