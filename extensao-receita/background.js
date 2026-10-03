// Faz a ponte entre a aba do sistema (que pede a consulta) e a aba da Receita (que tem os dados).
// Os pedidos ficam em storage.session porque o service worker pode ser encerrado a qualquer momento.
const KEY = 'pedidos';
const VALIDADE_MS = 30 * 60 * 1000;

async function lerPedidos() {
  const r = await chrome.storage.session.get(KEY);
  const agora = Date.now();
  return Object.fromEntries(Object.entries(r[KEY] || {}).filter(([, p]) => agora - p.em < VALIDADE_MS));
}
const gravarPedidos = (p) => chrome.storage.session.set({ [KEY]: p });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const pedidos = await lerPedidos();

    if (msg.tipo === 'pedido' && sender.tab) {
      pedidos[msg.cnpj] = { abaApp: sender.tab.id, em: Date.now() };
      await gravarPedidos(pedidos);
      return sendResponse({ ok: true });
    }

    if (msg.tipo === 'tem-pedido') return sendResponse({ ok: !!pedidos[msg.cnpj] });

    if (msg.tipo === 'dados') {
      const pedido = pedidos[msg.cnpj];
      if (!pedido) return sendResponse({ ok: false });
      try {
        await chrome.tabs.sendMessage(pedido.abaApp, {
          tipo: 'receita-dados', cnpj: msg.cnpj, comprovante: msg.comprovante, qsa: msg.qsa,
        });
      } catch {
        return sendResponse({ ok: false, erro: 'A aba do sistema foi fechada.' });
      }
      delete pedidos[msg.cnpj];
      await gravarPedidos(pedidos);
      try {
        const aba = await chrome.tabs.update(pedido.abaApp, { active: true });
        if (aba?.windowId) await chrome.windows.update(aba.windowId, { focused: true });
      } catch { /* aba do sistema já não existe */ }
      if (sender.tab) chrome.tabs.remove(sender.tab.id).catch(() => {});
      return sendResponse({ ok: true });
    }
    sendResponse({ ok: false });
  })();
  return true;
});
