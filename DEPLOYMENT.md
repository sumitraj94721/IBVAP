# IBVAP — Deployment & Operations Guide (SIH 26187)

This guide covers local development, single-container Docker deployment, and split cloud deployment (Frontend on **Vercel** + Backend on **Render / Railway / Cloud VM**) for the **Intelligent Border Video Analytics Platform (IBVAP)**.

---

## 1. Architecture Overview

| Layer | Technology | Entry Point | Default Port |
| :--- | :--- | :--- | :--- |
| **Frontend SPA** | React 18, Vite 6, Tailwind CSS | `index.html` → `src/main.jsx` → `src/App.jsx` | `5176` (dev) / `dist/` (build) |
| **Backend API & WS** | FastAPI, Uvicorn, WebSockets | `backend/app.py` (`backend.app:app`) or `python run.py` | `8000` (`$PORT`) |
| **Object Detection** | Ultralytics YOLOv8n (`yolov8n.pt`) | `backend/detection/yolo_detector.py` | Runs in Backend (CPU/GPU) |
| **Face & Emotion AI** | OpenCV YuNet + SFace 128D + FER+ ONNX | `backend/face/` & `backend/emotion_pipeline.py` | Runs in Backend (CPU) |
| **ANPR Engine** | Contour ROI + Tesseract OCR | `backend/anpr/` | Runs in Backend |
| **Database** | SQLite (`security.db` + `ibvap_edge.db`) | `backend/database.py` & `backend/storage_sync.py` | File-backed (`IBVAP_DATA_DIR`) |

---

## 2. Local Development Setup

### Prerequisites
- **Node.js** 18+ (tested with Node 20/24)
- **Python** 3.10–3.12
- *(Optional)* Tesseract OCR binary installed on system PATH for live license plate text extraction

### Step-by-Step Local Launch

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Frontend dependencies:**
   ```bash
   npm install
   ```

3. **Start Backend & Frontend concurrently (or in separate terminals):**
   ```bash
   # Option A: Start both together
   npm run dev:full

   # Option B: Start in two terminals
   python run.py          # Starts FastAPI on http://127.0.0.1:8000
   npm run dev            # Starts Vite on http://localhost:5176
   ```

4. **Verify Health & Tests:**
   ```bash
   npm run build
   npm run test:backend
   ```

---

## 3. Unified Docker Deployment (Recommended for Full-Stack / Edge Server)

The root `Dockerfile` builds the React frontend (`dist/`) and bundles it directly with the FastAPI + YOLOv8 + OpenCV backend in a single container served on port `8000`.

### Using Docker Compose
```bash
cp .env.example .env
docker compose up --build -d
```
- Open `http://localhost:8000` for the full application (Frontend + API + WebSockets + MJPEG streams).
- Health check endpoint: `http://localhost:8000/health`

### Using Docker CLI Directly
```bash
docker build -t ibvap:latest .
docker run -d --name ibvap -p 8000:8000 \
  -e IBVAP_ENV=production \
  -e IBVAP_AUTH_SECRET="replace-with-strong-64-char-secret" \
  -e IBVAP_ENABLE_DEMO_CREDENTIALS=true \
  ibvap:latest
```

---

## 4. Split Cloud Deployment (Vercel Frontend + Render Backend)

Because the backend executes real-time OpenCV video processing, persistent WebSockets (`/ws/stream`), and PyTorch YOLOv8 inference, it requires a stateful container/service (**Render**, **Railway**, **Fly.io**, or **AWS/GCP VM**), while the React SPA can be hosted globally on **Vercel**.

### Part A: Deploy Backend to Render
1. Push this repository to GitHub.
2. In Render, click **New + → Blueprint** and select the repository (uses `render.yaml`), or create a **Web Service** with:
   - **Runtime:** Python 3 (`3.11.9`) or Docker
   - **Build Command:** `pip install --upgrade pip && pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt`
   - **Start Command:** `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/health`
3. Set Environment Variables on Render:
   - `IBVAP_ENV=production`
   - `IBVAP_AUTH_SECRET=<strong-random-secret>`
   - `IBVAP_ENABLE_DEMO_CREDENTIALS=true` *(or `false` if using custom `IBVAP_ADMIN_USER` / `IBVAP_ADMIN_PASSWORD`)*
   - `IBVAP_DATA_DIR=/tmp/ibvap` *(or mount a Render Disk at `/var/data/ibvap`)*
   - `IBVAP_CORS_ORIGINS=https://your-project.vercel.app`
4. Copy your deployed Render URL (e.g. `https://ibvap-backend.onrender.com`).

### Part B: Deploy Frontend to Vercel
1. Import the GitHub repository into **Vercel**.
2. Vercel automatically detects `vercel.json`:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add Environment Variables in Vercel Project Settings:
   - `VITE_API_URL=https://ibvap-backend.onrender.com`
   - `VITE_WS_URL=wss://ibvap-backend.onrender.com`
4. Click **Deploy**.

---

## 5. Camera Modes in Cloud vs Local Deployments

- **CAM-01 (Browser Webcam):** Uses browser `navigator.mediaDevices.getUserMedia` (requires `https://` or `localhost`). Captures frames in the user's browser and streams them over `/ws/stream` to the backend for YOLOv8 + YuNet + SFace inference. Works in both local and cloud deployments!
- **CAM-02 / CAM-03 / CAM-04 (Demo Video / Intruder Image / Bunker Image / Simulated / Edge Stream):**
  - Works out-of-the-box in cloud deployments using the bundled `/demo/border/*.mp4` and `/demo/incidents/*.jpg` assets.
  - Can also connect to a remote RTSP/MJPEG edge camera when `CAM2_ENABLED=true` and `CAM2_STREAM_URL` are set.
