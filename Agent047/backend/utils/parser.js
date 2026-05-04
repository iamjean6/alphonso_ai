/**
 * Pro Parser: Deconstructs the Alphonso AI response into structured data.
 * This is the server-side source of truth for message persistence.
 */
export const parseAlphonsoResponse = (text) => {
    if (!text) return { cleanedText: "", videos: [] };

    const lines = text.split('\n');
    const videos = [];
    let lastTitle = "";
    let lastChannel = "";
    let lastAudit = "";

    lines.forEach(line => {
        // 1. CAPTURE TITLE/CHANNEL (Supports both bold and raw text)
        const titleRowMatch = line.match(/(?:\d+\.\s+)?(?:\*\*)?([^*]+?)(?:\*\*)?\s+by\s+([^-:[\]]+?)(?:\s+Audit:|\s*\*Audit:\*|$)/i);
        if (titleRowMatch) {
            lastTitle = titleRowMatch[1].trim();
            lastChannel = titleRowMatch[2].trim();
        }

        // 1.5 CAPTURE AUDIT (Handles both standalone and inline after "Audit:")
        const auditMatch = line.match(/(?:\s+Audit:|\*Audit:\*)\s*(.+?)(?:\s+\[System Metadata\]|$)/i);
        if (auditMatch) {
            lastAudit = auditMatch[1].trim();
        }

        // 2. EXTRACT VIDEO DATA
        const idMatch = line.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([0-9A-Za-z_-]{11})/i);
        if (idMatch) {
            const videoId = idMatch[1];
            
            // Extract metadata if present
            const viewsMatch = line.match(/Views:\s*(\d+)/i);
            const yearMatch = line.match(/Year:\s*(\d{4})/i);
            const thumbMatch = line.match(/Thumb:\s*(https:\/\/[^\s]+)/i);

            const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;
            const year = yearMatch ? yearMatch[1] : "2024";
            const thumbnail = thumbMatch ? thumbMatch[1].trim() : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            // Prevent duplicates
            if (!videos.some(v => v.id === videoId)) {
                videos.push({
                    id: videoId,
                    title: lastTitle || "Expert Training Drill",
                    channel: lastChannel || "Elite Performance",
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    views,
                    year,
                    thumbnail,
                    audit: lastAudit || "Study this footage for technical precision."
                });
                // Reset transient state
                lastAudit = "";
            }
        }
    });

    // 3. CLEAN TEXT (Keep titles, remove metadata, audits, and graph tags)
    let cleanedText = text;
    cleanedText = cleanedText.replace(/### (THE VISUAL MASTERCLASS|MEDIA & DRILLS|TRAINING RESOURCES)[:\s]*/gi, '');
    cleanedText = cleanedText.replace(/\[PHASE \d+\] [^:\n]+/gi, ''); // Scrub Phase headers
    cleanedText = cleanedText.replace(/\[GRAPH_FILE:\s*[^\]]+\]/gi, ''); // Scrub the graph tags

    cleanedText = cleanedText.split('\n').map(line => {
        // Remove "by [Channel Name] Audit: ..." from title lines
        const titleRowMatch = line.match(/^(\d+\.\s+)?(?:\*\*)?([^*]+?)(?:\*\*)?\s+by\s+([^-:[\]]+?)(?:\s+Audit:|\s*\*Audit:\*|$)/i);
        if (titleRowMatch) {
            const numbering = titleRowMatch[1] || "";
            const title = titleRowMatch[2].trim();
            return `${numbering}**${title}**`; 
        }
        return line;
    }).filter(line => {
        // Remove System Metadata, Link, and Audit lines
        const isScrubLine = /(youtube\.com|youtu\.be|\[System Metadata\]|\*Audit:\*|Views:|Year:|Thumb:|Link:)/i.test(line);
        return !isScrubLine;
    }).join('\n');

    return {
        cleanedText: cleanedText.trim() || text,
        videos
    };
};
