# Grimmich as a Docker container.
#   docker compose build      (the first build downloads a few GB: Python packages, the AI library)
#   docker compose up -d
# The program lives in /app, all your data (database, access files, caches, AI models) in /data (a volume).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    GRIMMICH_DATA=/data \
    GRIMMICH_HOST=0.0.0.0 \
    HF_HOME=/data/cache/huggingface \
    TORCH_HOME=/data/cache/torch \
    YOLO_CONFIG_DIR=/data/cache/ultralytics \
    MPLCONFIGDIR=/data/cache/matplotlib

# libraries that OpenCV needs
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PyTorch for the processor only (much smaller than the default package with GPU support).
# torch and torchvision must come from the same place, otherwise they do not fit together.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
# fail the build (not the first start) if the AI libraries do not fit together
RUN python -c "import torch, torchvision, ultralytics, timm; from transformers import AutoImageProcessor, AutoModelForImageClassification"

COPY . .

VOLUME /data
EXPOSE 8765
CMD ["python", "grimmich.py"]
