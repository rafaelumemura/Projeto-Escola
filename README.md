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
HOTMART_WEBHOOK_SECRET=
HOTMART_TEMP_PASSWORD=acesso123
HOTMART_BASIC_PRODUCT_ID=
HOTMART_COMPLETE_PRODUCT_ID=
HOTMART_PRO_PRODUCT_ID=
HOTMART_BASIC_OFFER_CODE=
HOTMART_COMPLETE_OFFER_CODE=
HOTMART_PRO_OFFER_CODE=
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

O checkout redireciona para os links configurados em `HOTMART_BASIC_URL`, `HOTMART_COMPLETE_URL` e, para upgrade, `HOTMART_UPGRADE_URL`.

### Webhook Hotmart

A rota `POST /api/hotmart/webhook` recebe a confirmação de compra, cria o usuário no Supabase Auth com a senha provisória `HOTMART_TEMP_PASSWORD` ou `acesso123`, ativa o plano contratado e marca o perfil para troca obrigatória de senha no primeiro acesso.

Se `HOTMART_WEBHOOK_SECRET` estiver configurado, envie o mesmo valor em um destes lugares: header `x-hotmart-hottok`, header `hottok`, header `x-webhook-token`, header `Authorization: Bearer <token>` ou query string `?token=<token>`.

Para identificação mais confiável do plano, configure `HOTMART_BASIC_OFFER_CODE`, `HOTMART_COMPLETE_OFFER_CODE` e `HOTMART_PRO_OFFER_CODE` com os códigos das ofertas/planos da Hotmart. Se você tiver produtos separados por plano, também pode usar `HOTMART_BASIC_PRODUCT_ID`, `HOTMART_COMPLETE_PRODUCT_ID` e `HOTMART_PRO_PRODUCT_ID`. Se esses valores não existirem, o backend tenta inferir pelo nome da oferta/produto.

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
