/**
 * Demo Data Generator for Sakhi Vault
 * Generates 15 fictional chat screenshot images (via Canvas), 2 audio transcripts,
 * and a sample WhatsApp chat for immediate demonstration.
 */
import { VaultCase, EvidenceItem } from './db.ts';

// Helper to draw a chat screenshot onto an HTML5 canvas and export base64 PNG
export function generateChatScreenshot(
  title: string,
  messages: Array<{ sender: 'suspect' | 'victim'; text: string; time: string }>,
  platform: 'WhatsApp' | 'Instagram' = 'WhatsApp'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const isWA = platform === 'WhatsApp';

  // 1. Background
  ctx.fillStyle = isWA ? '#0b141a' : '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Status Bar
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('9:41', 20, 24);
  ctx.fillText('5G  100%', 330, 24);

  // 3. Header
  ctx.fillStyle = isWA ? '#1f2c34' : '#121212';
  ctx.fillRect(0, 36, canvas.width, 56);

  // Back arrow & Avatar circle
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.arc(45, 64, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(title, 75, 58);

  ctx.fillStyle = '#22c55e';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(isWA ? 'online' : 'Active now', 75, 76);

  // 4. Chat Messages
  let y = 115;
  messages.forEach((msg) => {
    const isSuspect = msg.sender === 'suspect';
    const bubbleColor = isSuspect ? (isWA ? '#202c33' : '#262626') : isWA ? '#005c4b' : '#3797f0';
    const alignRight = !isSuspect;

    ctx.font = '13px system-ui, sans-serif';
    // Simple line wrap estimation
    const words = msg.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((w) => {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(testLine).width > 220) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    const bubbleWidth = Math.min(270, Math.max(140, ...lines.map((l) => ctx.measureText(l).width + 30)));
    const bubbleHeight = lines.length * 18 + 26;
    const x = alignRight ? canvas.width - bubbleWidth - 16 : 16;

    // Draw bubble
    ctx.fillStyle = bubbleColor;
    ctx.beginPath();
    ctx.roundRect(x, y, bubbleWidth, bubbleHeight, 10);
    ctx.fill();

    // Text
    ctx.fillStyle = '#f1f5f9';
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 12, y + 18 + i * 18);
    });

    // Timestamp
    ctx.fillStyle = isSuspect ? '#94a3b8' : '#cbd5e1';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(msg.time, x + bubbleWidth - 42, y + bubbleHeight - 8);

    y += bubbleHeight + 12;
  });

  return canvas.toDataURL('image/png');
}

export function createDemoCase(): VaultCase {
  const dummyScreenshotsConfig = [
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-14 22:15',
      notes: 'Initial threatening message demanding contact and compliance.',
      msgs: [
        { sender: 'suspect' as const, text: 'Tumne call kyu kaat di meri? Acha nahi kiya.', time: '10:14 PM' },
        { sender: 'suspect' as const, text: 'Main janta hu kal tumhara thesis presentation hai.', time: '10:15 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-15 08:30',
      notes: 'Ultimatum regarding official inquiry committee testimony.',
      msgs: [
        { sender: 'suspect' as const, text: 'Agar kal committee mein mere haq mein bayan nahi diya to photos department head ko bhej dunga.', time: '8:30 AM' },
        { sender: 'victim' as const, text: 'Aap mujhe blackmail mat karein. Main report karungi.', time: '8:32 AM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-15 08:35',
      notes: 'Coercive 24 hour deadline with menacing language.',
      msgs: [
        { sender: 'suspect' as const, text: 'Karke dekh lo. Samajhti kya ho khud ko? 24 ghantay hain tumhare paas.', time: '8:35 AM' },
      ],
    },
    {
      title: '@suspect_anon_29',
      platform: 'Instagram' as const,
      time: '2026-10-18 19:40',
      notes: 'Cyber-stalking via alternative social media handles.',
      msgs: [
        { sender: 'suspect' as const, text: 'Number block karke bach nahi sakti. Tum jahan bhi jaogi pata chal jayega.', time: '7:40 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-20 14:10',
      notes: 'Reputational threat involving university colleagues and family.',
      msgs: [
        { sender: 'suspect' as const, text: 'Family group ka number nikaal liya hai maine. Ab socho kya hoga.', time: '2:10 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-22 11:00',
      notes: 'Demanding immediate in-person meeting outside campus.',
      msgs: [
        { sender: 'suspect' as const, text: 'Aaj shaam 5 baje cafe ke bahar milo warna kal subah sab circulate ho chuka hoga.', time: '11:00 AM' },
        { sender: 'victim' as const, text: 'Mujhse koi rabta mat karein. Yeh jurm hai.', time: '11:05 AM' },
      ],
    },
    {
      title: '@suspect_anon_29',
      platform: 'Instagram' as const,
      time: '2026-10-23 21:15',
      notes: 'Continued tracking of daily commute locations.',
      msgs: [
        { sender: 'suspect' as const, text: 'Aaj blue shirt pehni thi tumne? Gate 3 se nikli.', time: '9:15 PM' },
      ],
    },
    {
      title: 'SMS (+92 321 9928172)',
      platform: 'WhatsApp' as const,
      time: '2026-10-25 16:30',
      notes: 'Threat sent from a secondary burner number.',
      msgs: [
        { sender: 'suspect' as const, text: 'Doosra number bhi hai mere paas. Kahan tak bhaag sakti ho?', time: '4:30 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-27 13:45',
      notes: 'Extortion message demanding withdrawal of formal complaint.',
      msgs: [
        { sender: 'suspect' as const, text: 'Apni complaint wapis lo chup chaap agar career bachana chahti ho.', time: '1:45 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-10-29 23:20',
      notes: 'Late night menacing communications.',
      msgs: [
        { sender: 'suspect' as const, text: 'Subah tak ka time hai. Faisla kar lo.', time: '11:20 PM' },
      ],
    },
    {
      title: '@suspect_anon_29',
      platform: 'Instagram' as const,
      time: '2026-10-31 10:10',
      notes: 'Defamatory claims threatened on public forums.',
      msgs: [
        { sender: 'suspect' as const, text: 'Tumhare department ke page pe sab upload kar dunga.', time: '10:10 AM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-11-02 15:00',
      notes: 'Coercive extortion message repeating demands.',
      msgs: [
        { sender: 'suspect' as const, text: 'Meeting cancel mat karna. Warna anjaam ke zimmedar khud hogi.', time: '3:00 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-11-03 18:25',
      notes: 'Direct intimidation after being ignored.',
      msgs: [
        { sender: 'suspect' as const, text: 'Ignore karke dekh liya na? Ab meri baari hai.', time: '6:25 PM' },
      ],
    },
    {
      title: '@suspect_anon_29',
      platform: 'Instagram' as const,
      time: '2026-11-05 20:50',
      notes: 'Mocking legal warnings and stating impunity.',
      msgs: [
        { sender: 'suspect' as const, text: 'Police kuch nahi karegi. Pehle apna socho.', time: '8:50 PM' },
      ],
    },
    {
      title: 'Unknown (+92 300 4819283)',
      platform: 'WhatsApp' as const,
      time: '2026-11-07 17:15',
      notes: 'Final aggressive voice note transcript following missed calls.',
      msgs: [
        { sender: 'suspect' as const, text: 'Aakhri warning hai yeh. Kal subah sab ko pata chal jayega.', time: '5:15 PM' },
      ],
    },
  ];

  const evidenceItems: EvidenceItem[] = dummyScreenshotsConfig.map((item, idx) => {
    const dataUrl = generateChatScreenshot(item.title, item.msgs, item.platform);
    return {
      id: `ev-img-${idx + 1}`,
      type: 'screenshot',
      platform: item.platform,
      incidentDateTime: item.time,
      personLabel: item.title,
      notes: item.notes,
      content: dataUrl,
      mimeType: 'image/png',
      ocrOrTranscriptText: item.msgs.map((m) => `[${m.time}] ${m.sender === 'suspect' ? 'Accused' : 'Complainant'}: "${m.text}"`).join('\n'),
      confidence: 0.98,
    };
  });

  // Add 2 audio transcript items
  evidenceItems.push({
    id: 'ev-audio-1',
    type: 'audio',
    platform: 'WhatsApp',
    incidentDateTime: '2026-10-16 23:40',
    personLabel: 'Accused Voice Note #1 (+92 300 4819283)',
    notes: 'Threatening Urdu voice message demanding compliance within 24 hours.',
    content: 'data:audio/mp3;base64,DEMO_AUDIO_PLACEHOLDER',
    ocrOrTranscriptText: `[آڈیو ریکارڈنگ - 34 سیکنڈ]
"سنو، میں آخری بار سمجھا رہا ہوں، فون کاٹنا بند کرو۔ اگر کل تم نے مجھ سے بات نہیں کی تو تمہاری فیملی کے تمام نمبرز میرے پاس موجود ہیں۔ تم اچھی طرح جانتی ہو میں کیا کر سکتا ہوں۔"
(English translation: "Listen, I am warning you for the last time, stop disconnecting my calls. If you don't speak to me tomorrow, I have your family's contact numbers. You know very well what I can do.")`,
    confidence: 0.96,
  });

  evidenceItems.push({
    id: 'ev-audio-2',
    type: 'audio',
    platform: 'Call',
    incidentDateTime: '2026-11-04 14:15',
    personLabel: 'Recorded Harassment Call (+92 300 4819283)',
    notes: 'Recorded phone interaction with explicit extortion demands.',
    content: 'data:audio/mp3;base64,DEMO_AUDIO_PLACEHOLDER_2',
    ocrOrTranscriptText: `[ریکارڈ شدہ کال - 52 سیکنڈ]
ملزم: "تمہیں کیا لگتا ہے تم رپورٹ کر کے بچ جاؤ گی؟"
متاثرہ: "آپ مجھ سے بات مت کریں۔ میں قانونی راستہ اختیار کر رہی ہوں۔"
ملزم: "کر لو، پھر دیکھنا عزت کس کی جائے گی۔ 24 گھنٹے ہیں سوچ لو۔"`,
    confidence: 0.95,
  });

  // Add 1 pasted WhatsApp chat export
  evidenceItems.push({
    id: 'ev-text-1',
    type: 'text',
    platform: 'WhatsApp',
    incidentDateTime: '2026-10-15 10:00',
    personLabel: 'WhatsApp Full Chat Export',
    notes: 'Exported chat transcript from Oct 14 - Nov 07.',
    content: `14/10/2026, 22:14 - Unknown (+92 300 4819283): Tumne call kyu kaat di meri? Acha nahi kiya.
14/10/2026, 22:15 - Unknown (+92 300 4819283): Main janta hu kal tumhara thesis presentation hai.
15/10/2026, 08:30 - Unknown (+92 300 4819283): Agar kal committee mein mere haq mein bayan nahi diya to photos department head ko bhej dunga.
15/10/2026, 08:32 - Complainant: Aap mujhe blackmail mat karein. Main report karungi.
15/10/2026, 08:35 - Unknown (+92 300 4819283): Karke dekh lo. Samajhti kya ho khud ko? 24 ghantay hain tumhare paas.
18/10/2026, 19:40 - @suspect_anon_29: Number block karke bach nahi sakti.
20/10/2026, 14:10 - Unknown (+92 300 4819283): Family group ka number nikaal liya hai maine.
25/10/2026, 16:30 - SMS (+92 321 9928172): Doosra number bhi hai mere paas. Kahan tak bhaag sakti ho?
27/10/2026, 13:45 - Unknown (+92 300 4819283): Apni complaint wapis lo chup chaap agar career bachana chahti ho.`,
    ocrOrTranscriptText: 'Full parsed WhatsApp sequence preserving sender markers and timestamps.',
    confidence: 1.0,
  });

  return {
    id: 'case-demo-104',
    title: 'Workplace & Academic Extortion Record Ref #104',
    category: 'blackmail/extortion',
    createdAt: '2026-10-15T09:00:00Z',
    updatedAt: new Date().toISOString(),
    evidenceItems,
    extractedReview: {
      messages: [
        {
          id: 'msg-d1',
          speaker: 'Accused (+92 300 4819283)',
          timestamp: '2026-10-15 08:30',
          text: 'Agar kal committee mein mere haq mein bayan nahi diya to photos department head ko bhej dunga.',
          language: 'Roman Urdu',
          isThreat: true,
        },
        {
          id: 'msg-d2',
          speaker: 'Complainant',
          timestamp: '2026-10-15 08:32',
          text: 'Aap mujhe blackmail mat karein. Main report karungi.',
          language: 'Roman Urdu',
          isThreat: false,
        },
        {
          id: 'msg-d3',
          speaker: 'Accused (+92 300 4819283)',
          timestamp: '2026-10-15 08:35',
          text: 'Karke dekh lo. Samajhti kya ho khud ko? 24 ghantay hain tumhare paas.',
          language: 'Roman Urdu',
          isThreat: true,
        },
        {
          id: 'msg-d4',
          speaker: 'Accused (@suspect_anon_29)',
          timestamp: '2026-10-18 19:40',
          text: 'Number block karke bach nahi sakti. Tum jahan bhi jaogi pata chal jayega.',
          language: 'Roman Urdu',
          isThreat: true,
        },
        {
          id: 'msg-d5',
          speaker: 'Accused (+92 300 4819283)',
          timestamp: '2026-10-20 14:10',
          text: 'Family group ka number nikaal liya hai maine. Ab socho kya hoga.',
          language: 'Roman Urdu',
          isThreat: true,
        },
      ],
      threats: [
        'Ultimatum threatening to distribute confidential/private photos to department head and employers within 24 hours.',
        'Threat to circulate sensitive media to family and public department portals.',
        'Continuous physical tracking and cyber-stalking across alternative burner numbers.',
      ],
      demands: [
        'Forced favorable testimony in upcoming institutional committee proceeding.',
        'Immediate withdrawal of formal grievance reports under duress.',
        'Submission to forced meetings outside campus.',
      ],
      platform: 'WhatsApp & Instagram',
      identifiers: ['+92 300 4819283', '+92 321 9928172', '@suspect_anon_29'],
      summary5Lines: [
        '1. The complainant experienced persistent unwanted digital communications across WhatsApp and Instagram.',
        '2. The accused leveraged institutional proximity to coerce testimony in an active inquiry proceeding.',
        '3. Explicit extortion threats of circulating private photos to superiors and family were issued with a 24-hour ultimatum.',
        '4. The complainant explicitly recorded refusals, instructed the accused to desist, and preserved all chat logs.',
        '5. Due to continuing harassment and explicit intimidation, immediate institutional inquiry and digital preservation are requested.',
      ],
      classificationLabels: [
        {
          category: 'blackmail/extortion',
          confidence: 0.98,
          reason: 'Explicit ultimatum ("24 ghantay hain tumhare paas") threatening disclosure of private photos to enforce compliance.',
          linkedQuotes: ['Agar kal committee mein mere haq mein bayan nahi diya to photos department head ko bhej dunga.'],
        },
        {
          category: 'workplace/educational harassment',
          confidence: 0.94,
          reason: 'Coercing institutional outcome and leveraging professional hierarchy.',
          linkedQuotes: ['Agar kal committee mein mere haq mein bayan nahi diya...'],
        },
        {
          category: 'cyber-stalking',
          confidence: 0.91,
          reason: 'Persistent tracking via alternative social accounts and secondary numbers after being blocked.',
          linkedQuotes: ['Number block karke bach nahi sakti. Tum jahan bhi jaogi pata chal jayega.'],
        },
        {
          category: 'criminal threats',
          confidence: 0.89,
          reason: 'Intimidation of family members and unlawful coercive ultimatums.',
          linkedQuotes: ['Family group ka number nikaal liya hai maine. Ab socho kya hoga.'],
        },
      ],
      customRedactionMapping: {
        '[PHONE_1]': '+92 300 4819283',
        '[PHONE_2]': '+92 321 9928172',
        '[PERSON_1]': 'Department Head',
      },
      isFallback: true,
    },
  };
}
