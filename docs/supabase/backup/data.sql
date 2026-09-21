SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict 5ZEl111KIgplYxbXQ7PQ1QBKjG8ITbeWNJ1NRuBwHGt51biCLiVReSy1XZsRd1u

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
676e3703-7794-4261-9901-630bd02ea1ee	2026-08-01 12:06:16.891603+00	2026_09_09_Seattle Seahawks_New England Patriots	2026	1	regular	New England Patriots	Seattle Seahawks	2026-09-10 00:20:00+00	-3.0	44.5	final	2026-09-15 11:05:02.120265+00
2e7fac24-4b48-4d49-8073-1cac60289786	2026-08-01 12:06:16.891603+00	2026_09_10_Los Angeles Rams_San Francisco 49ers	2026	1	regular	San Francisco 49ers	Los Angeles Rams	2026-09-11 00:35:00+00	-3.5	48.0	final	2026-09-15 11:05:02.120265+00
d02b3349-087e-464f-bc3b-4d0a274589c3	2026-08-01 12:06:16.891603+00	2026_09_13_Jacksonville Jaguars_Cleveland Browns	2026	1	regular	Cleveland Browns	Jacksonville Jaguars	2026-09-13 17:00:00+00	-8.0	40.5	final	2026-09-15 11:05:02.120265+00
a79b1290-67c3-4335-961a-60327ac9ea65	2026-08-01 12:06:16.891603+00	2026_09_13_Cincinnati Bengals_Tampa Bay Buccaneers	2026	1	regular	Tampa Bay Buccaneers	Cincinnati Bengals	2026-09-13 17:00:00+00	-3.5	50.5	final	2026-09-15 11:05:02.120265+00
7aa367ad-57e9-4cfe-9e62-f185b55ca51b	2026-08-01 12:06:16.891603+00	2026_09_13_Indianapolis Colts_Baltimore Ravens	2026	1	regular	Baltimore Ravens	Indianapolis Colts	2026-09-13 17:00:00+00	3.5	48.0	final	2026-09-15 11:05:02.120265+00
d75ed168-e629-479f-8431-181fd7ab907e	2026-08-01 12:06:16.891603+00	2026_09_13_Pittsburgh Steelers_Atlanta Falcons	2026	1	regular	Atlanta Falcons	Pittsburgh Steelers	2026-09-13 17:00:00+00	-3.5	41.5	final	2026-09-15 11:05:02.120265+00
bc845fd9-6ebb-461d-9906-2e54b62949be	2026-08-01 12:06:16.891603+00	2026_09_13_Houston Texans_Buffalo Bills	2026	1	regular	Buffalo Bills	Houston Texans	2026-09-13 17:00:00+00	1.0	44.5	final	2026-09-15 11:05:02.120265+00
375b2380-a9c5-48ba-b807-b9691e1ee33b	2026-08-01 12:06:16.891603+00	2026_09_13_Carolina Panthers_Chicago Bears	2026	1	regular	Chicago Bears	Carolina Panthers	2026-09-13 17:00:00+00	3.0	47.0	final	2026-09-15 11:05:02.120265+00
c6891132-344b-4b26-a718-173cc2353cec	2026-09-15 10:21:41.6878+00	2026_09_17_Buffalo Bills_Detroit Lions	2026	2	regular	Detroit Lions	Buffalo Bills	2026-09-18 00:15:00+00	-4.5	53.5	scheduled	2026-09-15 10:21:41.6878+00
72ed0064-4458-4ff6-ac1f-de18c35f69e0	2026-09-15 10:21:41.6878+00	2026_09_20_New York Jets_Green Bay Packers	2026	2	regular	Green Bay Packers	New York Jets	2026-09-20 17:00:00+00	4.0	44.5	scheduled	2026-09-15 10:21:41.6878+00
1be2ad11-2b0b-4a76-8133-8168abd35e73	2026-09-15 10:21:41.6878+00	2026_09_20_Chicago Bears_Minnesota Vikings	2026	2	regular	Minnesota Vikings	Chicago Bears	2026-09-20 17:00:00+00	-5.5	49.0	scheduled	2026-09-15 10:21:41.6878+00
cf7e42a7-d28a-431d-a38c-db553cca2df4	2026-09-15 10:21:41.6878+00	2026_09_20_New England Patriots_Pittsburgh Steelers	2026	2	regular	Pittsburgh Steelers	New England Patriots	2026-09-20 17:00:00+00	-5.0	41.5	scheduled	2026-09-15 10:21:41.6878+00
6f387e46-9917-4018-947d-56269579c703	2026-09-15 10:21:41.6878+00	2026_09_20_Atlanta Falcons_Carolina Panthers	2026	2	regular	Carolina Panthers	Atlanta Falcons	2026-09-20 17:00:00+00	1.0	44.0	scheduled	2026-09-15 10:21:41.6878+00
278c8979-2d62-46f2-a13a-c6751c5dc91f	2026-09-15 10:21:41.6878+00	2026_09_20_Tampa Bay Buccaneers_Cleveland Browns	2026	2	regular	Cleveland Browns	Tampa Bay Buccaneers	2026-09-20 17:00:00+00	-8.5	41.0	scheduled	2026-09-15 10:21:41.6878+00
2a562aa9-0384-4303-bd01-d451142dbe51	2026-09-15 10:21:41.6878+00	2026_09_20_Houston Texans_Cincinnati Bengals	2026	2	regular	Cincinnati Bengals	Houston Texans	2026-09-20 17:00:00+00	-3.0	46.5	scheduled	2026-09-15 10:21:41.6878+00
d0bddbaf-0d71-4bb5-9e99-87faba36b99b	2026-09-15 10:21:41.6878+00	2026_09_20_Baltimore Ravens_New Orleans Saints	2026	2	regular	New Orleans Saints	Baltimore Ravens	2026-09-20 17:00:00+00	-8.5	47.0	scheduled	2026-09-15 10:21:41.6878+00
44cd77da-ae0b-4c92-b8f9-2abb07c6b106	2026-09-15 10:21:41.6878+00	2026_09_20_Tennessee Titans_Philadelphia Eagles	2026	2	regular	Philadelphia Eagles	Tennessee Titans	2026-09-20 17:00:00+00	7.0	39.0	scheduled	2026-09-15 10:21:41.6878+00
0147a992-1c31-4332-9cdf-3921435b4d82	2026-09-15 10:21:41.6878+00	2026_09_20_Los Angeles Chargers_Las Vegas Raiders	2026	2	regular	Las Vegas Raiders	Los Angeles Chargers	2026-09-20 20:05:00+00	-7.0	43.5	scheduled	2026-09-15 10:21:41.6878+00
14039a85-041a-4493-a9cf-1e7dab8a1794	2026-08-01 12:06:16.891603+00	2026_09_13_Tennessee Titans_New York Jets	2026	1	regular	New York Jets	Tennessee Titans	2026-09-13 17:00:00+00	-1.5	39.5	final	2026-09-15 11:05:02.120265+00
def39771-de9c-487d-b704-a9f352c2ed21	2026-08-01 12:06:16.891603+00	2026_09_13_Detroit Lions_New Orleans Saints	2026	1	regular	New Orleans Saints	Detroit Lions	2026-09-13 17:00:00+00	-7.0	50.0	final	2026-09-15 11:05:02.120265+00
f6b22c75-9cb1-4c78-9b2b-ba772ae3f0e4	2026-08-01 12:06:16.891603+00	2026_09_13_Los Angeles Chargers_Arizona Cardinals	2026	1	regular	Arizona Cardinals	Los Angeles Chargers	2026-09-13 20:25:00+00	-8.5	47.0	final	2026-09-15 11:05:02.120265+00
0fc0a7c8-5fd9-4209-b590-4f48697150d2	2026-08-01 12:06:16.891603+00	2026_09_13_Las Vegas Raiders_Miami Dolphins	2026	1	regular	Miami Dolphins	Las Vegas Raiders	2026-09-13 20:25:00+00	-3.5	40.5	final	2026-09-15 11:05:02.120265+00
6b2d4fe5-e572-4c06-9763-166082159e34	2026-08-01 12:06:16.891603+00	2026_09_13_Philadelphia Eagles_Washington Commanders	2026	1	regular	Washington Commanders	Philadelphia Eagles	2026-09-13 20:25:00+00	-4.5	44.0	final	2026-09-15 11:05:02.120265+00
edb5684f-fbc1-469f-9609-902aa1e8101d	2026-08-01 12:06:16.891603+00	2026_09_13_Minnesota Vikings_Green Bay Packers	2026	1	regular	Green Bay Packers	Minnesota Vikings	2026-09-13 20:25:00+00	-1.5	46.0	final	2026-09-15 11:05:02.120265+00
a4873a76-2f67-446f-87f1-3889de410d12	2026-08-01 12:06:16.891603+00	2026_09_13_New York Giants_Dallas Cowboys	2026	1	regular	Dallas Cowboys	New York Giants	2026-09-14 00:20:00+00	3.0	48.0	final	2026-09-15 11:05:02.120265+00
15ea98cb-396c-4307-820a-8ceef52909eb	2026-08-04 14:26:15.154531+00	2026_09_14_Kansas City Chiefs_Denver Broncos	2026	1	regular	Denver Broncos	Kansas City Chiefs	2026-09-15 00:15:00+00	-2.5	43.5	final	2026-09-15 11:05:02.120265+00
3f07d8cd-61da-4c9c-9b81-faf8f93e3854	2026-09-15 10:21:41.6878+00	2026_09_20_Denver Broncos_Jacksonville Jaguars	2026	2	regular	Jacksonville Jaguars	Denver Broncos	2026-09-20 20:05:00+00	-2.5	44.5	scheduled	2026-09-15 10:21:41.6878+00
12670cee-8cb5-4db2-83fd-302841c9de38	2026-09-15 10:21:41.6878+00	2026_09_20_Dallas Cowboys_Washington Commanders	2026	2	regular	Washington Commanders	Dallas Cowboys	2026-09-20 20:25:00+00	-3.5	50.5	scheduled	2026-09-15 10:21:41.6878+00
6c9881c4-742c-4321-b3c2-c6c035820ca8	2026-09-15 10:21:41.6878+00	2026_09_20_Arizona Cardinals_Seattle Seahawks	2026	2	regular	Seattle Seahawks	Arizona Cardinals	2026-09-20 20:25:00+00	4.5	41.0	scheduled	2026-09-15 10:21:41.6878+00
63ed1468-8865-443b-9846-0137f9983841	2026-09-15 10:21:41.6878+00	2026_09_20_San Francisco 49ers_Miami Dolphins	2026	2	regular	Miami Dolphins	San Francisco 49ers	2026-09-20 20:25:00+00	-13.0	45.5	scheduled	2026-09-15 10:21:41.6878+00
fddfcd73-9719-44d1-b9c5-b2c40268d037	2026-09-15 10:21:41.6878+00	2026_09_20_Kansas City Chiefs_Indianapolis Colts	2026	2	regular	Indianapolis Colts	Kansas City Chiefs	2026-09-21 00:20:00+00	-6.5	47.5	scheduled	2026-09-15 10:21:41.6878+00
1a6b5c0a-efd8-4842-b653-bb15f6d50ce1	2026-09-15 10:21:41.6878+00	2026_09_21_Los Angeles Rams_New York Giants	2026	2	regular	New York Giants	Los Angeles Rams	2026-09-22 00:15:00+00	-7.0	48.5	scheduled	2026-09-15 10:21:41.6878+00
\.


--
-- Data for Name: scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."scores" ("id", "created_at", "game_id", "away_score", "home_score", "status", "updated_at", "updated_by") FROM stdin;
24c3fadb-b2c1-4eab-9de8-ff9767abd2d7	2026-09-15 11:01:36.41976+00	15ea98cb-396c-4307-820a-8ceef52909eb	10	31	final	2026-09-15 11:05:01.862447+00	\N
c7474dc9-7afc-4bda-be7a-0be0daa9e32e	2026-09-15 11:01:36.41976+00	a4873a76-2f67-446f-87f1-3889de410d12	20	28	final	2026-09-15 11:05:01.862447+00	\N
51e2b4a3-206e-4823-b6d4-8e35bf7b272d	2026-09-15 11:01:36.41976+00	edb5684f-fbc1-469f-9609-902aa1e8101d	22	39	final	2026-09-15 11:05:01.862447+00	\N
0dc43483-c52e-4c58-b418-50a5acd41fca	2026-09-15 11:01:36.41976+00	6b2d4fe5-e572-4c06-9763-166082159e34	22	24	final	2026-09-15 11:05:01.862447+00	\N
2530503e-ae91-40c3-bae4-1594130b1b80	2026-09-15 11:01:36.41976+00	0fc0a7c8-5fd9-4209-b590-4f48697150d2	13	27	final	2026-09-15 11:05:01.862447+00	\N
871919e5-6aea-448e-bb19-a7e827812ad9	2026-09-15 11:01:36.41976+00	f6b22c75-9cb1-4c78-9b2b-ba772ae3f0e4	26	14	final	2026-09-15 11:05:01.862447+00	\N
8ad41548-08e3-4d3d-9fec-afb3af2050ec	2026-09-15 11:01:36.41976+00	def39771-de9c-487d-b704-a9f352c2ed21	30	31	final	2026-09-15 11:05:01.862447+00	\N
8a1bf4cb-9479-4256-a5c2-f5cf4e31df4d	2026-09-15 11:01:36.41976+00	14039a85-041a-4493-a9cf-1e7dab8a1794	23	10	final	2026-09-15 11:05:01.862447+00	\N
662043f9-59a4-4322-ac2a-1160eb3fe6f9	2026-09-15 11:01:36.41976+00	375b2380-a9c5-48ba-b807-b9691e1ee33b	59	37	final	2026-09-15 11:05:01.862447+00	\N
910ba238-deb3-4b2c-99b8-0fc564606dbe	2026-09-15 11:01:36.41976+00	bc845fd9-6ebb-461d-9906-2e54b62949be	36	31	final	2026-09-15 11:05:01.862447+00	\N
8fc5b391-f563-4677-b693-a9f75cab97cd	2026-09-15 11:01:36.41976+00	d75ed168-e629-479f-8431-181fd7ab907e	13	20	final	2026-09-15 11:05:01.862447+00	\N
e1aa5404-fe97-43f7-b05c-dcc93b7f6eea	2026-09-15 11:01:36.41976+00	7aa367ad-57e9-4cfe-9e62-f185b55ca51b	41	23	final	2026-09-15 11:05:01.862447+00	\N
728ce3ab-df00-41dd-afff-7dc087ccc030	2026-09-15 11:01:36.41976+00	a79b1290-67c3-4335-961a-60327ac9ea65	27	33	final	2026-09-15 11:05:01.862447+00	\N
304fb61c-7441-4286-8b4b-ef3ca665d353	2026-09-15 11:01:36.41976+00	d02b3349-087e-464f-bc3b-4d0a274589c3	10	34	final	2026-09-15 11:05:01.862447+00	\N
16160f3b-3abf-42c4-a620-a5182113beed	2026-09-15 11:01:36.41976+00	2e7fac24-4b48-4d49-8073-1cac60289786	27	7	final	2026-09-15 11:05:01.862447+00	\N
fb8854a7-78d4-41c5-b2ee-4b365cbdf242	2026-09-15 11:01:36.41976+00	676e3703-7794-4261-9901-630bd02ea1ee	10	13	final	2026-09-15 11:05:01.862447+00	\N
\.


--
-- PostgreSQL database dump complete
--

-- \unrestrict 5ZEl111KIgplYxbXQ7PQ1QBKjG8ITbeWNJ1NRuBwHGt51biCLiVReSy1XZsRd1u

RESET ALL;
