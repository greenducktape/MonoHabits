import React, { useState, useEffect, useMemo, type FC, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, PanInfo, useMotionValue } from 'motion/react';
import { format, subDays, eachDayOfInterval, startOfYear, endOfYear, parseISO, getDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameMonth, addMonths, subMonths, isValid } from 'date-fns';
import { Plus, Check, Trash2, Archive, BarChart2, Calendar, Settings as SettingsIcon, X, ChevronRight, ChevronLeft, Upload, Download, FileText } from 'lucide-react';
import { cn } from './lib/utils';
import { Habit, StatData } from './types';
import { parse } from 'papaparse';

// --- Components ---

// --- Helpers ---

const getApiUrl = (path: string) => {
  // @ts-ignore - Vite env variables
  const baseUrl = import.meta.env.VITE_APP_URL;
  if (baseUrl && baseUrl !== 'null' && baseUrl !== '') {
    return `${baseUrl}${path}`;
  }
  return path;
};

const GLASS_COLORS = ['glass-blue', 'glass-yellow', 'glass-green', 'glass-brown'];

const getGlassClass = (index: number) => GLASS_COLORS[index % GLASS_COLORS.length];

// --- Components ---

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      console.log(`Submitting form. Mode: ${isRegistering ? 'Register' : 'Login'}, Endpoint: ${endpoint}`);
      
      const url = getApiUrl(endpoint);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        console.error('Auth failed:', data);
        setError(data.error || 'Authentication failed');
        return;
      }

      console.log('Auth successful');
      onLogin();
    } catch (e) {
      console.error('Auth error:', e);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border-3 border-black p-10 shadow-[8px_8px_0px_#000000] rounded-none text-center">
        <h1 className="text-5xl font-display text-black mb-4 uppercase tracking-tighter">MonoHabit</h1>
        <p className="text-xl font-serif italic text-black/70 mb-10">Track your habits with brutalist elegance.</p>
        
        <h2 className="text-2xl font-display uppercase tracking-widest mb-6 border-b-2 border-black pb-2">
          {isRegistering ? 'Create Account' : 'Login'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 border-3 border-bold-red bg-bold-red/10 text-bold-red font-display text-xs uppercase tracking-widest">
              {error}
            </div>
          )}
          
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="EMAIL ADDRESS"
            required
            className="w-full bg-transparent border-b-3 border-black text-black text-xl font-display py-3 focus:outline-none focus:border-electric-blue transition-colors placeholder-black/30"
          />
          
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PASSWORD"
            required
            className="w-full bg-transparent border-b-3 border-black text-black text-xl font-display py-3 focus:outline-none focus:border-electric-blue transition-colors placeholder-black/30"
          />
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-black text-white font-display text-sm uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000] disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Log In')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError('');
          }}
          className="mt-8 text-black/60 hover:text-black font-display text-xs uppercase tracking-widest underline decoration-2 underline-offset-4 transition-colors"
        >
          {isRegistering ? 'Already have an account? Log In' : 'Need an account? Sign Up'}
        </button>
      </div>
    </div>
  );
};

const TabBar = ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-[#F5F5F0] border-t-3 border-black flex justify-around items-center pb-6 z-50">
      {['today', 'trends', 'settings'].map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className="relative p-4 group"
        >
          {tab === 'today' && <Calendar strokeWidth={activeTab === 'today' ? 3 : 2} className={cn("w-7 h-7 transition-colors", activeTab === 'today' ? "text-black" : "text-black/30")} />}
          {tab === 'trends' && <BarChart2 strokeWidth={activeTab === 'trends' ? 3 : 2} className={cn("w-7 h-7 transition-colors", activeTab === 'trends' ? "text-black" : "text-black/30")} />}
          {tab === 'settings' && <SettingsIcon strokeWidth={activeTab === 'settings' ? 3 : 2} className={cn("w-7 h-7 transition-colors", activeTab === 'settings' ? "text-black" : "text-black/30")} />}
          
          {activeTab === tab && (
            <motion.div 
              layoutId="activeTab"
              className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-black rounded-none"
            />
          )}
        </button>
      ))}
    </div>
  );
};

const Header = ({ title, scrollY }: { title: string; scrollY: any }) => {
  const opacity = useTransform(scrollY, [0, 50], [0, 1]);
  const y = useTransform(scrollY, [0, 50], [20, 0]);

  return (
    <>
      {/* Compact Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 h-[88px] bg-[#F5F5F0]/90 backdrop-blur-md z-40 flex items-end justify-center pb-4 border-b-3 border-black transition-colors duration-200 pointer-events-none">
        <motion.span 
          style={{ opacity, y }} 
          className="font-display text-[18px] text-black uppercase tracking-widest"
        >
          {title}
        </motion.span>
      </div>
      
      {/* Large Title Placeholder */}
      <div className="pt-[120px] px-6 pb-8 border-b-3 border-black">
        <h1 className="text-[56px] font-display text-black leading-none tracking-tighter uppercase">{title}</h1>
      </div>
    </>
  );
};

interface HabitItemProps {
  habit: Habit;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (habit: Habit) => void;
}

const HabitItem: FC<HabitItemProps> = ({ habit, onToggle, onDelete, onEdit }) => {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-100, -50], [1, 0]);
  const threshold = -80;

  const handleDragEnd = (event: any, info: PanInfo) => {
    if (info.offset.x < threshold) {
      onDelete(habit.id);
    } 
  };

  const primaryColors = ['bg-electric-blue', 'bg-signal-yellow', 'bg-bold-red', 'bg-racing-green'];
  const colorClass = primaryColors[habit.id % primaryColors.length];

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="relative mb-6 group"
    >
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 bg-black rounded-none overflow-hidden border-3 border-black shadow-[4px_4px_0px_#000000]">
        <motion.span 
          style={{ opacity: deleteOpacity }}
          className="font-display text-sm text-white uppercase tracking-widest"
        >
          Delete
        </motion.span>
      </div>

      {/* Foreground Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={cn(
          "habit-item p-6 flex items-center justify-between cursor-pointer rounded-none relative z-10",
          habit.completed ? cn("is-active", colorClass) : "bg-white"
        )}
        onClick={() => {
          onToggle(habit.id);
          if (navigator.vibrate) navigator.vibrate(10);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onEdit(habit);
          if (navigator.vibrate) navigator.vibrate(50);
        }}
      >
        {/* Content Layer */}
        <div className="flex items-center justify-between w-full relative z-10">
          <span className={cn(
            "text-3xl font-serif italic transition-colors duration-300",
            habit.completed && colorClass !== 'bg-signal-yellow' ? "text-white" : "text-black"
          )}>
            {habit.title}
          </span>

          <div className={cn(
            "habit-checkbox w-8 h-8 flex items-center justify-center transition-colors duration-300",
            habit.completed ? "border-black" : "border-black"
          )}>
            <Check className={cn("w-6 h-6 transition-opacity duration-300 check-icon", habit.completed ? "opacity-100" : "opacity-0")} strokeWidth={4} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const AddHabitModal = ({ isOpen, onClose, onSave, initialHabit }: { isOpen: boolean; onClose: () => void; onSave: (title: string) => void; initialHabit?: Habit | null }) => {
  const [title, setTitle] = useState(initialHabit?.title || '');

  useEffect(() => {
    setTitle(initialHabit?.title || '');
  }, [initialHabit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#F5F5F0]/90 backdrop-blur-sm p-6">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="w-full max-w-md bg-white border-3 border-black p-8 shadow-[8px_8px_0px_#000000] rounded-none"
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-display uppercase tracking-tighter text-black">{initialHabit ? 'Edit Habit' : 'New Habit'}</h2>
          <button onClick={onClose}><X className="w-8 h-8 text-black hover:text-bold-red transition-colors" strokeWidth={3} /></button>
        </div>

        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Drink water..."
          className="w-full bg-transparent border-b-3 border-black text-black text-3xl font-serif italic py-3 focus:outline-none focus:border-electric-blue transition-colors placeholder-black/30 mb-10"
        />

        <button
          onClick={() => {
            if (title.trim()) {
              onSave(title);
              setTitle('');
              onClose();
            }
          }}
          className="w-full py-5 bg-black text-white font-display text-sm uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
        >
          {initialHabit ? 'Update' : 'Create'}
        </button>
      </motion.div>
    </div>
  );
};

// --- Visualization Components ---

const WeeklyView = ({ data }: { data: StatData }) => {
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
  const end = endOfWeek(today, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const maxHabits = data.totalHabits || 1;

  return (
    <div className="w-full h-64 flex items-end justify-between gap-3 pt-8">
      {days.map((day, index) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = data.heatmap.find(d => d.date === dateStr);
        const count = dayData ? dayData.count : 0;
        const height = Math.max((count / maxHabits) * 100, 5); // Min 5% height

        const primaryColors = ['bg-electric-blue', 'bg-signal-yellow', 'bg-bold-red', 'bg-racing-green'];
        const colorClass = primaryColors[index % primaryColors.length];

        return (
          <div key={dateStr} className="flex flex-col items-center gap-4 flex-1">
            <div className="w-full bg-[#F5F5F0] border-3 border-black rounded-none relative h-40 flex items-end overflow-hidden group">
               <motion.div 
                 initial={{ height: 0 }}
                 animate={{ height: `${height}%` }}
                 transition={{ duration: 0.5, ease: "easeOut" }}
                 className={cn("w-full border-t-3 border-black relative", colorClass)}
               >
               </motion.div>
               <div className="absolute bottom-2 w-full text-center text-xs font-display text-black opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/80 py-1">
                 {count}
               </div>
            </div>
            <span className="text-black font-display text-[10px] uppercase tracking-widest">
              {format(day, 'EEE')}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MonthlyView = ({ data }: { data: StatData }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getColorClass = (percentage: number) => {
    if (percentage === 0) return 'bg-[#E8E8E3]';
    if (percentage <= 0.33) return 'bg-bold-red';
    if (percentage <= 0.66) return 'bg-signal-yellow';
    if (percentage < 1) return 'bg-electric-blue';
    return 'bg-racing-green';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-8">
        <button onClick={prevMonth} className="p-3 border-3 border-black hover:bg-electric-blue hover:text-white transition-colors"><ChevronLeft className="w-5 h-5" strokeWidth={3} /></button>
        <span className="text-black font-display text-sm uppercase tracking-widest">{format(currentMonth, 'MMMM yyyy')}</span>
        <button onClick={nextMonth} className="p-3 border-3 border-black hover:bg-electric-blue hover:text-white transition-colors"><ChevronRight className="w-5 h-5" strokeWidth={3} /></button>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-4">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-black/50 font-display text-[10px] uppercase">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayData = data.heatmap.find(d => d.date === dateStr);
          const count = dayData ? dayData.count : 0;
          const total = data.totalHabits || 1;
          const percentage = count / total;
          
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          const colorClass = getColorClass(percentage);
          
          return (
            <div 
              key={dateStr} 
              className={cn(
                "aspect-square flex items-center justify-center text-[12px] font-serif italic relative group transition-all duration-300 rounded-none overflow-hidden border-2",
                !isCurrentMonth && "opacity-20",
                isToday ? "border-black" : "border-transparent",
                colorClass
              )}
            >
              <span className={cn(
                "relative z-20",
                count > 0 && colorClass !== 'bg-signal-yellow' ? "text-white font-sans font-bold" : "text-black"
              )}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const YearlyView = ({ data }: { data: StatData }) => {
  // Generate full year 2026
  const start = startOfYear(new Date(2026, 0, 1));
  const end = endOfYear(new Date(2026, 0, 1));
  const days = eachDayOfInterval({ start, end });

  // Calculate padding days for the start of the year to align Mon-Sun grid
  // Jan 1 2026 is Thursday.
  // Mon=0, Tue=1, Wed=2, Thu=3...
  const startDay = (getDay(start) + 6) % 7; // Convert Sun=0 to Mon=0 scale
  const paddingDays = Array.from({ length: startDay });

  const getColorClass = (percentage: number) => {
    if (percentage === 0) return 'bg-[#E8E8E3]';
    if (percentage <= 0.33) return 'bg-bold-red';
    if (percentage <= 0.66) return 'bg-signal-yellow';
    if (percentage < 1) return 'bg-electric-blue';
    return 'bg-racing-green';
  };

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex gap-1" style={{ width: 'max-content' }}>
        <div className="grid grid-rows-7 grid-flow-col gap-1.5">
           {/* Padding for correct day alignment */}
           {paddingDays.map((_, i) => (
             <div key={`pad-${i}`} className="w-4 h-4 bg-transparent" />
           ))}

           {days.map((day) => {
             const dateStr = format(day, 'yyyy-MM-dd');
             const dayData = data.heatmap.find(d => d.date === dateStr);
             const count = dayData ? dayData.count : 0;
             const percentage = count / (data.totalHabits || 1);
             const colorClass = getColorClass(percentage);
             
             return (
               <div
                 key={dateStr}
                 className={cn("w-4 h-4 rounded-none relative overflow-hidden border border-black/5", colorClass)}
                 title={`${dateStr}: ${count}`}
               />
             );
           })}
        </div>
      </div>
      <div className="mt-4 flex justify-between text-black font-display text-[10px] uppercase tracking-widest sticky left-0">
        <span>Jan</span>
        <span>Dec</span>
      </div>
    </div>
  );
};

// --- Screens ---

const TodayScreen = ({ habits, onToggle, onDelete, onEdit, onAdd }: any) => {
  const { scrollY } = useScroll();

  return (
    <div className="pb-32 min-h-screen bg-[#F5F5F0]">
      <Header title="Today" scrollY={scrollY} />
      
      <div className="px-6 mt-8">
        <div className="flex justify-between items-center mb-10">
          <span className="text-black font-display text-sm uppercase tracking-widest">
            {format(new Date(), 'EEEE, MMM d')}
          </span>
          <span className="text-black font-display text-sm">
            {habits.filter((h: Habit) => h.completed).length}/{habits.length}
          </span>
        </div>

        <div className="space-y-2">
          <AnimatePresence mode='popLayout'>
            {habits.length > 0 ? (
              habits.map((habit: Habit) => (
                <HabitItem 
                  key={habit.id}
                  habit={habit} 
                  onToggle={onToggle} 
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-24 text-center border-3 border-black bg-white shadow-[4px_4px_0px_#000000]"
              >
                <p className="text-black font-display text-lg uppercase tracking-widest mb-3">No habits yet</p>
                <p className="text-black/60 text-lg font-serif italic">Tap the button below to start your journey</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onAdd}
          className="mt-10 w-full py-6 border-3 border-black bg-white text-black font-display text-sm uppercase tracking-widest hover:bg-signal-yellow transition-colors flex items-center justify-center gap-3 rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
        >
          <Plus className="w-6 h-6" strokeWidth={3} /> Add Habit
        </button>
      </div>
    </div>
  );
};

const TrendsScreen = () => {
  const { scrollY } = useScroll();
  const [stats, setStats] = useState<StatData | null>(null);
  const [view, setView] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');

  useEffect(() => {
    const url = getApiUrl('/api/stats');
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.heatmap)) {
          setStats(data);
        } else {
          console.error('Invalid stats format:', data);
          setStats(null);
        }
      })
      .catch(err => {
        console.error('Stats fetch error:', err);
        setStats(null);
      });
  }, []);

  return (
    <div className="pb-32 min-h-screen bg-[#F5F5F0]">
      <Header title="Trends" scrollY={scrollY} />
      
      <div className="px-6 mt-8">
        {/* View Selector */}
        <div className="flex p-1 bg-white mb-10 rounded-none border-3 border-black shadow-[4px_4px_0px_#000000]">
          {['weekly', 'monthly', 'yearly'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v as any)}
              className={cn(
                "flex-1 py-3 text-xs font-display uppercase tracking-widest transition-colors rounded-none",
                view === v ? "bg-black text-white" : "text-black/50 hover:text-black"
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="border-3 border-black bg-white p-8 mb-8 min-h-[300px] rounded-none shadow-[4px_4px_0px_#000000]">
          <h3 className="text-black font-display text-2xl mb-8 uppercase tracking-tighter">{view} Overview</h3>
          {stats ? (
            <>
              {view === 'weekly' && <WeeklyView data={stats} />}
              {view === 'monthly' && <MonthlyView data={stats} />}
              {view === 'yearly' && <YearlyView data={stats} />}
            </>
          ) : (
            <div className="text-black/50 font-sans text-sm">Loading stats...</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="border-3 border-black bg-white p-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <div className="text-black/50 font-display text-[10px] uppercase mb-3 tracking-widest">Current Streak</div>
            <div className="text-5xl font-serif italic text-black">
              {/* Mock data for MVP */}
              12
            </div>
          </div>
          <div className="border-3 border-black bg-white p-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <div className="text-black/50 font-display text-[10px] uppercase mb-3 tracking-widest">Completion Rate</div>
            <div className="text-5xl font-serif italic text-black">
               {/* Mock data */}
               87%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingsScreen = () => {
  const { scrollY } = useScroll();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportStatus(null);

    parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Normalize data: expect columns "date" and "title" (case insensitive)
          const normalizedData = results.data.map((row: any) => {
            // Find keys that look like 'date' and 'title'
            const keys = Object.keys(row);
            const dateKey = keys.find(k => k.toLowerCase().includes('date'));
            const titleKey = keys.find(k => k.toLowerCase().includes('habit') || k.toLowerCase().includes('title'));
            const completedKey = keys.find(k => k.toLowerCase().includes('completed') || k.toLowerCase().includes('status') || k.toLowerCase().includes('done'));
            
            if (!dateKey || !titleKey) return null;

            let dateStr = row[dateKey];
            // Basic date validation/formatting
            try {
               const parsedDate = new Date(dateStr);
               if (isValid(parsedDate)) {
                 dateStr = format(parsedDate, 'yyyy-MM-dd');
               } else {
                 return null;
               }
            } catch (e) { return null; }

            // Parse completed status
            let completed = true;
            if (completedKey) {
              const val = String(row[completedKey]).toLowerCase().trim();
              if (val === 'false' || val === '0' || val === 'no' || val === 'incomplete') {
                completed = false;
              }
            }

            return {
              date: dateStr,
              title: row[titleKey],
              completed
            };
          }).filter(Boolean);

          if (normalizedData.length === 0) {
            throw new Error('No valid data found. CSV must have "Date" and "Habit Title" columns.');
          }

          const res = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: normalizedData })
          });

          const json = await res.json();
          if (json.success) {
            setImportStatus({ type: 'success', message: `Successfully imported ${json.count} entries.` });
            // Optional: reload to show new data
            setTimeout(() => window.location.reload(), 1500);
          } else {
            throw new Error(json.error || 'Import failed');
          }
        } catch (err: any) {
          setImportStatus({ type: 'error', message: err.message });
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (err) => {
        setImportStatus({ type: 'error', message: 'Failed to parse CSV file.' });
        setImporting(false);
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "Date,Habit Title,Completed\n2026-01-01,Drink Water,TRUE\n2026-01-01,Read Book,FALSE\n2026-01-02,Drink Water,TRUE";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "monohabit_import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="pb-32 min-h-screen bg-[#F5F5F0]">
      <Header title="Settings" scrollY={scrollY} />
      
      <div className="px-6 mt-8">
        <div className="border-t-3 border-black">
          {['Appearance', 'Notifications', 'Data & Storage', 'About'].map((item) => (
            <button key={item} className="w-full py-6 flex justify-between items-center border-b-3 border-black group hover:bg-white transition-colors px-4">
              <span className="text-black text-xl font-serif italic">{item}</span>
              <ChevronRight className="w-6 h-6 text-black group-hover:translate-x-1 transition-transform" strokeWidth={3} />
            </button>
          ))}
        </div>

        <div className="mt-12">
          <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Account</h4>
          <button 
            onClick={async () => {
              const url = getApiUrl('/api/auth/logout');
              await fetch(url, { method: 'POST' });
              window.location.reload();
            }}
            className="w-full py-4 border-3 border-black bg-white text-black font-display text-xs uppercase tracking-widest hover:bg-bold-red hover:text-white transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            Log Out
          </button>
        </div>

        <div className="mt-12">
          <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Import Data</h4>
          
          <div className="bg-white border-3 border-black p-6 mb-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <p className="text-black/70 text-base mb-6 font-serif italic">
              Import your history from a CSV file. The file should have columns for 
              <span className="text-black font-display not-italic mx-1">Date</span> and 
              <span className="text-black font-display not-italic mx-1">Habit Title</span>.
              Optionally add a <span className="text-black font-display not-italic mx-1">Completed</span> column (TRUE/FALSE) to explicitly mark items as incomplete.
            </p>
            
            <div className="flex gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex-1 py-4 bg-black text-white font-display text-xs uppercase tracking-widest hover:bg-electric-blue transition-colors flex items-center justify-center gap-3 rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
              >
                {importing ? 'Importing...' : <><Upload className="w-5 h-5" strokeWidth={3} /> Select CSV</>}
              </button>
              <button 
                onClick={downloadTemplate}
                className="px-6 py-4 border-3 border-black text-black hover:bg-signal-yellow transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
                title="Download Template"
              >
                <Download className="w-5 h-5" strokeWidth={3} />
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csv" 
              className="hidden" 
            />

            {importStatus && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mt-6 p-4 text-sm font-display uppercase tracking-widest border-3 rounded-none",
                  importStatus.type === 'success' ? "border-racing-green text-racing-green bg-racing-green/10" : "border-bold-red text-bold-red bg-bold-red/10"
                )}
              >
                {importStatus.message}
              </motion.div>
            )}
          </div>
        </div>
        
        <div className="mt-12">
          <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Data Management</h4>
          <div className="space-y-4">
            <button 
              onClick={async () => {
                if (confirm('This will delete all your data and replace it with sample data for 2026. Continue?')) {
                  const url = getApiUrl('/api/seed');
                  await fetch(url, { method: 'POST' });
                  window.location.reload();
                }
              }}
              className="w-full py-4 border-3 border-black bg-white text-black font-display text-xs uppercase tracking-widest hover:bg-signal-yellow transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
            >
              Load Sample Data (2026)
            </button>
            <button 
              onClick={async () => {
                if (confirm('This will permanently delete all your data. Continue?')) {
                  const url = getApiUrl('/api/reset');
                  await fetch(url, { method: 'POST' });
                  window.location.reload();
                }
              }}
              className="w-full py-4 border-3 border-black bg-black text-white font-display text-xs uppercase tracking-widest hover:bg-bold-red transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
            >
              Reset All Data
            </button>
          </div>
        </div>
        
        <div className="mt-16 text-center">
          <p className="font-display text-xs text-black/40 uppercase tracking-widest">MonoHabit v1.1.0</p>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const url = getApiUrl('/api/auth/me');
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchUser();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchHabits = async () => {
    try {
      const url = getApiUrl('/api/habits');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (Array.isArray(data)) {
        setHabits(data);
      } else {
        console.error('Invalid data format:', data);
        setHabits([]);
      }
    } catch (e) {
      console.error('Fetch error:', e);
      setHabits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchHabits();
    }
  }, [user]);

  const handleToggle = async (id: number) => {
    // Optimistic update
    setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: !h.completed } : h));
    
    const url = getApiUrl(`/api/habits/${id}/toggle`);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: format(new Date(), 'yyyy-MM-dd') })
    });
    // Re-fetch to ensure sync
    fetchHabits();
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to archive this habit?')) {
      const url = getApiUrl(`/api/habits/${id}`);
      await fetch(url, { method: 'DELETE' });
      fetchHabits();
    }
  };

  const handleSaveHabit = async (title: string) => {
    console.log('handleSaveHabit called with title:', title);
    const tempId = Date.now();
    const newHabit: Habit = {
      id: tempId,
      title,
      frequency: 'daily',
      completed: false,
      archived: false
    };

    if (editingHabit) {
      // Optimistic update for edit
      setHabits(prev => prev.map(h => h.id === editingHabit.id ? { ...h, title } : h));
      try {
        const url = getApiUrl(`/api/habits/${editingHabit.id}`);
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, frequency: editingHabit.frequency })
        });
        if (!res.ok) throw new Error('Update failed');
      } catch (e) {
        console.error('Update error:', e);
        fetchHabits(); // Rollback
      }
    } else {
      // Optimistic update for add
      setHabits(prev => [newHabit, ...prev]);
      try {
        const url = getApiUrl('/api/habits');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, frequency: 'daily' })
        });
        if (!res.ok) throw new Error('Create failed');
      } catch (e) {
        console.error('Create error:', e);
        fetchHabits(); // Rollback
      }
    }
    fetchHabits();
    setEditingHabit(null);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setIsModalOpen(true);
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#F5F5F0]">
        <motion.div 
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="font-display text-sm uppercase tracking-widest text-black"
        >
          Loading...
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={fetchUser} />;
  }

  return (
    <div className="bg-[#F5F5F0] min-h-screen text-black font-sans selection:bg-black selection:text-[#F5F5F0]">
      {loading && habits.length === 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#F5F5F0]">
          <motion.div 
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="font-display text-sm uppercase tracking-widest text-black"
          >
            Loading...
          </motion.div>
        </div>
      )}

      {activeTab === 'today' && (
        <TodayScreen 
          habits={habits} 
          onToggle={handleToggle} 
          onDelete={handleDelete}
          onEdit={openEditModal}
          onAdd={() => {
            setEditingHabit(null);
            setIsModalOpen(true);
          }}
        />
      )}
      {activeTab === 'trends' && <TrendsScreen />}
      {activeTab === 'settings' && <SettingsScreen />}

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <AnimatePresence>
        {isModalOpen && (
          <AddHabitModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            onSave={handleSaveHabit}
            initialHabit={editingHabit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
