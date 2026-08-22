SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict IK8l1hpRVVmAvl13KUULGrEuPQG0vXo8HxnerbMeclfefLwyK5SzloV1bYX0LiC

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."games" ("id", "created_at", "game_id", "season", "week", "week_type", "away_team", "home_team", "kickoff_utc", "spread_home", "total", "status", "updated_at") FROM stdin;
676e3703-7794-4261-9901-630bd02ea1ee	2026-08-01 12:06:16.891603+00	2026_09_09_Seattle Seahawks_New England Patriots	2026	1	regular	New England Patriots	Seattle Seahawks	2026-09-10 00:20:00+00	-3.5	44.0	scheduled	2026-08-19 18:50:41.665349+00
2e7fac24-4b48-4d49-8073-1cac60289786	2026-08-01 12:06:16.891603+00	2026_09_10_Los Angeles Rams_San Francisco 49ers	2026	1	regular	San Francisco 49ers	Los Angeles Rams	2026-09-11 00:35:00+00	-3.5	48.0	scheduled	2026-08-19 18:50:41.665349+00
d02b3349-087e-464f-bc3b-4d0a274589c3	2026-08-01 12:06:16.891603+00	2026_09_13_Jacksonville Jaguars_Cleveland Browns	2026	1	regular	Cleveland Browns	Jacksonville Jaguars	2026-09-13 17:00:00+00	-7.5	40.0	scheduled	2026-08-19 18:50:41.665349+00
a79b1290-67c3-4335-961a-60327ac9ea65	2026-08-01 12:06:16.891603+00	2026_09_13_Cincinnati Bengals_Tampa Bay Buccaneers	2026	1	regular	Tampa Bay Buccaneers	Cincinnati Bengals	2026-09-13 17:00:00+00	-3.5	51.5	scheduled	2026-08-19 18:50:41.665349+00
7aa367ad-57e9-4cfe-9e62-f185b55ca51b	2026-08-01 12:06:16.891603+00	2026_09_13_Indianapolis Colts_Baltimore Ravens	2026	1	regular	Baltimore Ravens	Indianapolis Colts	2026-09-13 17:00:00+00	3.5	48.5	scheduled	2026-08-19 18:50:41.665349+00
d75ed168-e629-479f-8431-181fd7ab907e	2026-08-01 12:06:16.891603+00	2026_09_13_Pittsburgh Steelers_Atlanta Falcons	2026	1	regular	Atlanta Falcons	Pittsburgh Steelers	2026-09-13 17:00:00+00	-3.0	42.0	scheduled	2026-08-19 18:50:41.665349+00
bc845fd9-6ebb-461d-9906-2e54b62949be	2026-08-01 12:06:16.891603+00	2026_09_13_Houston Texans_Buffalo Bills	2026	1	regular	Buffalo Bills	Houston Texans	2026-09-13 17:00:00+00	0.0	44.5	scheduled	2026-08-19 18:50:41.665349+00
375b2380-a9c5-48ba-b807-b9691e1ee33b	2026-08-01 12:06:16.891603+00	2026_09_13_Carolina Panthers_Chicago Bears	2026	1	regular	Chicago Bears	Carolina Panthers	2026-09-13 17:00:00+00	3.0	47.0	scheduled	2026-08-19 18:50:41.665349+00
14039a85-041a-4493-a9cf-1e7dab8a1794	2026-08-01 12:06:16.891603+00	2026_09_13_Tennessee Titans_New York Jets	2026	1	regular	New York Jets	Tennessee Titans	2026-09-13 17:00:00+00	-2.5	39.5	scheduled	2026-08-19 18:50:41.665349+00
def39771-de9c-487d-b704-a9f352c2ed21	2026-08-01 12:06:16.891603+00	2026_09_13_Detroit Lions_New Orleans Saints	2026	1	regular	New Orleans Saints	Detroit Lions	2026-09-13 17:00:00+00	-7.0	49.0	scheduled	2026-08-19 18:50:41.665349+00
f6b22c75-9cb1-4c78-9b2b-ba772ae3f0e4	2026-08-01 12:06:16.891603+00	2026_09_13_Los Angeles Chargers_Arizona Cardinals	2026	1	regular	Arizona Cardinals	Los Angeles Chargers	2026-09-13 20:25:00+00	-10.0	46.0	scheduled	2026-08-19 18:50:41.665349+00
0fc0a7c8-5fd9-4209-b590-4f48697150d2	2026-08-01 12:06:16.891603+00	2026_09_13_Las Vegas Raiders_Miami Dolphins	2026	1	regular	Miami Dolphins	Las Vegas Raiders	2026-09-13 20:25:00+00	-3.5	40.5	scheduled	2026-08-19 18:50:41.665349+00
6b2d4fe5-e572-4c06-9763-166082159e34	2026-08-01 12:06:16.891603+00	2026_09_13_Philadelphia Eagles_Washington Commanders	2026	1	regular	Washington Commanders	Philadelphia Eagles	2026-09-13 20:25:00+00	-4.5	47.0	scheduled	2026-08-19 18:50:41.665349+00
edb5684f-fbc1-469f-9609-902aa1e8101d	2026-08-01 12:06:16.891603+00	2026_09_13_Minnesota Vikings_Green Bay Packers	2026	1	regular	Green Bay Packers	Minnesota Vikings	2026-09-13 20:25:00+00	-1.0	45.0	scheduled	2026-08-19 18:50:41.665349+00
a4873a76-2f67-446f-87f1-3889de410d12	2026-08-01 12:06:16.891603+00	2026_09_13_New York Giants_Dallas Cowboys	2026	1	regular	Dallas Cowboys	New York Giants	2026-09-14 00:20:00+00	3.0	48.0	scheduled	2026-08-19 18:50:41.665349+00
15ea98cb-396c-4307-820a-8ceef52909eb	2026-08-04 14:26:15.154531+00	2026_09_14_Kansas City Chiefs_Denver Broncos	2026	1	regular	Denver Broncos	Kansas City Chiefs	2026-09-15 00:15:00+00	-3.0	43.0	scheduled	2026-08-19 18:50:41.665349+00
\.


--
-- Data for Name: scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."scores" ("id", "created_at", "game_id", "away_score", "home_score", "status", "updated_at", "updated_by") FROM stdin;
\.


--
-- PostgreSQL database dump complete
--

-- \unrestrict IK8l1hpRVVmAvl13KUULGrEuPQG0vXo8HxnerbMeclfefLwyK5SzloV1bYX0LiC

RESET ALL;
