-- ==========================================================================
-- Question Bank & Exam Mixer — Postgres Schema
-- Chạy trực tiếp trên Supabase SQL Editor.
-- Idempotent: dùng IF NOT EXISTS ở mọi chỗ để re-run được.
-- ==========================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()

-- 2. Table: chapters
CREATE TABLE IF NOT EXISTS chapters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  subject      text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: source_files
-- Feature #2: lưu file gốc. Feature #14: idempotent upload qua file_hash UNIQUE.
CREATE TABLE IF NOT EXISTS source_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id    uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  storage_path  text NOT NULL,
  file_hash     text NOT NULL UNIQUE,
  file_size     integer,
  mime_type     text,
  structure     jsonb NOT NULL,
  status        text NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  error_log     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_files_chapter ON source_files(chapter_id);

-- 4. Table: questions
-- Feature #1: dedup qua content_hash UNIQUE.
-- Feature #3: tags text[] với GIN index.
-- Feature #13: difficulty có thể là 'unclassified'.
CREATE TABLE IF NOT EXISTS questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id        uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  source_file_id    uuid REFERENCES source_files(id) ON DELETE SET NULL,
  question_number   integer,
  type              text NOT NULL CHECK (type IN (
                        'multiple_choice','short_answer','true_false','essay'
                    )),
  difficulty        text NOT NULL DEFAULT 'unclassified' CHECK (difficulty IN (
                        'biet','hieu','van_dung','unclassified'
                    )),
  content           text NOT NULL,
  options           jsonb,
  answer            text,
  explanation       text,
  tags              text[] NOT NULL DEFAULT '{}',
  content_hash      text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_content_hash
  ON questions(content_hash);

CREATE INDEX IF NOT EXISTS idx_questions_filter
  ON questions(chapter_id, difficulty, type);

CREATE INDEX IF NOT EXISTS idx_questions_tags
  ON questions USING gin(tags);

-- 5. Table: exams (Feature #4: lịch sử đề, tái tạo được)
CREATE TABLE IF NOT EXISTS exams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  config        jsonb NOT NULL,
  question_ids  uuid[] NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exams_created ON exams(created_at DESC);

-- 6. Row Level Security (RLS)
-- Bật RLS ở mọi bảng, KHÔNG tạo policy → mặc định deny cho anon.
-- Backend dùng service_role sẽ bypass RLS.
ALTER TABLE chapters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams         ENABLE ROW LEVEL SECURITY;

-- 7. Storage bucket cho file gốc (Feature #2)
-- Chạy TAY trong Supabase Dashboard > Storage:
--   - Tạo bucket "sources"
--   - Private (không public)
--   - Path convention: sources/{chapter_id}/{file_hash}.{ext}

-- ==========================================================================
-- CHECK sau khi chạy:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
--   → phải thấy: chapters, source_files, questions, exams
-- ==========================================================================
