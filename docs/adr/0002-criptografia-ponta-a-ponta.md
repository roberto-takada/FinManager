# ADR-0002: Criptografia ponta a ponta

- **Status:** Aceita
- **Data:** 2026-11-05
- **Resolve:** QA-001

## Contexto
A regra RN-001 exige que todos os dados relevantes sejam criptografados. Os dados são financeiros e pessoais, e o projeto será público como portfólio. Era preciso decidir **quem** consegue decifrar os dados: só o usuário (ponta a ponta) ou também um servidor.

## Opções consideradas
1. **Criptografia do lado do servidor.**
   - Prós: permite recuperar a senha; permite processar relatórios e IA no servidor.
   - Contras: o servidor (e quem o controla ou invade) consegue ler os dados; exige backend, banco e gestão de chaves no servidor.
2. **Criptografia ponta a ponta (E2E), com chave derivada da senha mestra.**
   - Prós: privacidade máxima, porque nenhum terceiro tem a chave; combina com a arquitetura sem servidor (ADR-0003); é um ótimo tema de estudo e de portfólio.
   - Contras: sem a senha (ou a chave de recuperação), os dados ficam perdidos; todo o processamento roda no navegador; a segurança depende da força da senha mestra.

## Decisão
**Criptografia ponta a ponta.** Os dados são cifrados no navegador com AES-256-GCM, usando uma chave de dados (DEK) aleatória. A DEK é protegida por uma chave derivada da senha mestra (Argon2id ou PBKDF2-SHA-256 com ≥ 600.000 iterações), seguindo o modelo de criptografia em envelope. Uma chave de recuperação opcional também protege a DEK. Detalhes em [ENGENHARIA_DE_SOFTWARE.md §5.6](../ENGENHARIA_DE_SOFTWARE.md#56-cofre-e-gestão-de-chaves-rn-001-rn-008-rn-013).

## Consequências
- **Positivas:** os dados no disco e no backup são ilegíveis sem a senha; não há segredos de servidor para proteger; trocar a senha só exige recifrar a DEK.
- **Negativas:** não existe "esqueci minha senha" sem a chave de recuperação (RN-013); as buscas e relatórios precisam dos dados decifrados em memória; a segurança depende da qualidade do código que roda no navegador (XSS e dependências passam a ser os riscos principais).
- **Requisitos criados ou alterados:** RN-001, RN-008, RN-013, RF-001 a RF-006, RNF-002 a RNF-006, RNF-033.
