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
  findByBarcode: (barcode, operatorId) =>
    req('GET', `/sessions/find-by-barcode?barcode=${encodeURIComponent(barcode)}&operator_id=${operatorId}`),

  // Picking actions
  scan: (sessionId, barcode, operatorId, focusSku = null) =>
    req('POST', `/sessions/${sessionId}/scan`, { barcode, operator_id: operatorId, focus_sku: focusSku }),
  scanBox: (sessionId, barcode, operatorId, focusSku = null) =>
    req('POST', `/sessions/${sessionId}/scan-box`, { barcode, operator_id: operatorId, focus_sku: focusSku }),
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
  getZpl: (sessionId, sku) =>
    req('GET', `/labels/zpl?session_id=${sessionId}&sku=${encodeURIComponent(sku)}`),
  markPrinted: (sessionId, sku) =>
    req('POST', '/labels/mark-printed', { session_id: sessionId, sku }),

  // Printers
  getPrinters: () => req('GET', '/printers/'),
  createPrinter: (name, ip_address, port) => req('POST', '/printers/', { name, ip_address, port }),

  // Barcodes
  importBarcodesExcel: (formData) => req('POST', '/barcodes/import-excel', formData, true),
  resolveBarcode: (barcode) => req('GET', `/barcodes/resolve?barcode=${encodeURIComponent(barcode)}`),
  listBarcodes: (search = '') => req('GET', `/barcodes/?search=${encodeURIComponent(search)}&limit=2000`),

  // Master Data CRUD
  createProduct: (sku, description, barcodes) =>
    req('POST', '/barcodes/product', { sku, description, barcodes }),
  updateProduct: (sku, description) =>
    req('PUT', `/barcodes/${encodeURIComponent(sku)}`, { description }),
  deleteProduct: (sku) =>
    req('DELETE', `/barcodes/${encodeURIComponent(sku)}`),
  addBarcodeToProduct: (sku, barcode) =>
    req('POST', `/barcodes/${encodeURIComponent(sku)}/barcode`, { barcode }),
  removeBarcodeFromProduct: (sku, barcode) =>
    req('DELETE', `/barcodes/${encodeURIComponent(sku)}/barcode/${encodeURIComponent(barcode)}`),
}
