import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { aiProvider, ProfileSchema } from '@/lib/profile-schema';
import { geminiText } from '@/lib/server/gemini';
import { renderProfile } from '@/lib/assistant/prompt';
import { generatePlan } from '@/lib/rules/engine';
import { RULES } from '@/lib/rules/data';
import { evidenceContext, evidenceFallback, RAG_SYSTEM_PROMPT, retrieveEvidence } from '@/lib/rag/retrieve';

export const runtime = 'nodejs';
const BodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(24),
  profile: ProfileSchema.nullable().optional(),
});

export type AssistantSource = {
  ruleId: string; name: string; url: string; lastVerified: string; verified: boolean;
  citation: string; retrievedAt: string; kind: string;
};
export type AssistantEvent =
  | { type: 'sources'; sources: AssistantSource[]; mode: 'ai' | 'rules_only'; searchMode: 'hybrid' | 'bm25'; notice?: string }
  | { type: 'text'; delta: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { messages, profile = null } = parsed.data;
  const question = messages.at(-1)!.content;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => { if (!request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try {
        const result = await retrieveEvidence(question, profile, request.signal);
        const sources: AssistantSource[] = result.hits.map(({ chunk }, i) => ({
          ruleId: chunk.id, citation: `S${i + 1}`, name: chunk.title, url: chunk.url,
          lastVerified: '', verified: false, retrievedAt: chunk.retrievedAt, kind: chunk.kind,
        }));
        const provider = aiProvider();
        const canGenerate = provider !== null && result.hits.length > 0;
        send({ type: 'sources', sources, mode: canGenerate ? 'ai' : 'rules_only', searchMode: result.mode, notice: result.notice });
        let answer = evidenceFallback(result.hits);
        if (canGenerate) {
          const plan = profile ? generatePlan(profile, RULES).map(t => ({ title: t.title, date: t.deadline?.date, status: t.status })) : [];
          const context = JSON.stringify({ evidence: evidenceContext(result.hits),
            profile: profile ? renderProfile(profile) : 'Not shared', deterministicPlan: plan, question });
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
          try {
            const history = messages.slice(0, -1);
            let generated: string;
            if (provider === 'google') {
              generated = await geminiText({ system: RAG_SYSTEM_PROMPT,
                contents: [...history.map(m => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: m.content }] })),
                  { role: 'user', parts: [{ text: context }] }], signal });
            } else {
              const response = await new Anthropic().messages.create({ model: 'claude-opus-5-5', max_tokens: 2000,
                system: RAG_SYSTEM_PROMPT, messages: [...history, { role: 'user', content: context }] }, { signal });
              generated = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
            }
            const citations = [...generated.matchAll(/\[S(\d+)\]/g)].map(m => Number(m[1]));
            if (!generated.trim() || citations.some(n => n < 1 || n > sources.length) || /https?:\/\//i.test(generated)) throw new Error('Invalid answer sources');
            if (!citations.length) {
              const refusal = /does not (contain|cover)|doesn't (contain|cover)|not covered|no (relevant|sufficient)|не (содерж|охват)|недостаточно|нет (информации|сведений)/i.test(generated);
              if (!refusal) throw new Error('Missing evidence citations');
            }
            answer = generated;
          } catch {
            if (request.signal.aborted) return;
            send({ type: 'sources', sources, mode: 'rules_only', searchMode: result.mode,
              notice: [result.notice, 'AI answer unavailable; showing the retrieved source text.'].filter(Boolean).join(' ') });
          }
        }
        send({ type: 'text', delta: answer });
        send({ type: 'done' });
      } catch {
        send({ type: 'error', message: 'The assistant could not load its sources. Your plan is unchanged.' });
        send({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
