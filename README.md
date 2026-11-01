# ⚽ CanchaBot · Complejo La Redonda

**Un asistente con IA que atiende las reservas de un complejo de fútbol 5 y 7 las 24 hs, y un panel que ayuda al dueño a llenar la cancha.**

## El problema

En los complejos de fútbol las reservas se manejan por WhatsApp a mano. El dueño (o el encargado) contesta siempre lo mismo ("¿tenés a las 21?", "¿cuánto sale?", "¿hay estacionamiento?"). Mientras no contesta, los clientes se van a otro lado. Además, los turnos que quedan vacíos se pierden y nadie mira los números del día.

## La solución

Una web con dos vistas:

- **Reservar** (para el cliente): un chat con un asistente que responde y reserva como lo haría el encargado.
- **Panel del dueño**: las reservas del día en una grilla, consultas pendientes y herramientas con IA para vender más.

La IA **interpreta**, pero el **backend valida**. Los precios, la disponibilidad y los cambios los calcula siempre el servidor, así que la IA nunca puede reservar un turno ocupado ni inventar un precio.

## Funciones con IA

### 1. Asistente de reservas (chat)
- Entiende pedidos en lenguaje natural: *"somos 10, ¿tenés algo el jueves después de las 20?"*. Responde con tarjetas de turnos libres y crea la reserva con nombre y teléfono.
- **Primero responde la pregunta concreta** (accesibilidad, cantina, lluvia, seña…). Recién después ofrece turnos.
- Si el horario está ocupado, **propone las alternativas más cercanas**: misma hora en otra cancha, o una hora antes o después.
- **Cancela o cambia reservas por chat**. El cliente se identifica con su teléfono y solo puede tocar sus propias reservas. El asistente aplica la política de cancelación (con más de 24 hs se devuelve la seña; con menos, queda como crédito).
- **Comprobante** con el código de reserva, la seña del 30% y el alias para transferir, el precio por jugador y un botón **"Compartir con el grupo"** por WhatsApp.

### 2. Consultas pendientes
Si el cliente pregunta algo que el asistente no sabe, el asistente **no inventa**: le dice que lo consulta con el encargado. La pregunta aparece en el panel con el teléfono del cliente (link directo a WhatsApp) y un botón para marcarla como respondida.

### 3. Llenar turnos vacíos
Con un clic, la IA arma una **promo lista para publicar** con los turnos libres del día. Incluye título, texto, descuento sugerido y hashtags, más botones para copiarla o enviarla por WhatsApp.

### 4. Analizar mi día
La IA lee las reservas y devuelve un **resumen del día**: porcentaje de ocupación, insights (horarios flojos, señas sin pagar, cancha más pedida) y recomendaciones concretas.

## Stack

- **Backend:** Node.js 20+, Express 5
- **IA:** OpenAI `gpt-4o-mini` con respuestas en JSON. Se usa solo desde el backend, así que la key nunca llega al navegador.
- **Frontend:** React + Vite, Tailwind CSS 4, diseño "noche de estadio" responsive

**Modo demo:** sin `OPENAI_API_KEY`, todo sigue funcionando con respuestas simuladas armadas con los datos reales.

## Cómo correrlo

```bash
npm install            # dependencias del backend
npm run build          # instala y compila el frontend
cp .env.example .env   # pegá tu OPENAI_API_KEY (opcional: sin key arranca en modo demo)
npm start              # → http://localhost:3000
```

**Para probar rápido:**
- En el chat:
  - *"¿Tenés la cancha 1 mañana a las 20?"*: está ocupada, así que muestra alternativas.
  - *"Quiero cancelar mi reserva"*, con el teléfono **341 555 0108**.
  - *"Necesito cambiar mi reserva"*, con el teléfono **341 555 0110**.
  - *"¿Es accesible para silla de ruedas?"*
- En el **Panel del dueño**: tocá "Llenar turnos vacíos" y "Analizar mi día", y mirá las consultas pendientes.

> Los datos son de ejemplo y se guardan en memoria: se reinician cada vez que se reinicia el servidor.
