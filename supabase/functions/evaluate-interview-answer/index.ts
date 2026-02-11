import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, answer, category, skillAssessed, fusionMetrics } = await req.json();
    
    if (!question || !answer) {
      return new Response(
        JSON.stringify({ error: "Question and answer are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build delivery context from fusion metrics
    const deliveryContext = fusionMetrics ? `
Delivery Metrics Observed:
- Eye Contact: ${fusionMetrics.eyeContact || 0}%
- Posture: ${fusionMetrics.posture || 0}%
- Body Language: ${fusionMetrics.bodyLanguage || 0}%
- Facial Expression: ${fusionMetrics.facialExpression || 0}%
- Voice Quality: ${fusionMetrics.voiceQuality || 0}%
- Speech Clarity: ${fusionMetrics.speechClarity || 0}%
- Content Engagement: ${fusionMetrics.contentEngagement || 0}%
- Overall Confidence: ${fusionMetrics.confidence || 0}%
` : '';

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert interview coach and HR professional. Evaluate the candidate's answer considering both content quality and delivery metrics.

## EVALUATION CRITERIA

### Content Score (0-100):
- Relevance: Does the answer directly address the question?
- Specificity: Are there concrete examples, not vague generalizations?
- Structure: Is the answer well-organized (STAR method preferred)?
- Impact: Does the candidate show measurable results?
- Skill Demonstration: Does it showcase the assessed skill?

### Delivery Score (0-100):
- Eye contact and engagement with camera
- Confident posture and body language
- Clear, well-paced speech
- Professional presence

Be ENCOURAGING but HONEST. Focus on specific improvements.`
          },
          {
            role: "user",
            content: `Evaluate this interview response:

**Category:** ${category}
**Skill Assessed:** ${skillAssessed}
**Question:** "${question}"

**Candidate's Answer:** "${answer}"

${deliveryContext}

Provide encouraging, specific feedback.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "evaluate_answer",
              description: "Evaluate the interview answer with structured feedback",
              parameters: {
                type: "object",
                properties: {
                  contentScore: { type: "number", description: "Content quality score (0-100)" },
                  deliveryScore: { type: "number", description: "Delivery score based on metrics (0-100)" },
                  overallScore: { type: "number", description: "Combined overall score (0-100)" },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 specific strengths"
                  },
                  improvements: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-2 specific areas for improvement"
                  },
                  sampleAnswer: { type: "string", description: "A sample better answer or key points" },
                  overallFeedback: { type: "string", description: "2-3 encouraging sentences with actionable tip" },
                  deliveryFeedback: { type: "string", description: "Specific feedback on delivery metrics" },
                  quickTip: { type: "string", description: "One specific 5-7 word improvement suggestion" }
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log("Evaluation:", { question: question.slice(0, 50), score: result.overallScore });
      
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
