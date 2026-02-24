// https://deno.land/std@0.168.0/http/server.ts
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
    const body = await req.json();
    const { resumeText, numberOfQuestions = 5 } = body;

    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 40) {
      return new Response(
        JSON.stringify({ error: "resumeText is missing or too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY environment variable is not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert resume parser implementing the NER-KE (Named Entity Recognition & Keyword Extraction) Algorithm.
## ALGORITHM SPECIFICATION: NER-KE v2.0
### CORE PRINCIPLE: ZERO HALLUCINATION
You must ONLY extract and reference information that is EXPLICITLY written in the resume text.
- If information is not present, mark it as "NOT_FOUND" or empty array
- NEVER infer, assume, or generate any data not in the source text
... (keep the rest of your original long system prompt here) ...`;

    const userPrompt = `EXECUTE NER-KE ALGORITHM v2.0 ON THIS RESUME:
===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====
STEP-BY-STEP EXECUTION:
... (keep your original user prompt instructions here) ...
Generate exactly ${numberOfQuestions} questions.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\n" + userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API failed:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Gemini API request failed", status: res.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("Could not parse JSON from Gemini", text.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Invalid JSON response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});// https://deno.land/std@0.168.0/http/server.ts
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
    const body = await req.json();
    const { resumeText, numberOfQuestions = 5 } = body;

    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 40) {
      return new Response(
        JSON.stringify({ error: "resumeText is missing or too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY environment variable is not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert resume parser implementing the NER-KE (Named Entity Recognition & Keyword Extraction) Algorithm.
## ALGORITHM SPECIFICATION: NER-KE v2.0
### CORE PRINCIPLE: ZERO HALLUCINATION
You must ONLY extract and reference information that is EXPLICITLY written in the resume text.
- If information is not present, mark it as "NOT_FOUND" or empty array
- NEVER infer, assume, or generate any data not in the source text
... (keep the rest of your original long system prompt here) ...`;

    const userPrompt = `EXECUTE NER-KE ALGORITHM v2.0 ON THIS RESUME:
===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====
STEP-BY-STEP EXECUTION:
... (keep your original user prompt instructions here) ...
Generate exactly ${numberOfQuestions} questions.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\n" + userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API failed:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Gemini API request failed", status: res.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("Could not parse JSON from Gemini", text.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Invalid JSON response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
