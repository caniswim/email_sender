import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

interface ProductVariation {
  value: string
  quantity: number
}

interface Product {
  id: string
  name: string
  quantity: number
  revenue: number
  image?: {
    url: string
  }
  variations: {
    [key: string]: ProductVariation
  }
  combinations: Array<{
    products: string[]
    count: number
  }>
}

export function ProductGallery() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  useEffect(() => {
    const sessionsRef = ref(db, 'checkout_sessions')
    
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const sessions = snapshot.val()
      if (!sessions) {
        setProducts([])
        setLoading(false)
        return
      }

      const productMap = new Map<string, Product>()
      const combinationsMap = new Map<string, number>()

      Object.values(sessions).forEach((session: any) => {
        session.cart?.items?.forEach((item: any) => {
          if (!productMap.has(item.id)) {
            productMap.set(item.id, {
              id: item.id,
              name: item.name,
              quantity: 0,
              revenue: 0,
              image: item.image,
              variations: {},
              combinations: []
            })
          }

          const product = productMap.get(item.id)!
          product.quantity += item.quantity
          product.revenue += parseFloat(item.totalPrice)

          // Registrar variações
          if (item.variationId) {
            const variationKey = `variation_${item.variationId}`
            if (!product.variations[variationKey]) {
              product.variations[variationKey] = {
                value: `Variação ${item.variationId}`,
                quantity: 0
              }
            }
            product.variations[variationKey].quantity += item.quantity
          }
        })

        // Registrar combinações de produtos
        const items = session.cart?.items || []
        if (items.length > 1) {
          for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
              const combo = [items[i].id, items[j].id].sort().join('-')
              combinationsMap.set(combo, (combinationsMap.get(combo) || 0) + 1)
            }
          }
        }
      })

      // Adicionar combinações aos produtos
      combinationsMap.forEach((count, combo) => {
        const [id1, id2] = combo.split('-')
        const product1 = productMap.get(id1)
        const product2 = productMap.get(id2)
        if (product1 && product2) {
          product1.combinations.push({
            products: [id2],
            count
          })
          product2.combinations.push({
            products: [id1],
            count
          })
        }
      })

      const sortedProducts = Array.from(productMap.values())
        .sort((a, b) => b.quantity - a.quantity)

      setProducts(sortedProducts)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Grid de Produtos */}
      <div className="bg-card p-6 rounded-xl border border-border">
        <h2 className="text-xl font-semibold mb-6">Produtos Mais Populares</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.slice(0, 8).map(product => (
            <div
              key={product.id}
              className="bg-accent/50 rounded-xl p-4 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => setSelectedProduct(product)}
            >
              {product.image && (
                <img
                  src={product.image.url}
                  alt={product.name}
                  className="w-full aspect-square object-cover rounded-lg mb-3"
                />
              )}
              <div className="space-y-1">
                <p className="font-medium line-clamp-2">{product.name}</p>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{product.quantity}x vendidos</span>
                  <span>R$ {product.revenue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Variações Populares */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-xl border border-border">
          <h3 className="text-lg font-semibold mb-4">Variações Mais Vendidas</h3>
          <div className="space-y-4">
            {products.slice(0, 4).map(product => (
              <div key={product.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  {product.image && (
                    <img
                      src={product.image.url}
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                  )}
                  <p className="font-medium">{product.name}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.values(product.variations)
                    .sort((a, b) => b.quantity - a.quantity)
                    .slice(0, 6)
                    .map(variation => (
                      <div
                        key={variation.value}
                        className="bg-accent/50 px-3 py-2 rounded-lg text-sm"
                      >
                        <p className="font-medium">{variation.value}</p>
                        <p className="text-muted-foreground">{variation.quantity}x</p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Combinações Frequentes */}
        <div className="bg-card p-6 rounded-xl border border-border">
          <h3 className="text-lg font-semibold mb-4">Combinações Frequentes</h3>
          <div className="space-y-4">
            {products
              .filter(p => p.combinations.length > 0)
              .slice(0, 4)
              .map(product => (
                <div key={product.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    {product.image && (
                      <img
                        src={product.image.url}
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    )}
                    <p className="font-medium">{product.name}</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {product.combinations
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 4)
                      .map(combo => {
                        const relatedProduct = products.find(p => p.id === combo.products[0])
                        return relatedProduct?.image ? (
                          <div key={combo.products[0]} className="flex-shrink-0 text-center">
                            <img
                              src={relatedProduct.image.url}
                              alt="Produto relacionado"
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {combo.count}x juntos
                            </p>
                          </div>
                        ) : null
                      })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes do Produto */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedProduct(null)
            }
          }}
        >
          <div className="bg-card rounded-xl w-full max-w-2xl overflow-hidden">
            <div className="relative">
              {selectedProduct.image && (
                <img
                  src={selectedProduct.image.url}
                  alt={selectedProduct.name}
                  className="w-full aspect-video object-cover"
                />
              )}
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-2">{selectedProduct.name}</h3>
              <div className="flex justify-between text-sm text-muted-foreground mb-4">
                <span>{selectedProduct.quantity}x vendidos</span>
                <span>R$ {selectedProduct.revenue.toFixed(2)} em vendas</span>
              </div>

              {/* Variações */}
              <div className="space-y-4">
                <h4 className="font-medium">Variações Disponíveis</h4>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(selectedProduct.variations)
                    .sort((a, b) => b.quantity - a.quantity)
                    .map(variation => (
                      <div
                        key={variation.value}
                        className="bg-accent/50 px-3 py-2 rounded-lg text-sm"
                      >
                        <p className="font-medium">{variation.value}</p>
                        <p className="text-muted-foreground">{variation.quantity}x</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 
} 