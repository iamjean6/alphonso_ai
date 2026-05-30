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
        // 1. CAPTURE TITLE/CHANNEL (Supports 'by', '—', and '-')
        const titleRowMatch = line.match(/(?:\d+\.\s+)?(?:\*\*)?([^*]+?)(?:\*\*)?\s+(?:by|—|-)\s+([^-:[\]]+?)(?:\s+Audit:|\s*\*Audit:\*|$)/i);
        if (titleRowMatch) {
            lastTitle = titleRowMatch[1].trim();
            lastChannel = titleRowMatch[2].trim();
        }

        // 1.5 CAPTURE AUDIT (Handles standalone, 'Audit:', '*Audit:*', and 'Audit* Why it's in your film room:*')
        const auditMatch = line.match(/(?:\s+Audit:|\*Audit:\*|\*Audit\* Why it's in your film room:\*)\s*(.+?)(?:\s+\[System Metadata\]|\s+\[SYSTEM\]|$)/i);
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
                lastTitle = "";
                lastChannel = "";
            }
        }
    });

    // 3. CAPTURE PDF URL IF PRESENT
    let pdfUrl = "";
    const pdfMatch = text.match(/\[PDF_URL:\s*([^\]]+)\]/i);
    if (pdfMatch) {
        pdfUrl = pdfMatch[1].trim();
    }

    // 4. CLEAN TEXT (Keep titles, remove metadata, audits, graph tags, and PDF tags)
    let cleanedText = text;
    cleanedText = cleanedText.replace(/### (THE VISUAL MASTERCLASS|MEDIA & DRILLS|TRAINING RESOURCES)[:\s]*/gi, '');
    cleanedText = cleanedText.replace(/\[PHASE \d+\] [^:\n]+/gi, ''); // Scrub Phase headers
    cleanedText = cleanedText.replace(/\[GRAPH_FILE:\s*[^\]]+\]/gi, ''); // Scrub the graph tags
    cleanedText = cleanedText.replace(/\[PDF_URL:\s*[^\]]+\]/gi, ''); // Scrub the PDF tag

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
        // Remove System Metadata, Link, Audit lines, and decorative horizontal lines
        const isScrubLine = /(youtube\.com|youtu\.be|\[System Metadata\]|\[SYSTEM\]|\*Audit:\*|Views:|Year:|Thumb:|Link:|PDF_URL:)/i.test(line);
        const isDecorativeLine = /^[─═\-_*]{5,}$/.test(line.trim());
        return !isScrubLine && !isDecorativeLine;
    }).join('\n');

    return {
        cleanedText: cleanedText.trim() || text,
        videos,
        pdfUrl
    };
};
