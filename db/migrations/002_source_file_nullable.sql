-- 002_source_file_nullable.sql
-- Đảm bảo questions.source_file_id cho phép NULL và FK là ON DELETE SET NULL.
-- schema.sql đã khai báo đúng, migration này idempotent để đảm bảo môi trường cũ.

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_source_file_id_fkey;

ALTER TABLE questions
  ADD CONSTRAINT questions_source_file_id_fkey
  FOREIGN KEY (source_file_id)
  REFERENCES source_files(id)
  ON DELETE SET NULL;
