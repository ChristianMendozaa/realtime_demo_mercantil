import os
import json
import logging
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from app.bank_tools import BankSimulator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BancoMercantilBackend")

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY no se encontró en las variables de entorno.")

MODEL_VERSION = "gpt-realtime-mini-2025-12-15"

app = FastAPI(title="Banco Mercantil Backend REST")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bank_simulator = BankSimulator()

# Pydantic model for receiving tool calls
class ToolCall(BaseModel):
    name: str
    arguments: dict

@app.get("/api/session")
async def get_ephemeral_token():
    """Crea un Realtime Session Token en OpenAI usando nuestra API Key de forma segura y le inyecta las instrucciones del Banco."""
    url = "https://api.openai.com/v1/realtime/sessions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL_VERSION,
        "modalities": ["audio", "text"],
        "instructions": "Eres el asistente virtual del Banco Mercantil Santa Cruz. Siempre responde amablemente en español con actitud proactiva. Si el usuario te pregunta por operaciones como saldo o transferencias, utiliza las herramientas. Recuerda mantener la conversación concisa pero útil.",
        "voice": "nova",
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        },
        "tools": bank_simulator.get_tools_definition(),
        "tool_choice": "auto",
        "temperature": 0.7,
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        # Devuelve el client_secret.value
        return response.json()
    else:
        logger.error(f"Error OpenAI Session: {response.text}")
        raise HTTPException(status_code=500, detail="Fallo al obtener token efímero de OpenAI.")

@app.post("/api/tools")
async def execute_tool_endpoint(call: ToolCall):
    """Ejecuta una operación del banco simulada desde una llamada REST externa"""
    logger.info(f"Petición REST de frontend para herramienta '{call.name}' con args: {call.arguments}")
    result = bank_simulator.execute_tool(call.name, call.arguments)
    return result
