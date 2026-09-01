import type { AiSuggestion } from '../types';

export default function analyzeAi(input: { title?: string; content?: string }): AiSuggestion {
  const content = `${input.title ?? ''} ${input.content ?? ''}`.trim();
  return {
    summary: content ? content.slice(0, 60) : '',
    suggestedTags: input.title ? [input.title.slice(0, 12)] : [],
    suggestedDifficulty: 'medium',
  };
}
