# Projeto Escola

PWA SaaS em Next.js para professores da educação infantil e fundamental 1 gerarem, salvarem e organizarem atividades pedagógicas personalizadas com IA.

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

- Básico: 30 atividades por ciclo de 30 dias
- Completo: 100 atividades por ciclo de 30 dias

Para ativar um ciclo após confirmação de pagamento:

```sql
select public.activate_subscription_cycle('USER_ID_AQUI', 'basic');
select public.activate_subscription_cycle('USER_ID_AQUI', 'complete');
```

Para upgrade do Básico para o Completo no ciclo atual:

```sql
select public.upgrade_subscription_to_complete('USER_ID_AQUI');
```

A função `public.billing_maintenance()` suspende planos vencidos após 1 dia de carência e exclui usuários suspensos há mais de 30 dias. Ela também está exposta em `POST /api/billing/maintenance` usando o header `x-maintenance-secret`.

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
