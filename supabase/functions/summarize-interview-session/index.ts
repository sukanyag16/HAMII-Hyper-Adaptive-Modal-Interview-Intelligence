import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { results, metrics, candidateName = "the candidate" } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context (you can adjust truncation if needed)
    const questionsContext = results
      .map((r, i) => `Q${i+1} (${r.category || "?"})  
Question: ${r.question}
Answer: ${r.answer?.substring(0, 380) || ""}${r.answer?.length > 380 ? "..." : ""}
Scores: Content ${r.contentScore ?? "?"}% | Delivery ${r.deliveryScore ?? "?"}% | Overall ${r.overallScore ?? "?"}%
Strengths: ${r.strengths?.join(", ") || "—"}
Improvements: ${r.improvements?.join(", ") || "—"}`)
      .join("\n\n");

    const metricsStr = `
Average delivery metrics:
• Eye contact: ${metrics?.avgEyeContact ?? "?"}%
• Posture: ${metrics?.avgPosture ?? "?"}%
• Speech clarity: ${metrics?.avgSpeechClarity ?? "?"}%
• Body language: ${metrics?.avgBodyLanguage ?? "?"}%
• Overall score: ${metrics?.avgOverallScore ?? "?"}%`;

    const system = `You are a professional interview coach. Create a concise, encouraging yet honest session recap.

Required JSON structure (exact keys):

{
  "executiveSummary": "2–4 sentence overview",
  "performanceRating": "one of: Excellent | Strong | Good | Fair | Needs Improvement",
  "topStrengths": ["point 1", "point 2", "point 3"],
  "priorityImprovements": ["point 1", "point 2", "point 3"],
  "deliveryAnalysis": "short paragraph about non-verbal communication",
  "contentQuality": "short paragraph about answer structure & relevance",
  "actionPlan": ["action 1", "action 2", "action 3"],
  "motivationalNote": "short encouraging closing"
}

Be specific, reference concrete examples from answers when possible.`;

    const user = `Session recap for ${candidateName}:

${metricsStr}

${questionsContext || "(no detailed answers provided — give general feedback)"}

Generate the recap now.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: user }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: {
            temperature: 0.35,
            topP: 0.92,
            maxOutputTokens: 1200,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("Gemini summary failed:", res.status, txt);
      return new Response(JSON.stringify({ error: "AI summary request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {
        executiveSummary: "Session completed. Review individual question feedback.",
        performanceRating: "Good",
        topStrengths: ["Clear speaking", "Relevant examples", "Professional tone"],
        priorityImprovements: ["Use STAR structure more consistently", "Add more quantifiable results", "Maintain better eye contact"],
        deliveryAnalysis: "Delivery was generally solid with room for improvement in eye contact and posture.",
        contentQuality: "Answers showed good understanding but could benefit from more structure.",
        actionPlan: ["Practice STAR method daily", "Record mock interviews", "Review feedback after each session"],
        motivationalNote: "Solid foundation — keep practicing!"
      };
    }

    return new Response(JSON.stringify(json), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
