# ADR-0001: Escolha da stack de desenvolvimento

- **Status:** Aceita
- **Data:** 2026-11-05

## Contexto
O FinManager é um app 100% client-side, sem servidor (ADR-0003), com criptografia ponta a ponta (ADR-0002) e IA local (ADR-0004). As prioridades para a escolha foram **estabilidade** e **desempenho**, seguidas de: poucas dependências (risco R-08), acessibilidade, encaixe na arquitetura em camadas e valor para aprendizado e portfólio. O **Tailwind CSS** já estava definido para os estilos.

## Opções consideradas
1. **Angular.**
   - Prós: ciclo de versões previsível, com 18 meses de suporte por versão e migrações automáticas (`ng update`); vem com rotas, formulários, injeção de dependência, service worker, CDK de acessibilidade e arrastar e soltar; sanitização e suporte a CSP embutidos; menos dependências de terceiros.
   - Contras: curva de aprendizado maior; pacote inicial maior.
2. **React.**
   - Prós: ecossistema e mercado maiores; pacote inicial menor; React Compiler.
   - Contras: sem política formal de LTS; rotas, estado, formulários, PWA e acessibilidade dependem de bibliotecas de terceiros, que mudam com frequência e aumentam a superfície de ataque.

A diferença de desempenho entre os dois é pequena para este app: o custo dominante é derivar a chave e decifrar os dados, o que independe do framework.

## Decisão
**Angular**, com a stack abaixo. As versões exatas serão fixadas no `package.json` e no *lockfile* na criação do projeto, sempre usando a **versão estável mais recente** de cada ferramenta.

### Núcleo
| Camada | Escolha | Observações |
|---|---|---|
| Linguagem | **TypeScript** em modo `strict` | Inclui `noUncheckedIndexedAccess`. |
| Framework | **Angular** (componentes *standalone*) | **Zoneless** + **signals** + `ChangeDetectionStrategy.OnPush` em todos os componentes; `@defer` para telas pesadas (relatórios, gráficos). |
| Estilos | **Tailwind CSS** | Tokens de design (cores, espaçamentos, temas claro/escuro/alto contraste) definidos como variáveis CSS e expostos ao Tailwind. |
| Estado | **Signals + serviços** do Angular | Sem NgRx (KISS/YAGNI). |
| Formulários | **Reactive Forms** | API estável. Os *Signal Forms* serão reavaliados quando se tornarem estáveis. |
| Componentes acessíveis | **Angular CDK** (a11y, overlay/dialog, drag-drop, listbox) | Base do design system próprio estilizado com Tailwind. |
| PWA/offline | **@angular/service-worker** | Pacote oficial. |
| Localização | Locale `pt-BR` do Angular | Formatação de moeda e datas via `Intl`. |

### Infraestrutura (adaptadores)
| Necessidade | Escolha | Por quê |
|---|---|---|
| Criptografia | **Web Crypto API** (nativa) | AES-256-GCM, geração de números aleatórios, chaves não extraíveis. Sem biblioteca de criptografia em JS. |
| Derivação de chave | **Argon2id** via **hash-wasm** | Mais resistente que o PBKDF2 a ataques com GPU, o que importa porque o arquivo de backup pode vazar. Biblioteca pequena e sem dependências. Parâmetros iniciais mínimos da OWASP (m = 19 MiB, t = 2, p = 1), calibrados para atender RNF-033 e gravados nos metadados. |
| IndexedDB | **idb** (Jake Archibald) | Camada fina com Promises sobre o IndexedDB nativo. Como tudo é decifrado em memória, não são necessários índices nem consultas avançadas (Dexie seria excessivo). |
| Validação de dados | **Zod** | Valida o esquema dos dados decifrados, principalmente na importação de backups (entrada não confiável). |
| Datas | **date-fns** | Funções puras e *tree-shakable*, ideais para o Domínio (faturas, períodos de relatórios). |
| Gráficos | **Chart.js**, usado diretamente, sem wrapper | Leve, compatível com CSP e sem dependências extras. Todo gráfico tem tabela alternativa (RF-045). |
| Relatórios em PDF | **CSS de impressão** + "Salvar como PDF" do navegador | Nenhuma dependência e resultado acessível. Bibliotecas de PDF serão reavaliadas se houver necessidade real. |
| CSV | Implementação própria, simples | Evita dependência. |

### Qualidade e ferramentas
| Necessidade | Escolha |
|---|---|
| Testes unitários e de integração | **Vitest** (executor padrão das versões recentes do Angular) + **fake-indexeddb** |
| Testes E2E | **Playwright** (Chromium, Firefox e WebKit, cobrindo RNF-050) |
| Acessibilidade automatizada | **@axe-core/playwright** |
| Lint | **angular-eslint** (inclui regras de acessibilidade de templates) |
| Formatação | **Prettier** + **prettier-plugin-tailwindcss** |
| Gerenciador de pacotes | **pnpm**: bloqueia scripts de instalação por padrão e permite exigir uma idade mínima para novas versões de pacotes (proteção contra pacotes comprometidos, R-08) |
| Node.js | Versão LTS ativa |
| CI/CD | **GitHub Actions** |

## Consequências
- **Positivas:** um framework coeso e com suporte previsível; poucas dependências de produção (Angular, idb, hash-wasm, Zod, date-fns, Chart.js); a injeção de dependência do Angular implementa diretamente as portas e adaptadores da arquitetura; o Domínio continua em TypeScript puro, independente do Angular.
- **Negativas:** curva de aprendizado de Angular (injeção de dependência, signals, decorators); pacote inicial maior que o de um app React equivalente.
- **CSP:** o Argon2id em WebAssembly exige `'wasm-unsafe-eval'` em `script-src`. É a única flexibilização aceita e deve ser documentada.
- **Regra de arquitetura:** o código em `domain/` **não pode importar** `@angular/*` nem bibliotecas de infraestrutura. Isso será verificado por regra de lint.
- **Reavaliar quando:** os Signal Forms ou o Angular Aria se estabilizarem; surgir a necessidade de PDF gerado programaticamente; o desempenho de desbloqueio violar RNF-033.
