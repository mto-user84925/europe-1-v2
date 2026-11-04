-- ============================================================================
--  RLS — user_station_configs
--  Météo-Climat Pro
-- ============================================================================
--  À COLLER DANS : Supabase → SQL Editor → New query
--
--  ⚠️ À LIRE AVANT D'EXÉCUTER.
--  Ce script est idempotent : il peut être relancé sans casser la base.
--  Il ne SUPPRIME AUCUNE DONNÉE. Il ajoute une colonne et des politiques.
--
--  Contexte : l'application client (MyStation.jsx) filtre désormais sur
--  `client_id`. Sans cette colonne, la page « Ma Station » ne trouvera plus
--  aucune configuration existante → d'où l'étape 1.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ÉTAPE 0 — DIAGNOSTIC (lecture seule, à exécuter d'abord)
-- ----------------------------------------------------------------------------
-- Vérifie l'état actuel. Ces requêtes ne modifient rien.

-- 0.a Les colonnes existantes de la table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_station_configs'
ORDER BY ordinal_position;

-- 0.b Le RLS est-il activé ?
SELECT relname AS table_name, relrowsecurity AS rls_active
FROM pg_class
WHERE relname = 'user_station_configs';

-- 0.c Les politiques déjà en place
SELECT policyname, cmd, roles, qual AS using_expression, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'user_station_configs';

-- 0.d Combien de lignes risquent d'être orphelines ?
SELECT
    count(*)                                         AS total_lignes,
    count(*) FILTER (WHERE ntfy_topic IS NULL)       AS sans_topic,
    count(DISTINCT ntfy_topic)                       AS topics_distincts
FROM public.user_station_configs;


-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — Ajouter la colonne client_id
-- ----------------------------------------------------------------------------

ALTER TABLE public.user_station_configs
    ADD COLUMN IF NOT EXISTS client_id text;

COMMENT ON COLUMN public.user_station_configs.client_id IS
    'Identifiant d''installation généré côté navigateur (localStorage). Sert au cloisonnement des données entre clients.';


-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — Reprise des données existantes
-- ----------------------------------------------------------------------------
-- Les lignes créées AVANT cette correction n'ont pas de client_id.
-- On les rattache à leur topic : chaque topic existant devient son propre client.
-- Ainsi aucune configuration n'est perdue et personne ne voit les autres.
--
-- ⚠️ Si tu préfères que l'ancien contenu devienne INVISIBLE (plus sûr en cas
--    de topics partagés), remplace le bloc 2 par :
--       -- (aucune reprise, les lignes restent avec client_id NULL)

UPDATE public.user_station_configs
SET    client_id = ntfy_topic
WHERE  client_id IS NULL
  AND  ntfy_topic IS NOT NULL;

-- Vérification post-reprise : doit renvoyer 0
SELECT count(*) AS lignes_sans_client_id
FROM public.user_station_configs
WHERE client_id IS NULL;


-- ----------------------------------------------------------------------------
-- ÉTAPE 3 — Contrainte d'intégrité
-- ----------------------------------------------------------------------------

ALTER TABLE public.user_station_configs
    ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_station_configs_client_id
    ON public.user_station_configs (client_id);


-- ----------------------------------------------------------------------------
-- ÉTAPE 4 — Politiques RLS
-- ----------------------------------------------------------------------------
-- ⚠️ POINT IMPORTANT — lis ceci avant d'exécuter.
--
-- `client_id` est généré par le NAVIGATEUR (localStorage). Ce n'est donc PAS
-- une preuve d'identité : n'importe qui peut envoyer le client_id d'un autre.
-- Il empêche l'énumération accidentelle (« je liste tous les clients »),
-- pas une attaque déterminée.
--
-- Conséquence assumée ci-dessous :
--   • ÉCRITURE : fermée à l'anon. C'est ce qui arrête la destruction de données
--     (avant : n'importe qui pouvait DELETE toute la table).
--   • LECTURE  : fermée à l'anon également. La page « Ma Station » nécessitera
--     donc une session authentifiée pour fonctionner.
--
-- Si tu préfères garder « Ma Station » utilisable SANS connexion, ne prends pas
-- ce fichier tel quel : utilise l'ÉTAPE 6 (auth réelle) qui est la seule
-- solution propre. Il n'existe pas d'option « lecture publique mais filtrée »
-- correcte sans identité côté serveur.

ALTER TABLE public.user_station_configs ENABLE ROW LEVEL SECURITY;

-- On retire les anciennes politiques permissives éventuelles
DROP POLICY IF EXISTS "allow_all_user_station_configs"   ON public.user_station_configs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_station_configs;
DROP POLICY IF EXISTS "public_all_user_station_configs"  ON public.user_station_configs;
DROP POLICY IF EXISTS "write_user_station_configs_authenticated" ON public.user_station_configs;
DROP POLICY IF EXISTS "read_user_station_configs_authenticated"  ON public.user_station_configs;

-- AUCUNE politique pour `anon` : par défaut, RLS refuse tout.
-- Pour `authenticated` : accès aux lignes de son propre client_id.
-- (Le filtre applicatif .eq('client_id', ...) reste nécessaire : RLS ne sait
--  pas lire un client_id arbitraire sans colonne user_id — voir ÉTAPE 6.)

CREATE POLICY "read_user_station_configs_authenticated"
    ON public.user_station_configs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "write_user_station_configs_authenticated"
    ON public.user_station_configs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- ÉTAPE 5 — VÉRIFICATION FINALE (lecture seule)
-- ----------------------------------------------------------------------------

-- 5.a RLS bien activé ?  (attendu : rls_active = true)
SELECT relname AS table_name, relrowsecurity AS rls_active
FROM pg_class
WHERE relname = 'user_station_configs';

-- 5.b Politiques présentes (attendu : 2 lignes, aucune pour anon)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'user_station_configs';

-- 5.c Plus aucune ligne orpheline (attendu : 0)
SELECT count(*) AS lignes_sans_client_id
FROM public.user_station_configs
WHERE client_id IS NULL;


-- ----------------------------------------------------------------------------
-- ÉTAPE 6 — (OPTIONNEL, RECOMMANDÉ) Passage à une vraie isolation par utilisateur
-- ----------------------------------------------------------------------------
-- À n'exécuter QUE lorsque Supabase Auth est effectivement utilisé par
-- l'application (AuthProvider branché dans main.jsx).
-- Décommente et adapte, puis relance.
--
-- ALTER TABLE public.user_station_configs
--     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- CREATE INDEX IF NOT EXISTS idx_user_station_configs_user_id
--     ON public.user_station_configs (user_id);
--
-- DROP POLICY IF EXISTS "write_user_station_configs_authenticated" ON public.user_station_configs;
--
-- CREATE POLICY "own_rows_select"
--     ON public.user_station_configs FOR SELECT TO authenticated
--     USING (user_id = auth.uid());
--
-- CREATE POLICY "own_rows_insert"
--     ON public.user_station_configs FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid());
--
-- CREATE POLICY "own_rows_update"
--     ON public.user_station_configs FOR UPDATE TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--
-- CREATE POLICY "own_rows_delete"
--     ON public.user_station_configs FOR DELETE TO authenticated
--     USING (user_id = auth.uid());


-- ============================================================================
--  ROLLBACK (en cas de problème)
-- ============================================================================
-- Pour revenir en arrière :
--
--   DROP POLICY IF EXISTS "read_user_station_configs_authenticated"
--       ON public.user_station_configs;
--   DROP POLICY IF EXISTS "write_user_station_configs_authenticated"
--       ON public.user_station_configs;
--   ALTER TABLE public.user_station_configs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.user_station_configs ALTER COLUMN client_id DROP NOT NULL;
--
-- La colonne client_id peut rester en place : elle est inoffensive.
-- ============================================================================
