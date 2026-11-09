import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export const hasApiKey = Boolean(apiKey && apiKey.trim().length > 5);

export const ai = new GoogleGenAI(
  hasApiKey
    ? {
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }
    : {
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }
);
