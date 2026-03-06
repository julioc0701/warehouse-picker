const BASE = '/api'

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} }
  if (body) {
    if (isForm) {
      opts.body = body
    } else {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Operators
  getOperators: () => req('GET', '/operators/'),
  getOperatorByBadge: (badge) => req('GET', `/operators/badge/${badge}`),
  createOperator: (name, badge) => req('POST', '/operators/', { name, badge }),

  // Sessions
  getSessions: () => req('GET', '/sessions/'),
  getSession: (id) => req('GET', `/sessions/${id}`),
  getItems: (id) => req('GET', `/sessions/${id}/items`),
  uploadSession: (formData) => req('POST', '/sessions/upload', formData, true),
  claimSession: (sessionId, operatorId) => req('POST', `/sessions/${sessionId}/claim`, { operator_id: operatorId }),
  deleteSession: (sessionId) => req('DELETE', `/sessions/${sessionId}`),
  reopenSession: (sessionId) => req('POST', `/sessions/${sessionId}/reopen-session`),

  // Picking actions
  scan: (sessionId, barcode, operatorId) =>
    req('POST', `/sessions/${sessionId}/scan`, { barcode, operator_id: operatorId }),
  scanBox: (sessionId, barcode, operatorId) =>
    req('POST', `/sessions/${sessionId}/scan-box`, { barcode, operator_id: operatorId }),
  undo: (sessionId, sku, operatorId) =>
    req('POST', `/sessions/${sessionId}/undo`, { sku, operator_id: operatorId }),
  shortage: (sessionId, sku, qtyFound, operatorId) =>
    req('POST', `/sessions/${sessionId}/shortage`, { sku, qty_found: qtyFound, operator_id: operatorId }),
  outOfStock: (sessionId, sku, operatorId) =>
    req('POST', `/sessions/${sessionId}/out-of-stock`, { sku, operator_id: operatorId }),
  reopen: (sessionId, sku, operatorId) =>
    req('POST', `/sessions/${sessionId}/reopen`, { sku, operator_id: operatorId }),
  resetItem: (sessionId, sku, operatorId) =>
    req('POST', `/sessions/${sessionId}/reset-item`, { sku, operator_id: operatorId }),
  resetAllItems: (sessionId, operatorId) =>
    req('POST', `/sessions/${sessionId}/reset-all-items`, { operator_id: operatorId }),
  addBarcode: (sessionId, barcode, sku, operatorId) =>
    req('POST', `/sessions/${sessionId}/add-barcode`, { barcode, sku, operator_id: operatorId }),

  // Labels
  printLabels: (sessionId, sku, printerId) =>
    req('POST', '/labels/print', { session_id: sessionId, sku, printer_id: printerId }),

  // Printers
  getPrinters: () => req('GET', '/printers/'),
  createPrinter: (name, ip_address, port) => req('POST', '/printers/', { name, ip_address, port }),

  // Barcodes
  importBarcodesExcel: (formData) => req('POST', '/barcodes/import-excel', formData, true),
  resolveBarcode: (barcode) => req('GET', `/barcodes/resolve?barcode=${encodeURIComponent(barcode)}`),
}
