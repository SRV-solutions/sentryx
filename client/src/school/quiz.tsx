/** Piezas compartidas de los juegos de preguntas: tipos, colores y figuras de cada opción. */
import { Triangle, Diamond, Circle, Square } from 'lucide-react';

export interface QuizOption { text: string; correct: boolean }
export interface QuizQuestion { id: string; text: string; timeLimit: number; points: number; options: QuizOption[] }
export interface Quiz {
  id: number;
  title: string;
  description: string;
  subjectId: number | null;
  programUnitId: number | null;
  questions: QuizQuestion[];
  questionCount?: number;
  updatedAt: string;
  canEdit?: boolean;
  Subject?: { id: number; name: string } | null;
  ProgramUnit?: { id: number; title: string; order: number } | null;
}

export const TIME_LIMITS = [5, 10, 20, 30, 60, 90, 120];
export const POINTS = [
  { value: 1000, label: 'Normal' },
  { value: 2000, label: 'Doble' },
  { value: 0, label: 'Sin puntos (opinión)' },
];

const SHAPES = [Triangle, Diamond, Circle, Square];
/** Figura de cada opción (rojo triángulo, azul rombo, amarillo círculo, verde cuadrado). */
export const OptionShape = ({ index, size = 22 }: { index: number; size?: number }) => {
  const Shape = SHAPES[index % 4];
  return <span className="quiz-shape"><Shape size={size} fill="#fff" color="#fff" /></span>;
};

export const newQuestion = (): QuizQuestion => ({
  id: Math.random().toString(36).slice(2, 10),
  text: '',
  timeLimit: 20,
  points: 1000,
  options: [
    { text: '', correct: true },
    { text: '', correct: false },
    { text: '', correct: false },
    { text: '', correct: false },
  ],
});

/** Opciones vacías al final no se guardan (mínimo 2). */
export const cleanQuestion = (q: QuizQuestion): QuizQuestion => ({ ...q, options: q.options.filter((o, i) => o.text.trim() || i < 2) });

export const formatSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
