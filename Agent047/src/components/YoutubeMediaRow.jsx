import React from 'react';
import { Play, Users, Calendar, ExternalLink } from 'lucide-react';

const YoutubeMediaRow = ({ title, channel, views, year, thumbnail, url, audit }) => {
  const formatViews = (count) => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count;
  };

  return (
    <div className="group relative flex flex-col md:flex-row gap-6 p-6 glass rounded-[32px] border border-border/50 hover:border-accent-sport/30 transition-all duration-500 hover:shadow-2xl hover:shadow-accent-sport/5 mb-6 overflow-hidden">
      {/* Visual Side (Thumbnail) */}
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="relative w-full md:w-64 aspect-video rounded-2xl overflow-hidden shrink-0 block"
      >
        <img 
          src={thumbnail} 
          alt={title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 rounded-full bg-accent-sport flex items-center justify-center text-black shadow-xl scale-75 group-hover:scale-100 transition-transform duration-500">
            <Play size={20} fill="currentColor" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded-md text-[10px] font-bold text-white uppercase tracking-widest backdrop-blur-md">
          Watch Audit
        </div>
      </a>

      {/* Content Side */}
      <div className="flex flex-col flex-grow min-w-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase font-black tracking-[0.2em] text-accent-sport italic">Technical Footage</span>
          <div className="flex items-center gap-4 text-muted-foreground/60 text-xs font-bold uppercase tracking-widest">
            <div className="flex items-center gap-1">
              <Users size={12} />
              {formatViews(views)}
            </div>
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              {year}
            </div>
          </div>
        </div>

        <h3 className="text-xl font-black uppercase italic tracking-tighter leading-tight mb-3 group-hover:text-accent-sport transition-colors line-clamp-1">
          {title}
        </h3>

        <div className="bg-secondary/30 rounded-2xl p-4 border border-border/30 relative mb-4">
            <span className="absolute -top-2 left-4 px-2 bg-background text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground border border-border rounded-full">Coach's Audit</span>
            <p className="text-sm text-foreground/80 leading-relaxed font-medium italic">
                "{audit}"
            </p>
        </div>

        <div className="mt-auto flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate max-w-[150px]">
                {channel}
            </span>
            <a 
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-accent-sport hover:translate-x-1 transition-transform"
            >
                Deconstruct <ExternalLink size={12} />
            </a>
        </div>
      </div>
    </div>
  );
};

export default YoutubeMediaRow;
