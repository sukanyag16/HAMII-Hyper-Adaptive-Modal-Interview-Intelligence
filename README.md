# HAMII - Hyper-Adaptive Multi-Modal Interview Intelligence

HAMII is an advanced, AI-powered communication coaching platform designed to help job seekers, professionals, and students master their interview and presentation skills. It uses state-of-the-art computer vision, audio processing, and NLP to provide real-time, multi-modal feedback.

## 🚀 Key Features

- **Real-Time AI Analysis**: Simultaneous tracking of facial expressions, body language, and vocal metrics.
- **Multi-Modal Fusion**: Intelligent aggregation of vision, audio, and speech data for holistic scoring.
- **Context-Aware Coaching**: Tailored feedback based on user category (e.g., Job Seeker, Sales, Public Speaker).
- **Proctored Exam Simulation**: Technical exam environment with AI monitoring.
- **Privacy First**: All analysis is performed locally in the browser or via secure, isolated functions.
- **Multi-Language Support**: Speech recognition and analysis for English, Hindi, and Telugu.

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **AI/ML**: 
  - **Vision**: MediaPipe (Face Mesh, Pose, Gesture)
  - **Audio**: Web Audio API (YIN Pitch Detection, RMS Energy)
  - **NLP**: Custom algorithms for TF-IDF, Sentiment Analysis, and Fluecy Scoring.
- **Backend/Integrations**: Supabase (Edge Functions for deep analysis), Firebase (Planned for Auth).

## 🧠 How the Algorithm Works

HAMII employs a **Multi-Modal Fusion Engine** that processes three primary data streams:

1.  **Vision Analyzer**:
    - **Face Mesh**: Tracks 468 landmarks to detect eye contact, blinks, and FACS-based micro-expressions.
    - **Pose Detection**: Analyzes 33 keypoints to monitor posture, stability, and shoulder alignment.
    - **Gesture Recognition**: Tracks hand visibility and movement variety.

2.  **Audio Analyzer**:
    - **Pitch Tracking**: Uses the **YIN algorithm** for high-precision fundamental frequency detection.
    - **Dynamic Range**: Monitors volume (RMS) and signal-to-noise ratio (SNR) for speech clarity.
    - **Voice Stability**: Measures pitch variation to infer confidence levels.

3.  **Speech & NLP Engine**:
    - **Lexical Analysis**: Calculates WPM (Words Per Minute) and filler word percentage.
    - **Sentiment Analysis**: Uses VADER-inspired logic to determine the emotional tone of responses.
    - **Topic Modeling**: TF-IDF and Cosine Similarity to verify content relevance.

4.  **Weighted Fusion**:
    - Metrics are aggregated using a context-dependent weighting matrix (e.g., job seekers are scored higher on eye contact and posture).
    - **Temporal Smoothing**: Uses Exponential Moving Average (EMA) and Bayesian-style confidence scoring to provide stable, reliable feedback.

## 📂 Project Structure

- `src/components`: UI components and page sections.
- `src/lib`: Core AI/ML logic and analyzers.
- `src/pages`: Application routes and main views.
- `src/hooks`: Custom React hooks for state management.
- `src/integrations`: Connection logic for external services.

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or bun

### Installation
```bash
# Clone the repository
git clone https://github.com/priyankadaspoddar/HAMII-Hyper-Adaptive-Modal-Interview-Intelligence.git

# Navigate to the project directory
cd HAMII-Hyper-Adaptive-Modal-Interview-Intelligence-main

# Install dependencies
npm install

# Start the dev server
npm run dev
```

## 📄 License
This project is licensed under the MIT License.
