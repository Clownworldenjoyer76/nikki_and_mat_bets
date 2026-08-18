


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_master"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'master'
      and status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_master"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_admin_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_master()
     and (
       new.role is distinct from old.role
       or new.status is distinct from old.status
     )
  then
    raise exception 'Only master can change role or status';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_admin_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  elsif tg_op = 'UPDATE' and new.updated_by is null then
    new.updated_by = old.updated_by;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_by"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "pick_id" "uuid",
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comments_status_check" CHECK (("status" = ANY (ARRAY['published'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "sender_name" "text" NOT NULL,
    "sender_email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'read'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game_id" "text" NOT NULL,
    "season" integer NOT NULL,
    "week" smallint NOT NULL,
    "week_type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "away_team" "text" NOT NULL,
    "home_team" "text" NOT NULL,
    "kickoff_utc" timestamp with time zone NOT NULL,
    "spread_home" numeric,
    "total" numeric,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "games_game_id_check" CHECK (("length"(TRIM(BOTH FROM "game_id")) > 0)),
    CONSTRAINT "games_season_check" CHECK (("season" >= 2000)),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'final'::"text", 'postponed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "games_teams_check" CHECK ((("length"(TRIM(BOTH FROM "home_team")) > 0) AND ("length"(TRIM(BOTH FROM "away_team")) > 0) AND ("home_team" <> "away_team"))),
    CONSTRAINT "games_week_check" CHECK ((("week" >= 1) AND ("week" <= 22))),
    CONSTRAINT "games_week_type_check" CHECK (("week_type" = ANY (ARRAY['preseason'::"text", 'regular'::"text", 'playoff'::"text"])))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."picks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "game_id" "uuid",
    "spread_pick" "text" NOT NULL,
    "total_pick" "text" NOT NULL,
    "visibility" "text" DEFAULT 'kickoff'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "spread_result" "text",
    "total_result" "text",
    CONSTRAINT "picks_spread_pick_check" CHECK (("spread_pick" = ANY (ARRAY['home'::"text", 'away'::"text"]))),
    CONSTRAINT "picks_spread_result_check" CHECK ((("spread_result" IS NULL) OR ("spread_result" = ANY (ARRAY['W'::"text", 'L'::"text", 'P'::"text"])))),
    CONSTRAINT "picks_total_pick_check" CHECK (("total_pick" = ANY (ARRAY['over'::"text", 'under'::"text"]))),
    CONSTRAINT "picks_total_result_check" CHECK ((("total_result" IS NULL) OR ("total_result" = ANY (ARRAY['W'::"text", 'L'::"text", 'P'::"text"])))),
    CONSTRAINT "picks_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'kickoff'::"text"])))
);


ALTER TABLE "public"."picks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "role" "text" DEFAULT 'member'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bio" "text",
    "profile_image" "text",
    CONSTRAINT "profiles_display_name_not_blank" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0)),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'master'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "away_score" smallint,
    "home_score" smallint,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "scores_away_nonnegative" CHECK ((("away_score" IS NULL) OR ("away_score" >= 0))),
    CONSTRAINT "scores_home_nonnegative" CHECK ((("home_score" IS NULL) OR ("home_score" >= 0))),
    CONSTRAINT "scores_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."scores" OWNER TO "postgres";


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_game_id_key" UNIQUE ("game_id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."picks"
    ADD CONSTRAINT "picks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."picks"
    ADD CONSTRAINT "picks_user_game_unique" UNIQUE ("user_id", "game_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_game_id_key" UNIQUE ("game_id");



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_pkey" PRIMARY KEY ("id");



CREATE INDEX "comments_game_id_idx" ON "public"."comments" USING "btree" ("game_id");



CREATE INDEX "comments_pick_id_idx" ON "public"."comments" USING "btree" ("pick_id");



CREATE INDEX "comments_user_id_idx" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "contact_messages_user_id_idx" ON "public"."contact_messages" USING "btree" ("user_id");



CREATE INDEX "picks_game_id_idx" ON "public"."picks" USING "btree" ("game_id");



CREATE INDEX "picks_updated_by_idx" ON "public"."picks" USING "btree" ("updated_by");



CREATE UNIQUE INDEX "profiles_display_name_unique" ON "public"."profiles" USING "btree" ("lower"("display_name"));



CREATE INDEX "scores_updated_by_idx" ON "public"."scores" USING "btree" ("updated_by");



CREATE OR REPLACE TRIGGER "comments_set_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "contact_messages_set_updated_at" BEFORE UPDATE ON "public"."contact_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "games_set_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "picks_set_updated_at" BEFORE UPDATE ON "public"."picks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "picks_set_updated_by" BEFORE INSERT OR UPDATE ON "public"."picks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_by"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_profile_admin_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_admin_fields"();



CREATE OR REPLACE TRIGGER "scores_set_updated_at" BEFORE UPDATE ON "public"."scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "scores_set_updated_by" BEFORE INSERT OR UPDATE ON "public"."scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_by"();



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pick_id_fkey" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."picks"
    ADD CONSTRAINT "picks_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."picks"
    ADD CONSTRAINT "picks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."picks"
    ADD CONSTRAINT "picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete" ON "public"."comments" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_master"() AS "is_master") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "comments_insert" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'published'::"text"))));



CREATE POLICY "comments_read" ON "public"."comments" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_master"() AS "is_master")));



CREATE POLICY "comments_update" ON "public"."comments" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'published'::"text")))) WITH CHECK ((( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'published'::"text"))));



CREATE POLICY "contact_insert_user" ON "public"."contact_messages" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'new'::"text")));



CREATE POLICY "contact_insert_visitor" ON "public"."contact_messages" FOR INSERT TO "anon" WITH CHECK ((("user_id" IS NULL) AND ("status" = 'new'::"text")));



CREATE POLICY "contact_master_delete" ON "public"."contact_messages" FOR DELETE TO "authenticated" USING ("public"."is_master"());



CREATE POLICY "contact_master_read" ON "public"."contact_messages" FOR SELECT TO "authenticated" USING ("public"."is_master"());



CREATE POLICY "contact_master_update" ON "public"."contact_messages" FOR UPDATE TO "authenticated" USING ("public"."is_master"()) WITH CHECK ("public"."is_master"());



ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_master_delete" ON "public"."games" FOR DELETE TO "authenticated" USING ("public"."is_master"());



CREATE POLICY "games_master_insert" ON "public"."games" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_master"());



CREATE POLICY "games_master_update" ON "public"."games" FOR UPDATE TO "authenticated" USING ("public"."is_master"()) WITH CHECK ("public"."is_master"());



CREATE POLICY "games_read" ON "public"."games" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."picks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "picks_delete" ON "public"."picks" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."status" = 'active'::"text")))) AND (( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."games"
  WHERE (("games"."id" = "picks"."game_id") AND ("now"() < "games"."kickoff_utc"))))))));



CREATE POLICY "picks_insert" ON "public"."picks" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."status" = 'active'::"text")))) AND (( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."games"
  WHERE (("games"."id" = "picks"."game_id") AND ("now"() < "games"."kickoff_utc"))))))));



CREATE POLICY "picks_read" ON "public"."picks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "picks_update" ON "public"."picks" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."status" = 'active'::"text")))) AND (( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."games"
  WHERE (("games"."id" = "picks"."game_id") AND ("now"() < "games"."kickoff_utc")))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."status" = 'active'::"text")))) AND (( SELECT "public"."is_master"() AS "is_master") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."games"
  WHERE (("games"."id" = "picks"."game_id") AND ("now"() < "games"."kickoff_utc"))))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_master" ON "public"."profiles" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_master"() AS "is_master"));



CREATE POLICY "profiles_read" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'active'::"text") OR ("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_master"() AS "is_master")));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_master"() AS "is_master"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_master"() AS "is_master")));



ALTER TABLE "public"."scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scores_master_delete" ON "public"."scores" FOR DELETE TO "authenticated" USING ("public"."is_master"());



CREATE POLICY "scores_master_insert" ON "public"."scores" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_master"());



CREATE POLICY "scores_master_update" ON "public"."scores" FOR UPDATE TO "authenticated" USING ("public"."is_master"()) WITH CHECK ("public"."is_master"());



CREATE POLICY "scores_read" ON "public"."scores" FOR SELECT TO "authenticated", "anon" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."protect_profile_admin_fields"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;


















GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."comments" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."comments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."comments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_messages" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_messages" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."picks" TO "anon";
GRANT ALL ON TABLE "public"."picks" TO "authenticated";
GRANT ALL ON TABLE "public"."picks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scores" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scores" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scores" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































