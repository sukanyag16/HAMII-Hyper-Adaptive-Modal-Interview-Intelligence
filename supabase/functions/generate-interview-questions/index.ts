import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert HR interviewer. Your task is to analyze a candidate's resume using a structured extraction algorithm and generate interview questions ONLY based on information explicitly present in the resume.

## EXTRACTION ALGORITHM (Follow this strictly):

STEP 1 - Extract these fields from the resume:
- NAME: Candidate's name
- SKILLS: List all technical skills, tools, frameworks, languages mentioned
- PROJECTS: List all project names and their descriptions
- EXPERIENCE: List all job titles, companies, and responsibilities
- EDUCATION: Degrees, institutions, certifications
- ACHIEVEMENTS: Quantifiable accomplishments, awards, metrics

STEP 2 - Generate questions using ONLY extracted information:
- Question 1: Introduction question referencing their background
- Question 2: Ask about a SPECIFIC project mentioned in the resume (use exact project name)
- Question 3-${numberOfQuestions}: Ask about SPECIFIC skills, experiences, or achievements extracted

## STRICT RULES:
- NEVER invent or assume information not in the resume
- ALWAYS reference specific items (project names, company names, technologies) from the resume
- If the resume mentions "React", ask about React specifically, not generic frontend
- If resume mentions "XYZ Company", reference that company in the question
- Each question MUST quote or reference something directly from the resume

## OUTPUT FORMAT:
For each question provide:
- category: Introduction | Experience-based | Technical | Behavioral | Situational | Soft Skills
- skillAssessed: The specific skill/competency being tested (from resume)
- answerTip: Brief guidance (use STAR method for behavioral questions)`;

    const userPrompt = `RESUME TO ANALYZE:
---
${resumeText}
---

TASK: Generate exactly ${numberOfQuestions} interview questions.

MANDATORY STRUCTURE:
1. Question 1: Introduction - "Tell me about yourself" tailored to their specific background
2. Question 2: Project-specific - Ask about a SPECIFIC project mentioned in the resume by name
3. Questions 3-${numberOfQuestions}: Must each reference a SPECIFIC skill, technology, company, or achievement from the resume

VALIDATION CHECKLIST (ensure each question passes):
✓ Does this question reference something explicitly written in the resume?
✓ Am I using the exact names/terms from the resume?
✓ Would this question make sense ONLY for this specific candidate?

DO NOT generate generic questions. Every question must be traceable to resume content.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_questions",
              description: "Generate personalized interview questions based on the resume",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "The interview question" },
                        category: { 
                          type: "string", 
                          enum: ["Introduction", "Experience-based", "Technical", "Behavioral", "Situational", "Soft Skills"]
                        },
                        skillAssessed: { type: "string", description: "The skill or competency being assessed" },
                        answerTip: { type: "string", description: "A brief tip for what makes a good answer. Mention STAR method for behavioral questions." }
                      },
                      required: ["question", "category", "skillAssessed", "answerTip"],
                      additionalProperties: false
                    }
                  },
                  candidateSummary: {
                    type: "string",
                    description: "A brief summary of the candidate's profile based on the resume"
                  }
                },
                required: ["questions", "candidateSummary"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_questions" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response received");
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log("Generated", result.questions?.length || 0, "questions");
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback if no tool call
    return new Response(
      JSON.stringify({ error: "Failed to parse AI response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating interview questions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
