# ADR-0004: IA executada somente no navegador

- **Status:** Aceita
- **Data:** 2026-11-05
- **Resolve:** QA-004

## Contexto
O objetivo OBJ-04 prevê "IAs simples" para ajudar na gestão financeira: projeções, sugestão de categoria, detecção de gastos fora do padrão e resumos. A arquitetura é local-first, sem servidor (ADR-0003), com criptografia ponta a ponta (ADR-0002), e a regra RN-011 proíbe enviar dados financeiros pela rede.

## Opções consideradas
1. **Serviço externo (LLM via API).**
   - Prós: resumos e respostas em linguagem natural de alta qualidade.
   - Contras: envia dados financeiros a terceiros, o que quebra RN-011 e o espírito do E2E; sem servidor, o usuário teria de informar a própria chave de API no navegador; tem custo; não funciona offline.
2. **IA local no navegador.**
   - Prós: privacidade total; funciona offline; sem custo; coerente com a arquitetura.
   - Contras: capacidades mais limitadas; texto em linguagem natural feito por *templates*, não gerado livremente.

## Decisão
**IA somente local.** Projeções determinísticas, categorização por regras com aprendizado a partir das correções do usuário, detecção de anomalias por estatística simples e resumos por *templates*. Tudo roda no navegador, atrás de uma interface no módulo `inteligencia`. Detalhes em [ENGENHARIA_DE_SOFTWARE.md §5.5](../ENGENHARIA_DE_SOFTWARE.md#55-inteligência-artificial-rn-009).

## Consequências
- **Positivas:** nenhuma exceção à política de rede (a CSP pode manter `connect-src 'self'`); os recursos de IA são testáveis de forma determinística; bom exercício de algoritmos e estatística.
- **Negativas:** sem conversa livre nem respostas abertas em linguagem natural.
- **Evolução possível:** modelos leves treinados localmente (ex.: Naive Bayes para categorização), sem violar esta decisão.
- **Requisitos criados ou alterados:** RN-011, RF-063, RF-065, RNF-009.
