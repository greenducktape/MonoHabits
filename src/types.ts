export interface Habit {
  id: number;
  title: string;
  frequency: string;
  completed: boolean;
  status?: 'completed' | 'skipped' | null;
  archived: boolean;
}

export interface StatData {
  heatmap: { date: string; count: number; total: number }[];
  totalHabits: number;
  activeHabitsPerMonth?: { month: string; count: number }[];
  completionRate?: number;
  currentStreak?: number;
}
