# ADR-0005: Hospedagem no GitHub Pages e licença GPL-3.0

- **Status:** Aceita
- **Data:** 2026-11-05

## Contexto
O FinManager é um site estático, sem backend (ADR-0003), e será um portfólio público no GitHub (QA-006). Era preciso definir onde publicar o app e sob qual licença distribuir o código (RNF-060, RNF-062).

## Opções consideradas
**Hospedagem**
1. **GitHub Pages.** Prós: gratuito; integrado ao repositório e ao GitHub Actions; HTTPS automático. Contras: não permite cabeçalhos HTTP personalizados; não tem *fallback* nativo para rotas de SPA.
2. **Netlify / Cloudflare Pages / Vercel.** Prós: permitem cabeçalhos personalizados (CSP completa, `frame-ancestors`). Contras: mais um serviço e mais uma conta; o código e a demo ficam em lugares diferentes.

**Licença**
1. **MIT.** Permissiva: qualquer pessoa pode reutilizar o código, inclusive em software fechado.
2. **GPL-3.0.** *Copyleft*: quem distribuir versões modificadas precisa mantê-las abertas sob a mesma licença.

## Decisão
- **Hospedagem: GitHub Pages**, com deploy feito pelo GitHub Actions a cada merge na `main`.
- **Licença: GPL-3.0** (arquivo `LICENSE` na raiz, com o texto oficial da GNU).

## Consequências
**Hospedagem**
- **CSP por `<meta http-equiv="Content-Security-Policy">`**, já que não há como enviar cabeçalhos. A diretiva `frame-ancestors` não funciona via `<meta>`, então a **proteção contra *clickjacking*** (embutir o app em um `iframe` para induzir cliques, como em "Apagar cofre") é feita em código: se o app detectar que está dentro de um *frame* (`window.top !== window.self`), ele não renderiza a interface.
- **Rotas da SPA:** o build copia `index.html` para `404.html`, para que URLs profundas funcionem ao recarregar a página.
- **Base path:** o site fica em `https://<usuario>.github.io/FinManager/`, então o build usa `--base-href /FinManager/`, e o escopo do service worker deve respeitar esse caminho.
- **HTTPS:** a opção "Enforce HTTPS" deve ficar ativa (RNF-001).
- **Isolamento de dados:** o IndexedDB é separado por origem (`<usuario>.github.io`). Outros projetos publicados no GitHub Pages da mesma conta compartilham essa origem e, portanto, poderiam acessar o IndexedDB do FinManager. **Não publicar outros sites de terceiros ou não confiáveis na mesma conta/origem**, ou migrar para um domínio próprio, se isso mudar.

**Licença**
- Todas as dependências atuais (Angular, idb, hash-wasm, Zod, date-fns, Chart.js e ferramentas) usam licenças permissivas (MIT/ISC), compatíveis com GPL-3.0.
- A política de dependências passa a exigir **licença compatível com GPL-3.0** (MIT, ISC, BSD, Apache-2.0, LGPL, GPL). Dependências com licenças incompatíveis ou proprietárias são vetadas.
- O README deve indicar a licença e os direitos autorais (`Copyright (C) 2026 Roberto Takada`).
