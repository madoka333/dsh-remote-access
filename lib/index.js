import net from 'node:net'
import os from 'node:os'
import fs from 'node:fs'

export const name = 'dsh-remote-access'
export const inject = ['webServer']

const defaults = {
  networkIds: [],
  remotePort: 3080,
  allowedClients: [],
  compatShim: true,
  maxConnections: 64,
  retrySeconds: 30,
}
const loopback = '127.0.0.1'
const shimMarker = 'dsh-web-compat-shim'

function addressesFor(networkIds) {
  const wanted = new Set(Array.isArray(networkIds) ? networkIds.map((id) => String(id).toLowerCase()) : [])
  const result = []
  try {
    for (const [name, records] of Object.entries(os.networkInterfaces())) {
      const match = /^ZeroTier One \[([0-9a-f]{16})\]$/i.exec(name)
      if (!match || (wanted.size && !wanted.has(match[1].toLowerCase()))) continue
      for (const item of records ?? []) {
        if (item.family === 'IPv4' && !item.internal) result.push(item.address)
      }
    }
  } catch {
    // A missing network adapter is a normal startup state.
  }
  return [...new Set(result)]
}

function normalizeIp(value) {
  return typeof value === 'string' && value.startsWith('::ffff:') ? value.slice(7) : value
}

export function apply(ctx, rawConfig = {}) {
  const config = { ...defaults, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) }
  const networkIds = Array.isArray(config.networkIds) ? config.networkIds : []
  const log = (message) => {
    try { console.log(`[dsh-remote-access] ${message}`) } catch { /* stdout may be closed */ }
  }
  const webServer = ctx.get('webServer')
  let targetPort
  try {
    const origin = new URL(webServer.getOrigin())
    targetPort = Number(origin.port) || (origin.protocol === 'https:' ? 443 : 80)
  } catch {
    log('webServer origin unavailable; remote forwarding not started')
    return
  }
  const remotePort = Number.isInteger(config.remotePort) && config.remotePort > 0 ? config.remotePort : defaults.remotePort
  const allowed = new Set((Array.isArray(config.allowedClients) ? config.allowedClients : []).map(normalizeIp))
  const servers = new Set()
  let retryTimer
  let disposed = false
  let listenStatus = 'waiting for a ZeroTier address'
  const startupAddresses = addressesFor(networkIds)

  if (config.compatShim) {
    try {
      const shim = fs.readFileSync(new URL('./compat-shim.html', import.meta.url), 'utf8')
      if (typeof webServer.tapIndex === 'function' && shim.includes(shimMarker)) {
        ctx.effect(() => webServer.tapIndex((html) => {
          if (typeof html !== 'string' || html.includes(shimMarker)) return html
          return html.replace(/<head(\s[^>]*)?>/i, (open) => `${open}\n${shim}`)
        }))
      } else {
        log('compatibility shim skipped: tapIndex unavailable or shim marker missing')
      }
    } catch (error) {
      log(`compatibility shim unavailable: ${error?.message ?? error}`)
    }
  }

  const startOn = (address) => {
    if (disposed || [...servers].some((server) => server.listening && server.address()?.address === address)) return
    const server = net.createServer({ allowHalfOpen: false })
    servers.add(server)
    server.maxConnections = Math.max(1, Number(config.maxConnections) || defaults.maxConnections)
    server.on('error', (error) => log(`listener ${address}:${remotePort}: ${error?.code ?? error?.message ?? error}`))
    server.on('connection', (client) => {
      const peer = normalizeIp(client.remoteAddress ?? '')
      if (allowed.size && !allowed.has(peer)) {
        client.destroy()
        return
      }
      const upstream = net.connect({ host: loopback, port: targetPort })
      const close = () => { client.destroy(); upstream.destroy() }
      client.on('error', close)
      upstream.on('error', close)
      client.on('close', close)
      upstream.on('close', close)
      client.setNoDelay(true)
      upstream.setNoDelay(true)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    server.listen(remotePort, address, () => {
      listenStatus = 'listening'
      log(`forwarding ${address}:${remotePort} to 127.0.0.1:${targetPort}`)
    })
  }

  const scan = () => {
    if (disposed) return false
    let found = []
    try { found = addressesFor(networkIds) } catch { /* retry later */ }
    for (const address of found) {
      try { startOn(address) } catch (error) { log(`cannot bind ${address}:${remotePort}: ${error?.message ?? error}`) }
    }
    return found.length > 0
  }

  if (!scan()) {
    log(`no matching ZeroTier IPv4 address (networks: ${networkIds.join(', ') || 'all'}); retrying`)
    retryTimer = setInterval(scan, Math.max(5, Number(config.retrySeconds) || defaults.retrySeconds) * 1000)
    retryTimer.unref?.()
  }

  let origin = ''
  try { origin = webServer.getOrigin() } catch { /* report unavailable below */ }
  log(`runtime ready; dsh web origin=${origin || 'unknown'}; listen=${listenStatus}; addresses=${startupAddresses.join(',') || 'none'}`)

  ctx.effect(() => () => {
    disposed = true
    if (retryTimer) clearInterval(retryTimer)
    for (const server of servers) {
      try { server.closeAllConnections?.() } catch { /* best effort */ }
      try { server.close() } catch { /* best effort */ }
    }
    servers.clear()
  })
}
