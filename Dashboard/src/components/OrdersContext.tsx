import { createContext, useContext, useState, ReactNode } from 'react'

type OrderTab = 'orders' | 'paid'

interface OrdersContextType {
  selectedTab: OrderTab
  setSelectedTab: (tab: OrderTab) => void
}

export const OrdersContext = createContext<OrdersContextType>({
  selectedTab: 'orders',
  setSelectedTab: () => {}
})

export function useOrders() {
  return useContext(OrdersContext)
}

interface OrdersProviderProps {
  children: ReactNode
}

export function OrdersProvider({ children }: OrdersProviderProps) {
  const [selectedTab, setSelectedTab] = useState<OrderTab>('orders')

  return (
    <OrdersContext.Provider value={{ selectedTab, setSelectedTab }}>
      {children}
    </OrdersContext.Provider>
  )
} 