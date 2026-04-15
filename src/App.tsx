import React, { useState, useEffect, useMemo, type FC, useRef, type ChangeEvent, createContext, useContext } from 'react';
import { motion, AnimatePresence, useTransform, PanInfo, useMotionValue } from 'motion/react';
import { format, subDays, addDays, eachDayOfInterval, startOfYear, endOfYear, parseISO, getDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameMonth, addMonths, subMonths, isValid } from 'date-fns';
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

export type Milestone = {
  id: number;
  title: string;
  status: 'locked' | 'active' | 'completed';
  x: number;
  y: number;
};

export type MilestoneEdge = {
  id: number;
  from_id: number;
  to_id: number;
};

const WallScreen = () => {
  const [nodes, setNodes] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptConfig, setPromptConfig] = useState<{ isOpen: boolean; title: string; initialValue: string; onConfirm: (val: string) => void } | null>(null);

  const fetchWallData = async () => {
    try {
      const res = await apiFetch('/api/milestones');
      if (res.ok) {
        const data = await res.json();
        // Sort nodes by ID so they stack in order of creation
        setNodes(data.nodes.sort((a: Milestone, b: Milestone) => a.id - b.id));
      } else {
        setError('Failed to fetch wall data');
      }
    } catch (e) {
      console.error('Failed to fetch wall data', e);
      setError('Network error while fetching wall data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallData();
  }, []);

  const handleAddBrick = () => {
    setPromptConfig({
      isOpen: true,
      title: 'Enter brick title:',
      initialValue: '',
      onConfirm: async (title: string) => {
        setPromptConfig(null);
        try {
          const res = await apiFetch('/api/milestones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, x: 0, y: 0, status: 'locked' })
          });
          if (res.ok) {
            const newNode = await res.json();
            setNodes(prev => [...prev, newNode]);
          } else {
            setError('Failed to create brick');
          }
        } catch (e) {
          console.error('Failed to create node', e);
          setError('Network error while creating brick');
        }
      }
    });
  };

  const updateNodeStatus = async (id: number, status: 'locked' | 'active' | 'completed') => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    
    // Optimistic
    setNodes(prev => prev.map(n => n.id === id ? { ...n, status } : n));
    
    try {
      const res = await apiFetch(`/api/milestones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...node, status })
      });
      if (!res.ok) {
        setError('Failed to update brick status');
        fetchWallData();
      }
    } catch (e) {
      console.error('Failed to update node', e);
      setError('Network error while updating brick status');
      fetchWallData();
    }
  };

  const deleteNode = async (id: number) => {
    // Optimistic
    setNodes(prev => prev.filter(n => n.id !== id));
    try {
      const res = await apiFetch(`/api/milestones/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Failed to delete brick');
        fetchWallData(); // Revert
      }
    } catch (e) {
      console.error('Failed to delete node', e);
      setError('Network error while deleting brick');
      fetchWallData(); // Revert
    }
    setSelectedNodeId(null);
  };

  const editNodeTitle = (id: number) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setPromptConfig({
      isOpen: true,
      title: 'Edit brick title:',
      initialValue: node.title,
      onConfirm: async (newTitle: string) => {
        setPromptConfig(null);
        if (!newTitle.trim() || newTitle === node.title) return;
        
        setNodes(prev => prev.map(n => n.id === id ? { ...n, title: newTitle } : n));
        try {
          const res = await apiFetch(`/api/milestones/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...node, title: newTitle })
          });
          if (!res.ok) {
            setError('Failed to update brick title');
            fetchWallData();
          }
        } catch (e) {
          console.error('Failed to update node title', e);
          setError('Network error while updating brick title');
          fetchWallData();
        }
      }
    });
  };

  // Add a dummy node for the "Lay Brick" button
  const allNodes = [...nodes, { id: -1, title: '+ Lay Brick', status: 'add-button' as any, x: 0, y: 0 }];

  // Calculate grid positions for each node
  const nodesWithGrid = allNodes.map((node, i) => {
    let row = 0;
    let count = 0;
    while (count + (row % 2 === 0 ? 3 : 4) <= i) {
      count += row % 2 === 0 ? 3 : 4;
      row++;
    }
    const colIndex = i - count;
    const isOffset = row % 2 === 0;
    return { ...node, row, colIndex, isOffset };
  });

  // Sort nodes so the highest row (top of the wall) renders first
  const sortedNodes = [...nodesWithGrid].sort((a, b) => {
    if (a.row !== b.row) return b.row - a.row;
    return a.colIndex - b.colIndex;
  });

  return (
    <div className="pb-32 min-h-screen bg-[#F5F5F0] flex flex-col pt-24" onClick={() => setSelectedNodeId(null)}>
      <div className="fixed top-0 left-0 right-0 h-[88px] bg-[#F5F5F0]/90 backdrop-blur-md z-40 flex items-end justify-between px-6 pb-4 border-b-3 border-black">
        <span className="font-display text-[18px] text-black uppercase tracking-widest">
          The Wall
        </span>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-bold-red text-white px-6 py-3 border-3 border-black shadow-[4px_4px_0px_#000000] font-display uppercase tracking-widest text-sm flex items-center gap-4"
          >
            {error}
            <button onClick={() => setError(null)} className="hover:text-black transition-colors"><X size={16}/></button>
          </motion.div>
        )}
        {promptConfig?.isOpen && (
          <PromptModal 
            isOpen={promptConfig.isOpen}
            title={promptConfig.title}
            initialValue={promptConfig.initialValue}
            onConfirm={(val) => {
              promptConfig.onConfirm(val);
            }}
            onCancel={() => setPromptConfig(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col justify-end items-center px-4 overflow-y-auto pb-12 pt-12">
        {loading ? (
          <div className="font-display uppercase tracking-widest animate-pulse">Building...</div>
        ) : (
          <div className="grid grid-cols-8 gap-2 w-full max-w-3xl">
            {sortedNodes.map((node, nodeIndex) => (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: (node.row * 0.1) + (node.colIndex * 0.05), type: 'spring', stiffness: 200, damping: 20 }}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (node.id === -1) {
                    handleAddBrick();
                  } else {
                    setSelectedNodeId(node.id === selectedNodeId ? null : node.id); 
                  }
                }}
                className={cn(
                  "relative h-20 col-span-2 border-4 border-black flex items-center justify-center cursor-pointer shadow-[4px_4px_0px_#000000] transition-all hover:-translate-y-1 hover:shadow-[4px_8px_0px_#000000]",
                  node.isOffset && node.colIndex === 0 ? "col-start-2" : "",
                  node.status === 'completed' ? 'bg-racing-green text-white' : 
                  node.status === 'active' ? 'bg-signal-yellow text-black' : 
                  node.status === 'add-button' ? 'bg-transparent border-dashed text-black/50 hover:bg-black/5 hover:text-black' :
                  'bg-white text-black',
                  selectedNodeId === node.id ? 'ring-4 ring-black ring-offset-4 ring-offset-[#F5F5F0] z-10' : 'z-0'
                )}
              >
                {/* Inner brick detail */}
                {node.status !== 'add-button' && (
                  <>
                    <div className="absolute inset-0 border-b-2 border-black/10 top-1/2 pointer-events-none" />
                    <div className="absolute inset-0 border-r-2 border-black/10 left-1/2 pointer-events-none" />
                  </>
                )}

                {node.status === 'active' && (
                  <div className="absolute -top-6 text-xl animate-bounce">🏗️</div>
                )}
                <span className="font-display text-xs uppercase tracking-widest text-center px-2 leading-tight break-words w-full z-10">
                  {node.title}
                </span>

                {selectedNodeId === node.id && node.status !== 'add-button' && (
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 flex gap-2 bg-white border-3 border-black p-2 shadow-[4px_4px_0px_#000000] z-50">
                    <button onClick={(e) => { e.stopPropagation(); updateNodeStatus(node.id, 'active'); }} className="p-2 hover:bg-gray-100 text-black" title="Set Active">▶️</button>
                    <button onClick={(e) => { e.stopPropagation(); updateNodeStatus(node.id, 'completed'); }} className="p-2 hover:bg-gray-100 text-black" title="Complete">✅</button>
                    <button onClick={(e) => { e.stopPropagation(); updateNodeStatus(node.id, 'locked'); }} className="p-2 hover:bg-gray-100 text-black" title="Lock">🔒</button>
                    <button onClick={(e) => { e.stopPropagation(); editNodeTitle(node.id); }} className="p-2 hover:bg-gray-100 text-black" title="Edit Title">✏️</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="p-2 hover:bg-gray-100 text-bold-red" title="Delete"><Trash2 size={16}/></button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
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
      <div className="w-full max-w-md bg-white border-3 border-black p-6 md:p-10 shadow-[8px_8px_0px_#000000] rounded-none text-center">
        <h1 className="text-4xl md:text-5xl font-display text-black mb-3 uppercase tracking-tighter">MonoHabit</h1>
        <p className="text-base md:text-xl font-serif italic text-black/70 mb-8 md:mb-10">Track your habits with brutalist elegance.</p>
        
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

const TAB_ITEMS = [
  {
    id: 'today', label: 'Today',
    icon: (active: boolean) => <Calendar strokeWidth={active ? 3 : 2} className={cn("w-6 h-6 transition-colors", active ? "text-black" : "text-black/35")} />
  },
  {
    id: 'trends', label: 'Trends',
    icon: (active: boolean) => <BarChart2 strokeWidth={active ? 3 : 2} className={cn("w-6 h-6 transition-colors", active ? "text-black" : "text-black/35")} />
  },
  {
    id: 'wall', label: 'Wall',
    icon: (active: boolean) => (
      <svg className={cn("w-6 h-6 transition-colors", active ? "text-black" : "text-black/35")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 3 : 2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line>
        <line x1="9" y1="9" x2="9" y2="15"></line><line x1="15" y1="15" x2="15" y2="21"></line>
        <line x1="15" y1="3" x2="15" y2="9"></line>
      </svg>
    )
  },
  {
    id: 'settings', label: 'Settings',
    icon: (active: boolean) => <SettingsIcon strokeWidth={active ? 3 : 2} className={cn("w-6 h-6 transition-colors", active ? "text-black" : "text-black/35")} />
  },
];

const TabBar = ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-[#F5F5F0]/95 backdrop-blur-sm border-t-3 border-black flex justify-around items-start pt-2 z-50"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
    >
      {TAB_ITEMS.map(({ id, label, icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="flex flex-col items-center gap-0.5 px-4 pt-1 pb-0.5 min-w-[52px]"
          >
            {icon(active)}
            <span className={cn(
              "font-display text-[9px] uppercase tracking-wider transition-colors leading-none mt-0.5",
              active ? "text-black" : "text-black/35"
            )}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const Header = ({ title }: { title: string }) => {
  return (
    <div
      className="fixed top-0 left-0 right-0 bg-[#F5F5F0] border-b-3 border-black z-40 flex items-end justify-center pb-3"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 52px)' }}
    >
      <span className="font-display text-[15px] text-black uppercase tracking-widest">
        {title}
      </span>
    </div>
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
  const actionsOpacity = useTransform(x, [-120, -60], [1, 0]);
  const SNAP_THRESHOLD = -60;
  const OPEN_X = -128;

  const [isOpen, setIsOpen] = useState(false);

  // Long press to edit
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handleTouchStart = () => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onEdit(habit);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleDragEnd = (_event: any, info: PanInfo) => {
    if (info.offset.x < SNAP_THRESHOLD) {
      setIsOpen(true);
      x.set(OPEN_X);
    } else {
      setIsOpen(false);
      x.set(0);
    }
  };

  const handleClick = () => {
    if (longPressFired.current) return;
    if (isOpen) {
      setIsOpen(false);
      x.set(0);
      return;
    }
    onToggle(habit.id);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onEdit(habit);
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const primaryColors = ['bg-electric-blue', 'bg-signal-yellow', 'bg-bold-red', 'bg-racing-green'];
  const colorClass = primaryColors[habit.id % primaryColors.length];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="relative group h-full overflow-hidden"
    >
      {/* Background Actions: Edit + Delete */}
      <motion.div
        style={{ opacity: actionsOpacity }}
        className="absolute inset-y-0 right-0 flex items-stretch border-3 border-black shadow-[4px_4px_0px_#000000]"
      >
        <button
          onClick={() => { setIsOpen(false); x.set(0); onEdit(habit); }}
          className="w-16 bg-electric-blue flex flex-col items-center justify-center gap-1 border-r-2 border-black"
        >
          <span className="font-display text-[9px] text-white uppercase tracking-widest">Edit</span>
        </button>
        <button
          onClick={() => { setIsOpen(false); x.set(0); onDelete(habit.id); }}
          className="w-16 bg-bold-red flex flex-col items-center justify-center gap-1"
        >
          <span className="font-display text-[9px] text-white uppercase tracking-widest">Delete</span>
        </button>
      </motion.div>

      {/* Foreground Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: OPEN_X, right: 0 }}
        dragElastic={{ left: 0.15, right: 0.05 }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={cn(
          "habit-item px-4 py-4 md:px-6 md:py-5 flex flex-row items-center justify-between gap-3 cursor-pointer rounded-none relative z-10 min-h-[68px] md:min-h-0",
          habit.completed ? cn("is-active", colorClass) : habit.status === 'skipped' ? "bg-gray-200" : "bg-white"
        )}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        <span className={cn(
          "text-lg leading-snug md:text-3xl font-serif italic transition-colors duration-300 flex-1",
          habit.completed && colorClass !== 'bg-signal-yellow' ? "text-white" : habit.status === 'skipped' ? "text-gray-500 line-through" : "text-black"
        )}>
          {habit.title}
        </span>

        <div className={cn(
          "habit-checkbox w-7 h-7 md:w-8 md:h-8 flex items-center justify-center transition-colors duration-300 shrink-0",
          habit.completed ? "border-black" : habit.status === 'skipped' ? "border-gray-400" : "border-black"
        )}>
          {habit.status === 'skipped' ? (
            <X className="w-4 h-4 md:w-5 md:h-5 text-gray-500" strokeWidth={4} />
          ) : (
            <Check className={cn("w-4 h-4 md:w-5 md:h-5 transition-opacity duration-300 check-icon", habit.completed ? "opacity-100" : "opacity-0")} strokeWidth={4} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const AddHabitModal = ({ isOpen, onClose, onSave, onDelete, onSkip, initialHabit, dateLabel }: { isOpen: boolean; onClose: () => void; onSave: (title: string) => void; onDelete?: (id: number) => void; onSkip?: (id: number) => void; initialHabit?: Habit | null; dateLabel?: string }) => {
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
              {initialHabit.status === 'skipped' ? `Unskip for ${dateLabel ?? 'Today'}` : `Skip for ${dateLabel ?? 'Today'}`}
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

// --- Day Detail Modal ---

const DayDetailModal = ({ date, onClose }: { date: string; onClose: () => void }) => {
  const [completions, setCompletions] = useState<{ title: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/completions/${date}`)
      .then(res => res.json())
      .then(data => setCompletions(Array.isArray(data) ? data : []))
      .catch(() => setCompletions([]))
      .finally(() => setLoading(false));
  }, [date]);

  const completedCount = completions.filter(c => c.status === 'completed').length;
  const totalCount = completions.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#F5F5F0]/90 backdrop-blur-sm p-4">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="w-full max-w-sm bg-white border-3 border-black shadow-[8px_8px_0px_#000000] rounded-none"
      >
        <div className="flex justify-between items-start p-4 border-b-3 border-black">
          <div>
            <div className="font-display text-[9px] uppercase tracking-widest text-black/50 mb-0.5">Day Summary</div>
            <div className="font-display text-base uppercase tracking-tighter">
              {format(parseISO(date), 'EEEE, MMM d yyyy')}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {totalCount > 0 && (
              <span className="font-display text-sm tabular-nums">{completedCount}/{totalCount}</span>
            )}
            <button onClick={onClose} className="p-1 hover:text-bold-red transition-colors">
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="p-4 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 font-display text-[10px] uppercase tracking-widest text-black/40">Loading...</div>
          ) : totalCount === 0 ? (
            <div className="text-center py-8 font-serif italic text-black/40">No habits tracked</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {completions.map((c, i) => (
                <div key={i} className={cn(
                  "flex items-center justify-between px-3 py-2.5 border-2 border-black gap-3",
                  c.status === 'completed' ? "bg-racing-green" : c.status === 'skipped' ? "bg-gray-100" : "bg-white"
                )}>
                  <span className={cn(
                    "font-serif italic text-sm flex-1",
                    c.status === 'completed' ? "text-white" : c.status === 'skipped' ? "text-gray-400 line-through" : "text-black/40"
                  )}>{c.title}</span>
                  {c.status === 'completed'
                    ? <Check className="w-4 h-4 text-white shrink-0" strokeWidth={3} />
                    : c.status === 'skipped'
                    ? <X className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={3} />
                    : <div className="w-4 h-4 border-2 border-black/20 shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- Visualization Components ---

const WeeklyView = ({ data, onDayClick }: { data: StatData; onDayClick: (date: string) => void }) => {
  const { paletteId } = useContext(PaletteContext);
  const palette = PALETTES[paletteId]?.colors || PALETTES['traffic'].colors;

  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 });
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
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = data.heatmap.find(d => d.date === dateStr);
        const count = dayData?.count ?? 0;
        const total = dayData?.total ?? 0;
        const percentage = total > 0 ? count / total : 0;
        const height = total > 0 ? Math.max(percentage * 100, 5) : 3;
        const colorClass = getColorClass(percentage);

        return (
          <div
            key={dateStr}
            className="flex flex-col items-center gap-4 flex-1 cursor-pointer"
            onClick={() => total > 0 && onDayClick(dateStr)}
          >
            <div className="w-full bg-[#F5F5F0] border-3 border-black rounded-none relative h-40 flex items-end overflow-hidden group">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={cn("w-full border-t-3 border-black", colorClass)}
              />
              <div className="absolute bottom-2 w-full text-center text-[10px] font-display text-black opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/80 py-1">
                {total > 0 ? `${count}/${total}` : '—'}
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

const MonthlyView = ({ data, onDayClick }: { data: StatData; onDayClick: (date: string) => void }) => {
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
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayData = data.heatmap.find(d => d.date === dateStr);
          const count = dayData?.count ?? 0;
          const total = dayData?.total ?? 0;
          const percentage = total > 0 ? count / total : 0;
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          const colorClass = getColorClass(percentage);

          return (
            <div
              key={dateStr}
              onClick={() => isCurrentMonth && total > 0 && onDayClick(dateStr)}
              title={total > 0 ? `${count}/${total} habits` : undefined}
              className={cn(
                "aspect-square flex items-center justify-center text-[12px] font-serif italic relative transition-all duration-300 rounded-none overflow-hidden border-2",
                !isCurrentMonth ? "opacity-20" : total > 0 ? "cursor-pointer hover:opacity-80" : "",
                isToday ? "border-black" : "border-transparent",
                colorClass
              )}
            >
              <span className={cn(
                "relative z-20",
                count > 0 && colorClass !== 'bg-signal-yellow' ? "text-white font-sans font-bold text-[11px]" : "text-black"
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

const YearlyView = ({ data, onDayClick }: { data: StatData; onDayClick: (date: string) => void }) => {
  const { paletteId } = useContext(PaletteContext);
  const palette = PALETTES[paletteId]?.colors || PALETTES['traffic'].colors;

  const currentYear = new Date().getFullYear();
  const start = startOfYear(new Date(currentYear, 0, 1));
  const end = endOfYear(new Date(currentYear, 0, 1));
  const days = eachDayOfInterval({ start, end });

  const startDay = (getDay(start) + 6) % 7;
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
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} className="w-4 h-4 bg-transparent" />
          ))}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = data.heatmap.find(d => d.date === dateStr);
            const count = dayData?.count ?? 0;
            const total = dayData?.total ?? 0;
            const percentage = total > 0 ? count / total : 0;
            const colorClass = getColorClass(percentage);

            return (
              <div
                key={dateStr}
                onClick={() => total > 0 && onDayClick(dateStr)}
                title={total > 0 ? `${dateStr}: ${count}/${total}` : dateStr}
                className={cn(
                  "w-4 h-4 rounded-none border border-black/5",
                  total > 0 ? "cursor-pointer hover:opacity-75" : "",
                  colorClass
                )}
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

const TodayScreen = ({ habits, loading, selectedDate, isViewingToday, onPrevDay, onNextDay, onToggle, onDelete, onEdit, onAdd }: any) => {
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);

  useEffect(() => {
    apiFetch('/api/milestones')
      .then(res => res.json())
      .then(data => {
        if (data.nodes) {
          const active = data.nodes.find((n: Milestone) => n.status === 'active');
          setActiveMilestone(active || null);
        }
      })
      .catch(e => console.error('Failed to fetch active milestone', e));
  }, []);

  const completedCount = habits.filter((h: Habit) => h.completed).length;

  return (
    <div className="pb-40 md:pb-32 min-h-screen bg-[#F5F5F0]">
      <Header title={isViewingToday ? 'Today' : format(selectedDate, 'EEE, MMM d')} />

      <div className="px-4 md:px-6 mt-4 md:mt-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px + 1rem)' }}>
        {/* Date nav + counter row */}
        <div className="flex justify-between items-center mb-5 md:mb-10">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPrevDay}
              className="w-9 h-9 flex items-center justify-center border-3 border-black bg-white hover:bg-signal-yellow transition-colors shadow-[2px_2px_0px_#000000] active:translate-y-px active:translate-x-px active:shadow-none"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={3} />
            </button>
            <span className="text-black font-display text-[11px] md:text-sm uppercase tracking-widest px-1">
              {format(selectedDate, 'EEE, MMM d')}
            </span>
            <button
              onClick={onNextDay}
              disabled={isViewingToday}
              className="w-9 h-9 flex items-center justify-center border-3 border-black bg-white hover:bg-signal-yellow transition-colors shadow-[2px_2px_0px_#000000] active:translate-y-px active:translate-x-px active:shadow-none disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={3} />
            </button>
          </div>

          {/* Progress pill */}
          <div className="flex items-center gap-2">
            <span className="text-black font-display text-xs md:text-sm tabular-nums">
              {completedCount}/{habits.length}
            </span>
            {habits.length > 0 && (
              <div className="hidden sm:block w-20 h-2 border-2 border-black bg-white overflow-hidden">
                <div
                  className="h-full bg-black transition-all duration-300"
                  style={{ width: `${Math.round((completedCount / habits.length) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {activeMilestone && (
          <div className="mb-5 md:mb-8 p-3 border-3 border-black bg-electric-blue text-black shadow-[4px_4px_0px_#000000] flex items-center gap-3">
            <div className="text-lg shrink-0">📍</div>
            <div className="min-w-0">
              <div className="font-display text-[9px] uppercase tracking-widest opacity-60 mb-0.5">Current Milestone</div>
              <div className="font-display text-sm uppercase tracking-tight truncate">{activeMilestone.title}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center">
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="font-display text-sm uppercase tracking-widest text-black"
            >
              Loading...
            </motion.div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 md:gap-2">
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
                  className="py-20 text-center border-3 border-black bg-white shadow-[4px_4px_0px_#000000]"
                >
                  <p className="text-black font-display text-base uppercase tracking-widest mb-3">
                    {isViewingToday ? 'No habits yet' : 'No records for this day'}
                  </p>
                  <p className="text-black/60 font-serif italic">
                    {isViewingToday ? 'Tap + to start your journey' : 'Nothing was tracked on this date'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Desktop add button */}
        <button
          onClick={onAdd}
          className="hidden md:flex mt-8 w-full py-6 border-3 border-black bg-white text-black font-display text-sm uppercase tracking-widest hover:bg-signal-yellow transition-colors items-center justify-center gap-3 rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
        >
          <Plus className="w-6 h-6" strokeWidth={3} /> Add Habit
        </button>
      </div>

      {/* Floating Add button — mobile only, above tab bar */}
      <button
        onClick={onAdd}
        className="fixed right-4 md:hidden w-14 h-14 bg-black text-white border-3 border-black shadow-[4px_4px_0px_#000000] flex items-center justify-center z-40 active:translate-y-1 active:translate-x-1 active:shadow-none hover:bg-electric-blue transition-colors"
        style={{ bottom: 'calc(max(5rem, env(safe-area-inset-bottom) + 5rem) + 0.75rem)' }}
        aria-label="Add Habit"
      >
        <Plus className="w-7 h-7" strokeWidth={3} />
      </button>
    </div>
  );
};

const TrendsScreen = () => {
  const [stats, setStats] = useState<StatData | null>(null);
  const [view, setView] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
      <Header title="Trends" />

      <div className="px-4 md:px-6 mt-6 md:mt-8" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px + 1.5rem)' }}>
        {/* View Selector */}
        <div className="flex p-1 bg-white mb-6 md:mb-10 rounded-none border-3 border-black shadow-[4px_4px_0px_#000000]">
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

        <div className="border-3 border-black bg-white p-5 md:p-8 mb-6 md:mb-8 min-h-[260px] rounded-none shadow-[4px_4px_0px_#000000]">
          <div className="flex items-baseline justify-between mb-6 md:mb-8">
            <h3 className="text-black font-display text-xl md:text-2xl uppercase tracking-tighter">{view} Overview</h3>
            <span className="text-black/40 font-display text-[9px] uppercase tracking-widest">Tap a day for details</span>
          </div>
          {stats ? (
            <>
              {view === 'weekly' && <WeeklyView data={stats} onDayClick={setSelectedDay} />}
              {view === 'monthly' && <MonthlyView data={stats} onDayClick={setSelectedDay} />}
              {view === 'yearly' && <YearlyView data={stats} onDayClick={setSelectedDay} />}
            </>
          ) : (
            <div className="text-black/50 font-sans text-sm">Loading stats...</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-6">
          <div className="border-3 border-black bg-white p-5 md:p-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <div className="text-black/50 font-display text-[10px] uppercase mb-2 tracking-widest">Current Streak</div>
            <div className="text-4xl md:text-5xl font-serif italic text-black">
              {stats?.currentStreak ?? 0}
            </div>
          </div>
          <div className="border-3 border-black bg-white p-5 md:p-6 rounded-none shadow-[4px_4px_0px_#000000]">
            <div className="text-black/50 font-display text-[10px] uppercase mb-2 tracking-widest">Completion Rate</div>
            <div className="text-4xl md:text-5xl font-serif italic text-black">
              {stats?.completionRate ?? 0}%
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedDay && (
          <DayDetailModal date={selectedDay} onClose={() => setSelectedDay(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

const PromptModal = ({ isOpen, title, initialValue, onConfirm, onCancel }: { isOpen: boolean; title: string; initialValue: string; onConfirm: (val: string) => void; onCancel: () => void }) => {
  const [value, setValue] = useState(initialValue);
  
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F5F5F0]/90 backdrop-blur-sm p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-sm bg-white border-3 border-black p-8 shadow-[8px_8px_0px_#000000] rounded-none"
      >
        <h3 className="font-display text-xl uppercase tracking-tighter mb-4 text-center">{title}</h3>
        <input 
          autoFocus
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border-3 border-black p-3 font-serif text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-electric-blue"
          onKeyDown={e => {
            if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex gap-4">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 border-3 border-black bg-white text-black font-display text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            Cancel
          </button>
          <button 
            onClick={() => value.trim() && onConfirm(value.trim())}
            className="flex-1 py-3 border-3 border-black bg-black text-white font-display text-xs uppercase tracking-widest hover:bg-electric-blue transition-colors rounded-none shadow-[4px_4px_0px_#000000] active:translate-y-1 active:translate-x-1 active:shadow-[0px_0px_0px_#000000]"
          >
            Save
          </button>
        </div>
      </motion.div>
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

            // Parse status — support 'completed'/'skipped' explicitly, plus true/false/yes/no
            const rawStatus = completedKey ? String(row[completedKey]).toLowerCase().trim() : 'completed';
            const status = (rawStatus === 'completed' || rawStatus === 'true' || rawStatus === '1' || rawStatus === 'yes')
              ? 'completed' : 'skipped';

            return {
              date: dateStr,
              title: row[titleKey],
              completed: status === 'completed',
              status
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
      <Header title="Settings" />

      <div className="px-6 mt-8" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 52px + 2rem)' }}>
        <div className="mb-12">
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [pastHabits, setPastHabits] = useState<Habit[] | null>(null);
  const [loadingPastHabits, setLoadingPastHabits] = useState(false);

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

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isViewingToday = format(selectedDate, 'yyyy-MM-dd') === todayStr;
  const displayHabits = isViewingToday ? habits : (pastHabits ?? []);

  const fetchPastHabits = async (date: Date) => {
    setLoadingPastHabits(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/habits?date=${dateStr}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPastHabits(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Fetch past habits error:', e);
      setPastHabits([]);
    } finally {
      setLoadingPastHabits(false);
    }
  };

  useEffect(() => {
    if (user && !isViewingToday) {
      fetchPastHabits(selectedDate);
    }
  }, [selectedDate, user]);

  const handlePrevDay = () => setSelectedDate(prev => subDays(prev, 1));
  const handleNextDay = () => {
    setSelectedDate(prev => {
      const next = addDays(prev, 1);
      return next <= new Date() ? next : prev;
    });
  };

  const handleToggle = async (id: number) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    // Optimistic update
    if (isViewingToday) {
      setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: !h.completed, status: h.completed ? null : 'completed' } : h));
    } else {
      setPastHabits(prev => prev?.map(h => h.id === id ? { ...h, completed: !h.completed, status: h.completed ? null : 'completed' } : h) ?? null);
    }

    try {
      const res = await apiFetch(`/api/habits/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr })
      });
      if (!res.ok) throw new Error('Toggle failed');
      const data = await res.json();
      if (isViewingToday) {
        setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h));
      } else {
        setPastHabits(prev => prev?.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h) ?? null);
      }
    } catch (e) {
      console.error('Toggle error:', e);
      if (isViewingToday) fetchHabits(); else fetchPastHabits(selectedDate);
    }
  };

  const handleSkip = async (id: number) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    // Optimistic update
    if (isViewingToday) {
      setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: false, status: h.status === 'skipped' ? null : 'skipped' } : h));
    } else {
      setPastHabits(prev => prev?.map(h => h.id === id ? { ...h, completed: false, status: h.status === 'skipped' ? null : 'skipped' } : h) ?? null);
    }

    try {
      const res = await apiFetch(`/api/habits/${id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr })
      });
      if (!res.ok) throw new Error('Skip failed');
      const data = await res.json();
      if (isViewingToday) {
        setHabits(prev => prev.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h));
      } else {
        setPastHabits(prev => prev?.map(h => h.id === id ? { ...h, completed: data.completed, status: data.status } : h) ?? null);
      }
    } catch (e) {
      console.error('Skip error:', e);
      if (isViewingToday) fetchHabits(); else fetchPastHabits(selectedDate);
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
            habits={displayHabits}
            loading={loadingPastHabits}
            selectedDate={selectedDate}
            isViewingToday={isViewingToday}
            onPrevDay={handlePrevDay}
            onNextDay={handleNextDay}
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
        {activeTab === 'wall' && <WallScreen />}
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
              dateLabel={isViewingToday ? 'Today' : format(selectedDate, 'MMM d')}
            />
          )}
        </AnimatePresence>
      </div>
    </PaletteContext.Provider>
  );
}
