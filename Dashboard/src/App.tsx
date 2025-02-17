import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './components/theme-provider'
import { Sidebar } from './components/Sidebar'
import { MobileNavigation } from './components/MobileNavigation'
import { Dashboard } from './pages/Dashboard'
import { AbandonedCarts } from './pages/AbandonedCarts'
import { Orders } from './pages/Orders'
import { initAbandonedCheckoutWebhook } from './services/abandonedCheckoutWebhook'

export function App() {
  useEffect(() => {
    // Inicializa o webhook de checkouts abandonados
    initAbandonedCheckoutWebhook()
  }, [])

  return (
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="min-h-screen bg-background">
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <Sidebar />
          </div>

          {/* Mobile Navigation */}
          <MobileNavigation />

          <main className="p-4 lg:p-8 lg:pl-72 pb-20 md:pb-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/abandoned-carts" element={<AbandonedCarts />} />
              <Route path="/orders" element={<Orders />} />
            </Routes>
          </main>
        </div>
      </ThemeProvider>
    </BrowserRouter>
  )
}
