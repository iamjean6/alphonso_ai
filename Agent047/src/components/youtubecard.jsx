import React from 'react';
import { Users } from 'lucide-react';

const YoutubeCard = ({ number, title, views, year, thumbnail, url }) => {
  const handleClick = () => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Format large numbers (e.g., 1250000 -> 1.2M)
  const formatViews = (num) => {
    if (!num) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div 
      onClick={handleClick}
      className="flex-shrink-0 w-72 group cursor-pointer h-96 relative rounded-[32px] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-border bg-card"
    >
      {/* Thumbnail */}
      <img 
        src={thumbnail} 
        alt={title} 
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
      />
      
      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
      
      {/* Top Number Badge */}
      <div className="absolute top-4 left-4 w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-foreground font-bold shadow-xl">
        {number}
      </div>

      {/* Content */}
      <div className="absolute bottom-6 left-6 right-6">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="bg-primary/20 p-1.5 rounded-lg backdrop-blur-md border border-primary/20">
            <Users size={12} className="text-primary fill-primary/30" />
          </div>
          <span className="text-primary text-sm font-black tracking-tight">{formatViews(views)} Views</span>
          <span className="text-muted-foreground/40 text-xs">|</span>
          <span className="text-muted-foreground text-sm font-medium">{year}</span>
        </div>
        <h3 className="text-foreground font-bold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors duration-300">
          {title}
        </h3>
      </div>
    </div>
  );
};

export default YoutubeCard;
