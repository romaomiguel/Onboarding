# Extensão "Onboarding - Consulta Receita"

Último recurso do cadastro de clientes: quando OpenCNPJ, NextAPI e Sintegra não trazem a empresa ou o quadro
societário, o sistema oferece abrir o site da Receita com o CNPJ preenchido. O usuário só resolve o captcha e
consulta; a extensão lê o cartão CNPJ e o QSA e devolve os dados para a aba do sistema.

## Instalar (teste / modo desenvolvedor)
1. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
2. **Carregar sem compactação** e escolha esta pasta (`extensao-receita`).
3. Recarregue a página do sistema.

O sistema é reconhecido pelos domínios em `manifest.json` (`onboarding.exemplo.local`, `localhost` e `127.0.0.1`).
Se o endereço mudar, ajuste o segundo item de `content_scripts.matches`.

## Como funciona
- `app.js` (página do sistema): recebe o pedido da tela e repassa o resultado.
- `receita.js` (site da Receita): só age se o sistema pediu aquele CNPJ. Lê `/comprovante`, clica em
  "Consultar QSA", lê `/qsa` e envia tudo.
- `background.js`: liga as duas abas, foca o sistema e fecha a janela da Receita.
- O mapeamento dos campos fica no frontend (`frontend/src/lib/receita.ts`), então ajustes de formato não exigem
  reinstalar a extensão.

Em produção: publicar como "não listada" na Chrome Web Store ou instalar por política do Google Workspace.
