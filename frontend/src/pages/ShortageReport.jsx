import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import MarketplaceLogo from '../components/MarketplaceLogo'

export default function ShortageReport() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getShortageReport()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const totalShortage = items.reduce((s, i) => s + i.shortage_qty, 0)

  return (
    <div className="min-h-screen bg-gray-100 p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Relatório de Faltas</h1>
          <p className="text-gray-500 text-sm mt-1">
            SKUs com falta de estoque — listas em andamento e concluídas
          </p>
        </div>
        <button
          onClick={() => navigate('/supervisor')}
          className="text-blue-500 hover:underline text-lg"
        >
          ← Supervisor
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        {loading && (
          <p className="text-center text-gray-400 py-8">Carregando...</p>
        )}

        {!loading && items.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-xl">
            ✓ Nenhuma falta registrada.
          </p>
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">
                {items.length} SKU{items.length !== 1 ? 's' : ''} com falta
              </p>
              <p className="text-sm font-semibold text-red-600">
                Total faltante: {totalShortage} unidades
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="pb-3 pr-4">SKU</th>
                    <th className="pb-3 pr-4">Descrição</th>
                    <th className="pb-3 pr-4">Lista</th>
                    <th className="pb-3 pr-4">Observação</th>
                    <th className="pb-3 text-right text-red-500">Qtd Faltante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={`${item.sku}-${item.session_code}`} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono font-semibold whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {item.description || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 flex items-center gap-1 py-0.5 rounded-full whitespace-nowrap w-max">
                          <MarketplaceLogo marketplace={item.marketplace} size={14} /> {item.session_code || '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div
                          onClick={async () => {
                            const newNotes = window.prompt(`Adicionar/Editar observação para ${item.sku}:`, item.notes || '')
                            if (newNotes === null) return
                            try {
                              await api.updateShortageNotes(item.sku, newNotes.trim() || null)
                              setItems(prev => prev.map(i => i.sku === item.sku ? { ...i, notes: newNotes.trim() || null } : i))
                            } catch (e) {
                              alert('Erro ao atualizar: ' + e.message)
                            }
                          }}
                          className="truncate max-w-[250px] cursor-pointer text-blue-600 hover:text-blue-800 italic group hover:bg-blue-50 p-1 rounded transition-colors"
                          title={item.notes || 'Clique para adicionar observação'}
                        >
                          <span className="mr-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                          {item.notes || <span className="text-gray-300">clique para add</span>}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-bold text-red-600 text-base">
                          -{item.shortage_qty}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
