// Shared types dùng chung giữa các subproblem SP1-SP6.

export type Difficulty = 'biet' | 'hieu' | 'van_dung' | 'unclassified';

export type QuestionType =
  | 'multiple_choice'   // trắc nghiệm 4 đáp án
  | 'short_answer'      // trả lời ngắn
  | 'true_false'        // đúng/sai
  | 'essay';            // tự luận

export interface QuestionRange {
  from: number;         // số câu bắt đầu (inclusive)
  to: number;           // số câu kết thúc (inclusive)
  type: QuestionType;
}

export interface RawQuestion {
  number: number;
  type: QuestionType;
  raw_content: string;
  options?: QuestionOption[] | null;
  answer?: string | null;
  explanation?: string | null;
}

export interface ClassifiedQuestion extends RawQuestion {
  difficulty: Difficulty;
}

export interface QuestionOption {
  key: 'A' | 'B' | 'C' | 'D' | 'a' | 'b' | 'c' | 'd';
  text: string;
}

export interface Question {
  id: string;
  chapter_id: string;
  source_file_id: string | null;
  question_number: number | null;
  type: QuestionType;
  difficulty: Difficulty;
  content: string;
  options: QuestionOption[] | null;
  answer: string | null;
  explanation: string | null;
  tags: string[];
  content_hash: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  name: string;
  subject: string | null;
  description: string | null;
  created_at: string;
}

export interface ExamMeta {
  school?: string;
  exam_title?: string;
  subject?: string;
  date?: string;
  duration?: string;
  constants?: string;
}

export interface ExamConfig {
  chapter_ids: string[];
  total_questions: number;
  by_difficulty: Partial<Record<Difficulty, number>>;
  by_type: Partial<Record<QuestionType, number>>;
  tags?: string[];
  random_seed: string;
  meta?: ExamMeta;
}

export interface Exam {
  id: string;
  name: string;
  config: ExamConfig;
  question_ids: string[];
  notes: string | null;
  created_at: string;
}
