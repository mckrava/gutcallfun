-- ============================================================================
-- SEED: 50 fake users with resolved game activity, for populating leaderboards
-- ============================================================================
--
-- WHAT THIS DOES
--   Inserts 50 clearly-fake users, joins each to a deterministic subset of the
--   FINISHED games that have resolved questions, and writes one
--   `user_game_answer` row per question they "answered" — with awarded_points
--   computed the same way `question-resolution.service.ts` computes them.
--
-- WHY IT WRITES ANSWERS AND NOT total_points
--   Every leaderboard is DERIVED at query time from `user_game_answer`
--   (see the header block in modules/api/leaderboard/leaderboard.service.ts).
--   `user_score_profile.total_points` is a decorative cache that nothing ranks
--   on — writing it alone (as scripts/seed-profiles.ts does) moves no board.
--   This script writes the answers first and then recomputes the counters from
--   them, so the derived boards and the cached counters agree.
--
-- SCORING RULE (LOCKED — do not recalibrate)
--   correct pick : reward_multiplier 1.000, awarded_points = winning option's
--                  base_gain (5 fizzles / 7 danger / 15 shot / 100 goal)
--   wrong pick   : reward_multiplier 0.000, awarded_points = 0
--   base_gain is always read from game_question_option, never hardcoded here.
--
-- DETERMINISTIC
--   User uuids are fixed ('00000000-0000-4000-8000-<index>'), and every
--   "did they answer / did they get it right / which wrong option" decision is
--   an md5 hash of (user_id, question_id) — not random(). Re-running produces
--   byte-identical scores.
--
-- RUN
--   psql "postgres://gutcallfun:changeme-local-only@127.0.0.1:5488/gutcallfun" \
--     -f apps/gutcallfun-core/scripts/seed-fake-leaderboard.sql
--
--   Safe to re-run: the cleanup block at the top removes the previous run
--   first. It matches ONLY on the 'FAKE' wallet prefix and squad ids 901-903,
--   so real users and real squads are never touched.
--
-- UNDO
--   Run just the CLEANUP section below (lines up to "-- 1. USERS"), wrapped in
--   its own BEGIN/COMMIT.
--
-- PREREQUISITE
--   At least one game with status='finished' and resolved questions. If there
--   are none the script still runs and simply produces users with no activity
--   (the final verification SELECTs will show zeros).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. CLEANUP — remove any prior run of THIS seed, FK-safe order
-- ============================================================================

DELETE FROM user_game_answer
 WHERE user_id IN (SELECT id FROM "user" WHERE wallet_address LIKE 'FAKE%');

DELETE FROM user_game
 WHERE user_id IN (SELECT id FROM "user" WHERE wallet_address LIKE 'FAKE%');

-- Covers both fake members of real squads and any member of the seeded squads.
DELETE FROM squad_participant
 WHERE user_id IN (SELECT id FROM "user" WHERE wallet_address LIKE 'FAKE%')
    OR squad_id BETWEEN 901 AND 903;

DELETE FROM "user" WHERE wallet_address LIKE 'FAKE%';

-- Only the seeded profiles: their ids embed the fixed fake-uuid prefix.
DELETE FROM user_score_profile WHERE id LIKE 'usp_00000000-0000-4000-8000-%';

DELETE FROM squad WHERE id BETWEEN 901 AND 903;
DELETE FROM squad_score_profile WHERE id IN ('ssp_901', 'ssp_902', 'ssp_903');

-- ============================================================================
-- 1. USERS — 50 fake accounts with deterministic ids
-- ============================================================================
--
-- squad_bucket decides squad membership later:
--   0        -> no squad (exercises the solo-participant path)
--   1        -> squad 1, the existing real squad (see section 3b)
--   901..903 -> the seeded fake squads
--
-- skill is the per-user hit rate, spread ~0.15..0.55 by a hash of the uuid so
-- the ranking is not simply the insertion order.

CREATE TEMP TABLE seed_user ON COMMIT DROP AS
WITH names(i, handle, emoji) AS (
  VALUES
    ( 1, 'pitch_prophet',   '🔮'), ( 2, 'volley_vera',     '⚡'),
    ( 3, 'nutmeg_nico',     '🥜'), ( 4, 'header_hana',     '🎯'),
    ( 5, 'offside_omar',    '🚩'), ( 6, 'counter_kira',    '🏃'),
    ( 7, 'sweeper_sam',     '🧹'), ( 8, 'far_post_fin',    '📮'),
    ( 9, 'tiki_taka_tom',   '🎼'), (10, 'gegen_greta',     '🔥'),
    (11, 'boot_room_bea',   '👟'), (12, 'chalk_on_boots',  '🥅'),
    (13, 'late_runner_lu',  '⏱'), (14, 'park_the_bus',    '🚌'),
    (15, 'panenka_pete',    '🪶'), (16, 'rabona_rosa',     '🩰'),
    (17, 'top_bins_teo',    '🗑'), (18, 'clean_sheet_cleo','🧊'),
    (19, 'derby_dana',      '🏟'), (20, 'stoppage_stig',   '⏳'),
    (21, 'wing_back_wes',   '🪽'), (22, 'false_nine_fay',  '9️⃣'),
    (23, 'low_block_leo',   '🧱'), (24, 'high_line_hugo',  '📏'),
    (25, 'set_piece_saskia','📐'), (26, 'through_ball_tia','🪡'),
    (27, 'first_touch_finn','🤏'), (28, 'box_to_box_bo',   '🔁'),
    (29, 'target_man_theo', '🗼'), (30, 'poacher_pia',     '🦊'),
    (31, 'byline_bram',     '📍'), (32, 'cutback_cara',    '↩️'),
    (33, 'overlap_otto',    '🔀'), (34, 'press_trigger',   '🎚'),
    (35, 'half_space_hal',  '◧'),  (36, 'switch_play_sia', '↔️'),
    (37, 'long_ball_lars',  '🏹'), (38, 'dink_dora',       '🪁'),
    (39, 'chip_shot_chad',  '🍟'), (40, 'curler_cass',     '🌀'),
    (41, 'one_two_uma',     '2️⃣'), (42, 'give_and_go_gil', '🤝'),
    (43, 'last_ditch_lena', '🛡'), (44, 'goal_line_gus',   '🥅'),
    (45, 'extra_time_evie', '➕'), (46, 'shootout_shay',   '🎲'),
    (47, 'terrace_tobi',    '🪧'), (48, 'away_end_ada',    '✈️'),
    (49, 'match_day_milo',  '📅'), (50, 'full_time_fritz', '🔔')
)
SELECT
  n.i,
  ('00000000-0000-4000-8000-' || lpad(n.i::text, 12, '0'))::uuid       AS user_id,
  'usp_00000000-0000-4000-8000-' || lpad(n.i::text, 12, '0')           AS profile_id,
  'FAKE' || upper(md5('gutcall-fake-wallet-' || n.i::text))            AS wallet_address,
  -- GC-XXXX-XXXX, Crockford-safe chars only. The trailing hex index makes the
  -- code unique by construction rather than by luck.
  'GC-' || upper(substr(md5('gutcall-fake-share-' || n.i::text), 1, 4))
        || '-F' || lpad(upper(to_hex(n.i)), 3, '0')                    AS share_code,
  n.handle,
  n.emoji,
  -- Hit rate 0.15 .. 0.55.
  0.15 + 0.40 * (('x' || substr(md5('skill-' || n.i::text), 1, 8))::bit(32)::bigint)::float8
                / 4294967295.0                                         AS skill,
  -- 8 users into the real squad 1, the rest spread over 901-903, 6 squadless.
  CASE
    WHEN n.i <= 8  THEN 1
    WHEN n.i <= 22 THEN 901
    WHEN n.i <= 36 THEN 902
    WHEN n.i <= 44 THEN 903
    ELSE 0
  END                                                                  AS squad_bucket,
  -- Staggered so the leaderboard's `ORDER BY total_points DESC, created_at ASC`
  -- tiebreak is deterministic.
  now() - ((60 - n.i) || ' minutes')::interval                         AS created_at
FROM names n;

-- Reversed FK: user.score_profile -> user_score_profile.id, so profiles first.
INSERT INTO user_score_profile (id, total_points, games_played)
SELECT profile_id, 0, 0 FROM seed_user;

INSERT INTO "user" (id, wallet_address, share_code, handle, emoji, score_profile, created_at)
SELECT user_id, wallet_address, share_code, handle, emoji, profile_id, created_at
FROM seed_user;

-- ============================================================================
-- 2. ELIGIBLE GAMES — finished, with at least one resolved question
-- ============================================================================
-- Discovered dynamically: nothing below hardcodes a game, question or option id.

CREATE TEMP TABLE seed_game ON COMMIT DROP AS
SELECT g.id AS game_id,
       row_number() OVER (ORDER BY g.id) - 1 AS gidx,
       count(*) OVER ()                      AS game_count
FROM game g
WHERE g.status = 'finished'
  AND EXISTS (
    SELECT 1 FROM game_question q
     WHERE q.game_id = g.id
       AND q.state = 'resolved'
       AND q.resolved_option_id IS NOT NULL
  );

-- ============================================================================
-- 3. SQUADS
-- ============================================================================

-- 3a. Three seeded squads. Ids 901-903 sit far above anything SquadsService
--     allocates (it uses max(id)+1), so they cannot collide.
INSERT INTO squad_score_profile (id, total_points, games_played) VALUES
  ('ssp_901', 0, 0), ('ssp_902', 0, 0), ('ssp_903', 0, 0);

INSERT INTO squad (id, name, emoji, invite_code, active) VALUES
  (901, 'Total Football FC', '🟠', 'FAKE01', true),
  (902, 'Catenaccio Crew',   '🔵', 'FAKE02', true),
  (903, 'Long Ball Legion',  '🟢', 'FAKE03', true);

INSERT INTO squad_participant (squad_id, user_id, active, score_profile)
SELECT squad_bucket, user_id, true, 'ssp_' || squad_bucket
FROM seed_user
WHERE squad_bucket BETWEEN 901 AND 903;

-- 3b. ---- OPTIONAL BLOCK: stuff the EXISTING squad 1 with 8 fake rivals ----
--     Purpose: give the real local squad a populated leaderboard to look at.
--     Delete this one statement (and change `WHEN n.i <= 8 THEN 1` above to
--     `THEN 0`) if you'd rather leave squad 1 alone. Guarded by EXISTS so the
--     script still runs on a DB where squad 1 was never created.
--     NOTE: squad 1's own `ssp_1` counter is deliberately NOT recomputed in
--     section 6 — this seed does not mutate real rows beyond adding members.
--     Its derived board (7c) is correct regardless; only the decorative
--     counter, which nothing ranks on, stays at its pre-seed value.
INSERT INTO squad_participant (squad_id, user_id, active, score_profile)
SELECT 1, su.user_id, true,
       (SELECT sp.id FROM squad_score_profile sp WHERE sp.id = 'ssp_1')
FROM seed_user su
WHERE su.squad_bucket = 1
  AND EXISTS (SELECT 1 FROM squad s WHERE s.id = 1);
-- ---- END OPTIONAL BLOCK --------------------------------------------------

-- ============================================================================
-- 4. GAME PARTICIPATION — user_game rows
-- ============================================================================
-- Each user joins 2-4 of the eligible games (or all of them, if fewer exist).
-- The squad_id here is what the leaderboard reads for squad attribution — NOT
-- squad_participant — so it must match the user's squad or squad boards
-- score them zero.

CREATE TEMP TABLE seed_join ON COMMIT DROP AS
SELECT
  su.user_id,
  sg.game_id,
  CASE WHEN su.squad_bucket = 0 THEN NULL ELSE su.squad_bucket END AS squad_id,
  su.skill
FROM seed_user su
CROSS JOIN seed_game sg
WHERE
  -- Rotate each user's window over the game list so they don't all pile into
  -- game #1, then take the first 2-4 games of their rotated view.
  ((sg.gidx
    - (('x' || substr(md5('rot-' || su.user_id::text), 1, 8))::bit(32)::bigint % sg.game_count)
    + sg.game_count) % sg.game_count)
  < least(
      sg.game_count,
      2 + (('x' || substr(md5('games-' || su.user_id::text), 1, 8))::bit(32)::bigint % 3)
    );

INSERT INTO user_game (game_id, user_id, squad_id, joined_at)
SELECT sj.game_id,
       sj.user_id,
       sj.squad_id,
       -- Just before the game's first question opened.
       COALESCE((SELECT min(q.created_at) FROM game_question q WHERE q.game_id = sj.game_id),
                now()) - interval '3 minutes'
FROM seed_join sj;

-- ============================================================================
-- 5. ANSWERS — the rows every leaderboard actually sums
-- ============================================================================

CREATE TEMP TABLE seed_answer ON COMMIT DROP AS
WITH resolved_q AS (
  SELECT q.id, q.game_id, q.resolved_option_id, q.resolved_at, q.created_at
  FROM game_question q
  WHERE q.state = 'resolved'
    AND q.resolved_option_id IS NOT NULL
),
-- Every non-winning option of each question, indexed so a hash can pick one.
wrong_option AS (
  SELECT o.game_question_id,
         o.id AS option_id,
         row_number() OVER (PARTITION BY o.game_question_id ORDER BY o.display_order) - 1 AS widx,
         count(*)     OVER (PARTITION BY o.game_question_id) AS wcount
  FROM game_question_option o
  JOIN resolved_q rq ON rq.id = o.game_question_id
  WHERE o.id <> rq.resolved_option_id
),
candidate AS (
  SELECT
    sj.user_id,
    sj.game_id,
    rq.id AS question_id,
    rq.resolved_option_id,
    rq.resolved_at,
    rq.created_at AS q_created_at,
    sj.skill,
    -- Independent hashes: one decides "did they answer", one "were they right",
    -- one "which wrong option". Salted so they can't correlate.
    (('x' || substr(md5('ans-'   || sj.user_id::text || rq.id::text), 1, 8))::bit(32)::bigint)::float8
      / 4294967295.0 AS h_answer,
    (('x' || substr(md5('hit-'   || sj.user_id::text || rq.id::text), 1, 8))::bit(32)::bigint)::float8
      / 4294967295.0 AS h_hit,
    ('x' || substr(md5('wrong-' || sj.user_id::text || rq.id::text), 1, 8))::bit(32)::bigint
      AS h_wrong
  FROM seed_join sj
  JOIN resolved_q rq ON rq.game_id = sj.game_id
),
answered AS (
  -- Participation rate 0.60..0.90, per user, deterministic.
  SELECT c.*,
         0.60 + 0.30 * (('x' || substr(md5('part-' || c.user_id::text), 1, 8))::bit(32)::bigint)::float8
                       / 4294967295.0 AS answer_rate
  FROM candidate c
)
SELECT
  a.user_id,
  a.game_id,
  a.question_id,
  (a.h_hit < a.skill) AS is_correct,
  CASE
    WHEN a.h_hit < a.skill THEN a.resolved_option_id
    ELSE (SELECT w.option_id
            FROM wrong_option w
           WHERE w.game_question_id = a.question_id
             AND w.widx = (a.h_wrong % w.wcount))
  END AS selected_option_id,
  -- Picked a few seconds inside the 5s window, resolved with the question.
  a.resolved_at - interval '4 seconds' AS created_at,
  a.resolved_at
FROM answered a
WHERE a.h_answer < a.answer_rate;

INSERT INTO user_game_answer (
  user_id, game_id, game_question_id, selected_option_id,
  reward_multiplier, awarded_points, successful_outcome, created_at, resolved_at
)
SELECT
  sa.user_id,
  sa.game_id,
  sa.question_id,
  sa.selected_option_id,
  CASE WHEN sa.is_correct THEN 1.000 ELSE 0.000 END,
  -- base_gain is read from the option, never hardcoded. A correct pick's
  -- selected option IS the winning option, so this is its frozen base_gain.
  CASE WHEN sa.is_correct THEN o.base_gain ELSE 0 END,
  sa.is_correct,
  sa.created_at,
  sa.resolved_at
FROM seed_answer sa
JOIN game_question_option o ON o.id = sa.selected_option_id
-- Defensive: a question with no non-winning option would yield NULL here, and
-- selected_option_id is NOT NULL. Skip rather than abort the whole seed.
WHERE sa.selected_option_id IS NOT NULL;

-- ============================================================================
-- 6. RECONCILE THE DECORATIVE COUNTERS
-- ============================================================================
-- Nothing ranks on these, but GET /users/:id/score-profile and the squad
-- aggregates read them, so keep them consistent with the answers just written.

UPDATE user_score_profile usp
   SET total_points = agg.pts,
       games_played = agg.games,
       updated_at   = now()
  FROM (
    SELECT su.profile_id,
           COALESCE((SELECT sum(uga.awarded_points)
                       FROM user_game_answer uga
                      WHERE uga.user_id = su.user_id
                        AND uga.awarded_points IS NOT NULL), 0) AS pts,
           (SELECT count(*) FROM user_game ug WHERE ug.user_id = su.user_id) AS games
    FROM seed_user su
  ) agg
 WHERE usp.id = agg.profile_id;

UPDATE squad_score_profile ssp
   SET total_points = agg.pts,
       games_played = agg.games,
       updated_at   = now()
  FROM (
    SELECT 'ssp_' || ug.squad_id AS profile_id,
           COALESCE(sum(uga.awarded_points), 0)  AS pts,
           count(DISTINCT ug.game_id)            AS games
    FROM user_game ug
    LEFT JOIN user_game_answer uga
           ON uga.user_id = ug.user_id
          AND uga.game_id = ug.game_id
          AND uga.awarded_points IS NOT NULL
    WHERE ug.squad_id BETWEEN 901 AND 903
    GROUP BY ug.squad_id
  ) agg
 WHERE ssp.id = agg.profile_id;

COMMIT;

-- ============================================================================
-- 7. VERIFICATION — what the app will now show
-- ============================================================================

-- 7a. Global board, top 15 (mirrors LeaderboardService with no scope).
SELECT RANK() OVER (ORDER BY s.total_points DESC) AS rank,
       u.handle, u.emoji, s.total_points
FROM (
  SELECT u.id AS user_id,
         COALESCE(sum(uga.awarded_points), 0) AS total_points
  FROM "user" u
  LEFT JOIN user_game_answer uga
         ON uga.user_id = u.id AND uga.awarded_points IS NOT NULL
  GROUP BY u.id
) s
JOIN "user" u ON u.id = s.user_id
ORDER BY s.total_points DESC, u.created_at ASC
LIMIT 15;

-- 7b. Per-game boards: top 5 of each finished game that has activity.
SELECT g.id AS game_id,
       g.team1_name || ' v ' || g.team2_name AS match,
       u.handle,
       sum(uga.awarded_points) AS points,
       count(*)                AS answers
FROM user_game ug
JOIN game g   ON g.id = ug.game_id
JOIN "user" u ON u.id = ug.user_id
JOIN user_game_answer uga
     ON uga.user_id = ug.user_id
    AND uga.game_id = ug.game_id
    AND uga.awarded_points IS NOT NULL
GROUP BY g.id, g.team1_name, g.team2_name, u.handle
ORDER BY g.id, points DESC;

-- 7c. Squad boards — points attributed via user_game.squad_id, exactly as the
--     leaderboard's squad-scoped EXISTS subquery does.
SELECT s.id AS squad_id, s.name, u.handle,
       COALESCE(sum(uga.awarded_points), 0) AS points
FROM squad s
JOIN squad_participant sp ON sp.squad_id = s.id AND sp.active
JOIN "user" u             ON u.id = sp.user_id
LEFT JOIN user_game ug    ON ug.user_id = u.id AND ug.squad_id = s.id
LEFT JOIN user_game_answer uga
       ON uga.user_id = ug.user_id
      AND uga.game_id = ug.game_id
      AND uga.awarded_points IS NOT NULL
GROUP BY s.id, s.name, u.handle
ORDER BY s.id, points DESC;

-- 7d. Sanity: distribution shape and hit rates.
SELECT count(*)                                     AS fake_users,
       sum(usp.total_points)                        AS total_points,
       round(avg(usp.total_points))                 AS avg_points,
       max(usp.total_points)                        AS best,
       min(usp.total_points)                        AS worst
FROM "user" u
JOIN user_score_profile usp ON usp.id = u.score_profile
WHERE u.wallet_address LIKE 'FAKE%';
