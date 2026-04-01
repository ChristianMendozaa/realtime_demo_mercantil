import logging
import json

logger = logging.getLogger("BancoMercantilTools")

class BankSimulator:
    def __init__(self):
        # Base de datos simulada
        self.db = {
            "12345678": {
                "name": "Juan Perez",
                "balance": 1500.50,
                "currency": "BOB", # Bolivianos
                "accounts": ["Ahorro 4010203040"]
            }
        }

    def get_tools_definition(self):
        """Devuelve el esquema de las herramientas para OpenAI Realtime API."""
        return [
            {
                "type": "function",
                "name": "consultar_saldo",
                "description": "Consulta el saldo bancario actual de una cuenta usando el número de carnet de identidad (CI).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ci": {
                            "type": "string",
                            "description": "El número de documento de identidad del usuario (ejemplo: 12345678)"
                        }
                    },
                    "required": ["ci"]
                }
            },
            {
                "type": "function",
                "name": "transferir_fondos",
                "description": "Transfiere una cantidad de dinero de la cuenta del usuario a otra.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ci": {
                            "type": "string",
                            "description": "El número de identidad de quien envía"
                        },
                        "monto": {
                            "type": "number",
                            "description": "La cantidad de dinero a transferir"
                        },
                        "destino": {
                            "type": "string",
                            "description": "Nombre completo o cuenta del destinatario"
                        }
                    },
                    "required": ["ci", "monto", "destino"]
                }
            }
        ]

    def execute_tool(self, name: str, arguments: dict):
        if name == "consultar_saldo":
            return self.consultar_saldo(arguments.get("ci"))
        elif name == "transferir_fondos":
            return self.transferir_fondos(arguments.get("ci"), arguments.get("monto"), arguments.get("destino"))
        else:
            return {"error": "Herramienta no implementada"}

    def consultar_saldo(self, ci: str):
        logger.info(f"Simulando consulta de saldo para CI {ci}")
        # Simulamos un usuario logueado en caso de que no mande el correcto para demostración
        ci = ci if ci in self.db else "12345678"
        user = self.db.get(ci)
        if user:
            return {
                "status": "success",
                "mensaje": f"El saldo actual de {user['name']} es de {user['balance']} {user['currency']} en su cuenta {user['accounts'][0]}"
            }
        return {"status": "error", "mensaje": "Usuario no encontrado en el sistema del Banco Mercantil Santa Cruz."}

    def transferir_fondos(self, ci: str, monto: float, destino: str):
        logger.info(f"Simulando transferencia para CI {ci} de monto {monto} a {destino}")
        ci = ci if ci in self.db else "12345678"
        user = self.db.get(ci)
        
        try:
            monto = float(monto)
        except (ValueError, TypeError):
            return {"status": "error", "mensaje": "Monto inválido."}

        if user:
            if user['balance'] >= monto:
                user['balance'] -= monto
                return {
                    "status": "success",
                    "mensaje": f"Transferencia exitosa de {monto} {user['currency']} a la cuenta de {destino} aprobada. Su nuevo saldo es {user['balance']} {user['currency']}."
                }
            else:
                return {
                    "status": "error",
                    "mensaje": "Saldo insuficiente para realizar la transferencia."
                }
        return {"status": "error", "mensaje": "Usuario no encontrado."}
