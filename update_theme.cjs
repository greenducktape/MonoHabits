const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Theme replacements
content = content.replace(/bg-black\/80/g, 'bg-[#F9F9F6]/80');
content = content.replace(/bg-black/g, 'bg-[#F9F9F6]');
content = content.replace(/text-white/g, 'text-stone-900');
content = content.replace(/border-\[#333333\]/g, 'border-stone-300');
content = content.replace(/bg-\[#111111\]/g, 'bg-white');
content = content.replace(/text-\[#444444\]/g, 'text-stone-500');
content = content.replace(/text-\[#888888\]/g, 'text-stone-400');
content = content.replace(/text-\[#666666\]/g, 'text-stone-400');
content = content.replace(/text-\[#222222\]/g, 'text-stone-400');

// Swap white and black for elements that need to contrast with the background
content = content.replace(/bg-white/g, 'bg-stone-900');
content = content.replace(/border-white/g, 'border-stone-900');
content = content.replace(/text-black/g, 'text-white');

// Fix specific elements
content = content.replace(/const GLASS_COLORS = \['glass-blue', 'glass-green', 'glass-red', 'glass-orange'\];/, "const GLASS_COLORS = ['glass-blue', 'glass-yellow', 'glass-green', 'glass-brown'];");

// HabitItem text color when completed (needs to be white to contrast with the colorful tiles)
content = content.replace(/habit\.completed \? "text-stone-900 font-medium drop-shadow-md" : "text-stone-900"/, 'habit.completed ? "text-white font-medium drop-shadow-md" : "text-stone-900"');

// Check icon needs to be white
content = content.replace(/<Check className="w-4 h-4 text-stone-900 drop-shadow-sm"/, '<Check className="w-4 h-4 text-white drop-shadow-sm"');

// HabitItem completed button background
content = content.replace(/bg-stone-900\/20 border-stone-900\/50/, 'bg-white/20 border-white/50');

// Monthly view text color when completed
content = content.replace(/glassClass \? "text-stone-900 font-bold drop-shadow-md" : \(count > 0 \? "text-white mix-blend-difference" : "text-stone-500"\)/, 'glassClass ? "text-white font-bold drop-shadow-md" : (count > 0 ? "text-white mix-blend-difference" : "text-stone-500")');

// Weekly view count text
content = content.replace(/text-white font-bold mix-blend-screen/, 'text-white font-bold mix-blend-difference');

fs.writeFileSync('src/App.tsx', content);
console.log('Theme updated in App.tsx');
