import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeText, numberOfQuestions = 5 } = await req.json();

    console.log("Generating interview questions from resume...");
    console.log("Resume length:", resumeText?.length || 0);

    if (!resumeText || resumeText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Resume text is too short or empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("LOVABLE_API_KEY (Gemini key) is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert resume parser implementing the NER-KE (Named Entity Recognition & Keyword Extraction) Algorithm v2.0.

CORE RULE: ZERO HALLUCINATION — ONLY use information EXPLICITLY present in the resume text.
Never infer, assume, embellish, or add anything not directly written.

Follow these phases exactly:

1. Preprocess: Identify sections (Education, Experience, Skills, Projects, etc.)
2. Extract entities ONLY if they appear verbatim:
   - name
   - email
   - skills: array of exact skill names
   - projects: array of {name, technologies: [], description, metrics}
   - experience: array of {company, role, duration, responsibilities: []}
   - education: array of {degree, institution, year, gpa}
   - achievements: array of exact strings

3. Create candidateSummary using ONLY this template structure (omit missing parts):
   "[NAME or 'Candidate'] [has/with] [SKILLS count] technical skills including [TOP 3-5 SKILLS]. [Experience at COMPANY names.] [Worked on PROJECT count projects including PROJECT names.] [Education: DEGREE from INSTITUTION.]"

4. Generate exactly ${numberOfQuestions} interview questions.
   Each question MUST:
   - Contain at least one EXACT term/phrase from the resume
   - Be anchored to extracted entities (skills, projects, experience, etc.)
   - Have one of these categories: "Introduction", "Project-Based", "Experience-Based", "Technical", "Behavioral", "Achievement-Based"

5. Output ONLY valid JSON matching this exact schema — no extra text, no markdown:

{
  "extractedEntities": {
    "name": "string | 'Candidate'",
    "email": "string | ''",
    "skills": ["string", ...],
    "projects": [{"name": "string", "technologies": ["string",...], "description": "string", "metrics": "string | ''"}, ...],
    "experience": [{"company": "string", "role": "string", "duration": "string | ''", "responsibilities": ["string",...]}, ...],
    "education": [{"degree": "string", "institution": "string", "year": "string | ''", "gpa": "string | ''"}, ...],
    "achievements": ["string", ...]
  },
  "candidateSummary": "string",
  "questions": [
    {
      "question": "string",
      "category": "Introduction | Project-Based | Experience-Based | Technical | Behavioral | Achievement-Based",
      "skillAssessed": "string (exact skill or '' if not applicable)",
      "resumeReference": "string (exact phrase from resume this question is based on)",
      "answerTip": "string (short tip, mention STAR for behavioral)"
    },
    ...
  ],
  "extractionConfidence": {
    "skillsFound": number,
    "projectsFound": number,
    "experienceFound": number,
    "educationFound": number,
    "overallQuality": "high" | "medium" | "low"
  }
}`;

    const userPrompt = `===== RESUME TEXT =====
${resumeText}
===== END OF RESUME =====

Execute the NER-KE v2.0 algorithm strictly.
Extract ONLY what's explicitly written.
Generate exactly ${numberOfQuestions} questions.
Return ONLY the JSON object defined in the system prompt.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to generate questions from Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let result;
    try {
      // Handle possible code block or extra whitespace
      const cleaned = generatedText
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      result = JSON.parse(cleaned);
      console.log("Gemini JSON parsed successfully");
      console.log("- Skills found:", result.extractionConfidence?.skillsFound || 0);
      console.log("- Questions:", result.questions?.length || 0);
    } catch (parseErr) {
      console.error("JSON parse failed:", parseErr);
      return new Response(
        JSON.stringify({ error: "Failed to parse structured output from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
