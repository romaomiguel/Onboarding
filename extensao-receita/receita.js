// Roda no site da Receita. Só age se o sistema pediu a consulta daquele CNPJ.
// Fluxo: usuário resolve o captcha -> /comprovante (lido aqui) -> clica sozinho em "Consultar QSA" -> /qsa (lido aqui).
const texto = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const digitos = (s) => String(s || '').replace(/\D/g, '');
const ESTADO = 'onboarding-receita';

function lerComprovante() {
  const raiz = document.querySelector('app-cnpj-comprovante');
  if (!raiz) return null;
  const campos = {};
  raiz.querySelectorAll('.section').forEach((sec) => {
    const titulo = texto(sec.querySelector('.section-title'));
    if (titulo) campos[titulo] = [...sec.querySelectorAll('.section-data')].map(texto).filter(Boolean);
  });
  return campos['NÚMERO DE INSCRIÇÃO'] ? campos : null;
}

function lerQsa() {
  const raiz = document.querySelector('app-cnpj-qsa');
  const capital = raiz?.querySelector('#capital');
  if (!capital) return null;
  const pares = (bloco) => {
    const out = {};
    bloco.querySelectorAll('b').forEach((b) => {
      const rotulo = texto(b);
      const valor = texto(b.parentElement?.nextElementSibling);
      if (rotulo && valor) out[rotulo] = valor;
    });
    return out;
  };
  return {
    empresa: pares(capital),
    socios: [...raiz.querySelectorAll('.alert-warning')].map(pares).filter((s) => Object.keys(s).length),
  };
}

const esperar = (fn, ms) => new Promise((resolve) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const v = fn();
    if (v || Date.now() - t0 > ms) { clearInterval(iv); resolve(v || null); }
  }, 300);
});

const aviso = (() => {
  let el;
  return (msg) => {
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;z-index:99999;right:16px;bottom:16px;max-width:320px;padding:10px 14px;'
        + 'background:#0f766e;color:#fff;font:14px sans-serif;border-radius:8px;box-shadow:0 2px 8px #0005';
      document.body.appendChild(el);
    }
    el.textContent = `Onboarding: ${msg}`;
  };
})();

const pedido = (cnpj) => chrome.runtime.sendMessage({ tipo: 'tem-pedido', cnpj }).then((r) => !!r?.ok).catch(() => false);
const ignorados = new Set();
let ocupado = false;

async function enviar(cnpj, comprovante, qsa) {
  aviso('enviando os dados ao sistema…');
  const r = await chrome.runtime.sendMessage({ tipo: 'dados', cnpj, comprovante, qsa }).catch(() => null);
  if (!r?.ok) aviso(r?.erro || 'não foi possível enviar ao sistema. Volte à aba do sistema e tente de novo.');
}

async function tick() {
  if (ocupado) return;
  ocupado = true;
  try {
    const qsa = lerQsa();
    if (qsa) {
      const cnpj = digitos(qsa.empresa['CNPJ:']);
      if (ignorados.has(cnpj) || !(await pedido(cnpj))) return ignorados.add(cnpj);
      aviso('lendo o quadro de sócios…');
      await new Promise((r) => setTimeout(r, 600));
      let comprovante = null;
      try { comprovante = JSON.parse(sessionStorage.getItem(ESTADO) || 'null'); } catch { /* sem estado */ }
      return await enviar(cnpj, comprovante, lerQsa());
    }

    const comprovante = lerComprovante();
    if (comprovante) {
      const cnpj = digitos(comprovante['NÚMERO DE INSCRIÇÃO'][0]);
      if (ignorados.has(cnpj) || !(await pedido(cnpj))) return ignorados.add(cnpj);
      sessionStorage.setItem(ESTADO, JSON.stringify(comprovante));
      const botao = await esperar(() => document.querySelector('button[name="qsa"]'), 4000);
      if (!botao) return await enviar(cnpj, comprovante, null); // ex.: MEI/empresário individual, sem QSA
      aviso('capturando o quadro de sócios…');
      botao.click();
      // Aguarda a tela do QSA aparecer; o próximo tick faz o envio.
      await esperar(() => document.querySelector('app-cnpj-qsa'), 15000);
    }
  } finally {
    ocupado = false;
  }
}

setInterval(tick, 700);
