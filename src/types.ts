export interface Habit {
  id: number;
  title: string;
  frequency: string;
  completed: boolean;
  archived: boolean;
}

export interface StatData {
  heatmap: { date: string; count: number }[];
  totalHabits: number;
}
