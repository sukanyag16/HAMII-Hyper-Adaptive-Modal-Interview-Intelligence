import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface QuestionResult {
  question: string;
  category: string;
  answer: string;
  contentScore: number;
  deliveryScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
}

interface SessionMetrics {
  avgEyeContact: number;
  avgPosture: number;
  avgSpeechClarity: number;
  avgBodyLanguage: number;
  avgOverallScore: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { results, metrics, candidateName } = await req.json() as {
      results: QuestionResult[];
      metrics: SessionMetrics;
      candidateName?: string;
    };

    // ✅ Use the Gemini key you already added in Supabase secrets (LOVABLE_API_KEY)
    const GEMINI_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY (stored as LOVABLE_API_KEY) is not configured');
    }

    const questionsContext = results.map((r, i) =>
      `Q${i + 1} (${r.category}): "${r.question}"
Answer: "${r.answer.slice(0, 300)}${r.answer.length > 300 ? '...' : ''}"
Scores: Content ${r.contentScore}%, Delivery ${r.deliveryScore}%, Overall ${r.overallScore}%
Strengths: ${r.strengths.join(', ') || 'None identified'}
Areas to improve: ${r.improvements.join(', ') || 'None identified'}`
    ).join('\n\n');

    const metricsContext = `
Session Delivery Metrics:
- Eye Contact: ${metrics.avgEyeContact}%
- Posture: ${metrics.avgPosture}%
- Speech Clarity: ${metrics.avgSpeechClarity}%
- Body Language: ${metrics.avgBodyLanguage}%
- Average Overall Score: ${metrics.avgOverallScore}%
`;

    const systemPrompt = `You are an expert interview coach providing a comprehensive session recap. Generate a professional, encouraging, and actionable summary.

Your summary must include:
1. Executive Summary (2-3 sentences)
2. Top Strengths (exactly 3 bullet points with specific examples)
3. Priority Improvements (exactly 3 bullet points with actionable steps)
4. Delivery Analysis (non-verbal communication)
5. Content Quality (structure, relevance, depth)
6. Action Plan (exactly 3 specific steps)

Be specific and reference actual answers when possible. Use an encouraging but honest tone.

You MUST respond with ONLY a valid JSON object in this exact format (no extra text, no markdown):

{
  "executiveSummary": "<2-3 sentence overview>",
  "performanceRating": "<Excellent|Strong|Competent|Developing|Needs Work>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "priorityImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "deliveryAnalysis": "<paragraph analyzing non-verbal communication>",
  "contentQuality": "<paragraph assessing answer quality>",
  "actionPlan": ["<action 1>", "<action 2>", "<action 3>"],
  "motivationalNote": "<brief encouraging closing message>"
}`;

    const userPrompt = `Generate a session recap for ${candidateName || 'the candidate'}:

${metricsContext}

Interview Questions and Responses:
${questionsContext}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const generatedText = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let summary;
    try {
      // Clean any possible markdown/code block wrappers
      const jsonMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        generatedText.match(/```\s*([\s\S]*?)\s*```/) ||
                        generatedText.match(/\{[\s\S]*\}/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : generatedText;
      summary = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback
      summary = {
        executiveSummary: "Session completed successfully. Review the detailed feedback for each question.",
        performanceRating: metrics.avgOverallScore >= 80 ? "Strong" : metrics.avgOverallScore >= 60 ? "Competent" : "Developing",
        topStrengths: results.flatMap(r => r.strengths).slice(0, 3),
        priorityImprovements: results.flatMap(r => r.improvements).slice(0, 3),
        deliveryAnalysis: `Eye contact: ${metrics.avgEyeContact}%, Posture: ${metrics.avgPosture}%.`,
        contentQuality: `Average score across ${results.length} questions: ${metrics.avgOverallScore}%.`,
        actionPlan: ["Practice STAR method daily", "Record and review your answers", "Focus on specific examples"],
        motivationalNote: "You're making great progress — keep practicing!"
      };
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in summarize-interview-session:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
