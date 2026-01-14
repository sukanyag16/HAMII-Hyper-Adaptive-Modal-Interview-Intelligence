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
    const { question, answer, category, skillAssessed, fusionMetrics } = await req.json();
    
    console.log("Evaluating interview answer...");
    console.log("Question:", question?.substring(0, 50));
    console.log("Answer length:", answer?.length || 0);
    console.log("Fusion metrics:", fusionMetrics);
    
    if (!question || !answer) {
      return new Response(
        JSON.stringify({ error: "Question and answer are required" }),
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

    const systemPrompt = `You are an expert interview coach and HR professional. Your task is to evaluate a candidate's answer to an interview question and provide constructive feedback.

Consider both the content of the answer AND the delivery metrics provided (eye contact, posture, clarity, engagement, etc.).

Provide:
1. A score from 0-100 for the answer quality
2. Specific strengths in the answer
3. Areas for improvement
4. A sample better answer if applicable
5. Overall feedback combining content and delivery`;

    const userPrompt = `Evaluate the following interview response:

QUESTION (${category} - Assessing: ${skillAssessed}):
${question}

CANDIDATE'S ANSWER:
${answer}

DELIVERY METRICS:
- Eye Contact: ${fusionMetrics?.eyeContact || 0}%
- Posture: ${fusionMetrics?.posture || 0}%
- Clarity: ${fusionMetrics?.speechClarity || 0}%
- Engagement: ${fusionMetrics?.contentEngagement || 0}%
- Body Language: ${fusionMetrics?.bodyLanguage || 0}%
- Voice Quality: ${fusionMetrics?.voiceQuality || 0}%
- Overall Confidence: ${fusionMetrics?.confidence || 0}%

Provide a comprehensive evaluation.`;

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
              name: "evaluate_answer",
              description: "Evaluate the interview answer and provide structured feedback",
              parameters: {
                type: "object",
                properties: {
                  contentScore: { 
                    type: "number", 
                    description: "Score for answer content quality (0-100)" 
                  },
                  deliveryScore: { 
                    type: "number", 
                    description: "Score for delivery based on metrics (0-100)" 
                  },
                  overallScore: { 
                    type: "number", 
                    description: "Combined overall score (0-100)" 
                  },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of strengths in the answer"
                  },
                  improvements: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of areas for improvement"
                  },
                  sampleAnswer: {
                    type: "string",
                    description: "A sample better answer or key points to include"
                  },
                  overallFeedback: {
                    type: "string",
                    description: "Comprehensive feedback combining content and delivery"
                  },
                  deliveryFeedback: {
                    type: "string",
                    description: "Specific feedback on delivery metrics"
                  }
                },
                required: ["contentScore", "deliveryScore", "overallScore", "strengths", "improvements", "overallFeedback"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "evaluate_answer" } }
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
        JSON.stringify({ error: "Failed to evaluate answer" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Evaluation response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log("Evaluation scores:", result.contentScore, result.deliveryScore, result.overallScore);
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Failed to parse evaluation response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error evaluating answer:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
