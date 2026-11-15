# One container: builds the React app, then serves it + the API with FastAPI.
FROM node:20-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server server
COPY --from=web /app/dist dist
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "8000"]
