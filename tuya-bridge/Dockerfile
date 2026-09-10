# Puente entre dispositivos Tuya WiFi y MQTT. Va aparte del backend a propósito:
# el protocolo de Tuya lo habla tinytuya (Python) y el soporte de la versión 3.4
# en las librerías de Node no es fiable.
FROM python:3.12-slim
WORKDIR /app

COPY tuya-bridge/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tuya-bridge/bridge.py .

# Sello de versión, inyectado desde CI.
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=$COMMIT_SHA
ENV PYTHONUNBUFFERED=1
CMD ["python", "bridge.py"]
