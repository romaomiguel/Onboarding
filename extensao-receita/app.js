// Roda na página do sistema: traduz mensagens da página (postMessage) para a extensão e vice-versa.
const ORIGEM_APP = 'onboarding-app';
const ORIGEM_EXT = 'onboarding-ext';

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.origem !== ORIGEM_APP) return;
  if (e.data.tipo === 'ping') {
    window.postMessage({ origem: ORIGEM_EXT, tipo: 'pong', versao: chrome.runtime.getManifest().version }, '*');
  } else if (e.data.tipo === 'pedido') {
    chrome.runtime.sendMessage({ tipo: 'pedido', cnpj: String(e.data.cnpj || '').replace(/\D/g, '') });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo !== 'receita-dados') return;
  window.postMessage({
    origem: ORIGEM_EXT, tipo: 'dados', cnpj: msg.cnpj, comprovante: msg.comprovante, qsa: msg.qsa,
  }, '*');
});
