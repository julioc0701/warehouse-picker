import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import MarketplaceLogo from '../components/MarketplaceLogo'
import TransferConfirmDialog from '../components/dialogs/TransferConfirmDialog'
import SearchSelectionDialog from '../components/dialogs/SearchSelectionDialog'
import ShortageDialog from '../components/dialogs/ShortageDialog'
import UnknownBarcodeDialog from '../components/dialogs/UnknownBarcodeDialog'
import WrongSkuDialog from '../components/dialogs/WrongSkuDialog'

const STATUS_COLOR = {
  pending: 'bg-gray-200',
  in_progress: 'bg-blue-500',
  complete: 'bg-green-500',
  partial: 'bg-orange-400',
  out_of_stock: 'bg-red-500',
}

const STATUS_LABEL = {
  pending: 'Pendente',
  in_progress: 'Separando...',
  complete: '✓ Completo',
  partial: '⚠ Parcial',
  out_of_stock: '✗ Sem estoque',
}

// Endereço do agente local de impressão instalado na máquina do operador
const PRINT_AGENT_BASE = 'http://127.0.0.1:9100'
const PRINT_AGENT_URL = `${PRINT_AGENT_BASE}/print`

/**
 * Gera um bloco ZPL 2-up: duas etiquetas idênticas lado a lado numa bobina dupla.
 * Layout esquerdo: X base ~30 | Layout direito: X base ~350
 * Cada ^XA...^XZ = 1 impressão física = 2 etiquetas.
 */
function buildZplBlock(mlCode, description, sku) {
  // Sanitiza caracteres especiais do ZPL (^ e ~ são comandos)
  const safeDesc = (description || '')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .substring(0, 120)
  return (
    '^XA^CI28\n' +
    // ── Etiqueta ESQUERDA (X base 30) ──────────────────────────────────────
    '^LH0,0\n' +
    `^FO30,15^BY2,,0^BCN,54,N,N^FD${mlCode}^FS\n` +
    `^FO105,75^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO105,76^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO16,115^A0N,18,18^FB300,2,2,L^FH^FD${safeDesc}^FS\n` +
    `^FO16,153^A0N,18,18^FB300,1,0,L^FH^FD^FS\n` +
    `^FO15,153^A0N,18,18^FB300,1,0,L^FH^FD^FS\n` +
    `^FO16,172^A0N,18,18^FH^FDSKU: ${sku}\n` +
    '^FS\n' +
    // ── Etiqueta DIREITA (X base 350) ──────────────────────────────────────
    '^CI28\n' +
    '^LH0,0\n' +
    `^FO350,15^BY2,,0^BCN,54,N,N^FD${mlCode}^FS\n` +
    `^FO425,75^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO425,76^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO346,115^A0N,18,18^FB300,2,2,L^FH^FD${safeDesc}^FS\n` +
    `^FO346,153^A0N,18,18^FB300,1,0,L^FH^FD^FS\n` +
    `^FO345,153^A0N,18,18^FB300,1,0,L^FH^FD^FS\n` +
    `^FO346,172^A0N,18,18^FH^FDSKU: ${sku}\n` +
    '^FS\n' +
    '^XZ'
  )
}

function buildZplBlockSingle(mlCode, description, sku) {
  const safeDesc = (description || '')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .substring(0, 120)
  return (
    '^XA^CI28\n' +
    '^LH0,0\n' +
    `^FO30,15^BY2,,0^BCN,54,N,N^FD${mlCode}^FS\n` +
    `^FO105,75^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO105,76^A0N,20,25^FH^FD${mlCode}^FS\n` +
    `^FO16,115^A0N,18,18^FB300,2,2,L^FH^FD${safeDesc}^FS\n` +
    `^FO16,172^A0N,18,18^FH^FDSKU: ${sku}^FS\n` +
    '^XZ'
  )
}

function buildShopeeZplBlock(mlCode, description, sku) {
  let nameLine = (description || '').replace(/\^/g, ' ')
  if (nameLine.length > 40) {
    const sub = nameLine.substring(0, 40)
    const lastSpace = sub.lastIndexOf(' ')
    nameLine = lastSpace > 0 ? sub.substring(0, lastSpace) : sub
  }

  return (
    '^XA^CI28\n' +
    // ── Etiqueta ESQUERDA (X base 10) ──
    '^LH0,0\n' +
    `^FO10,5^A0N,16,16^FD${nameLine}^FS\n` +
    `^FO90,25^BQN,2,3^FDQA,${mlCode}^FS\n` +
    `^FO10,125^A0N,16,16^FDseller sku: ${sku}^FS\n` +
    `^FO10,145^A0N,16,16^FDbarcode: ${mlCode}^FS\n` +
    `^FO10,165^A0N,16,16^FDwhs skuid: ${mlCode}^FS\n` +
    // ── Etiqueta DIREITA (X base 350 ajustado para nao cortar) ──
    '^CI28\n' +
    '^LH0,0\n' +
    `^FO350,5^A0N,16,16^FD${nameLine}^FS\n` +
    `^FO430,25^BQN,2,3^FDQA,${mlCode}^FS\n` +
    `^FO350,125^A0N,16,16^FDseller sku: ${sku}^FS\n` +
    `^FO350,145^A0N,16,16^FDbarcode: ${mlCode}^FS\n` +
    `^FO350,165^A0N,16,16^FDwhs skuid: ${mlCode}^FS\n` +
    '^XZ'
  )
}

function buildShopeeZplBlockSingle(mlCode, description, sku) {
  let nameLine = (description || '').replace(/\^/g, ' ')
  if (nameLine.length > 40) {
    const sub = nameLine.substring(0, 40)
    const lastSpace = sub.lastIndexOf(' ')
    nameLine = lastSpace > 0 ? sub.substring(0, lastSpace) : sub
  }

  return (
    '^XA^CI28\n' +
    '^LH0,0\n' +
    `^FO10,5^A0N,16,16^FD${nameLine}^FS\n` +
    `^FO90,25^BQN,2,3^FDQA,${mlCode}^FS\n` +
    `^FO10,125^A0N,16,16^FDseller sku: ${sku}^FS\n` +
    `^FO10,145^A0N,16,16^FDbarcode: ${mlCode}^FS\n` +
    `^FO10,165^A0N,16,16^FDwhs skuid: ${mlCode}^FS\n` +
    '^XZ'
  )
}

export default function Picking() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const focusSku = searchParams.get('sku')
  const navigate = useNavigate()
  const operator = JSON.parse(sessionStorage.getItem('operator') || 'null')

  const goBackToItems = useCallback(
    () => navigate(`/sessions/${sessionId}/items`),
    [sessionId, navigate]
  )

  const [session, setSession] = useState(null)
  const [item, setItem] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [transferData, setTransferData] = useState(null) // { item_id, sku, ownerName }
  const [recentItems, setRecentItems] = useState([])
  const [barcode, setBarcode] = useState('')
  const [flash, setFlash] = useState(null) // 'ok' | 'error' | 'complete'
  const [dialog, setDialog] = useState(null)
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState(null)
  const [wrongItem, setWrongItem] = useState(null) // For wrong_session or in_progress_other

  // printStatus: null | 'printing' | 'done' | 'error'
  const [printStatus, setPrintStatus] = useState(null)
  const [printError, setPrintError] = useState(null)

  const [loading, setLoading] = useState(true)
  const [allItems, setAllItems] = useState([])
  const [scanMode, setScanMode] = useState('unit') // 'unit' | 'box'
  const [fixingSpooler, setFixingSpooler] = useState(false)

  const inputRef = useRef(null)

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Load session on mount
  useEffect(() => {
    if (!operator) { navigate('/'); return }
    Promise.all([
      api.getSession(sessionId),
      api.getPrinters(),
    ]).then(([s, p]) => {
      setSession(s)
      setPrinters(p)
      if (p.length > 0) setSelectedPrinter(p[0].id)
      if (focusSku) {
        api.getItems(sessionId).then(items => {
          const focused = items.find(i => i.sku === focusSku)
          setItem(focused || null)
          if (!focused) api.getItems(sessionId).then(setAllItems)
        })
      } else {
        setItem(s.current_item)
        if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      }
    }).finally(() => { setLoading(false); focusInput() })
  }, [sessionId, focusSku])

  function refreshSession() {
    api.getSession(sessionId).then(s => {
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) {
        api.getItems(sessionId).then(setAllItems)
      }
    })
  }

  function triggerFlash(type) {
    setFlash(type)
    setTimeout(() => setFlash(null), 600)
  }

  async function handleScan(e, codeOverride = null) {
    if (e && e.key !== 'Enter') return
    const code = (codeOverride || barcode || '').trim()
    if (!code) return

    // Se não for override (bipagem real), limpa o campo
    if (!codeOverride) setBarcode('')

    try {
      if (scanMode === 'box' && item) {
        const res = await api.scan(sessionId, code, operator.id, focusSku || null)
        if (res.status === 'ok') {
          await api.undo(sessionId, item.sku, operator.id)
          setDialog({ type: 'box_qty', data: { code } })
          return
        }
        await updateFromResponse(res, code)
        return
      }

      const res = await api.scan(sessionId, code, operator.id, focusSku || null)
      await updateFromResponse(res, code)
    } catch (err) {
      triggerFlash('error')
      focusInput()
    }
  }

  async function updateFromResponse(res, code) {
    if (res.progress) {
      setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    }

    switch (res.status) {
      case 'ok':
        setItem(res.item)
        triggerFlash('ok')
        break

      case 'complete':
        setItem(res.item)
        setPrintStatus(null)
        setPrintError(null)
        triggerFlash('complete')
        // Dispara impressão automática no agente local (porta 9100)
        if (res.item?.labels_ready) {
          await autoPrintLabels(res.item)
        }
        if (focusSku) {
          setTimeout(goBackToItems, 600)
        } else {
          setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
          setTimeout(() => {
            api.getSession(sessionId).then(s => {
              setSession(s)
              setItem(s.current_item)
              if (!s.current_item) api.getItems(sessionId).then(setAllItems)
            })
          }, 400)
        }
        break

      case 'excess':
        triggerFlash('error')
        break

      case 'unknown_barcode':
        setDialog({ type: 'unknown', data: { barcode: code } })
        return

      case 'multiple_matches':
        setDialog({ type: 'multiple_matches', data: { candidates: res.candidates } })
        return

      case 'wrong_session':
        if (res.action === 'transfer_available') {
          setBarcode('')
          setTransferData({ item_id: res.item_id, sku: res.sku, ownerName: res.owner_name })
        } else if (res.action === 'in_progress_other') {
          setDialog({ type: 'wrong_sku', data: { ...res, barcode: code } })
        } else {
          // Quando o barcode é conhecido mas não pertence a este item nem é transferível (ou o operador quer forçar vínculo)
          setDialog({
            type: 'wrong_session',
            data: {
              barcode: code,
              sku: res.sku,
              description: res.description,
              all_skus: res.all_skus || [res.sku]
            }
          })
        }
        return

      case 'ambiguous_barcode':
        setDialog({ type: 'multiple_matches', data: { candidates: res.candidates } })
        return

      case 'wrong_sku':
        // Em focus mode, o operador está trabalhando num SKU específico.
        // Bipar um código de outro SKU não deve oferecer substituição — só informa o erro.
        if (focusSku) {
          setDialog({ type: 'wrong_session', data: { barcode: code, sku: res.scanned_sku, description: res.item?.description } })
        } else {
          setDialog({ type: 'wrong_sku', data: { ...res, barcode: code } })
        }
        return
    }

    focusInput()
  }

  async function handleShortageConfirm(qtyFound, notes) {
    setDialog(null)
    const res = await api.shortage(sessionId, item.sku, qtyFound, operator.id, notes)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    if (res.item?.labels_ready) {
      await autoPrintLabels(res.item)
    }

    if (focusSku) {
      goBackToItems()
    } else {
      setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
      const s = await api.getSession(sessionId)
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      focusInput()
    }
  }

  async function handleOutOfStock() {
    // Se o item já está concluído, abre o modal de ajuste por defeito
    if (item.status === 'complete') {
      setDialog({ type: 'defect_adjust', data: { defectQty: 0, reprint: false } })
      return
    }
    setDialog({ type: 'oos_confirm', data: { notes: '' } })
  }

  async function handleDefectAdjustConfirm({ defectQty, reprint }) {
    setDialog(null)
    // Calcula o qty_final válido
    const validQty = Math.max(0, item.qty_picked - defectQty)
    // Usa a API de shortage para reduzir a quantidade
    const res = await api.shortage(sessionId, item.sku, validQty, operator.id, `Ajuste por defeito: ${defectQty} unidade(s) com problema`)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)

    // Só imprime se o checkbox estiver marcado
    if (reprint && res.item?.labels_ready) {
      await autoPrintLabels(res.item, true, validQty)
    }

    if (focusSku) {
      goBackToItems()
    } else {
      setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
      const s = await api.getSession(sessionId)
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      focusInput()
    }
  }

  async function _doOutOfStock(notes) {
    setDialog(null)
    const res = await api.outOfStock(sessionId, item.sku, operator.id, notes)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    if (res.item?.labels_ready) {
      await autoPrintLabels(res.item)
    }

    if (focusSku) {
      goBackToItems()
    } else {
      setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
      const s = await api.getSession(sessionId)
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      focusInput()
    }
  }

  async function handleUndo() {
    const res = await api.undo(sessionId, item.sku, operator.id)
    setItem(res.item)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    focusInput()
  }

  async function handleReopen(sku) {
    const res = await api.reopen(sessionId, sku, operator.id)
    setRecentItems(prev => prev.map(i => i.sku === sku ? res.item : i))
    refreshSession()
    focusInput()
  }

  async function handleAddBarcode(code) {
    setDialog(null)
    if (item) {
      try {
        await api.addBarcode(sessionId, code, item.sku, operator.id)
        if (scanMode === 'box') {
          // Barcode acabou de ser vinculado — abre dialog de quantidade
          setDialog({ type: 'box_qty', data: { code } })
          return
        }
        const res = await api.scan(sessionId, code, operator.id, focusSku || null)
        updateFromResponse(res, code)
      } catch (err) {
        console.error('Erro ao vincular código:', err)
        triggerFlash('error')
        alert('Erro ao vincular código: ' + err.message)
      }
    }
    focusInput()
  }

  async function handleBoxQtyConfirm(qty) {
    const { code } = dialog.data
    setDialog(null)
    try {
      if (qty === 0) {
        const res = await api.outOfStock(sessionId, item.sku, operator.id)
        setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
        if (focusSku) {
          goBackToItems()
        } else {
          setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
          const s = await api.getSession(sessionId)
          setSession(s)
          setItem(s.current_item)
          if (!s.current_item) api.getItems(sessionId).then(setAllItems)
          focusInput()
        }
      } else if (qty < item.qty_required) {
        const res = await api.shortage(sessionId, item.sku, qty, operator.id)
        setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
        // Imprime as etiquetas da quantidade encontrada (qty_picked = qty)
        if (res.item?.labels_ready) {
          await autoPrintLabels(res.item)
        }
        if (focusSku) {
          goBackToItems()
        } else {
          setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
          const s = await api.getSession(sessionId)
          setSession(s)
          setItem(s.current_item)
          if (!s.current_item) api.getItems(sessionId).then(setAllItems)
          focusInput()
        }
      } else if (qty >= item.qty_required) {
        const res = await api.scanBox(sessionId, code, operator.id, focusSku || null)
        await updateFromResponse(res, code)
      }
    } catch (err) {
      triggerFlash('error')
      focusInput()
    }
  }

  /**
   * Gera o ZPL dinamicamente a partir dos dados do item e envia ao agente local
   * (ZebraAgent-WP.exe) em http://127.0.0.1:9100/print.
   *
   * - Todos os blocos são concatenados em um único payload → 1 POST atômico.
   * - mode: 'no-cors' evita bloqueio CORS (o agente não devolve CORS headers).
   *   Se o agente estiver desligado, fetch() lança TypeError normalmente.
   * - Proteção contra dupla impressão via item.labels_printed.
   */
  async function autoPrintLabels(pickedItem, force = false, overrideQty = null) {
    if (!force && pickedItem.labels_printed) {
      setPrintStatus('done')
      return
    }

    setPrintStatus('printing')
    setPrintError(null)

    const mlCode = pickedItem.ml_code || pickedItem.sku
    const desc = pickedItem.description
    const sku = pickedItem.sku
    const qty = overrideQty !== null ? overrideQty : (pickedItem.qty_picked || 1)
    const fullPairs = Math.floor(qty / 2)
    const remainder = qty % 2

    let fullZpl = ''

    if (session?.marketplace === 'shopee') {
      const blocks = [
        ...Array.from({ length: fullPairs }, () => buildShopeeZplBlock(mlCode, desc, sku)),
        ...(remainder === 1 ? [buildShopeeZplBlockSingle(mlCode, desc, sku), '^XA^XZ'] : []),
      ]
      fullZpl = blocks.join('\n')
    } else {
      const blocks = [
        ...Array.from({ length: fullPairs }, () => buildZplBlock(mlCode, desc, sku)),
        ...(remainder === 1 ? [buildZplBlockSingle(mlCode, desc, sku)] : []),
      ]
      fullZpl = blocks.join('\n')
    }

    // Aplica um ajuste fino de -15 dots na esquerda (aprox 1.8mm) para todas as posições (FOx)
    fullZpl = fullZpl.replace(/\^FO(\d+),/g, (match, x) => `^FO${Math.max(0, parseInt(x, 10) - 15)},`)

    try {
      const isHttps = window.location.protocol === 'https:'

      // 1. Tenta impressão DIRETA se estiver em HTTP (Localhost)
      // Em HTTPS (Produção), os navegadores bloqueiam chamadas HTTP locais (Mixed Content).
      if (!isHttps) {
        try {
          console.log('Ambiente HTTP detectado. Tentando impressão direta via 127.0.0.1:9100...')
          await fetch(PRINT_AGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: fullZpl,
            mode: 'no-cors',
            signal: AbortSignal.timeout(1500),
          })
          console.log('Comando direto enviado.')
          await api.markPrinted(sessionId, pickedItem.sku)
          setPrintStatus('done')
          return
        } catch (directErr) {
          console.warn('Impressão direta falhou. Seguindo para fila do servidor...', directErr)
        }
      } else {
        console.log('Ambiente HTTPS (Produção). Ignorando impressão direta para evitar bloqueio do navegador.')
      }

      // 2. FILA DE IMPRESSÃO (Polling) — Modo padrão para Produção (HTTPS)
      console.log('Enviando job para fila de impressão do servidor (Polling)...')
      await api.createPrintJob(sessionId, pickedItem.sku, fullZpl, operator?.id)

      // O Agente (iniciar_producao.bat) vai "puxar" esse job automaticamente.
      setPrintStatus('done')

    } catch (err) {
      console.error('Erro ao processar impressão:', err)
      const msg = err?.message || 'Erro inesperado na impressão'
      setPrintError(msg)
      setPrintStatus('error')
    }
  }

  async function handlePrint() {
    if (item) await autoPrintLabels(item)
    focusInput()
  }

  function handleForcePrint() {
    if (item) setDialog({ type: 'reprint_qty', data: { qty: item.qty_required } })
  }

  async function handleReprintConfirm(qty) {
    setDialog(null)
    if (item && qty > 0) await autoPrintLabels(item, true, qty)
    focusInput()
  }

  async function handleTransfer() {
    if (!transferData) return
    setSubmitting(true)
    try {
      const res = await api.transferItem(transferData.item_id, operator.id)
      setTransferData(null)
      // Redirect to the newly created session
      navigate(`/picking/${res.new_session_id}`)
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFixSpooler() {
    if (!window.confirm('Isso irá reiniciar o serviço de impressão do Windows e limpar a fila. Deseja continuar?')) return
    setFixingSpooler(true)
    try {
      const res = await fetch(`${PRINT_AGENT_BASE}/fix-spooler`, { method: 'GET' })
      const data = await res.json()
      if (data.status === 'ok') {
        alert('Sucesso: Spooler reiniciado e fila limpa. Tente imprimir novamente.')
        setPrintStatus(null) // Reset status to allow retry
      } else {
        alert('Erro ao limpar spooler: ' + data.message)
      }
    } catch (err) {
      alert('Não foi possível comunicar com o agente. Verifique se o ZebraAgent está aberto.')
    } finally {
      setFixingSpooler(false)
      focusInput()
    }
  }

  async function onSelectSearchResult(candidate) {
    setDialog(null)
    const isInSession = allItems.some(i => i.sku === candidate.sku)

    if (isInSession) {
      if (focusSku) {
        // Se já estamos focados, apenas bipa
        await handleScan(null, candidate.sku)
      } else {
        // No modo livre, manda o scan com o focus_sku para o backend resolver a ambiguidade
        // Passamos o SKU selecionado como override
        await handleScan(null, candidate.sku)
      }
    } else {
      // Mesma lógica de transferência existente: bipa o SKU override
      // O backend process_scan agora retornará 'wrong_session' + 'transfer_available'
      handleScan(null, candidate.sku)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-3xl text-gray-400">Carregando...</div>

  const progress = session?.progress || {}
  const pct = progress.items_total ? Math.round((progress.items_picked / progress.items_total) * 100) : 0

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${flash === 'ok' ? 'bg-green-50' : flash === 'error' ? 'bg-red-50' : flash === 'complete' ? 'bg-green-100' : 'bg-gray-100'
      }`}>

      {transferData && (
        <TransferConfirmDialog
          sku={transferData.sku}
          ownerName={transferData.ownerName}
          onConfirm={handleTransfer}
          onCancel={() => setTransferData(null)}
        />
      )}
      {dialog?.type === 'multiple_matches' && (
        <SearchSelectionDialog
          candidates={dialog.data.candidates}
          onSelect={onSelectSearchResult}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white shadow px-6 py-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="flex gap-6 items-baseline">
            <span className="text-2xl font-bold flex items-center gap-2">
              <MarketplaceLogo marketplace={session?.marketplace} size={24} /> {operator?.name}
            </span>
            <span className="text-xl text-gray-500">{session?.session_code}</span>
          </div>
          <button
            onClick={() => focusSku ? goBackToItems() : navigate('/sessions')}
            className="text-gray-400 hover:text-gray-700"
          >
            ← Voltar
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-lg font-medium whitespace-nowrap">
            {progress.items_picked} / {progress.items_total} itens
          </span>
          <span className="text-lg text-gray-500 whitespace-nowrap">
            {progress.skus_complete} / {progress.skus_total} SKUs
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-6">

        {/* Scan input */}
        {item && (
          <div className="bg-white rounded-2xl shadow p-6">

            {/* Scan mode selector */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Modo de bipagem</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setScanMode('unit'); focusInput() }}
                  className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${scanMode === 'unit'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}
                >
                  <span className="block text-lg leading-none mb-1">1</span>
                  Unitário (1 a 1)
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setScanMode('box'); focusInput() }}
                  className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${scanMode === 'box'
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                    }`}
                >
                  <span className="block text-lg leading-none mb-1">📦</span>
                  Caixa / Total
                </button>
              </div>
              {scanMode === 'box' && (
                <div className="mt-2 flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-3 py-2">
                  <span className="text-orange-500 text-lg">⚡</span>
                  <p className="text-orange-700 text-xs font-semibold">
                    1 leitura = {item.qty_required} unidades — item será concluído automaticamente
                  </p>
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              className="scan-input"
              placeholder="Digite o SKU ou bipe aqui..."
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              onKeyDown={handleScan}
              autoFocus
            />
          </div>
        )}

        {/* Current item */}
        {item ? (
          <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm uppercase tracking-wide">SKU</p>
                <p className="text-2xl font-mono font-bold">{item.sku}</p>
                <p className="text-xl text-gray-600 mt-1">{item.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[item.status]} text-white`}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xl font-bold mb-1">
                <span>{item.qty_picked} separados</span>
                <span className="text-gray-400">de {item.qty_required}</span>
              </div>
              <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${STATUS_COLOR[item.status]}`}
                  style={{ width: `${Math.min((item.qty_picked / item.qty_required) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleUndo}
                disabled={item.qty_picked === 0}
                className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100 disabled:opacity-30"
              >
                -1 LEITURA
              </button>
              <button
                onClick={() => setDialog({ type: 'shortage' })}
                className="py-4 rounded-xl border-2 border-orange-400 text-orange-600 text-lg font-medium hover:bg-orange-50"
              >
                FALTA
              </button>
              <button
                onClick={handleOutOfStock}
                className="py-4 rounded-xl border-2 border-red-400 text-red-600 text-lg font-medium hover:bg-red-50"
              >
                SEM ESTOQUE
              </button>
            </div>

            {/* Seção de impressão — aparece quando o item tem etiquetas prontas */}
            {item.labels_ready && (
              <div className="border-t pt-4 flex flex-col gap-3">

                {/* Estado: aguardando ação */}
                {printStatus === null && (
                  <button
                    onClick={handlePrint}
                    className="py-4 rounded-xl bg-green-600 text-white text-xl font-bold hover:bg-green-700 active:bg-green-800 transition-colors"
                  >
                    🖨️ IMPRIMIR {item.qty_required} ETIQUETAS
                  </button>
                )}

                {/* Estado: enviando para a impressora */}
                {printStatus === 'printing' && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="animate-spin text-xl">⏳</span>
                    <div>
                      <p className="text-blue-800 font-semibold text-sm">Enviando para impressora...</p>
                      <p className="text-blue-600 text-xs mt-0.5">Zebra ZD220 via agente local</p>
                    </div>
                  </div>
                )}

                {/* Estado: impresso com sucesso */}
                {printStatus === 'done' && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                      <span className="text-2xl">✅</span>
                      <div>
                        <p className="text-green-800 font-semibold text-sm">
                          {item.qty_required} {item.qty_required === 1 ? 'etiqueta impressa' : 'etiquetas impressas'} com sucesso
                        </p>
                        <p className="text-green-600 text-xs mt-0.5">Zebra ZD220</p>
                      </div>
                    </div>
                    <button
                      onClick={handleForcePrint}
                      title="Reimprimir etiquetas"
                      className="px-3 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      🔁 Reimprimir
                    </button>
                    <button
                      onClick={handleFixSpooler}
                      disabled={fixingSpooler}
                      title="Limpar fila de impressão se travou"
                      className="px-3 py-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-medium transition-colors whitespace-nowrap border border-orange-200"
                    >
                      {fixingSpooler ? '⏳ Limpando...' : '❓ Não imprimiu?'}
                    </button>
                  </div>
                )}

                {/* Estado: erro na impressão */}
                {printStatus === 'error' && (
                  <div className="flex flex-col gap-2">
                    <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-700 font-semibold text-sm">✗ Falha na impressão</p>
                      <p className="text-red-600 text-xs mt-1">{printError}</p>
                    </div>
                    <button
                      onClick={handlePrint}
                      className="py-3 rounded-xl bg-red-500 text-white text-base font-bold hover:bg-red-600 active:bg-red-700 transition-colors"
                    >
                      🔄 Tentar novamente
                    </button>
                    <button
                      onClick={handleFixSpooler}
                      disabled={fixingSpooler}
                      className="py-3 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200 transition-colors border border-orange-300"
                    >
                      {fixingSpooler ? '⏳ Limpando Spooler...' : '🛠️ Limpar Fila de Impressão (Fila Travada)'}
                    </button>
                  </div>
                )}

                {/* Dica permanente sobre o agente */}
                <p className="text-xs text-gray-400 text-center px-2">
                  Para imprimir, o <strong>ZebraAgent-WP.exe</strong> deve estar aberto na máquina.
                </p>

              </div>
            )}
          </div>
        ) : (
          <CompletionSummary items={allItems} onBack={() => navigate('/sessions')} />
        )}

        {/* Concluídos recentemente */}
        {item && recentItems.length > 0 && (
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-sm mb-2">Concluídos recentemente</p>
            <div className="flex flex-col gap-2">
              {recentItems.map(ri => (
                <div key={ri.sku} className="bg-white rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
                  <div>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_COLOR[ri.status]}`} />
                    <span className="font-mono font-medium">{ri.sku}</span>
                    <span className="text-gray-400 ml-3">✓ {ri.qty_picked}</span>
                    {ri.shortage_qty > 0 && (
                      <span className="text-red-400 ml-2">/ {ri.shortage_qty} sem estoque</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleReopen(ri.sku)}
                    className="text-blue-500 hover:underline text-sm"
                  >
                    reabrir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.type === 'oos_confirm' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 shadow-2xl">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-bold text-center text-red-600">⚠ Confirmar Sem Estoque</h2>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              {item.qty_picked > 0 ? (
                <>
                  <p className="text-lg text-green-700 font-semibold">✓ {item.qty_picked} lidos serão mantidos</p>
                  <p className="text-lg text-red-600 font-semibold mt-1">
                    ✗ {item.qty_required - item.qty_picked} marcados como sem estoque
                  </p>
                </>
              ) : (
                <p className="text-lg text-red-600 font-semibold">
                  Todas as {item.qty_required} unidades marcadas como sem estoque
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">Observação (Opcional)</label>
              <textarea
                value={dialog.data.notes}
                onChange={e => setDialog({ ...dialog, data: { ...dialog.data, notes: e.target.value } })}
                placeholder="Ex: Faltou apenas o reparo do kit..."
                className="w-full text-sm border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-red-400 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setDialog(null); focusInput() }}
                className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100"
              >
                CANCELAR
              </button>
              <button
                onClick={() => _doOutOfStock(dialog.data.notes)}
                className="py-4 rounded-xl bg-red-500 text-white text-lg font-bold hover:bg-red-600"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.type === 'defect_adjust' && item && (
        <DefectAdjustDialog
          item={item}
          onConfirm={handleDefectAdjustConfirm}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}

      {dialog?.type === 'shortage' && (
        <ShortageDialog
          item={item}
          onConfirm={handleShortageConfirm}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}
      {dialog?.type === 'unknown' && (
        <UnknownBarcodeDialog
          barcode={dialog.data.barcode}
          currentSku={item?.sku}
          onAdd={() => handleAddBarcode(dialog.data.barcode)}
          onSkip={() => { setDialog(null); focusInput() }}
        />
      )}
      {dialog?.type === 'wrong_session' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center text-red-600">⚠ Código já vinculado</h2>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-sm">O código de barras</p>
              <p className="font-mono font-bold text-lg mt-1 break-all">{dialog.data.barcode}</p>
              <p className="text-gray-500 text-sm mt-3">já está vinculado ao SKU:</p>
              <p className="font-mono font-bold text-2xl text-red-700 mt-1">{dialog.data.sku}</p>
              {dialog.data.description && (
                <p className="text-gray-600 text-sm mt-1">{dialog.data.description}</p>
              )}
              <p className="text-gray-400 text-xs mt-3">Este código não pertence ao item desta lista.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setDialog(null); focusInput() }}
                className="py-4 rounded-xl bg-gray-100 border-2 border-gray-300 text-lg font-medium hover:bg-gray-200"
              >
                CANCELAR
              </button>
              <button
                onClick={() => handleAddBarcode(dialog.data.barcode)}
                className="py-4 rounded-xl bg-blue-600 text-white text-lg font-bold hover:bg-blue-700"
              >
                VINCULAR
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.type === 'box_qty' && item && (
        <BoxQtyDialog
          item={item}
          onConfirm={handleBoxQtyConfirm}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}

      {dialog?.type === 'reprint_qty' && item && (
        <ReprintQtyDialog
          item={item}
          defaultQty={dialog.data.qty}
          onConfirm={handleReprintConfirm}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}

      {dialog?.type === 'wrong_sku' && (
        <WrongSkuDialog
          scannedItem={dialog.data.item}
          expectedSku={dialog.data.expected_sku}
          onConfirm={async () => {
            const code = dialog.data.barcode
            const sku = dialog.data.scanned_sku
            setDialog(null)

            if (scanMode === 'box') {
              // Modo caixa: em vez de completar direto, bipa para focar o item e abre o dialog de qtde
              const res = await api.scan(sessionId, code, operator.id, sku)
              if (res.status === 'ok' || res.status === 'complete') {
                await api.undo(sessionId, sku, operator.id)
                setItem(res.item)
                setDialog({ type: 'box_qty', data: { code } })
              } else {
                updateFromResponse(res, code)
              }
            } else {
              const res = await api.reopen(sessionId, sku, operator.id)
              setItem(res.item)
              focusInput()
            }
          }}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}
    </div>
  )
}

function DefectAdjustDialog({ item, onConfirm, onCancel }) {
  const [validQtyInput, setValidQtyInput] = useState(item.qty_picked)
  const [reprint, setReprint] = useState(false)

  const validQty = Math.max(0, Math.min(item.qty_picked, Number(validQtyInput) || 0))
  const oosQty = item.qty_picked - validQty
  const isInvalid = validQty >= item.qty_picked  // sem alteração = inválido

  function handleConfirm() {
    if (isInvalid) return
    onConfirm({ defectQty: oosQty, reprint })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 overflow-y-auto max-h-[95vh]">

        {/* Header */}
        <div className="px-6 pt-6">
          <h2 className="text-2xl font-bold text-center text-orange-600">⚠ Ajuste por Defeito</h2>
          <p className="text-center text-gray-500 text-sm mt-1">Item já concluído — informe a quantidade real válida</p>
        </div>

        {/* Info do item */}
        <div className="mx-6 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-center">
          <p className="font-mono font-bold text-lg">{item.sku}</p>
          {item.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{item.description}</p>}
          <p className="text-gray-400 text-xs mt-2">Quantidade original coletada: <strong className="text-gray-700">{item.qty_picked}</strong></p>
        </div>

        {/* Input da quantidade real válida */}
        <div className="mx-6 flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Quantidade real válida (sem defeito)
          </label>
          <input
            type="number"
            min={0}
            max={item.qty_picked - 1}
            value={validQtyInput}
            onChange={e => setValidQtyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            onFocus={e => e.target.select()}
            autoFocus
            className="text-center text-4xl font-bold border-2 border-gray-300 focus:border-orange-400 rounded-xl py-4 outline-none"
          />
          {isInvalid && Number(validQtyInput) === item.qty_picked && (
            <p className="text-orange-500 text-xs text-center">Reduza a quantidade para registrar a diferença</p>
          )}
        </div>

        {/* Cálculo automático — só mostra quando há diferença */}
        {oosQty > 0 && (
          <div className="mx-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Qtde original coletada:</span>
              <span className="font-bold">{item.qty_picked}</span>
            </div>
            <div className="flex justify-between text-green-700">
              <span>Qtde real válida:</span>
              <span className="font-bold">{validQty}</span>
            </div>
            <div className="border-t border-orange-200 mt-1 pt-1 flex justify-between text-red-600">
              <span className="font-semibold">Irá para "sem estoque":</span>
              <span className="font-bold text-lg">{oosQty} unidade(s)</span>
            </div>
          </div>
        )}

        {/* Checkbox Reimprimir */}
        <div
          className={`mx-6 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${reprint ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
          onClick={() => setReprint(v => !v)}
        >
          <div className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${reprint ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
            }`}>
            {reprint && <span className="text-white text-xs font-bold">✓</span>}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Reimprimir etiquetas</p>
            <p className="text-xs text-gray-400">
              {reprint
                ? `Imprimirá ${validQty} etiqueta(s) com a quantidade válida`
                : 'Apenas ajusta as quantidades, sem imprimir'}
            </p>
          </div>
        </div>

        {/* Botões */}
        <div className="mx-6 mb-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100"
          >
            CANCELAR
          </button>
          <button
            onClick={handleConfirm}
            disabled={isInvalid}
            className="py-4 rounded-xl bg-orange-500 text-white text-lg font-bold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  )
}

function ReprintQtyDialog({ item, defaultQty, onConfirm, onCancel }) {
  const [qty, setQty] = useState(defaultQty || item.qty_required)

  function handleConfirm() {
    const n = Math.max(1, Number(qty) || 1)
    onConfirm(n)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center">Reimprimir Etiquetas</h2>
        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-center">
          <p className="font-mono font-bold text-xl">{item.sku}</p>
          <p className="text-gray-400 text-xs mt-2">Necessário: {item.qty_required} unidades</p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Quantas etiquetas imprimir?
          </label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleConfirm()
            }}
            onFocus={e => e.target.select()}
            autoFocus
            className="text-center text-4xl font-bold border-2 border-gray-300 focus:border-blue-500 rounded-xl py-4 outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100"
          >
            CANCELAR
          </button>
          <button
            onClick={handleConfirm}
            className="py-4 rounded-xl bg-green-600 text-white text-lg font-bold hover:bg-green-700"
          >
            IMPRIMIR
          </button>
        </div>
      </div>
    </div>
  )
}

function BoxQtyDialog({ item, onConfirm, onCancel }) {
  const [qty, setQty] = useState(item.qty_required)

  function handleConfirm() {
    const n = Math.max(0, Math.min(item.qty_required, Number(qty) || 0))
    onConfirm(n)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center">Quantidade Encontrada</h2>
        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-center">
          <p className="font-mono font-bold text-xl">{item.sku}</p>
          {item.description && (
            <p className="text-gray-500 text-sm mt-1">{item.description}</p>
          )}
          <p className="text-gray-400 text-xs mt-2">Necessário: {item.qty_required} unidades</p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Quantas você encontrou?
          </label>
          <input
            type="number"
            min={0}
            max={item.qty_required}
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleConfirm()
            }}
            onFocus={e => e.target.select()}
            autoFocus
            className="text-center text-4xl font-bold border-2 border-gray-300 focus:border-blue-500 rounded-xl py-4 outline-none"
          />
          {Number(qty) < item.qty_required && Number(qty) > 0 && (
            <p className="text-orange-600 text-sm text-center">
              ⚠ {item.qty_required - Number(qty)} unidades serão registradas como falta
            </p>
          )}
          {Number(qty) === 0 && (
            <p className="text-red-600 text-sm text-center">
              ✗ Item será marcado como sem estoque
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100"
          >
            CANCELAR
          </button>
          <button
            onClick={handleConfirm}
            className="py-4 rounded-xl bg-blue-600 text-white text-lg font-bold hover:bg-blue-700"
          >
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  )
}

function CompletionSummary({ items, onBack }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6 items-center justify-center py-16">
        <p className="text-2xl text-gray-400">Carregando resumo...</p>
      </div>
    )
  }

  const complete = items.filter(i => i.status === 'complete')
  const partial = items.filter(i => i.status === 'partial')
  const outOfStock = items.filter(i => i.status === 'out_of_stock')
  const totalPicked = items.reduce((s, i) => s + i.qty_picked, 0)
  const totalShort = items.reduce((s, i) => s + (i.shortage_qty || 0), 0)
  const pendentes = [...partial, ...outOfStock]

  return (
    <div className="flex flex-col gap-6">

      <div className="bg-green-100 border-2 border-green-400 rounded-2xl p-8 text-center">
        <p className="text-4xl font-bold text-green-700 mb-3">🎉 Lista concluída!</p>
        <div className="flex justify-center gap-8 text-xl">
          <div>
            <p className="font-bold text-green-700 text-3xl">{totalPicked}</p>
            <p className="text-green-600 text-sm">unidades separadas</p>
          </div>
          {totalShort > 0 && (
            <div>
              <p className="font-bold text-orange-600 text-3xl">{totalShort}</p>
              <p className="text-orange-500 text-sm">sem estoque / falta</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-green-700">{complete.length}</p>
          <p className="text-sm text-green-600 mt-1">✓ Completos</p>
        </div>
        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-orange-600">{partial.length}</p>
          <p className="text-sm text-orange-500 mt-1">⚠ Parciais</p>
        </div>
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-red-600">{outOfStock.length}</p>
          <p className="text-sm text-red-500 mt-1">✗ Sem estoque</p>
        </div>
      </div>

      {pendentes.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Itens com pendência ({pendentes.length})
          </p>
          <div className="flex flex-col divide-y max-h-64 overflow-y-auto">
            {pendentes.map(i => (
              <div key={i.sku} className="flex justify-between items-center py-3">
                <div>
                  <span className="font-mono font-semibold text-sm">{i.sku}</span>
                  {i.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{i.description}</p>
                  )}
                </div>
                <div className="text-right text-sm whitespace-nowrap ml-4">
                  <span className="text-green-700 font-medium">✓ {i.qty_picked} lidos</span>
                  {i.shortage_qty > 0 && (
                    <span className="text-red-500 font-medium ml-3">✗ {i.shortage_qty} sem estoque</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full py-5 bg-blue-600 text-white text-2xl font-bold rounded-2xl hover:bg-blue-700"
      >
        VOLTAR PARA AS LISTAS
      </button>
    </div>
  )
}
