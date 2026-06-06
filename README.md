# Projeto Escola

App em Next.js para professores da educação infantil e fundamental 1 gerarem, salvarem e organizarem atividades pedagógicas personalizadas com IA.

## Stack

- Next.js + TypeScript
- Tailwind CSS
- PWA com manifest e service worker próprios
- Supabase Auth, PostgreSQL e RLS
- Backend em API Routes do Next.js
- Claude API via `https://api.anthropic.com/v1/messages`
- Railway para deploy

Sem Lovable, sem n8n e sem workflows externos.

## Setup local

1. Instale dependências:

```bash
npm install
```

2. Crie `.env.local` a partir de `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
BILLING_MAINTENANCE_SECRET=
APP_URL=https://projetoescola.attivakids.com.br
HOTMART_WEBHOOK_SECRET=
HOTMART_TEMP_PASSWORD=acesso123
HOTMART_BASIC_PRODUCT_ID=
HOTMART_COMPLETE_PRODUCT_ID=
HOTMART_PRO_PRODUCT_ID=
HOTMART_BASIC_OFFER_CODE=
HOTMART_COMPLETE_OFFER_CODE=
HOTMART_PRO_OFFER_CODE=
HOTMART_BASIC_PLAN_ID=
HOTMART_COMPLETE_PLAN_ID=
HOTMART_PRO_PLAN_ID=
HOTMART_BASIC_URL=
HOTMART_COMPLETE_URL=
HOTMART_UPGRADE_URL=
```

3. No Supabase, rode o SQL em `supabase/schema.sql`.

4. Inicie o app:

```bash
npm run dev
```

## Supabase

O arquivo `supabase/schema.sql` cria:

- `profiles`
- `activities`
- `collections`
- `collection_activities`
- `weekly_plans`
- `weekly_plan_items`
- `billing_subscriptions`
- `hotmart_events`
- bucket `avatars` no Supabase Storage

Ele também ativa RLS em todas as tabelas e cria policies para que cada usuário acesse apenas seus próprios dados.

### Planos

Os planos disponíveis são:

- Gratuito: 5 atividades por ciclo de 7 dias
- Básico: 25 atividades por ciclo de 30 dias
- Completo: 100 atividades por ciclo de 30 dias
- Pro: 1000 atividades por ciclo de 30 dias, reservado ao admin `rafaelumemura@gmail.com`

Para ativar um ciclo após confirmação de pagamento:

```sql
select public.activate_subscription_cycle('USER_ID_AQUI', 'free');
select public.activate_subscription_cycle('USER_ID_AQUI', 'basic');
select public.activate_subscription_cycle('USER_ID_AQUI', 'complete');
```

Para upgrade do Básico para o Completo no ciclo atual:

```sql
select public.upgrade_subscription_to_complete('USER_ID_AQUI');
```

A função `public.billing_maintenance()` suspende planos vencidos após 1 dia de carência e exclui usuários suspensos há mais de 30 dias. Ela também está exposta em `POST /api/billing/maintenance` usando o header `x-maintenance-secret`.

Para que isso aconteça mesmo quando nenhum usuário abre o app, crie um serviço Cron no próprio projeto Railway, compartilhe `APP_URL` e `BILLING_MAINTENANCE_SECRET` e execute diariamente:

```bash
npm run billing:maintenance
```

O checkout redireciona para os links configurados em `HOTMART_BASIC_URL`, `HOTMART_COMPLETE_URL` e, para upgrade, `HOTMART_UPGRADE_URL`.

### Webhook Hotmart

A rota pública é:

```txt
POST https://projetoescola.attivakids.com.br/api/hotmart/webhook
```

Configure na Hotmart o token Hottok com o mesmo valor de `HOTMART_WEBHOOK_SECRET`. O endpoint exige esse valor no header oficial `X-HOTMART-HOTTOK`; tokens em URL não são aceitos.

Eventos tratados:

- `PURCHASE_APPROVED` e `PURCHASE_COMPLETE`: criam ou atualizam o usuário, ativam o plano e iniciam o ciclo.
- `PURCHASE_DELAYED`, `PURCHASE_EXPIRED` e `PURCHASE_CANCELED`: marcam pagamento pendente.
- `PURCHASE_REFUNDED` e `PURCHASE_CHARGEBACK`: suspendem o acesso.
- `SUBSCRIPTION_CANCELLATION`: agenda o cancelamento para o final do período já pago.
- `SWITCH_PLAN`: altera o plano sem duplicar o usuário.
- `UPDATE_SUBSCRIPTION_CHARGE_DATE`: atualiza a próxima cobrança.

Cada evento é salvo em `hotmart_events`. O `id` enviado pela Hotmart é único, portanto reenvios não duplicam assinaturas nem zeram contadores.

Para novos compradores, o backend usa o Supabase Admin para criar o usuário com `HOTMART_TEMP_PASSWORD` ou `acesso123`, confirma o e-mail e marca `password_must_change`. Se o usuário já existir no Auth, mesmo sem perfil, o cadastro é reaproveitado.

Para distinguir os planos, configure preferencialmente os códigos das ofertas:

```env
HOTMART_BASIC_OFFER_CODE=
HOTMART_COMPLETE_OFFER_CODE=
```

Também são aceitos `HOTMART_*_PLAN_ID` e, somente quando cada plano for um produto separado, `HOTMART_*_PRODUCT_ID`. Vários códigos para o mesmo plano podem ser separados por vírgula.

Depois do deploy, abra `GET /api/hotmart/webhook`. A resposta mostra apenas se segredo e mapeamentos estão configurados, sem revelar seus valores.

Para instalar a estrutura de auditoria e idempotência em um banco existente, execute:

```txt
supabase/migrations/2026-06-06_harden_hotmart_webhook.sql
```

## APIs internas

- `POST /api/activities/generate`
- `POST /api/activities`
- `GET /api/activities`
- `GET /api/activities/:id`
- `PUT /api/activities/:id`
- `DELETE /api/activities/:id`
- `POST /api/collections`
- `GET /api/collections`
- `GET /api/collections/:id`
- `PUT /api/collections/:id`
- `DELETE /api/collections/:id`
- `POST /api/collections/:id/activities`
- `DELETE /api/collections/:id/activities/:activityId`
- `POST /api/weekly-plans`
- `GET /api/weekly-plans`
- `GET /api/weekly-plans/:id`
- `PUT /api/weekly-plans/:id`
- `DELETE /api/weekly-plans/:id`
- `POST /api/weekly-plans/:id/items`
- `PUT /api/weekly-plans/:id/items/:itemId`
- `DELETE /api/weekly-plans/:id/items/:itemId`
- `GET /api/billing/usage`
- `POST /api/billing/checkout`
- `POST /api/billing/maintenance`
- `POST /api/hotmart/webhook`
- `POST /api/pdf/activity`
- `POST /api/pdf/activity-material`
- `POST /api/pdf/weekly-plan`

As rotas usam `Authorization: Bearer <supabase_access_token>` e executam queries com cliente Supabase autenticado, respeitando RLS.

## Deploy na Railway

1. Crie um novo projeto Railway conectado a este repositório.
2. Configure as variáveis de ambiente da seção de setup.
3. Use o build padrão detectado pelo Nixpacks.
4. O start command já está em `railway.toml`:

```bash
npm run start
```

## PWA

O app inclui:

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icon.svg`
- registro do service worker em produção

Depois do deploy em HTTPS, o navegador deve oferecer instalação do app.
