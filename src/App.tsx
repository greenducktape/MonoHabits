import React, { useState, useEffect, useMemo, type FC, useRef, type ChangeEvent, createContext, useContext } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, PanInfo, useMotionValue } from 'motion/react';
import { format, subDays, eachDayOfInterval, startOfYear, endOfYear, parseISO, getDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameMonth, addMonths, subMonths, isValid } from 'date-fns';
import { Plus, Check, Trash2, Archive, BarChart2, Calendar, Settings as SettingsIcon, X, ChevronRight, ChevronLeft, Upload, Download, FileText } from 'lucide-react';
import { cn } from './lib/utils';
import { Habit, StatData } from './types';
import { parse } from 'papaparse';

// --- Palettes ---
export type Palette = {
  name: string;
  colors: string[];
};

export const PALETTES: Record<string, Palette> = {
  traffic: {
    name: 'Traffic Light',
    colors: ['bg-[#E8E8E3]', 'bg-bold-red', 'bg-signal-yellow', 'bg-green-400', 'bg-racing-green']
  },
  original: {
    name: 'Original',
    colors: ['bg-[#E8E8E3]', 'bg-bold-red', 'bg-signal-yellow', 'bg-electric-blue', 'bg-racing-green']
  },
  ocean: {
    name: 'Ocean',
    colors: ['bg-[#E8E8E3]', 'bg-blue-300', 'bg-blue-500', 'bg-blue-700', 'bg-blue-900']
  },
  monochrome: {
    name: 'Monochrome',
    colors: ['bg-[#E8E8E3]', 'bg-gray-300', 'bg-gray-500', 'bg-gray-700', 'bg-black']
  },
  sunset: {
    name: 'Sunset',
    colors: ['bg-[#E8E8E3]', 'bg-yellow-300', 'bg-orange-400', 'bg-red-500', 'bg-purple-800']
  }
};

export const PaletteContext = createContext<{
  paletteId: string;
  setPaletteId: (id: string) => void;
}>({ paletteId: 'traffic', setPaletteId: () => {} });

// --- Helpers ---

const apiFetch = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });
};

const GLASS_COLORS = ['glass-blue', 'glass-yellow', 'glass-green', 'glass-brown'];

const getGlassClass = (index: number) => GLASS_COLORS[index % GLASS_COLORS.length];

// --- Components ---

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        const res = await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, newPassword: password, recoveryCode })
        });
        const data = await res.json();
        
        if (!res.ok) {
          setError(data.error || 'Password reset failed');
          return;
        }
        
        setSuccessMsg('Password reset successfully! You can now log in.');
        setIsForgotPassword(false);
        setPassword('');
        setRecoveryCode('');
      } else {
        const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
        
        const res = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (!res.ok) {
          setError(data.error || 'Authentication failed');
          return;
        }

        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }

        if (isRegistering && data.user?.recoveryCode) {
          setNewRecoveryCode(data.user.recoveryCode);
        } else {
          onLogin();
        }
      }
    } catch (e) {
      console.error('Auth error:', e);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (newRecoveryCode) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border-3 border-black p-10 shadow-[8px_8px_0px_#000000] rounded-none text-center">
          <h2 className="text-2xl font-display uppercase tracking-widest mb-6 border-b-2 border-black pb-2">
            Save Your Recovery Code
          </h2>
          <p className="text-black/70 mb-6 font-serif italic">
            Please save this code in a secure place. You will need it if you ever forget your password.
          </p>
          <div className="bg-[#F5F5F0] border-3 border-black p-6 mb-8">
            <span className="text-3xl font-mono font-bold tracking-widest">{newRecoveryCode}</span>
          </div>
          <button
            onClick={onLogin}
            className="w-full py-5 bg-black text-white font-display text-sm uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            I have saved it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border-3 border-black p-10 shadow-[8px_8px_0px_#000000] rounded-none text-center">
        <h1 className="text-5xl font-display text-black mb-4 uppercase tracking-tighter">MonoHabit</h1>
        <p className="text-xl font-serif italic text-black/70 mb-10">Track your habits with brutalist elegance.</p>
        
        <h2 className="text-2xl font-display uppercase tracking-widest mb-6 border-b-2 border-black pb-2">
          {isForgotPassword ? 'Reset Password' : (isRegistering ? 'Create Account' : 'Login')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 border-3 border-bold-red bg-bold-red/10 text-bold-red font-display text-xs uppercase tracking-widest">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 border-3 border-black bg-green-100 text-black font-display text-xs uppercase tracking-widest">
              {successMsg}
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
          
          {isForgotPassword && (
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="RECOVERY CODE"
              required
              className="w-full bg-transparent border-b-3 border-black text-black text-xl font-display py-3 focus:outline-none focus:border-electric-blue transition-colors placeholder-black/30"
            />
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isForgotPassword ? "NEW PASSWORD" : "PASSWORD"}
            required
            className="w-full bg-transparent border-b-3 border-black text-black text-xl font-display py-3 focus:outline-none focus:border-electric-blue transition-colors placeholder-black/30"
          />
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-black text-white font-display text-sm uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000] disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isForgotPassword ? 'Reset Password' : (isRegistering ? 'Create Account' : 'Log In'))}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-4">
          {!isForgotPassword && !isRegistering && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true);
                setError('');
                setSuccessMsg('');
              }}
              className="text-black/60 hover:text-black font-display text-xs uppercase tracking-widest underline decoration-2 underline-offset-4 transition-colors"
            >
              Forgot Password?
            </button>
          )}
          
          <button
            type="button"
            onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false);
              } else {
                setIsRegistering(!isRegistering);
              }
              setError('');
              setSuccessMsg('');
            }}
            className="text-black/60 hover:text-black font-display text-xs uppercase tracking-widest underline decoration-2 underline-offset-4 transition-colors"
          >
            {isForgotPassword ? 'Back to Login' : (isRegistering ? 'Already have an account? Log In' : 'Need an account? Sign Up')}
          </button>
        </div>
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
          Archive
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
          habit.completed ? cn("is-active", colorClass) : habit.status === 'skipped' ? "bg-gray-200" : "bg-white"
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
            habit.completed && colorClass !== 'bg-signal-yellow' ? "text-white" : habit.status === 'skipped' ? "text-gray-500 line-through" : "text-black"
          )}>
            {habit.title}
          </span>

          <div className={cn(
            "habit-checkbox w-8 h-8 flex items-center justify-center transition-colors duration-300",
            habit.completed ? "border-black" : habit.status === 'skipped' ? "border-gray-400" : "border-black"
          )}>
            {habit.status === 'skipped' ? (
              <X className="w-6 h-6 text-gray-500" strokeWidth={4} />
            ) : (
              <Check className={cn("w-6 h-6 transition-opacity duration-300 check-icon", habit.completed ? "opacity-100" : "opacity-0")} strokeWidth={4} />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const AddHabitModal = ({ isOpen, onClose, onSave, onDelete, onSkip, initialHabit }: { isOpen: boolean; onClose: () => void; onSave: (title: string) => void; onDelete?: (id: number) => void; onSkip?: (id: number) => void; initialHabit?: Habit | null }) => {
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

        <div className="flex flex-col gap-3">
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

          {initialHabit && onSkip && (
            <button
              onClick={() => {
                onSkip(initialHabit.id);
                onClose();
              }}
              className="w-full py-5 bg-[#F5F5F0] text-black border-3 border-black font-display text-sm uppercase tracking-widest hover:bg-black hover:text-white transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
            >
              {initialHabit.status === 'skipped' ? 'Unskip for Today' : 'Skip for Today'}
            </button>
          )}

          {initialHabit && onDelete && (
            <button
              onClick={() => {
                onDelete(initialHabit.id);
                onClose();
              }}
              className="w-full py-5 bg-bold-red text-white border-3 border-black font-display text-sm uppercase tracking-widest hover:bg-black transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
            >
              Archive Habit
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- Visualization Components ---

const WeeklyView = ({ data }: { data: StatData }) => {
  const { paletteId } = useContext(PaletteContext);
  const palette = PALETTES[paletteId]?.colors || PALETTES['traffic'].colors;

  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
  const end = endOfWeek(today, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const getColorClass = (percentage: number) => {
    if (percentage === 0) return palette[0];
    if (percentage <= 0.33) return palette[1];
    if (percentage <= 0.66) return palette[2];
    if (percentage < 1) return palette[3];
    return palette[4];
  };

  return (
    <div className="w-full h-64 flex items-end justify-between gap-3 pt-8">
      {days.map((day, index) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const monthStr = dateStr.substring(0, 7);
        const activeThisMonth = data.activeHabitsPerMonth?.find(m => m.month === monthStr)?.count;
        const maxHabits = activeThisMonth || data.totalHabits || 1;

        const dayData = data.heatmap.find(d => d.date === dateStr);
        const count = dayData ? dayData.count : 0;
        const height = Math.max((count / maxHabits) * 100, 5); // Min 5% height
        const percentage = count / maxHabits;
        const colorClass = getColorClass(percentage);

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
  const { paletteId } = useContext(PaletteContext);
  const palette = PALETTES[paletteId]?.colors || PALETTES['traffic'].colors;
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getColorClass = (percentage: number) => {
    if (percentage === 0) return palette[0];
    if (percentage <= 0.33) return palette[1];
    if (percentage <= 0.66) return palette[2];
    if (percentage < 1) return palette[3];
    return palette[4];
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
          const monthStr = dateStr.substring(0, 7);
          const activeThisMonth = data.activeHabitsPerMonth?.find(m => m.month === monthStr)?.count;
          const total = activeThisMonth || data.totalHabits || 1;

          const dayData = data.heatmap.find(d => d.date === dateStr);
          const count = dayData ? dayData.count : 0;
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
  const { paletteId } = useContext(PaletteContext);
  const palette = PALETTES[paletteId]?.colors || PALETTES['traffic'].colors;

  // Generate full current year
  const currentYear = new Date().getFullYear();
  const start = startOfYear(new Date(currentYear, 0, 1));
  const end = endOfYear(new Date(currentYear, 0, 1));
  const days = eachDayOfInterval({ start, end });

  // Calculate padding days for the start of the year to align Mon-Sun grid
  // Mon=0, Tue=1, Wed=2, Thu=3...
  const startDay = (getDay(start) + 6) % 7; // Convert Sun=0 to Mon=0 scale
  const paddingDays = Array.from({ length: startDay });

  const getColorClass = (percentage: number) => {
    if (percentage === 0) return palette[0];
    if (percentage <= 0.33) return palette[1];
    if (percentage <= 0.66) return palette[2];
    if (percentage < 1) return palette[3];
    return palette[4];
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
             const monthStr = dateStr.substring(0, 7);
             const activeThisMonth = data.activeHabitsPerMonth?.find(m => m.month === monthStr)?.count;
             const total = activeThisMonth || data.totalHabits || 1;

             const dayData = data.heatmap.find(d => d.date === dateStr);
             const count = dayData ? dayData.count : 0;
             const percentage = count / total;
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
    apiFetch('/api/stats')
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
              {stats?.currentStreak ?? 0}
            </div>
          </div>
          <div className="border-3 border-black bg-white p-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <div className="text-black/50 font-display text-[10px] uppercase mb-3 tracking-widest">Completion Rate</div>
            <div className="text-5xl font-serif italic text-black">
               {stats?.completionRate ?? 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }: { isOpen: boolean; message: string; onConfirm: () => void; onCancel: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F5F5F0]/90 backdrop-blur-sm p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-sm bg-white border-3 border-black p-8 shadow-[8px_8px_0px_#000000] rounded-none text-center"
      >
        <p className="text-black font-serif italic text-lg mb-8">{message}</p>
        <div className="flex gap-4">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 border-3 border-black bg-white text-black font-display text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3 border-3 border-black bg-bold-red text-white font-display text-xs uppercase tracking-widest hover:bg-black transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const SettingsScreen = ({ onHabitRestored }: { onHabitRestored: () => void }) => {
  const { scrollY } = useScroll();
  const { paletteId, setPaletteId } = useContext(PaletteContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);

  const fetchArchivedHabits = async () => {
    try {
      const res = await apiFetch('/api/habits/archived');
      if (res.ok) {
        const data = await res.json();
        setArchivedHabits(data);
      }
    } catch (e) {
      console.error('Failed to fetch archived habits', e);
    }
  };

  useEffect(() => {
    fetchArchivedHabits();
  }, []);

  const handleRestore = async (id: number) => {
    try {
      const res = await apiFetch(`/api/habits/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        setArchivedHabits(prev => prev.filter(h => h.id !== id));
        onHabitRestored();
      }
    } catch (e) {
      console.error('Failed to restore habit', e);
    }
  };

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

          const res = await apiFetch('/api/import', {
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
        <div className="mt-8 mb-12">
          <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Heatmap Palette</h4>
          <div className="space-y-4">
            {Object.entries(PALETTES).map(([id, palette]) => (
              <button
                key={id}
                onClick={() => setPaletteId(id)}
                className={cn(
                  "w-full p-4 border-3 border-black bg-white flex items-center justify-between transition-colors shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]",
                  paletteId === id ? "bg-black text-white" : "hover:bg-gray-50 text-black"
                )}
              >
                <span className="font-serif italic text-lg">{palette.name}</span>
                <div className="flex gap-1">
                  {palette.colors.slice(1).map((color, i) => (
                    <div key={i} className={cn("w-6 h-6 border border-black/20", color)} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t-3 border-black">
          {['Notifications', 'Data & Storage', 'About'].map((item) => (
            <button key={item} className="w-full py-6 flex justify-between items-center border-b-3 border-black group hover:bg-white transition-colors px-4">
              <span className="text-black text-xl font-serif italic">{item}</span>
              <ChevronRight className="w-6 h-6 text-black group-hover:translate-x-1 transition-transform" strokeWidth={3} />
            </button>
          ))}
        </div>

        {archivedHabits.length > 0 && (
          <div className="mt-12">
            <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Archived Habits</h4>
            <div className="space-y-4">
              {archivedHabits.map(habit => (
                <div key={habit.id} className="w-full p-4 border-3 border-black bg-white flex items-center justify-between shadow-[4px_4px_0px_#000000]">
                  <span className="font-serif italic text-lg">{habit.title}</span>
                  <button 
                    onClick={() => handleRestore(habit.id)}
                    className="px-4 py-2 bg-black text-white font-display text-[10px] uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12">
          <h4 className="text-black font-display text-sm uppercase tracking-widest mb-6">Account</h4>
          <button 
            onClick={async () => {
              await apiFetch('/api/auth/logout', { method: 'POST' });
              localStorage.removeItem('auth_token');
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
              onClick={() => {
                setConfirmConfig({
                  isOpen: true,
                  message: 'This will delete all your data and replace it with sample data for 2026. Continue?',
                  onConfirm: async () => {
                    await apiFetch('/api/seed', { method: 'POST' });
                    window.location.reload();
                  }
                });
              }}
              className="w-full py-4 border-3 border-black bg-white text-black font-display text-xs uppercase tracking-widest hover:bg-signal-yellow transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
            >
              Load Sample Data (2026)
            </button>
            <button 
              onClick={() => {
                setConfirmConfig({
                  isOpen: true,
                  message: 'This will permanently delete all your data. Continue?',
                  onConfirm: async () => {
                    await apiFetch('/api/reset', { method: 'POST' });
                    window.location.reload();
                  }
                });
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

      <AnimatePresence>
        {confirmConfig?.isOpen && (
          <ConfirmModal 
            isOpen={confirmConfig.isOpen}
            message={confirmConfig.message}
            onConfirm={() => {
              confirmConfig.onConfirm();
              setConfirmConfig(null);
            }}
            onCancel={() => setConfirmConfig(null)}
          />
        )}
      </AnimatePresence>
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
  const [paletteId, setPaletteId] = useState(() => localStorage.getItem('monohabit_palette') || 'traffic');

  useEffect(() => {
    localStorage.setItem('monohabit_palette', paletteId);
  }, [paletteId]);

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
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
      const res = await apiFetch('/api/habits');
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
    setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: !h.completed, status: h.completed ? null : 'completed' } : h));
    
    try {
      const res = await apiFetch(`/api/habits/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: format(new Date(), 'yyyy-MM-dd') })
      });
      if (!res.ok) throw new Error('Toggle failed');
      const data = await res.json();
      setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h));
    } catch (e) {
      console.error('Toggle error:', e);
      // Revert optimistic update on failure
      fetchHabits();
    }
  };

  const handleSkip = async (id: number) => {
    // Optimistic update
    setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: false, status: h.status === 'skipped' ? null : 'skipped' } : h));
    
    try {
      const res = await apiFetch(`/api/habits/${id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: format(new Date(), 'yyyy-MM-dd') })
      });
      if (!res.ok) throw new Error('Skip failed');
      const data = await res.json();
      setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h));
    } catch (e) {
      console.error('Skip error:', e);
      // Revert optimistic update on failure
      fetchHabits();
    }
  };

  const handleDelete = async (id: number) => {
    // Optimistic update
    setHabits(prev => prev.filter(h => h.id !== id));
    try {
      const res = await apiFetch(`/api/habits/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (e) {
      console.error('Delete error:', e);
      fetchHabits(); // Rollback on failure
    }
  };

  const handleSaveHabit = async (title: string) => {
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
        const res = await apiFetch(`/api/habits/${editingHabit.id}`, {
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
        const res = await apiFetch('/api/habits', {
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
    <PaletteContext.Provider value={{ paletteId, setPaletteId }}>
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
        {activeTab === 'settings' && <SettingsScreen onHabitRestored={fetchHabits} />}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <AnimatePresence>
          {isModalOpen && (
            <AddHabitModal 
              isOpen={isModalOpen} 
              onClose={() => setIsModalOpen(false)} 
              onSave={handleSaveHabit}
              onDelete={handleDelete}
              onSkip={handleSkip}
              initialHabit={editingHabit}
            />
          )}
        </AnimatePresence>
      </div>
    </PaletteContext.Provider>
  );
}
