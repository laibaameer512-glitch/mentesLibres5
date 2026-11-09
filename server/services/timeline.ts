import { ExtractedMessage } from './extract.ts';

export interface TimelineEvent {
  id: string;
  timestamp: string; // ISO string or standardized format
  rawTimestamp: string;
  speaker: string;
  text: string;
  platform: string;
  sourceEvidenceId: string;
  sourceType: 'screenshot' | 'audio' | 'text';
  isThreat?: boolean;
  hasGapBefore?: boolean;
  gapDurationDescription?: string;
  isDateUncertain?: boolean;
}

export interface TimelineResult {
  events: TimelineEvent[];
  totalEvents: number;
  startDate: string;
  endDate: string;
  duplicateCountRemoved: number;
  gapsIdentified: number;
  uncertainDatesCount: number;
}

interface EvidenceInputItem {
  id: string;
  type: 'screenshot' | 'audio' | 'text';
  platform: string;
  incidentDateTime: string; // user provided or extracted
  extractedMessages?: ExtractedMessage[];
  rawText?: string;
}

/**
 * Merges all evidence items chronologically, removes duplicates, and marks gaps or uncertain dates.
 */
export function buildChronologicalTimeline(items: EvidenceInputItem[]): TimelineResult {
  const rawEvents: TimelineEvent[] = [];

  items.forEach((item) => {
    if (item.extractedMessages && item.extractedMessages.length > 0) {
      item.extractedMessages.forEach((msg, idx) => {
        const parsedTime = parseFlexibleDateTime(msg.timestamp, item.incidentDateTime);
        rawEvents.push({
          id: msg.id || `${item.id}-msg-${idx}`,
          timestamp: parsedTime.normalized,
          rawTimestamp: msg.timestamp || item.incidentDateTime,
          speaker: msg.speaker || 'Unknown',
          text: msg.text,
          platform: item.platform,
          sourceEvidenceId: item.id,
          sourceType: item.type,
          isThreat: msg.isThreat,
          isDateUncertain: parsedTime.isUncertain,
        });
      });
    } else if (item.rawText) {
      const parsedTime = parseFlexibleDateTime('', item.incidentDateTime);
      rawEvents.push({
        id: `${item.id}-item`,
        timestamp: parsedTime.normalized,
        rawTimestamp: item.incidentDateTime,
        speaker: 'Record Entry',
        text: item.rawText,
        platform: item.platform,
        sourceEvidenceId: item.id,
        sourceType: item.type,
        isDateUncertain: parsedTime.isUncertain,
      });
    }
  });

  // Sort chronologically
  rawEvents.sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  // Deduplicate near-identical texts from same speaker within short window
  const uniqueEvents: TimelineEvent[] = [];
  let duplicateCount = 0;

  for (const event of rawEvents) {
    const isDup = uniqueEvents.some((existing) => {
      const textMatch = existing.text.trim().toLowerCase() === event.text.trim().toLowerCase();
      const speakerMatch = existing.speaker.toLowerCase() === event.speaker.toLowerCase();
      return textMatch && speakerMatch;
    });

    if (isDup) {
      duplicateCount++;
    } else {
      uniqueEvents.push(event);
    }
  }

  // Identify time gaps (> 24 hours between events)
  let gapsCount = 0;
  let uncertainCount = 0;

  for (let i = 0; i < uniqueEvents.length; i++) {
    if (uniqueEvents[i].isDateUncertain) {
      uncertainCount++;
    }
    if (i > 0) {
      const prevTime = new Date(uniqueEvents[i - 1].timestamp).getTime();
      const currTime = new Date(uniqueEvents[i].timestamp).getTime();
      const diffHours = (currTime - prevTime) / (1000 * 60 * 60);

      if (diffHours >= 24) {
        gapsCount++;
        uniqueEvents[i].hasGapBefore = true;
        const days = Math.floor(diffHours / 24);
        uniqueEvents[i].gapDurationDescription = `${days} day${days > 1 ? 's' : ''} interval`;
      }
    }
  }

  const startDate = uniqueEvents.length > 0 ? uniqueEvents[0].timestamp : new Date().toISOString();
  const endDate = uniqueEvents.length > 0 ? uniqueEvents[uniqueEvents.length - 1].timestamp : new Date().toISOString();

  return {
    events: uniqueEvents,
    totalEvents: uniqueEvents.length,
    startDate,
    endDate,
    duplicateCountRemoved: duplicateCount,
    gapsIdentified: gapsCount,
    uncertainDatesCount: uncertainCount,
  };
}

function parseFlexibleDateTime(
  msgTime: string,
  fallbackBaseDate: string
): { normalized: string; isUncertain: boolean } {
  // If base date is valid ISO or YYYY-MM-DD
  const base = fallbackBaseDate ? new Date(fallbackBaseDate) : new Date();
  if (isNaN(base.getTime())) {
    return { normalized: new Date().toISOString(), isUncertain: true };
  }

  if (!msgTime) {
    return { normalized: base.toISOString(), isUncertain: false };
  }

  // Check if msgTime has 12hr time e.g. "10:14 PM"
  const time12Match = msgTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (time12Match) {
    let hours = parseInt(time12Match[1], 10);
    const minutes = parseInt(time12Match[2], 10);
    const ampm = time12Match[3]?.toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const copy = new Date(base.getTime());
    copy.setHours(hours, minutes, 0, 0);
    return { normalized: copy.toISOString(), isUncertain: false };
  }

  const parsed = new Date(msgTime);
  if (!isNaN(parsed.getTime())) {
    return { normalized: parsed.toISOString(), isUncertain: false };
  }

  return { normalized: base.toISOString(), isUncertain: true };
}
