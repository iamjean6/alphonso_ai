import React from 'react';
import { Bookmark, Gift, Wrench, DollarSign, Flag, Settings2, Info } from 'lucide-react';

const RightToolbar = () => {
  return (
    <div className="w-16 h-screen flex flex-col items-center py-6 bg-sidebar border-l border-sidebar-border space-y-6">
      <div className="flex flex-col gap-4">
        <ToolButton icon={<Bookmark size={20} />} />
        <ToolButton icon={<Gift size={20} />} />
        <ToolButton icon={<Wrench size={20} />} />
        <ToolButton icon={<DollarSign size={20} />} />
        <ToolButton icon={<Flag size={20} />} />
      </div>
      
      <div className="mt-auto flex flex-col gap-4">
        <ToolButton icon={<Settings2 size={20} />} />
        <ToolButton icon={<Info size={20} />} />
      </div>
    </div>
  );
};

const ToolButton = ({ icon }) => (
  <button className="p-3 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl transition-all">
    {icon}
  </button>
);

export default RightToolbar;
