import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { X, Phone, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react'
import { formatCurrency, parseCurrency } from '../lib/utils'

interface AbandonedCart {
  id: string
  startTime: number
  lastUpdate: number
  activity: {
    current_step: string
    is_active: boolean
    last_activity: number
  }
  order?: {
    order_id: string
    order_status: string
    payment_method: string
  }
  contact: {
    name: string
    phone: string
    email: string
    cpf: string
  }
  cart: {
    items: Array<{
      id: number
      name: string
      quantity: number
      totalPrice: string
      unitPrice: string
      variationId: number
      image: {
        url: string
        srcset: string
      }
    }>
    itemCount: number
    total: string
    subtotal: string
    recoveryUrl: string
  }
  contacted?: boolean
  address: {
    cep: string
    city: string
    complement: string
    neighborhood: string
    number: string
    state: string
    street: string
    lastUpdate: number
  }
  location: {
    ip: string
    city: string
    country: string
    region: string
    latitude: number
    longitude: number
  }
  screenResolution: string
  userAgent: string
}

interface CartStatus {
  isAbandoned: boolean
  lastActiveTime: string
  abandonedStep: string
}

export function AbandonedCarts() {
  const [carts, setCarts] = useState<(AbandonedCart & { status: CartStatus })[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCart, setSelectedCart] = useState<(AbandonedCart & { status: CartStatus }) | null>(null)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [contactedCarts, setContactedCarts] = useState<Set<string>>(new Set())

  const handleCopyUrl = async (url: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Erro ao copiar:', err)
    }
  }

  const handleMarkAsContacted = (cartId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setContactedCarts(prev => {
      const newSet = new Set(prev)
      newSet.add(cartId)
      return newSet
    })
  }

  useEffect(() => {
    const checkoutRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(checkoutRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setLoading(false)
        return
      }

      const now = new Date()
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000)

      const activeSessions = Object.entries(data)
        .map(([id, session]: [string, any]) => {
          const lastUpdateDate = session.lastUpdate ? new Date(session.lastUpdate) : null
          const isValidDate = lastUpdateDate && !isNaN(lastUpdateDate.getTime())
          const isAbandoned = isValidDate ? lastUpdateDate < twentyMinutesAgo : false
          
          return {
            id,
            ...session,
            status: {
              isAbandoned,
              lastActiveTime: isValidDate
                ? formatDistanceToNow(lastUpdateDate, { locale: ptBR, addSuffix: true })
                : 'Data inválida',
              abandonedStep: session.activity?.current_step || 'Desconhecido'
            }
          }
        })
        .filter(session => 
          // Filtra apenas sessões com dados do cliente, que não foram finalizadas e não tem pedido criado
          session.contact?.name &&
          session.contact?.phone &&
          session.activity?.current_step !== 'success' &&
          !session.order // Exclui sessões que já tem pedido
        )
        .sort((a, b) => {
          // Ordena por status (abandonados primeiro) e depois por data
          if (a.status.isAbandoned !== b.status.isAbandoned) {
            return a.status.isAbandoned ? -1 : 1
          }
          const dateA = a.lastUpdate ? new Date(a.lastUpdate) : null
          const dateB = b.lastUpdate ? new Date(b.lastUpdate) : null
          const isValidA = dateA && !isNaN(dateA.getTime())
          const isValidB = dateB && !isNaN(dateB.getTime())
          
          if (!isValidA || !isValidB) return 0
          return dateB.getTime() - dateA.getTime()
        })

      setCarts(activeSessions)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  function formatTimeSpent(startTime: string) {
    return formatDistanceToNow(new Date(startTime), { locale: ptBR, addSuffix: true })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-card rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Carrinhos</h1>
        <p className="text-muted-foreground">
          {carts.length} carrinho{carts.length === 1 ? '' : 's'} no total
        </p>
      </div>

      {/* Lista de carrinhos */}
      <div className="grid grid-cols-1 gap-2">
        {carts.map(cart => {
          const needsContact = cart.status.isAbandoned && !contactedCarts.has(cart.id)
          return (
            <div
              key={cart.id}
              className="bg-card hover:bg-accent/5 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer relative"
              onClick={() => setSelectedCart(cart)}
            >
              {needsContact && (
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-8 bg-yellow-500 rounded-full" />
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  {/* Info Principal */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{cart.contact?.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        cart.status.isAbandoned 
                          ? 'bg-yellow-500/10 text-yellow-500'
                          : 'bg-green-500/10 text-green-500'
                      }`}>
                        {cart.status.isAbandoned ? 'Abandonado' : 'Ativo'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {cart.activity?.current_step === 'contact' ? 'Contato' :
                         cart.activity?.current_step === 'shipping' ? 'Entrega' :
                         cart.activity?.current_step === 'payment' ? 'Pagamento' :
                         cart.activity?.current_step}
                      </span>
                    </div>
                    <p className="text-sm truncate text-muted-foreground mb-1">
                      {cart.cart?.itemCount} {cart.cart?.itemCount === 1 ? 'item' : 'itens'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Última atividade {cart.status.lastActiveTime}
                    </p>
                  </div>

                  {/* Valor e Ações */}
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-medium whitespace-nowrap">
                      R$ {formatCurrency(parseCurrency(cart.cart?.total || '0'))}
                    </span>
                    <div className="flex gap-1">
                      <a
                        href={`https://wa.me/55${cart.contact?.phone?.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          needsContact 
                            ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500' 
                            : 'bg-green-500/10 hover:bg-green-500/20 text-green-500'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (needsContact) {
                            handleMarkAsContacted(cart.id, e)
                          }
                        }}
                      >
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de detalhes */}
      {selectedCart && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedCart(null)
            }
          }}
        >
          <div className="bg-card rounded-xl w-full max-w-2xl overflow-hidden">
            {/* Header do Modal */}
            <div className="p-4 border-b border-border flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selectedCart.contact?.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedCart.lastUpdate ? 
                      format(
                        toZonedTime(new Date(selectedCart.lastUpdate), 'America/Sao_Paulo'),
                        "dd/MM/yyyy HH:mm",
                        { locale: ptBR }
                      )
                      : 'Data não disponível'
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedCart.status.isAbandoned 
                      ? 'bg-yellow-500/10 text-yellow-500'
                      : 'bg-green-500/10 text-green-500'
                  }`}>
                    {selectedCart.status.isAbandoned ? 'Abandonado' : 'Ativo'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {selectedCart.activity?.current_step === 'contact' ? 'Contato' :
                     selectedCart.activity?.current_step === 'shipping' ? 'Entrega' :
                     selectedCart.activity?.current_step === 'payment' ? 'Pagamento' :
                     selectedCart.activity?.current_step}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCart(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Coluna da Esquerda - Informações Principais */}
                <div className="space-y-4">
                  {/* Cliente */}
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-sm font-medium">Cliente</h3>
                      <a
                        href={`https://wa.me/55${selectedCart.contact?.phone?.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full hover:bg-green-500/20 transition-colors"
                      >
                        WhatsApp
                      </a>
                    </div>
                    <p className="font-medium">{selectedCart.contact?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedCart.contact?.phone}</p>
                    <p className="text-sm text-muted-foreground">{selectedCart.contact?.email}</p>
                  </div>

                  {/* Endereço */}
                  {selectedCart.address && (
                    <div className="bg-accent/20 p-3 rounded-lg">
                      <h3 className="text-sm font-medium mb-2">Endereço</h3>
                      <p className="text-sm">
                        {selectedCart.address.street}, {selectedCart.address.number}
                        {selectedCart.address.complement && ` - ${selectedCart.address.complement}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedCart.address.neighborhood} - {selectedCart.address.city}/{selectedCart.address.state}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedCart.address.cep}</p>
                    </div>
                  )}

                  {/* Link do Carrinho */}
                  {selectedCart.cart?.recoveryUrl && (
                    <div className="bg-accent/20 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium">Link do Carrinho</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">
                            Abandonado
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedCart.cart.recoveryUrl);
                            setCopiedId('cart-url');
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
                        >
                          {copiedId === 'cart-url' ? <Check size={12} /> : <Copy size={12} />}
                          <span>Copiar Link</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Coluna da Direita - Produtos e Valores */}
                <div className="space-y-4">
                  {/* Produtos */}
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-sm font-medium">Produtos</h3>
                      <span className="text-xs text-muted-foreground">
                        {selectedCart.cart?.itemCount} {selectedCart.cart?.itemCount === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {selectedCart.cart?.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span>{item.quantity}x</span>
                            <span className="text-muted-foreground truncate max-w-[200px]">{item.name}</span>
                          </div>
                          <span>R$ {Number(item.totalPrice.replace(',', '.')).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                      <span className="text-sm font-medium">Total</span>
                      <span className="font-bold">
                        R$ {selectedCart.cart?.total ? Number(selectedCart.cart.total.replace(',', '.')).toFixed(2) : '0,00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botão para Informações Adicionais */}
              <button
                onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                className="w-full mt-4 py-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdditionalInfo ? (
                  <>
                    <ChevronUp size={14} />
                    Menos detalhes
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    Mais detalhes
                  </>
                )}
              </button>

              {/* Informações Adicionais */}
              {showAdditionalInfo && selectedCart.location && (
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Localização</h3>
                    <div className="space-y-1 text-xs">
                      <p><span className="text-muted-foreground">IP:</span> {selectedCart.location.ip}</p>
                      <p><span className="text-muted-foreground">Cidade:</span> {selectedCart.location.city}</p>
                      <p><span className="text-muted-foreground">Estado:</span> {selectedCart.location.region}</p>
                      <p><span className="text-muted-foreground">País:</span> {selectedCart.location.country}</p>
                    </div>
                  </div>
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Dispositivo</h3>
                    <div className="space-y-1 text-xs">
                      {selectedCart.screenResolution && (
                        <p><span className="text-muted-foreground">Resolução:</span> {selectedCart.screenResolution}</p>
                      )}
                      <p className="break-all">
                        <span className="text-muted-foreground">Navegador:</span> {selectedCart.userAgent}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 