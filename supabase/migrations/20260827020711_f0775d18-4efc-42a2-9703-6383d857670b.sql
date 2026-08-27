CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('up-vendas-sync-contagem') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'up-vendas-sync-contagem');
SELECT cron.unschedule('up-vendas-reconciliacao') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'up-vendas-reconciliacao');

SELECT cron.schedule(
  'up-vendas-sync-contagem',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--a479053a-f2b6-4010-abc1-2ab75647be91-dev.lovable.app/api/public/hooks/sync-contagem',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_1It0kM_TH7ipZUOZUcyRFQ_0JMeSCss"}'::jsonb,
    body := '{"tarefa": "sincronizar"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'up-vendas-reconciliacao',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--a479053a-f2b6-4010-abc1-2ab75647be91-dev.lovable.app/api/public/hooks/sync-contagem',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_1It0kM_TH7ipZUOZUcyRFQ_0JMeSCss"}'::jsonb,
    body := '{"tarefa": "reconciliar"}'::jsonb
  );
  $$
);