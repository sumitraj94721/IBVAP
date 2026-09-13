"""
AI Border Surveillance CCTV Command Center (SIH 26187)
Master Launcher Script
"""

import os
import sys
import time
import webbrowser
import threading
import urllib.request
import uvicorn

BANNER = r"""
=============================================================================
  ██████╗  ██████╗ ██████╗ ██████╗ ███████╗██████╗    ███████╗██╗██╗  ██╗
  ██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗   ██╔════╝██║██║  ██║
  ██████╔╝██║   ██║██████╔╝██║  ██║█████╗  ██████╔╝   ███████╗██║███████║
  ██╔══██╗██║   ██║██╔══██╗██║  ██║██╔══╝  ██╔══██╗   ╚════██║██║██╔══██║
  ██████╔╝╚██████╔╝██║  ██║██████╔╝███████╗██║  ██║   ███████║██║██║  ██║
  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚══════╝╚═╝╚═╝  ╚═╝
           AI BORDER SURVEILLANCE CCTV COMMAND CENTER (SIH 26187)
=============================================================================
  - Optical Ingestion: Local Laptop Webcam (1280x720 @ 30 FPS)
  - Face Detection: YuNet Deep Neural Network & OpenCV Haar Cascade
  - Target Tracking: Centroid & IoU Persistent Tracking (LOC_#1)
  - Emotion Recognition: FER+ ResNet Deep Neural Network (~12ms CPU)
  - HUD Tactical Overlay: Tech Brackets, Threat Color Badges, Anomaly Alerts
=============================================================================
"""

MODELS = {
    "models/emotion-ferplus-8.onnx": "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx",
    "models/face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
}


def ensure_models():
    """Verifies that all pre-trained ONNX neural network models exist."""
    os.makedirs("models", exist_ok=True)
    for model_path, url in MODELS.items():
        if not os.path.exists(model_path) or os.path.getsize(model_path) < 1000:
            print(f"[*] Downloading required model: {os.path.basename(model_path)}...")
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as resp, open(model_path, "wb") as f:
                    f.write(resp.read())
                print(f"[+] Download complete: {model_path} ({os.path.getsize(model_path)} bytes)")
            except Exception as e:
                print(f"[!] Warning: Could not download {model_path}: {e}")
        else:
            print(f"[+] Model verified: {model_path} ({os.path.getsize(model_path)} bytes)")


def open_browser():
    time.sleep(1.5)
    url = "http://127.0.0.1:8000"
    print(f"[*] Launching CCTV Command Center in default browser: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[!] Please open your browser manually at: {url}")


def main():
    print(BANNER)
    ensure_models()
    print("\n[*] Initializing FastAPI ASGI Application on http://127.0.0.1:8000 ...")

    # Start browser opener in separate thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Launch Uvicorn server
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
