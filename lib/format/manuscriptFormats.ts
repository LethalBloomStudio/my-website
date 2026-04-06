export type FormatId =
  | 'minimal' | 'standard' | 'novel' | 'screenplay' | 'poetry'
  | 'academic' | 'short_story' | 'childrens' | 'literary'
  | 'dark_moody' | 'airy' | 'typewriter'
  | 'romance' | 'thriller' | 'fantasy';

export interface ManuscriptFormat {
  id: FormatId;
  label: string;
  description: string;
  editorFont: string;
  editorSize: string;
  lineHeight: string;
  maxWidth: string;
  letterSpacing: string;
  textAlign: 'left' | 'center' | 'justify';
  paragraphIndent: string; // '\t' or ''
  chapterFont: string;
  chapterSize: string;
  chapterAlign: 'left' | 'center';
}

export const FORMATS: Record<FormatId, ManuscriptFormat> = {
  minimal: {
    id: 'minimal', label: 'Minimal',
    description: 'Clean, distraction-free. No imposed structure.',
    editorFont: 'Georgia, serif', editorSize: '1.0625rem', lineHeight: '2',
    maxWidth: '42rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: 'Georgia, serif', chapterSize: '0.875rem', chapterAlign: 'left',
  },
  standard: {
    id: 'standard', label: 'Standard Manuscript',
    description: 'Industry standard: Courier 12pt, double-spaced, indented paragraphs.',
    editorFont: '"Courier New", Courier, monospace', editorSize: '1rem', lineHeight: '2',
    maxWidth: '38rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: '"Courier New", Courier, monospace', chapterSize: '1rem', chapterAlign: 'center',
  },
  novel: {
    id: 'novel', label: 'Trade Novel',
    description: 'Georgia, 1.8 line height, justified, first-line indent.',
    editorFont: 'Georgia, "Times New Roman", serif', editorSize: '1.0625rem', lineHeight: '1.85',
    maxWidth: '40rem', letterSpacing: '0.01em', textAlign: 'justify', paragraphIndent: '\t',
    chapterFont: 'Georgia, "Times New Roman", serif', chapterSize: '1.125rem', chapterAlign: 'center',
  },
  screenplay: {
    id: 'screenplay', label: 'Screenplay',
    description: 'Courier 12pt, action-block spacing, no indent.',
    editorFont: '"Courier New", Courier, monospace', editorSize: '1rem', lineHeight: '1.75',
    maxWidth: '44rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '',
    chapterFont: '"Courier New", Courier, monospace', chapterSize: '1rem', chapterAlign: 'center',
  },
  poetry: {
    id: 'poetry', label: 'Poetry',
    description: 'Centered text, generous line spacing, no indent.',
    editorFont: 'Georgia, serif', editorSize: '1.125rem', lineHeight: '2.25',
    maxWidth: '34rem', letterSpacing: '0.02em', textAlign: 'center', paragraphIndent: '',
    chapterFont: 'Georgia, serif', chapterSize: '1rem', chapterAlign: 'center',
  },
  academic: {
    id: 'academic', label: 'Academic / Thesis',
    description: 'Times New Roman, double-spaced, indented paragraphs. APA/MLA ready.',
    editorFont: '"Times New Roman", Times, serif', editorSize: '1rem', lineHeight: '2',
    maxWidth: '38rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: '"Times New Roman", Times, serif', chapterSize: '1rem', chapterAlign: 'center',
  },
  short_story: {
    id: 'short_story', label: 'Short Story',
    description: 'Courier, tighter column, quick punchy pacing.',
    editorFont: '"Courier New", Courier, monospace', editorSize: '0.9375rem', lineHeight: '1.9',
    maxWidth: '34rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: '"Courier New", Courier, monospace', chapterSize: '0.9375rem', chapterAlign: 'left',
  },
  childrens: {
    id: 'childrens', label: "Children's Book",
    description: 'Large, friendly font. Wide spacing. Very short column.',
    editorFont: 'Georgia, serif', editorSize: '1.375rem', lineHeight: '2.4',
    maxWidth: '28rem', letterSpacing: '0.01em', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: 'Georgia, serif', chapterSize: '1.25rem', chapterAlign: 'center',
  },
  literary: {
    id: 'literary', label: 'Literary Fiction',
    description: 'Elegant serif, loose tracking, space-separated paragraphs, no indent.',
    editorFont: 'Georgia, "Times New Roman", serif', editorSize: '1.0625rem', lineHeight: '1.9',
    maxWidth: '40rem', letterSpacing: '0.015em', textAlign: 'left', paragraphIndent: '',
    chapterFont: 'Georgia, serif', chapterSize: '1rem', chapterAlign: 'left',
  },
  dark_moody: {
    id: 'dark_moody', label: 'Dark & Moody',
    description: 'Small tight type, compressed leading. Gothic intensity.',
    editorFont: 'Georgia, serif', editorSize: '0.9375rem', lineHeight: '1.65',
    maxWidth: '36rem', letterSpacing: '0.005em', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: 'Georgia, serif', chapterSize: '0.875rem', chapterAlign: 'left',
  },
  airy: {
    id: 'airy', label: 'Airy / Modern',
    description: 'System sans-serif, wide margins, generous whitespace.',
    editorFont: 'system-ui, -apple-system, sans-serif', editorSize: '1.0625rem', lineHeight: '2.1',
    maxWidth: '44rem', letterSpacing: '0.01em', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: 'system-ui, sans-serif', chapterSize: '0.875rem', chapterAlign: 'left',
  },
  typewriter: {
    id: 'typewriter', label: 'Classic Typewriter',
    description: 'Full Courier, tight and old-school. Every word counts.',
    editorFont: '"Courier New", Courier, monospace', editorSize: '0.9375rem', lineHeight: '1.75',
    maxWidth: '36rem', letterSpacing: '0.02em', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: '"Courier New", Courier, monospace', chapterSize: '0.9375rem', chapterAlign: 'left',
  },
  romance: {
    id: 'romance', label: 'Romance',
    description: 'Flowing serif, warm and inviting, italic chapter headings.',
    editorFont: 'Georgia, serif', editorSize: '1.125rem', lineHeight: '2',
    maxWidth: '40rem', letterSpacing: '0.01em', textAlign: 'justify', paragraphIndent: '\t',
    chapterFont: 'Georgia, serif', chapterSize: '1.125rem', chapterAlign: 'center',
  },
  thriller: {
    id: 'thriller', label: 'Thriller / Crime',
    description: 'Tight Courier, narrow column. Short sentences hit harder.',
    editorFont: '"Courier New", Courier, monospace', editorSize: '0.9375rem', lineHeight: '1.8',
    maxWidth: '32rem', letterSpacing: '0', textAlign: 'left', paragraphIndent: '\t',
    chapterFont: '"Courier New", Courier, monospace', chapterSize: '0.9375rem', chapterAlign: 'left',
  },
  fantasy: {
    id: 'fantasy', label: 'Fantasy / Epic',
    description: 'Wide serif, generous leading. Room for worlds to breathe.',
    editorFont: 'Georgia, serif', editorSize: '1.125rem', lineHeight: '2.1',
    maxWidth: '46rem', letterSpacing: '0.015em', textAlign: 'justify', paragraphIndent: '\t',
    chapterFont: 'Georgia, serif', chapterSize: '1.25rem', chapterAlign: 'center',
  },
};

export const FORMAT_ORDER: FormatId[] = [
  'minimal', 'standard', 'novel', 'screenplay', 'poetry',
  'academic', 'short_story', 'childrens', 'literary',
  'dark_moody', 'airy', 'typewriter',
  'romance', 'thriller', 'fantasy',
];
