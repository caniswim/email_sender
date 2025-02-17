import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package } from 'lucide-react'

export function Sidebar() {
  const location = useLocation()

  return (
    <div className="fixed top-0 left-0 h-full w-64 bg-card border-r border-border z-40">
      <div className="p-6 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-lg font-bold text-primary-foreground">B</span>
        </div>
        <h1 className="text-xl font-bold text-primary">Blazee</h1>
      </div>
      
      <nav className="px-2 py-4">
        <div className="space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
              location.pathname === '/' 
                ? 'bg-accent text-accent-foreground' 
                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
            }`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </Link>
          
          <Link
            to="/orders"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
              location.pathname === '/orders'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
            }`}
          >
            <Package size={20} />
            <span className="font-medium">Pedidos</span>
          </Link>

          <Link
            to="/abandoned-carts"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
              location.pathname === '/abandoned-carts'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
            }`}
          >
            <ShoppingCart size={20} />
            <span className="font-medium">Carrinhos Abandonados</span>
          </Link>
        </div>
      </nav>
    </div>
  )
} 