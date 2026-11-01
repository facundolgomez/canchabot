# ⚽ CanchaBot · Complejo La Redonda

Asistente con IA para reservar canchas de fútbol por chat, más un panel para el dueño.

## Correr en local

```bash
npm install            # dependencias del backend
npm run build          # instala y compila el frontend (client/dist)
cp .env.example .env   # opcional: pegá tu OPENAI_API_KEY (sin key → modo demo)
npm start              # http://localhost:3000
```

### Desarrollo con recarga en caliente

```bash
# Terminal 1 (raíz)
npm run dev            # backend en :3000 (se reinicia al guardar)

# Terminal 2
cd client && npm run dev   # frontend en :5173, /api va por proxy a :3000
```

## Endpoints

| Método | Ruta                 | Descripción                                                    |
| ------ | -------------------- | -------------------------------------------------------------- |
| POST   | `/api/chat`          | `{ historial: [{role, content}] }` → JSON de la IA (+ guarda reserva válida) |
| GET    | `/api/reservas`      | Lista de reservas (opcional `?fecha=YYYY-MM-DD`)               |
| PATCH  | `/api/reservas/:id`  | `{ estado: "pendiente_sena" \| "confirmada" \| "cancelada" }`   |
| GET    | `/api/complejo`      | Info del complejo, horarios y modo (ia/demo)                   |
| POST   | `/api/promo`         | `{ fecha }` → promo para llenar turnos libres (titulo, texto, turnos_en_promo, descuento_sugerido, hashtags) |
| POST   | `/api/analisis`      | `{ fecha }` → resumen, ocupacion_porcentaje, insights, recomendaciones |
| GET    | `/api/consultas`     | Preguntas que el asistente derivó al encargado (pendientes primero) |
| PATCH  | `/api/consultas/:id` | `{ estado: "pendiente" \| "respondida" }`                       |

**Por chat el cliente también puede:** cancelar o cambiar su reserva (se identifica con el teléfono con que reservó; solo puede tocar las suyas). Si pide un horario ocupado, el backend le propone lo más cercano libre.

## Deploy (Render, Railway, etc.)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Variable de entorno: `OPENAI_API_KEY` (sin ella arranca en modo demo)
