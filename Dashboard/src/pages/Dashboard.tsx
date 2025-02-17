import { DashboardHeader, PeriodContext, Period } from '../components/DashboardHeader'
import { DashboardMetrics } from '../components/DashboardMetrics'
import { DashboardChart } from '../components/DashboardChart'
import { LiveMetrics } from '../components/LiveMetrics'
import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { OrdersProvider } from '../components/OrdersContext'

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

export function Dashboard() {
  const location = useLocation()
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(periods[0])

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border md:hidden z-50">
        <div className="grid h-full grid-cols-4">
          <Link
            to="/"
            className={`flex flex-col items-center justify-center ${
              location.pathname === '/' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="text-xs mt-1">Home</span>
          </Link>

          <Link
            to="/metrics"
            className={`flex flex-col items-center justify-center ${
              location.pathname === '/metrics' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            <span className="text-xs mt-1">Métricas</span>
          </Link>

          <Link
            to="/orders"
            className={`flex flex-col items-center justify-center ${
              location.pathname === '/orders' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="text-xs mt-1">Pedidos</span>
          </Link>

          <Link
            to="/cart"
            className={`flex flex-col items-center justify-center ${
              location.pathname === '/cart' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            <span className="text-xs mt-1">Carrinho</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 hidden md:flex md:w-64 border-r border-border">
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-2xl font-bold">BZ</h1>
            </div>
            <nav className="mt-8 flex-1 px-2 space-y-1">
              <Link
                to="/"
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  location.pathname === '/'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/orders"
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  location.pathname === '/orders'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                Pedidos
              </Link>
              <Link
                to="/products"
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  location.pathname === '/products'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                Produtos
              </Link>
              <Link
                to="/customers"
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  location.pathname === '/customers'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                Clientes
              </Link>
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pb-20 md:pb-0 md:pl-64">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <PeriodContext.Provider value={{ selectedPeriod, setSelectedPeriodById: (id) => {
            const period = periods.find(p => p.id === id)
            if (period) {
              setSelectedPeriod(period)
            }
          }}}>
            <DashboardHeader />
            <OrdersProvider>
              <DashboardMetrics />
              <DashboardChart />
            </OrdersProvider>
            <LiveMetrics />
          </PeriodContext.Provider>
        </div>
      </main>
    </div>
  )
} 