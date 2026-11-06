# ADR-0003: Local-first, sem servidor, backup por arquivo

- **Status:** Aceita
- **Data:** 2026-11-05
- **Resolve:** QA-002 (e, junto com ela, QA-006)

## Contexto
Era preciso decidir onde os dados vivem: no navegador do usuário ou em um servidor com banco de dados. O app será usado inicialmente só pelo autor e depois publicado como portfólio no GitHub (QA-006). A regra RN-002 já exige o uso do armazenamento do navegador para não perder o trabalho do usuário.

## Opções consideradas
1. **Servidor como fonte da verdade** (backend + banco de dados).
   - Prós: sincronização entre dispositivos; backup centralizado.
   - Contras: custo e manutenção de infraestrutura; mais superfície de ataque; seria preciso cuidar de contas, autenticação e LGPD como controlador de dados de terceiros.
2. **Local-first com sincronização opcional.**
   - Prós: funciona offline e ainda sincroniza.
   - Contras: resolver conflitos de sincronização é complexo; continua exigindo servidor.
3. **Local-first sem servidor, com backup e migração por arquivo `.json` criptografado.**
   - Prós: zero infraestrutura além de hospedagem estática; privacidade total; funciona offline; a demonstração do portfólio pode ser publicada gratuitamente.
   - Contras: não há sincronização automática; os dados podem ser perdidos se o navegador for limpo e não houver backup; o usuário é responsável pelos próprios backups.

## Decisão
**Opção 3: local-first sem servidor.** Os dados ficam exclusivamente no IndexedDB do navegador, sempre cifrados (ADR-0002). O backup e a transferência entre dispositivos são feitos por exportação/importação de um arquivo `.json` criptografado, com formato versionado. O app é publicado como site estático.

## Consequências
- **Positivas:** arquitetura simples e barata; nenhum dado sai do dispositivo (RN-011); sem contas, login em servidor ou banco remoto; ótimo para portfólio (demo estática).
- **Negativas:** o backup passa a ser crítico e precisa entrar no MVP; é preciso solicitar armazenamento persistente e lembrar o usuário de fazer backup (RN-014); não há notificações com o app fechado (QA-007); o uso em várias abas exige coordenação (RNF-014); IA externa entraria em conflito com RN-011 (QA-004).
- **Novas questões:** QA-009 (substituir ou mesclar ao importar), QA-010 (senha do backup), QA-011 (chave de recuperação no MVP).
- **Requisitos criados ou alterados:** RN-010 a RN-014, RF-073, RF-090 a RF-097, RNF-012 a RNF-014, RNF-051, RNF-052, RNF-060 a RNF-063.
