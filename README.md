# IBVAP — Intelligent Border Video Analytics Platform (SIH 2026)

[![OpenCV](https://img.shields.io/badge/OpenCV-4.13.0-5C3EE8?logo=opencv&logoColor=white)](https://opencv.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ONNX](https://img.shields.io/badge/ONNX_DNN-FER%2B_ResNet-005CED?logo=onnx&logoColor=white)](https://onnx.ai/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time_30FPS-blue)](https://websockets.readthedocs.io/)

A military-grade, real-time Intelligent Border Video Analytics Platform (IBVAP) prototype developed for **Smart India Hackathon (SIH 2026)**. The system ingests live video from the local laptop webcam, performs real-time multi-object YOLO detection, persistent target tracking, person-object spatial-temporal understanding, multi-camera incident fusion, and explainable risk analysis at **25-30 FPS**, overlaying a high-tech surveillance tactical HUD.

---

## System Architecture

```
                                  [ Tactical Optical Hardware ]
                                 (Laptop HD Webcam / USB FLIR Cam)
                                                │
                                                ▼
                         [ HTML5 Browser Ingestion: getUserMedia ]
                                    (1280x720 @ 30 FPS)
                                                │
                                                │ WebSocket Stream (JPEG Buffer)
                                                ▼
         ┌─────────────────────────────────────────────────────────────────────────────┐
         │                  FastAPI Backend Server (Uvicorn ASGI)                      │
         │                                                                             │
         │  1. Ingestion & Frame Decode: OpenCV fast memory buffer                     │
         │  2. Face Detection Engine:                                                  │
         │     - Mode A (Default): YuNet Deep Neural Net (ONNX + 5 Facial Landmarks)   │
         │     - Mode B: OpenCV Haar Cascade Frontal Face Classifier                   │
         │  3. Centroid & IoU Persistent Face Tracker:                                 │
         │     - Assigns & locks target identifiers across frames: LOC_#01, LOC_#02    │
         │  4. Emotion & Agitation Classifier:                                         │
         │     - Pretrained FER+ ResNet Deep Neural Network via cv2.dnn                │
         │     - Classes: Neutral, Happy, Angry, Surprised, Sad, Fear, Disgust,        │
         │                Contempt                                                     │
         │     - Softmax confidence distribution and threat severity profiling         │
         └─────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                │ JSON Telemetry & Predictions
                                                ▼
         ┌─────────────────────────────────────────────────────────────────────────────┐
         │                  CCTV HUD Tactical Command Center UI                        │
         │                                                                             │
         │  - Tactical Tech-Bracket Bounding Boxes with sharp corner reticles          │
         │  - Color-Coded Threat Badges:                                               │
         │      * Green (#00ff88): Neutral / Happy (Nominal/Cooperative)               │
         │      * Amber (#ffaa00): Surprised / Distressed / Suspicious                 │
         │      * Alert Red (#ff3344): Angry / Fear / Disgust (Agitated/Hostile)       │
         │  - Facial Landmark Radar: Eye and mouth orientation tracking points         │
         │  - Sidebar Surveillance Feed: Timestamped event logs with anomaly alerts    │
         │  - Camera Ingestion Selector: Dynamic USB & virtual camera switching        │
         │  - Confidence Threshold Slider (50% - 90%) with live filtering              │
         │  - Synthetic Web Audio Radar & Alarm Sirens (Mute/Unmute support)           │
         │  - Optical Filter Modes: Standard Color, Night Vision, FLIR Thermal, B&W    │
         │  - Forensic Intelligence Export (CSV) & Frame Snapshot Archive (PNG)        │
         └─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities & Technical Specifications

| Feature | Implementation Detail | Benchmark Performance |
| :--- | :--- | :--- |
| **Video Ingestion** | `navigator.mediaDevices.getUserMedia` + OpenCV fallback | 1280x720 @ 30 FPS |
| **Face Detection** | YuNet Deep Neural Network (`face_detection_yunet_2023mar.onnx`) | ~8-12 ms CPU |
| **Target Tracking** | Centroid & IoU Euclidean tracker (`LOC_#01`, `LOC_#02`) | < 1 ms |
| **Facial Emotion** | Microsoft FER+ ResNet ONNX (`emotion-ferplus-8.onnx`) | ~12.6 ms CPU (~79 FPS max) |
| **Total Pipeline Latency** | WebSocket transfer + Decode + Detection + Emotion | **< 25 ms** |
| **Threat Categorization** | Hostile / Agitated (`Angry`), Stress (`Fear`), Nominal (`Neutral`) | Real-time classification |

---

## Project Structure

```
IBVAP/
├── backend/
│   ├── __init__.py            # Backend package initialization
│   ├── app.py                 # FastAPI application, WebSocket & REST endpoints
│   ├── face_pipeline.py       # Face detection (YuNet & Haar) + Centroid Tracker
│   ├── emotion_pipeline.py    # Pretrained FER+ ResNet emotion classifier
│   └── camera_streamer.py     # OpenCV native camera hardware capture
├── frontend/
│   ├── index.html             # Tactical CCTV HUD command center interface
│   ├── css/
│   │   └── style.css          # Military surveillance styling, scanlines, brackets
│   └── js/
│       ├── app.js             # Camera management, WebSocket, Canvas HUD renderer
│       └── audio.js           # Web Audio API synthetic radar beep & threat siren
├── models/
│   ├── emotion-ferplus-8.onnx # FER+ ResNet Deep Neural Network (33.4 MB)
│   └── face_detection_yunet_2023mar.onnx # YuNet Face Detection Network (232 KB)
├── requirements.txt           # Python dependencies
├── run.py                     # One-click automated launcher
└── README.md                  # System documentation
```

---

## Quick Start & Local Execution

### 1. Prerequisites
- Python 3.10, 3.11, or 3.12 installed.
- A functional laptop webcam or external USB camera.
- Google Chrome, Microsoft Edge, Firefox, or Safari browser.

### 2. Install Dependencies
In your terminal (PowerShell or Command Prompt):
```bash
pip install -r requirements.txt
```

### 3. Launch the Command Center
Execute the master runner:
```bash
python run.py
```
*The script automatically verifies the neural network models in `models/`, starts the FastAPI ASGI server on `http://127.0.0.1:8000`, and opens your default browser.*

### 4. Connect a Remote CAM-02 Edge Node

Run the following on the teammate laptop from the IBVAP project root. The webcam remains real; no footage is generated or replayed:

```powershell
pip install -r requirements.txt
$env:EDGE_NODE="true"
$env:EDGE_CAMERA_INDEX="0"
python run.py
```

Allow inbound TCP port `8000` in the teammate laptop firewall if Windows prompts for it. The teammate's stream URL is:
`http://TEAMMATE_IP:8000/edge/video_feed`

On the main IBVAP laptop, run the backend from the project root with the teammate's LAN IP:

```powershell
$env:CAM2_ENABLED="true"
$env:CAM2_NAME="Sector Bravo"
$env:CAM2_SOURCE_TYPE="EDGE_NODE"
$env:CAM2_STREAM_URL="http://TEAMMATE_IP:8000/edge/video_feed"
python run.py
```

In another terminal on the main laptop, start the dashboard with `npm run dev` and open `http://localhost:5176`. CAM-02 reconnects automatically and shows `REMOTE CAMERA OFFLINE` until the edge node is reachable. CAM-02 frames are processed by the same FastAPI `pipeline` used by the local stream.

---

## Tactical Dashboard Controls Guide

1. **Camera Selection**: Use the **"Video Device Ingestion"** dropdown to toggle between internal laptop webcam and any connected external USB/thermal camera.
2. **Analytics Toggle**: Toggle **"Face & Emotion Analytics"** on or off to enable or disable the AI inference pipeline in real time.
3. **Confidence Threshold**: Adjust the slider (50% - 90%) to filter out uncertain facial detections or ambiguous expressions.
4. **Detector Engine**: Switch between **YuNet Deep Neural Net** (high accuracy, handles tilted faces, outputs landmarks) and **OpenCV Haar Cascade** (ultra-lightweight CPU execution).
5. **Sensor Optical Filters**:
   - **Standard Color**: Direct optical RGB video feed.
   - **Night Vision**: Phosphor green high-gain night surveillance filter.
   - **Thermal FLIR**: Inverted false-color infrared heat signature filter.
   - **Monochrome**: High-contrast monochrome tactical feed.
6. **Audio Tactical Alerts**: Click `🔊 AUDIO ON` / `🔇 AUDIO OFF` to toggle real-time synthetic radar lock pings and high-threat anomaly alarm chimes.
7. **Intelligence Export**: Click `EXPORT` in the alert feed to download a timestamped CSV intelligence log of all detected anomalies and targets.
8. **Frame Snapshot**: Click `📸 SNAPSHOT` to save a watermarked forensic surveillance capture directly to your computer.

---

## REST & WebSocket API Documentation

- `WS /ws/stream`: Bi-directional real-time stream. Transmits base64 JPEG webcam frames; receives JSON coordinates `[x, y, w, h]`, target identities `LOC_#1`, emotion distributions, and anomaly alerts.
- `GET /api/status`: Health check, active AI models, and operational telemetry.
- `GET /api/cameras`: Enumerates local hardware video capture devices detected by OpenCV.
- `POST /api/analyze-frame`: Single-shot multipart image analysis endpoint.
- `GET /video_feed`: Direct backend MJPEG stream for headless or server-side OpenCV capture.
