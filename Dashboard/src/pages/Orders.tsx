import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { X, Phone, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react'
import { formatCurrency, parseCurrency } from '../lib/utils'

interface PixPayment {
  qrcode_url?: string;
  copy_paste?: string;
  expiration_date?: string;
  url?: string;
  code?: string;
}

interface OrderPayment {
  payment_method: 'pix' | 'boleto' | 'credit_card';
  order_status: 'pending' | 'processing' | 'completed' | 'cancelled';
  order_id: string;
  payment: PixPayment;
}

interface Order {
  id: string
  startTime: number
  lastUpdate: number
  updated_at: string
  order: OrderPayment
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
  address?: {
    cep: string
    city: string
    complement: string
    neighborhood: string
    number: string
    state: string
    street: string
    lastUpdate: number
  }
  location?: {
    ip: string
    city: string
    country: string
    region: string
    latitude: number
    longitude: number
  }
  screenResolution?: string
  userAgent?: string
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  useEffect(() => {
    const checkoutRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(checkoutRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setLoading(false)
        return
      }

      const activeOrders = Object.entries(data)
        .map(([id, session]) => ({
          id,
          ...session as any
        }))
        .filter(session => session.order && session.lastUpdate) // Filtra apenas sessões com pedidos e data válida
        .sort((a, b) => {
          const dateA = new Date(a.lastUpdate)
          const dateB = new Date(b.lastUpdate)
          return isNaN(dateB.getTime()) || isNaN(dateA.getTime()) ? 0 : dateB.getTime() - dateA.getTime()
        })

      setOrders(activeOrders)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

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
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-muted-foreground">
          {orders.length} pedido{orders.length === 1 ? '' : 's'} no total
        </p>
      </div>

      {/* Lista de pedidos */}
      <div className="grid grid-cols-1 gap-2">
        {orders.map(order => (
          <div
            key={order.id}
            className="bg-card hover:bg-accent/5 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedOrder(order)}
          >
            <div className="p-3">
              <div className="flex items-start justify-between gap-3">
                {/* Info Principal */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">#{order.order.order_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      order.order.order_status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                      order.order.order_status === 'processing' ? 'bg-blue-500/10 text-blue-500' :
                      order.order.order_status === 'completed' ? 'bg-green-500/10 text-green-500' :
                      'bg-red-500/10 text-red-500'
                    }`}>
                      {order.order.order_status === 'pending' ? 'Pendente' :
                       order.order.order_status === 'processing' ? 'Processando' :
                       order.order.order_status === 'completed' ? 'Concluído' :
                       'Cancelado'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {order.order.payment_method === 'pix' ? 'PIX' :
                       order.order.payment_method === 'boleto' ? 'Boleto' :
                       'Cartão'}
                    </span>
                  </div>
                  <p className="text-sm truncate text-muted-foreground mb-1">{order.contact?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.updated_at ? 
                      format(
                        toZonedTime(parseISO(order.updated_at), 'America/Sao_Paulo'),
                        "dd/MM • HH:mm",
                        { locale: ptBR }
                      )
                      : format(
                        toZonedTime(new Date(order.lastUpdate), 'America/Sao_Paulo'),
                        "dd/MM • HH:mm",
                        { locale: ptBR }
                      )
                    }
                  </p>
                </div>

                {/* Valor e Ações */}
                <div className="flex flex-col items-end gap-2">
                  <span className="font-medium whitespace-nowrap">
                    R$ {formatCurrency(parseCurrency(order.cart?.total || '0'))}
                  </span>
                  <div className="flex gap-1">
                    <a
                      href={`https://blazee.com.br/wp-admin/post.php?post=${order.order.order_id}&action=edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      WooCommerce
                    </a>
                    <a
                      href={`https://wa.me/55${order.contact?.phone?.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de detalhes */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedOrder(null)
            }
          }}
        >
          <div className="bg-card rounded-xl w-full max-w-2xl overflow-hidden">
            {/* Header do Modal */}
            <div className="p-4 border-b border-border flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold">#{selectedOrder.order.order_id}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.updated_at ? 
                      format(
                        toZonedTime(parseISO(selectedOrder.updated_at), 'America/Sao_Paulo'),
                        "dd/MM/yyyy HH:mm",
                        { locale: ptBR }
                      )
                      : format(
                        toZonedTime(new Date(selectedOrder.lastUpdate), 'America/Sao_Paulo'),
                        "dd/MM/yyyy HH:mm",
                        { locale: ptBR }
                      )
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedOrder.order.order_status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                    selectedOrder.order.order_status === 'processing' ? 'bg-blue-500/10 text-blue-500' :
                    selectedOrder.order.order_status === 'completed' ? 'bg-green-500/10 text-green-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>
                    {selectedOrder.order.order_status === 'pending' ? 'Pendente' :
                     selectedOrder.order.order_status === 'processing' ? 'Processando' :
                     selectedOrder.order.order_status === 'completed' ? 'Concluído' :
                     'Cancelado'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {selectedOrder.order.payment_method === 'pix' ? 'PIX' :
                     selectedOrder.order.payment_method === 'boleto' ? 'Boleto' :
                     'Cartão'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
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
                        href={`https://wa.me/55${selectedOrder.contact?.phone?.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full hover:bg-green-500/20 transition-colors"
                      >
                        WhatsApp
                      </a>
                    </div>
                    <p className="font-medium">{selectedOrder.contact?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.contact?.phone}</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.contact?.email}</p>
                  </div>

                  {/* Endereço */}
                  {selectedOrder.address && (
                    <div className="bg-accent/20 p-3 rounded-lg">
                      <h3 className="text-sm font-medium mb-2">Endereço</h3>
                      <p className="text-sm">
                        {selectedOrder.address.street}, {selectedOrder.address.number}
                        {selectedOrder.address.complement && ` - ${selectedOrder.address.complement}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedOrder.address.neighborhood} - {selectedOrder.address.city}/{selectedOrder.address.state}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedOrder.address.cep}</p>
                    </div>
                  )}

                  {/* Pagamento */}
                  {selectedOrder.order.payment && (
                    <div className="bg-accent/20 p-3 rounded-lg">
                      <h3 className="text-sm font-medium mb-2">Pagamento</h3>
                      
                      {selectedOrder.order.payment_method === 'pix' && (
                        <div className="space-y-2">
                          {/* Status de Validade */}
                          {selectedOrder.order.payment.expiration_date && (
                            <div className="flex items-center gap-2">
                              {(() => {
                                // Converte a data de expiração para um objeto Date no fuso horário de SP
                                const [datePart, timePart] = selectedOrder.order.payment.expiration_date.split(' ');
                                const [day, month, year] = datePart.split('/');
                                const [hour, minute] = timePart.split(':');
                                const expirationDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
                                const spTimeZone = 'America/Sao_Paulo';
                                const expirationInSP = toZonedTime(expirationDate, spTimeZone);
                                const nowInSP = toZonedTime(new Date(), spTimeZone);
                                const isExpired = expirationInSP < nowInSP;

                                return (
                                  <>
                                    <div className={`w-2 h-2 rounded-full ${
                                      isExpired ? 'bg-red-500' : 'bg-green-500'
                                    }`} />
                                    <span className="text-xs text-muted-foreground">
                                      {isExpired
                                        ? `Expirado em ${selectedOrder.order.payment.expiration_date}`
                                        : `Válido até ${selectedOrder.order.payment.expiration_date}`
                                      }
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          
                          {/* Botões de Ação */}
                          <div className="flex flex-col gap-2">
                            {selectedOrder.order.payment.copy_paste && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(selectedOrder.order.payment.copy_paste!);
                                  setCopiedId('pix-code');
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors"
                              >
                                {copiedId === 'pix-code' ? <Check size={14} /> : <Copy size={14} />}
                                <span>Copiar Código PIX</span>
                              </button>
                            )}

                            {selectedOrder.order.payment.qrcode_url && (
                              <button
                                onClick={() => {
                                  const img = document.createElement('img');
                                  img.src = selectedOrder.order.payment.qrcode_url!;
                                  const canvas = document.createElement('canvas');
                                  canvas.width = img.width;
                                  canvas.height = img.height;
                                  const ctx = canvas.getContext('2d');
                                  ctx?.drawImage(img, 0, 0);
                                  canvas.toBlob((blob) => {
                                    if (blob) {
                                      navigator.clipboard.write([
                                        new ClipboardItem({ 'image/png': blob })
                                      ]);
                                      setCopiedId('qr-code');
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }
                                  });
                                }}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors"
                              >
                                {copiedId === 'qr-code' ? <Check size={14} /> : <Copy size={14} />}
                                <span>Copiar QR Code</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedOrder.order.payment_method === 'boleto' && (
                        <div className="flex gap-2">
                          {selectedOrder.order.payment.url && (
                            <a
                              href={selectedOrder.order.payment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
                            >
                              Ver Boleto
                            </a>
                          )}
                          {selectedOrder.order.payment.code && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selectedOrder.order.payment.code!);
                                setCopiedId('boleto-code');
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                              className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
                            >
                              {copiedId === 'boleto-code' ? <Check size={12} /> : <Copy size={12} />}
                              <span>Código</span>
                            </button>
                          )}
                        </div>
                      )}
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
                        {selectedOrder.cart?.itemCount} {selectedOrder.cart?.itemCount === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {selectedOrder.cart?.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span>{item.quantity}x</span>
                            <span className="text-muted-foreground truncate max-w-[200px]">{item.name}</span>
                          </div>
                          <span>R$ {formatCurrency(parseCurrency(item.totalPrice))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                      <span className="text-sm font-medium">Total</span>
                      <span className="font-bold">
                        R$ {formatCurrency(parseCurrency(selectedOrder.cart?.total || '0'))}
                      </span>
                    </div>
                  </div>

                  {/* Link do Carrinho */}
                  {selectedOrder.cart?.recoveryUrl && (
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
                            navigator.clipboard.writeText(selectedOrder.cart.recoveryUrl);
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
              {showAdditionalInfo && selectedOrder.location && (
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Localização</h3>
                    <div className="space-y-1 text-xs">
                      <p><span className="text-muted-foreground">IP:</span> {selectedOrder.location.ip}</p>
                      <p><span className="text-muted-foreground">Cidade:</span> {selectedOrder.location.city}</p>
                      <p><span className="text-muted-foreground">Estado:</span> {selectedOrder.location.region}</p>
                      <p><span className="text-muted-foreground">País:</span> {selectedOrder.location.country}</p>
                    </div>
                  </div>
                  <div className="bg-accent/20 p-3 rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Dispositivo</h3>
                    <div className="space-y-1 text-xs">
                      {selectedOrder.screenResolution && (
                        <p><span className="text-muted-foreground">Resolução:</span> {selectedOrder.screenResolution}</p>
                      )}
                      <p className="break-all">
                        <span className="text-muted-foreground">Navegador:</span> {selectedOrder.userAgent}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ações Rápidas */}
              <div className="mt-4 flex justify-end gap-2">
                <a
                  href={`https://wa.me/55${selectedOrder.contact?.phone?.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://blazee.com.br/wp-admin/post.php?post=${selectedOrder.order.order_id}&action=edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors"
                >
                  WooCommerce
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 