import { Link, useLocation } from 'react-router-dom'

export function MobileNavigation() {
  const location = useLocation()

  return (
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
          to="/abandoned-carts"
          className={`flex flex-col items-center justify-center ${
            location.pathname === '/abandoned-carts' ? 'text-primary' : 'text-muted-foreground'
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
          <span className="text-xs mt-1">Carrinhos</span>
        </Link>
      </div>
    </nav>
  )
} 