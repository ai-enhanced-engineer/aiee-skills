---
name: frontend-angular-ai
description: AI integration patterns for Angular applications using Genkit, Firebase AI Logic, or Gemini API. Includes streaming responses, tool calling, and RAG patterns. Use when building AI-powered features in Angular apps.
kb-sources:
  - wiki/software-engineering/angular-ai-tools
updated: 2026-05-21
---

# Angular AI Integration

Patterns for integrating AI capabilities into Angular 21+ applications.

## Integration Approaches

| Approach | Where | Best For |
|----------|-------|----------|
| **Genkit** | Server-side | Multi-model, complex flows, tool calling |
| **Firebase AI Logic** | Client-side | Firebase apps, quota management |
| **Gemini API** | Direct | Maximum flexibility, multimodal |

## Quick Decision

```
Need server-side processing? → Genkit
Using Firebase already? → Firebase AI Logic
Need image/audio analysis? → Gemini API (multimodal)
Building chatbot with history? → Genkit (server-side state)
Simple text completion? → Firebase AI Logic
```

## Genkit Overview (Recommended)

Google's open-source toolkit for production AI applications.

```typescript
// Server: Express + Genkit
import { genkit } from 'genkit';
import { googleAI, gemini20Flash } from '@genkit-ai/googleai';

const ai = genkit({ plugins: [googleAI()] });

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  const response = await ai.generate({
    model: gemini20Flash,
    messages: [...history, { role: 'user', content: message }]
  });

  res.json({ reply: response.text });
});
```

## Key Patterns

### Streaming Responses

```typescript
// Use Resource API for signal-based streaming
streamingResponse = resource({
  stream: async () => {
    const data = signal<{ value: string }>({ value: '' });
    // Stream handling logic
    return data;
  }
});
```

### Tool Calling

```typescript
// Define tools for LLM to call
const tools = [
  {
    name: 'searchProducts',
    description: 'Search product catalog',
    parameters: { query: 'string' }
  }
];
```

### Temperature Control

| Temperature | Use Case |
|-------------|----------|
| 0.0 - 0.3 | Factual, deterministic |
| 0.4 - 0.7 | Balanced creativity |
| 0.8 - 1.0 | Creative, varied |

## Security Patterns

| Pattern | Description |
|---------|-------------|
| **API Key Protection** | Keys stored server-side only, never exposed to client |
| **Output Sanitization** | AI responses sanitized before DOM rendering |
| **Rate Limiting** | Request throttling to prevent quota exhaustion |
| **Server Proxy** | All LLM API calls routed through backend proxy |

See `reference.md` for detailed patterns and `examples.md` for implementations.
