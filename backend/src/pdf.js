import PDFDocument from 'pdfkit';


const CM = 28.3465;
const cm = (v) => v * CM;

// Medidas tiradas do MODELO.odt (A4, margens 2,75 / 1,35 cm; cabeçalho com 2 logos; rodapé em faixa).
const PAGE = { w: cm(21), h: cm(29.7) };
const M = { left: cm(2.75), right: cm(1.351), top: cm(3.5), bottom: cm(3.0) };
const CONTENT_W = PAGE.w - M.left - M.right;

const RED = '#ED2324';
const BLUE = '#3F499F';
const INK = '#1F2937';
const MUTED = '#6B7280';
const LINE = '#D9DEE5';

const STATUS_COLOR = { 'Concluído': '#15803D', 'Em andamento': '#B45309', Pendente: MUTED };

// Helvetica (WinAnsi) não tem "→".
const t = (s) => String(s ?? '').replace(/→/g, 'para');
const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const fmtCnae = (c) => String(c || '').replace(/\D/g, '').replace(/^(\d{2})(\d{2})(\d)(\d{2})$/, '$1.$2-$3-$4');
const fmtDoc = (v) => {
  const t = String(v || '');
  const d = t.replace(/\D/g, '');
  if (t.includes('*') || ![11, 14].includes(d.length)) return t;
  return d.length === 14 ? fmtCnpj(d) : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};
const fmtCnpj = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const brl = (n) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function chrome() {
  // Sem logos/cabeçalho/rodapé: cabeçalho e rodapé institucionais foram removidos desta versão pública.
}

function pageNumber(doc, n) {
  const prev = doc.page.margins.bottom;
  doc.page.margins.bottom = 0; // sem isso, escrever abaixo da margem abre outra página
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    .text(String(n), PAGE.w - cm(1.9), PAGE.h - cm(2.228) - 16, { width: 20, lineBreak: false });
  doc.page.margins.bottom = prev;
}

const limite = (doc) => PAGE.h - M.bottom;

function garantir(doc, altura) {
  if (doc.y + altura > limite(doc)) doc.addPage();
}

function secao(doc, titulo) {
  garantir(doc, 46);
  doc.moveDown(0.7);
  const y = doc.y;
  doc.rect(M.left, y, 3, 14).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text(t(titulo).toUpperCase(), M.left + 9, y + 2);
  doc.moveTo(M.left, doc.y + 4).lineTo(M.left + CONTENT_W, doc.y + 4).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.y += 10;
  doc.x = M.left;
}

// Pares rótulo/valor em 2 colunas.
function pares(doc, itens) {
  const validos = itens.filter(([, v]) => v !== undefined && v !== null && String(v) !== '');
  const gap = 18;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < validos.length; i += 2) {
    const linha = validos.slice(i, i + 2);
    const alturas = linha.map(([k, v]) => {
      doc.font('Helvetica-Bold').fontSize(7.5);
      const hk = doc.heightOfString(t(k).toUpperCase(), { width: colW });
      doc.font('Helvetica').fontSize(9.5);
      return hk + 2 + doc.heightOfString(t(v), { width: colW });
    });
    const h = Math.max(...alturas) + 8;
    garantir(doc, h);
    const y = doc.y;
    linha.forEach(([k, v], j) => {
      const x = M.left + j * (colW + gap);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(t(k).toUpperCase(), x, y, { width: colW });
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(t(v), x, doc.y + 1, { width: colW });
    });
    doc.y = y + h;
    doc.x = M.left;
  }
}

function tabela(doc, cols, linhas) {
  const cab = 18;
  const desenharCab = () => {
    const y = doc.y;
    doc.rect(M.left, y, CONTENT_W, cab).fill(BLUE);
    let x = M.left;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
    cols.forEach((c) => {
      doc.text(c.titulo.toUpperCase(), x + 5, y + 5.5, { width: c.w - 8, lineBreak: false });
      x += c.w;
    });
    doc.y = y + cab;
  };
  garantir(doc, cab + 24);
  desenharCab();
  linhas.forEach((l, idx) => {
    const h = Math.max(...cols.map((c, i) => {
      doc.font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      return doc.heightOfString(t(l[i]), { width: c.w - 10 });
    })) + 9;
    if (doc.y + h > limite(doc)) {
      doc.addPage();
      desenharCab();
    }
    const y = doc.y;
    if (idx % 2) doc.rect(M.left, y, CONTENT_W, h).fill('#F5F7FA');
    let x = M.left;
    cols.forEach((c, i) => {
      doc.font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(INK)
        .text(t(l[i]), x + 5, y + 4.5, { width: c.w - 10 });
      x += c.w;
    });
    doc.y = y + h;
  });
  doc.x = M.left;
  doc.moveDown(0.3);
}

// Mede a altura que um bloco ocuparia, renderizando-o num documento descartável.
function medir(fn) {
  const s = new PDFDocument({ size: 'A4', margins: { top: M.top, left: M.left, right: M.right, bottom: M.bottom } });
  let paginas = 0;
  s.on('pageAdded', () => { paginas++; s.x = M.left; s.y = M.top; });
  s.x = M.left;
  s.y = M.top;
  fn(s);
  const h = paginas * (limite(s) - M.top) + (s.y - M.top);
  s.end();
  return h;
}

// Mantém o tópico inteiro na mesma página quando ele cabe em uma; senão, começa em página nova.
function bloco(doc, fn) {
  const h = medir(fn);
  const util = limite(doc) - M.top;
  if (h <= util && doc.y + h > limite(doc)) doc.addPage();
  fn(doc);
}

export function gerarPdf(c) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M.top, left: M.left, right: M.right, bottom: M.bottom },
    bufferPages: true,
    info: {
      Title: `Resumo de Onboarding - ${c.razaoSocial}`,
      Author: 'Contabilidade Exemplo',
      Subject: 'Resumo do cadastro e onboarding do cliente',
    },
  });

  chrome(doc);
  doc.on('pageAdded', () => {
    chrome(doc);
    doc.x = M.left;
    doc.y = M.top;
  });

  // Título
  doc.font('Helvetica-Bold').fontSize(16).fillColor(BLUE).text('RESUMO DO CADASTRO E ONBOARDING', M.left, M.top);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text('Documento referente exclusivamente ao cliente identificado abaixo.', M.left, doc.y + 2);
  doc.moveDown(0.8);

  // Caixa do ERP
  if (c.erp) {
    const y = doc.y;
    doc.roundedRect(M.left, y, CONTENT_W, 46, 4).lineWidth(1.4).strokeColor(RED).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
      .text('ERP DO CLIENTE  -  IDENTIFICAÇÃO OPERACIONAL / CONTRATUAL', M.left, y + 8, { width: CONTENT_W, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(22).fillColor(RED)
      .text(c.erp, M.left, y + 19, { width: CONTENT_W, align: 'center' });
    doc.y = y + 54;
    doc.x = M.left;
  }

  // 1. Empresa
  bloco(doc, (doc) => {
  secao(doc, '1. Dados da empresa');
  pares(doc, [
    ['Razão social', c.razaoSocial],
    ['Nome fantasia', c.nomeFantasia],
    ['CNPJ', fmtCnpj(c.cnpj)],
    ['Situação cadastral', [c.situacaoCadastral, c.dataSituacao && `desde ${dataBR(c.dataSituacao)}`].filter(Boolean).join(' ')],
    ['Matriz / Filial', c.matrizFilial],
    ['Data de abertura', dataBR(c.dataAbertura)],
    ['Natureza jurídica', c.naturezaJuridica],
    ['Porte', c.porte],
    ['Capital social', brl(c.capitalSocial)],
    ['Regime tributário', c.regime],
    ['Atividade principal (CNAE)', [fmtCnae(c.cnaePrincipal), c.cnaePrincipalDesc].filter(Boolean).join(' - ')],
    ['E-mail', c.email],
    ['Telefone(s)', (c.telefones || []).join(' / ')],
    ['Endereço', [
      [c.logradouro, c.numero].filter(Boolean).join(', '),
      c.complemento, c.bairro,
      [c.municipio, c.uf].filter(Boolean).join('/'),
      c.cep && `CEP ${String(c.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}`,
    ].filter(Boolean).join(' - ')],
  ]);

  if (c.cnaesSecundarios?.length) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text('CNAES SECUNDÁRIOS', M.left, doc.y);
    doc.moveDown(0.3);
    tabela(doc, [{ titulo: 'Código', w: 70, bold: true }, { titulo: 'Descrição', w: CONTENT_W - 70 }],
      c.cnaesSecundarios.map((n) => [fmtCnae(n.codigo), n.descricao]));
  }
  });

  // 2. Sócios
  if (c.socios?.length) bloco(doc, (doc) => {
    secao(doc, '2. Quadro societário e responsáveis');
    tabela(
      doc,
      [
        { titulo: 'Nome', w: 150, bold: true },
        { titulo: 'Qualificação', w: 110 },
        { titulo: 'Documento', w: 80 },
        { titulo: 'Entrada', w: 55 },
        { titulo: 'Responsável', w: CONTENT_W - 395 },
      ],
      c.socios.map((s) => [s.nome, s.qualificacao, fmtDoc(s.documento), dataBR(s.dataEntrada), s.responsavel ? 'Sim' : '']),
    );
  });

  // 3. Contrato e equipe
  bloco(doc, (doc) => {
  secao(doc, '3. Contrato e equipe responsável');
  pares(doc, [
    ['Início do onboarding', dataBR(c.dataInicio)],
    ['Data de cadastro', dataBR(c.dataCadastro)],
    ['Responsável pelo relacionamento', c.respRelacionamento],
    ['Responsável comercial', c.respComercial],
    ['Gestor responsável', c.gestor],
    ['Formalização do contrato', dataBR(c.dataContrato)],
    ['Contrato / instrumento', c.numeroContrato],
  ]);
  });

  // 4. Serviços
  if (c.servicos?.length) bloco(doc, (doc) => {
    secao(doc, '4. Serviços contratados');
    let x = M.left;
    let y = doc.y;
    doc.font('Helvetica').fontSize(9);
    // y só muda ao quebrar linha (o text() do pdfkit move doc.y e desalinhava as etiquetas).
    c.servicos.forEach((s) => {
      const w = doc.widthOfString(t(s)) + 16;
      if (x + w > M.left + CONTENT_W) { x = M.left; y += 22; }
      doc.roundedRect(x, y, w, 17, 8.5).lineWidth(0.8).strokeColor(BLUE).stroke();
      doc.fillColor(BLUE).text(t(s), x + 8, y + 4.5, { lineBreak: false });
      x += w + 6;
    });
    doc.y = y + 26;
    doc.x = M.left;
  });

  // 5. Apresentação
  const ap = c.apresentacao || {};
  const itens = [
    ap.empresa && 'Apresentação da empresa',
    ap.servicos && 'Serviços contratados',
    ap.canais && 'Canais oficiais de comunicação',
    ap.responsavel && 'Responsável pelo relacionamento',
    ap.atendimento && 'Forma de atendimento e direcionamento das demandas',
  ].filter(Boolean);
  if (itens.length || ap.data || ap.canaisComunicacao || ap.formaAtendimento || ap.observacoes) {
    bloco(doc, (doc) => {
      secao(doc, '5. Apresentação ao cliente');
      pares(doc, [
        ['Data da apresentação', dataBR(ap.data)],
        ['Responsável pela apresentação', ap.responsavelApresentacao],
        ['Canais oficiais de comunicação', ap.canaisComunicacao],
        ['Forma de atendimento', ap.formaAtendimento],
        ['Itens apresentados', itens.join('; ')],
        ['Observações', ap.observacoes],
      ]);
    });
  }

  // 6. Status
  bloco(doc, (doc) => {
    secao(doc, '6. Status do onboarding');
    pares(doc, [
      ['Status', c.status],
      ['Conclusão', `${c.percentual}%`],
      ['Data de conclusão', dataBR(c.dataConclusao)],
    ]);
  });

  // 7. Registros
  const registradas = (c.etapas || []).filter((e) => e.status !== 'Pendente' || e.data || e.responsavel || e.observacao);
  if (registradas.length) bloco(doc, (doc) => {
    secao(doc, '7. Registros do onboarding');
    registradas.forEach((e) => {
      doc.font('Helvetica-Bold').fontSize(9);
      const titulo = `${e.ordem + 1}. ${t(e.nome)}`;
      const meta = [e.data && `Data: ${dataBR(e.data)}`, e.responsavel && `Responsável: ${e.responsavel}`].filter(Boolean).join('   ');
      const hObs = e.observacao ? doc.font('Helvetica').fontSize(8.5).heightOfString(t(e.observacao), { width: CONTENT_W - 8 }) + 2 : 0;
      const hTit = doc.font('Helvetica-Bold').fontSize(9).heightOfString(titulo, { width: CONTENT_W - 90 });
      garantir(doc, hTit + (meta ? 12 : 0) + hObs + 12);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(titulo, M.left, y, { width: CONTENT_W - 90 });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(STATUS_COLOR[e.status] || MUTED)
        .text(e.status, M.left + CONTENT_W - 85, y, { width: 85, align: 'right' });
      doc.y = y + hTit + 1;
      if (meta) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(meta, M.left, doc.y);
      if (e.observacao) doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(t(e.observacao), M.left, doc.y + 1, { width: CONTENT_W });
      doc.moveTo(M.left, doc.y + 4).lineTo(M.left + CONTENT_W, doc.y + 4).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y += 9;
    });
  });

  // Rodapé de geração + numeração
  doc.moveDown(0.5);
  garantir(doc, 20);
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(`Documento gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })}.`, M.left, doc.y, { width: CONTENT_W, align: 'right' });

  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    pageNumber(doc, i + 1);
  }
  doc.end();
  return doc;
}
