# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado do projeto

FinManager é um webapp de finanças pessoais **local-first, sem servidor, com criptografia ponta a ponta**. O projeto Angular foi criado, mas ainda é só o esqueleto: nenhuma feature foi implementada e as pastas de camadas abaixo ainda não existem. Toda a documentação, a interface e os commits são em **português (pt-BR)**.

Fontes de verdade (leia a seção relevante antes de implementar):
- `docs/ENGENHARIA_DE_REQUISITOS.md`: **o quê**. Regras de negócio (RN-xxx), requisitos funcionais (RF-xxx) e não funcionais (RNF-xxx), histórias de usuário com critérios Dado/Quando/Então (US-xxx), questões resolvidas (QA-xxx) e releases (MVP = v0.1).
- `docs/ENGENHARIA_DE_SOFTWARE.md`: **como**. Arquitetura, design das regras críticas (§5), segurança (§6), testes (§8), CI (§9), Definition of Done (§10).
- `docs/adr/`: **por quê**. ADR-0001 (stack), 0002 (E2E), 0003 (local-first), 0004 (IA local), 0005 (GitHub Pages + GPL-3.0).

## Comandos

Angular 22 (workspace na raiz, projeto `finmanager`), gerenciado com **pnpm**.

```sh
pnpm start                      # servidor de desenvolvimento (ng serve)
pnpm build                      # build de produção em dist/finmanager
pnpm test --watch=false         # todos os testes (Vitest via ng test, ambiente jsdom)
pnpm test --watch=false --include src/app/app.spec.ts           # um arquivo
pnpm test --watch=false --include src/app/app.spec.ts --filter "título"   # um teste pelo nome (regex)
pnpm lint                       # ESLint (angular-eslint + fronteiras entre camadas)
pnpm typecheck                  # tsc --noEmit para app e specs
pnpm format / pnpm format:check # Prettier (com prettier-plugin-tailwindcss)
```

Antes de dar uma tarefa por concluída, rode `format:check`, `lint`, `typecheck`, `test --watch=false` e `build`.

- **`ng add` não funciona** com o pnpm 12 instalado: o Angular CLI 22.2.6 não detecta o pnpm. Instale os pacotes com `pnpm add` e configure à mão.
- O `pnpm-workspace.yaml` define `minimumReleaseAge` (1 dia) e bloqueia scripts de instalação (`allowBuilds`). Não relaxe essas regras sem justificativa.
- O Prettier ignora `*.md`, para não realinhar as tabelas da documentação.
- Ainda não configurados: Playwright + axe, `fake-indexeddb`, CSP, service worker e deploy. O build para o GitHub Pages deverá usar `--base-href /FinManager/` e copiar `index.html` para `404.html`.

## Invariantes de arquitetura (não negociáveis)

- **Nenhum dado do usuário sai do navegador.** Sem backend, sem telemetria, sem analytics, sem CDNs e sem IA externa. A CSP usa `connect-src 'self'`; a única exceção é `'wasm-unsafe-eval'`, exigida pelo Argon2id. A CSP vai em `<meta>`, porque o GitHub Pages não aceita cabeçalhos. O app não deve renderizar dentro de `iframe`.
- **Criptografia em envelope** (detalhes em ENGENHARIA_DE_SOFTWARE §5.6):
  - Uma DEK aleatória (AES-256-GCM, Web Crypto) cifra os dados.
  - A DEK é guardada cifrada por uma KEK derivada da senha mestra (Argon2id via `hash-wasm`) e, em uma segunda cópia, pela chave de recuperação, que é obrigatória.
  - Uma senha errada é detectada pela falha de autenticação do GCM; não existe hash da senha armazenado.
  - Trocar a senha recifra apenas a DEK.
  - Nunca implemente primitivas criptográficas à mão.
- **O IndexedDB (via `idb`) guarda somente texto cifrado.** Ao desbloquear, tudo é decifrado para a memória, e consultas e relatórios rodam sobre esses dados em memória. Não crie índices sobre campos sensíveis. Bloquear o cofre (manualmente, por inatividade ou ao fechar a aba) descarta a DEK e os dados decifrados.
- **O Domínio não conhece criptografia nem Angular.** Cifrar e decifrar acontece apenas nos adaptadores de `infrastructure/`.
- **Backup** é um `.json` versionado (`formatVersion`) que carrega as DEKs cifradas, então abre com a senha mestra vigente no momento da exportação ou com a chave de recuperação. A importação **substitui** os dados atuais e roda em uma única transação, depois de validar o conteúdo com Zod. Antes de importar ou de trocar a moeda, crie um **ponto de restauração** com data e motivo; se não houver espaço para ele, a operação é cancelada.

## Estrutura de camadas (ENGENHARIA_DE_SOFTWARE §4.5)

```
src/app/
  domain/          TypeScript puro; só pode importar date-fns
  application/     casos de uso + portas (InjectionToken)
  infrastructure/  adaptadores: idb, Web Crypto, hash-wasm, arquivos
  features/        telas por feature, com lazy loading e guard de "cofre desbloqueado"
  ui/              design system acessível (Angular CDK + Tailwind)
  core/            bootstrap, rotas, providers que ligam portas a adaptadores
```

`features/` usa apenas `application/` e `ui/`, nunca `infrastructure/`. Essas fronteiras são verificadas pelo `no-restricted-imports` em `eslint.config.js`, que só casa caminhos relativos (para não bloquear `@angular/core` como se fosse `core/`). Ao criar uma nova camada ou pasta de topo, atualize essas regras.

## Regras de domínio fáceis de errar

- **Dinheiro:** use o objeto de valor `Dinheiro`, com valor em **unidades mínimas inteiras** e código **ISO 4217**. Nunca use ponto flutuante. Operações entre moedas diferentes lançam erro. Em parcelamentos, o resto dos centavos vai na 1ª parcela.
- **Moeda:** o app usa uma única moeda por vez. Trocar a moeda **não converte** os valores: o valor na unidade principal é preservado e a escala das unidades mínimas é ajustada. Câmbio e múltiplas moedas ficam para uma versão futura.
- **Cartão de crédito:** relatórios e projeções contam a compra pela **fatura**, mas a **data da compra** também é armazenada. Pagar a fatura é uma *transferência*, não uma despesa. Os casos de borda (dia 31, compra no dia do fechamento, parcelas, virada de ano) estão listados em §5.9.
- **Ações significativas** (lista em RN-005) exigem o diálogo de confirmação reutilizável, com foco inicial em "Cancelar", geram um evento na trilha de auditoria *append-only* e usam *soft delete*. Itens excluídos e eventos expiram em **180 dias**; o expurgo roda a cada desbloqueio, porque não existe tarefa agendada.
- **Notificações** só funcionam com a aba aberta e o cofre desbloqueado, e por padrão o texto não mostra valores nem descrições.
- **IA** é apenas local e determinística (regras, estatística, *templates*). Uma sugestão nunca altera dados sem o aceite do usuário.

## Convenções Angular e de código

- Componentes standalone, `OnPush`, **signals**, modo **zoneless**, `@defer` para telas pesadas.
- **Reactive Forms**, não Signal Forms. Estado com signals + serviços, sem NgRx.
- Acessibilidade WCAG 2.2 AA é requisito de cada componente (checklist em §7.3). Todo gráfico (Chart.js) precisa de uma tabela alternativa.
- PDF de relatórios via CSS de impressão, sem biblioteca.
- Toda nova dependência precisa de justificativa e de licença **compatível com GPL-3.0**; prefira APIs nativas do navegador ou do Angular. Não use `bypassSecurityTrust*`.
- Se mudar o formato dos dados persistidos ou do backup, incremente a versão e escreva uma migração com teste.

## Fluxo de trabalho

- **Git é exclusivo do usuário.** Nunca execute comandos git que alterem o repositório (`add`, `commit`, `push`, `pull`, `branch`, `checkout`/`switch`, `merge`, `rebase`, `reset`, `restore`, `stash`, `tag`, `init` etc.), nem mesmo se parecer conveniente. Comandos só de leitura (`status`, `diff`, `log`, `show`) são permitidos. Ferramentas que inicializam git (ex.: `ng new`) devem rodar com `--skip-git`. Ao terminar uma tarefa, sugira a mensagem de commit em vez de commitar.
- GitHub Flow: branches `feat/rf-010-...`, `fix/...`, `docs/...`. Commits no padrão Conventional Commits, citando o requisito: `feat(transacoes): adiciona cadastro de despesa (RF-010)`.
- Implemente uma história/RF por vez, a partir dos critérios de aceitação, que viram testes. Domínio e cálculos financeiros seguem TDD.
- Use apenas dados fictícios em testes, fixtures e no modo demonstração. Nunca versione arquivos de backup.
- **IDs são estáveis:** nunca renumere RN/RF/RNF/QA. Novos itens recebem o próximo número livre (a próxima questão é QA-013). Decisões estruturais viram um ADR, usando o modelo em ENGENHARIA_DE_SOFTWARE §11.
- Ao alterar um documento em `docs/`, atualize o cabeçalho "Versão" e a tabela "Histórico de Revisões", além da matriz de rastreabilidade quando aplicável.
- Ao editar os `.md` por script, cuidado: os separadores de tabela (`|---|`) contêm `---`, o que quebra cortes baseados no separador de seções.
