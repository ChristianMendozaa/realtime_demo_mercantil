import os
import json
import asyncio
import base64
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import websockets
from dotenv import load_dotenv
from app.bank_tools import BankSimulator

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BancoMercantilBackend")

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY no se encontró en las variables de entorno.")

# URL de la API Realtime con el modelo requerido por el usuario
# gpt-realtime-mini-2025-12-15
MODEL_VERSION = "gpt-realtime-mini-2025-12-15"
OPENAI_WS_URL = f"wss://api.openai.com/v1/realtime?model={MODEL_VERSION}"

app = FastAPI(title="Backend Asistente Banco Mercantil")

# Permitir a nuestro frontend Next.js o cualquier origen (para desarrollo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bank_simulator = BankSimulator()

# Configuración inicial de las instrucciones para la IA
SESSION_UPDATE = {
    "type": "session.update",
    "session": {
        "modalities": ["audio", "text"],
        "instructions": "Eres el asistente virtual del Banco Mercantil Santa Cruz. Siempre responde amablemente en español con actitud proactiva. Si el usuario te pregunta por operaciones como saldo o transferencias, utiliza las herramientas. Recuerda mantener la conversación concisa pero útil.",
        "voice": "nova",
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
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
}


@app.websocket("/ws/realtime")
async def websocket_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    logger.info("Cliente Frontend conectado por WebSocket.")

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1"
    }

    try:
        # Abrimos la conexión oficial WebSocket hacia la API Realtime de OpenAI
        async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
            logger.info("Conectado a OpenAI Realtime API.")
            
            # 1. Configuramos la sesión inmediatamente
            await openai_ws.send(json.dumps(SESSION_UPDATE))
            
            # Tarea para leer del cliente (Frontend) y enviar a OpenAI
            async def receive_from_client():
                try:
                    while True:
                        message = await client_ws.receive_text()
                        data = json.loads(message)
                        
                        # Si el cliente nos envía chunk de audio (input_audio_buffer.append)
                        # o cualquier otro evento soportado del Realtime API
                        await openai_ws.send(json.dumps(data))
                except WebSocketDisconnect:
                    logger.info("Cliente desconectado.")
                except Exception as e:
                    logger.error(f"Error recibiendo del cliente: {e}")

            # Tarea para leer de OpenAI y procesar o enviar al Frontend
            async def receive_from_openai():
                try:
                    async for message in openai_ws:
                        raw_msg = json.loads(message)
                        event_type = raw_msg.get("type")
                        
                        # Lógica de procesamiento de llamadas a herramientas (function calling)
                        if event_type == "response.function_call_arguments.done":
                            # OpenAI ha terminado de decidir los argumentos para llamar una función
                            call_id = raw_msg.get("call_id")
                            name = raw_msg.get("name")
                            arguments = raw_msg.get("arguments", "{}")
                            
                            logger.info(f"OpenAI invocó herramienta: {name} con argumentos: {arguments}")
                            
                            try:
                                args_dict = json.loads(arguments)
                            except json.JSONDecodeError:
                                args_dict = {}
                                
                            # Ejecutamos la función simulada en nuestro backend
                            result = bank_simulator.execute_tool(name, args_dict)
                            
                            # Devolvemos el resultado al modelo de OpenAI
                            tool_response_event = {
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": json.dumps(result)
                                }
                            }
                            await openai_ws.send(json.dumps(tool_response_event))
                            
                            # Le pedimos a la IA que genere una respuesta basada en la salida de la función
                            await openai_ws.send(json.dumps({
                                "type": "response.create"
                            }))
                            
                        # Reenviamos todos los eventos (incluyendo audio de vuelta) al frontend
                        await client_ws.send_text(message)
                        
                except websockets.exceptions.ConnectionClosed:
                    logger.info("Conexión con OpenAI cerrada.")
                except Exception as e:
                    logger.error(f"Error procesando mensajes de OpenAI: {e}")

            # Ejecutamos ambos loops asíncronamente
            task1 = asyncio.create_task(receive_from_client())
            task2 = asyncio.create_task(receive_from_openai())
            
            done, pending = await asyncio.wait(
                [task1, task2],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Cancelar tareas pendientes si uno se desconecta
            for p in pending:
                p.cancel()

    except Exception as e:
        logger.error(f"Falla inicializando WebSocket con OpenAI: {e}")
        await client_ws.close()
