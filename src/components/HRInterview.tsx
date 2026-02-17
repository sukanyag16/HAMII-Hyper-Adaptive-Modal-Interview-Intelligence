import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, Mic, MicOff, Video, VideoOff, Square, ArrowLeft, 
  Loader2, Play, SkipForward, CheckCircle, ChevronRight, AlertCircle
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VisionAnalyzer } from "@/lib/visionAnalysis";
import { AudioAnalyzer } from "@/lib/audioAnalysis";
import { SpeechRecognitionService, SpeechAnalyzer } from "@/lib/speechRecognition";
import { FusionAlgorithm } from "@/lib/fusionAlgorithm";
import type { RawMetrics, FusedMetrics } from "@/lib/fusionAlgorithm";
import HRInterviewSummary from "./HRInterviewSummary";

interface HRQuestion {
  question: string;
  category: string;
  role: string;
  experience: string;
  difficulty: string;
  source_type: string;
  ideal_answer: string;
  keywords: string[];
  improved_question: string;
}

interface HRQuestionResult {
  question: string;
  category: string;
  answer: string;
  evaluation: {
    contentScore: number;
    deliveryScore: number;
    overallScore: number;
    starBreakdown: { situation: number; task: number; action: number; result: number };
    strengths: string[];
    improvements: string[];
    feedback: string;
    quickTip: string;
  } | null;
  emotionHistory: string[];
  avgMetrics: {
    eyeContact: number;
    posture: number;
    bodyLanguage: number;
    facialExpression: number;
  };
}

const HRInterview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<HRQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [results, setResults] = useState<HRQuestionResult[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const [currentMetrics, setCurrentMetrics] = useState<FusedMetrics | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [aiVisionMetrics, setAiVisionMetrics] = useState<{
    detectedEmotion?: string;
    gestureType?: string;
    postureType?: string;
  } | null>(null);

  const visionAnalyzerRef = useRef<VisionAnalyzer | null>(null);
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionService | null>(null);
  const speechAnalyzerRef = useRef<SpeechAnalyzer>(new SpeechAnalyzer());
  const fusionAlgorithmRef = useRef<FusionAlgorithm>(new FusionAlgorithm());
  const animationFrameRef = useRef<number | null>(null);
  const metricsHistoryRef = useRef<FusedMetrics[]>([]);
  const emotionHistoryRef = useRef<string[]>([]);
  const aiAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const totalTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ────────────────────────────────────────────────
  // Load questions
  // ────────────────────────────────────────────────
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const response = await fetch('/data/hr_interview_questions.json');
        const allQuestions: HRQuestion[] = await response.json();
        const selected = selectDiverseQuestions(allQuestions, 5);
        setQuestions(selected);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        toast({ title: "Error", description: "Failed to load questions", variant: "destructive" });
      }
    };
    loadQuestions();
  }, [toast]);

  const selectDiverseQuestions = (all: HRQuestion[], count: number): HRQuestion[] => {
    const categories = [...new Set(all.map(q => q.category))];
    const selected: HRQuestion[] = [];
    const used = new Set<string>();

    for (const cat of categories) {
      if (selected.length >= count) break;
      const qs = all.filter(q => q.category === cat);
      const idx = Math.floor(Math.random() * qs.length);
      const q = qs[idx];
      if (q && !used.has(cat)) {
        selected.push(q);
        used.add(cat);
      }
    }

    while (selected.length < count) {
      const remain = all.filter(q => !selected.includes(q));
      if (!remain.length) break;
      const q = remain[Math.floor(Math.random() * remain.length)];
      selected.push(q);
    }

    return selected;
  };

  // ────────────────────────────────────────────────
  // Initialize models
  // ────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing models (Gemini 2.5 Pro backend expected)");
        visionAnalyzerRef.current = new VisionAnalyzer();
        await visionAnalyzerRef.current.initialize();
        setModelsLoaded(true);

        const speech = new SpeechRecognitionService();
        if (speech.isSupported()) {
          speechRecognitionRef.current = speech;
          speech.onTranscript((text, final) => {
            if (final) setTranscript(p => p + ' ' + text);
            else setInterimTranscript(text);
          });
        }
      } catch (err) {
        console.error(err);
        setModelsLoaded(true);
      }
    };
    init();

    return () => {
      visionAnalyzerRef.current?.cleanup();
      audioAnalyzerRef.current?.cleanup();
      speechRecognitionRef.current?.stop();
      clearInterval(timerIntervalRef.current!);
      clearInterval(totalTimerRef.current!);
      clearInterval(aiAnalysisIntervalRef.current!);
    };
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(console.log);
      }
      setStream(s);
      setIsCameraOn(true);
      setIsMicOn(true);
    } catch (err: any) {
      toast({
        title: "Camera / Mic Error",
        description: err.name === "NotAllowedError" ? "Please allow camera & microphone access" : "Could not access media devices",
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);
  };

  const toggleMicrophone = () => {
    stream?.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    setIsMicOn(!isMicOn);
  };

  const startInterview = () => {
    if (!isCameraOn) {
      toast({ title: "Camera Required", description: "Please enable camera first", variant: "destructive" });
      return;
    }
    setInterviewStarted(true);
    setResults([]);
    setCurrentQuestionIndex(0);
    setTotalDuration(0);
    totalTimerRef.current = setInterval(() => setTotalDuration(p => p + 1), 1000);
  };

  const startRecording = useCallback(() => {
    if (!isCameraOn || !stream) return;

    setIsRecording(true);
    setRecordingTime(0);
    setTranscript("");
    setInterimTranscript("");
    setCurrentFeedback(null);
    metricsHistoryRef.current = [];
    emotionHistoryRef.current = [];
    speechAnalyzerRef.current.reset();
    fusionAlgorithmRef.current.reset();
    setAiVisionMetrics(null);

    audioAnalyzerRef.current = new AudioAnalyzer();
    audioAnalyzerRef.current.initialize(stream);

    speechRecognitionRef.current?.start();

    timerIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);

    // ─── Gemini 2.5 Pro vision analysis ───
    const runAnalysis = async () => {
      if (!videoRef.current || !isRecording) return;
      const v = videoRef.current;
      if (v.readyState < v.HAVE_ENOUGH_DATA) return;

      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")!.drawImage(v, 0, 0);
        const img = c.toDataURL("image/jpeg", 0.75);

        const { data, error } = await supabase.functions.invoke("analyze-presentation", {
          body: {
            imageData: img,
            transcript: transcript + " " + interimTranscript,
            model: "gemini-2.5-pro-exp-02-05"   // ← explicit Gemini 2.5 Pro
          }
        });

        if (error) throw error;

        if (data?.vision) {
          setAiVisionMetrics({
            detectedEmotion: data.vision.detectedEmotion,
            gestureType: data.vision.gestureType,
            postureType: data.vision.postureType,
          });

          if (data.vision.detectedEmotion) {
            emotionHistoryRef.current.push(data.vision.detectedEmotion);
          }

          const m: FusedMetrics = {
            eyeContact: data.vision.eyeContact ?? 50,
            posture: data.vision.posture ?? 50,
            bodyLanguage: data.vision.bodyLanguage ?? 50,
            facialExpression: data.vision.expression ?? 50,
            voiceQuality: data.voice?.tone ?? 50,
            speechClarity: data.voice?.clarity ?? 50,
            contentEngagement: data.voice?.engagement ?? 50,
            overallScore: data.overall ?? 50,
            confidence: 0.85,
          };

          setCurrentMetrics(m);
          metricsHistoryRef.current.push(m);
        }
      } catch (err) {
        console.error("Vision analysis failed:", err);
      }
    };

    aiAnalysisIntervalRef.current = setInterval(runAnalysis, 3000);
    setTimeout(runAnalysis, 800);

    // local frame analysis (unchanged from your original)
    const analyzeFrame = async () => { /* ... your original local vision + audio logic ... */ };
    analyzeFrame();
  }, [isCameraOn, stream, transcript, interimTranscript]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    speechRecognitionRef.current?.stop();
    audioAnalyzerRef.current?.cleanup();
    clearInterval(timerIntervalRef.current!);
    clearInterval(aiAnalysisIntervalRef.current!);

    const avg = calculateAverageMetrics();
    await evaluateAnswer(avg);
  }, []);

  const calculateAverageMetrics = () => {
    const h = metricsHistoryRef.current;
    if (!h.length) return { eyeContact: 0, posture: 0, bodyLanguage: 0, facialExpression: 0 };
    return {
      eyeContact: Math.round(h.reduce((s, m) => s + m.eyeContact, 0) / h.length),
      posture: Math.round(h.reduce((s, m) => s + m.posture, 0) / h.length),
      bodyLanguage: Math.round(h.reduce((s, m) => s + m.bodyLanguage, 0) / h.length),
      facialExpression: Math.round(h.reduce((s, m) => s + m.facialExpression, 0) / h.length),
    };
  };

  const evaluateAnswer = async (avgMetrics: ReturnType<typeof calculateAverageMetrics>) => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    setIsEvaluating(true);

    try {
      const { data, error } = await supabase.functions.invoke("evaluate-hr-answer", {
        body: {
          question: q.improved_question,
          category: q.category,
          answer: transcript.trim(),
          idealAnswer: q.ideal_answer,
          keywords: q.keywords,
          visionMetrics: { ...avgMetrics, ...aiVisionMetrics },
          emotionHistory: emotionHistoryRef.current,
          model: "gemini-2.5-pro-exp-02-05"   // ← Gemini 2.5 Pro
        }
      });

      if (error) throw error;

      setResults(prev => [...prev, {
        question: q.improved_question,
        category: q.category,
        answer: transcript.trim(),
        evaluation: data,
        emotionHistory: [...emotionHistoryRef.current],
        avgMetrics,
      }]);

      setCurrentFeedback(data.feedback);

      toast({
        title: `Score: ${data.overallScore}%`,
        description: "Answer evaluated"
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Evaluation failed", description: "Could not process answer", variant: "destructive" });
    } finally {
      setIsEvaluating(false);
    }
  };

  // ─── rest of your component logic (nextQuestion, skip, formatTime, etc.) remains the same ───

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" />
        <span className="ml-3">Loading questions...</span>
      </div>
    );
  }

  // ... rest of your JSX (question card, video, controls, transcript, feedback, sidebar) ...
  // just remove any remaining lovable / heart / sparkle / pink elements

  // Example snippet for feedback area (neutral version):
  {(currentFeedback || isEvaluating) && (
    <Card className="p-5">
      {isEvaluating ? (
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Evaluating answer...</span>
        </div>
      ) : (
        <>
          <h3 className="font-medium mb-2">Feedback</h3>
          <p className="text-sm">{currentFeedback}</p>
          <Button onClick={nextQuestion} className="mt-4">
            {currentQuestionIndex < questions.length - 1 ? "Next" : "Finish"}
          </Button>
        </>
      )}
    </Card>
  )}

  // ... continue with your original layout ...
};

export default HRInterview;
