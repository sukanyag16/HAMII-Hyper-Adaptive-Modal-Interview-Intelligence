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

    const systemPrompt = `You are an expert HR interviewer and career coach. Your task is to analyze a candidate's resume and generate insightful, personalized interview questions.

Generate exactly ${numberOfQuestions} interview questions based on the resume provided. The questions should:
1. Be specific to the candidate's experience, skills, and background
2. Include a mix of behavioral, technical, and situational questions
3. Probe deeper into their accomplishments and projects mentioned
4. Test their problem-solving abilities related to their field
5. Assess cultural fit and soft skills

For each question, also provide:
- The category (Technical, Behavioral, Situational, Experience-based, or Soft Skills)
- The skill or competency being assessed
- A brief tip for what makes a good answer`;

    const userPrompt = `Based on the following resume, generate ${numberOfQuestions} personalized interview questions:

RESUME:
${resumeText}

Generate the questions in a structured format.`;

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
                          enum: ["Technical", "Behavioral", "Situational", "Experience-based", "Soft Skills"]
                        },
                        skillAssessed: { type: "string", description: "The skill or competency being assessed" },
                        answerTip: { type: "string", description: "A brief tip for what makes a good answer" }
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
