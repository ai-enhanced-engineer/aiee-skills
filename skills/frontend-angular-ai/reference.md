# Angular AI Reference

Detailed integration patterns for AI in Angular 21+.

## Genkit Deep Dive

### Server Setup

```typescript
// server/src/index.ts
import express from 'express';
import { genkit } from 'genkit';
import { googleAI, gemini20Flash } from '@genkit-ai/googleai';

const app = express();
app.use(express.json());

const ai = genkit({
  plugins: [googleAI()],
  model: gemini20Flash
});

// Simple generation
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;

  const response = await ai.generate({
    prompt,
    config: { temperature: 0.7 }
  });

  res.json({ text: response.text });
});

// Chat with history
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  const response = await ai.generate({
    model: gemini20Flash,
    messages: [
      ...history,
      { role: 'user', content: message }
    ],
    config: { temperature: 0.7 }
  });

  res.json({
    reply: response.text,
    history: [...history,
      { role: 'user', content: message },
      { role: 'model', content: response.text }
    ]
  });
});

app.listen(3000);
```

### Tool Calling (Function Calling)

```typescript
import { defineTool } from 'genkit';

// Define a tool
const searchProducts = defineTool({
  name: 'searchProducts',
  description: 'Search the product catalog by query',
  inputSchema: z.object({
    query: z.string(),
    category: z.string().optional()
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number()
  }))
}, async ({ query, category }) => {
  // Actual search implementation
  return await productService.search(query, category);
});

// Use in generation
const response = await ai.generate({
  prompt: 'Find me a laptop under $1000',
  tools: [searchProducts]
});
```

### Streaming with Genkit

```typescript
app.post('/api/stream', async (req, res) => {
  const { prompt } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await ai.generateStream({
    prompt,
    model: gemini20Flash
  });

  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

## Firebase AI Logic

Client-side AI with Firebase security rules.

### Setup

```typescript
// app.config.ts
import { initializeApp } from 'firebase/app';
import { getFirebaseAI } from 'firebase/ai';

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAI = getFirebaseAI(firebaseApp);
```

### Usage in Component

```typescript
import { Component, signal, inject } from '@angular/core';
import { getGenerativeModel, GoogleGenerativeAI } from 'firebase/ai';

@Component({...})
export class ChatComponent {
  private ai = inject(FirebaseAIService);

  prompt = signal('');
  response = signal('');
  loading = signal(false);

  async generate() {
    this.loading.set(true);

    try {
      const model = getGenerativeModel(this.ai.instance, {
        model: 'gemini-2.0-flash'
      });

      const result = await model.generateContent(this.prompt());
      this.response.set(result.response.text());
    } finally {
      this.loading.set(false);
    }
  }
}
```

## Gemini API Direct

Maximum flexibility with direct API access.

### Service

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface GeminiRequest {
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private http = inject(HttpClient);
  private apiUrl = '/api/gemini'; // Proxy to hide API key

  async generate(prompt: string): Promise<string> {
    const request: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    };

    const response = await this.http.post<any>(this.apiUrl, request).toPromise();
    return response.candidates[0].content.parts[0].text;
  }

  async *generateStream(prompt: string): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      yield chunk;
    }
  }
}
```

## Resource API for AI Data

Angular's Resource API handles async AI data elegantly.

```typescript
@Component({...})
export class InsightsComponent {
  private aiService = inject(AIService);

  metricsData = input.required<Metrics>();

  // AI insights as a resource
  insights = resource({
    request: () => ({ metrics: this.metricsData() }),
    loader: async ({ request }) => {
      return this.aiService.generateInsights(request.metrics);
    }
  });

  template = `
    @if (insights.isLoading()) {
      <app-skeleton />
    }

    @if (insights.hasValue()) {
      <div class="insights">{{ insights.value() }}</div>
    }

    @if (insights.error()) {
      <app-error [message]="insights.error().message" />
    }
  `;
}
```

## RAG Pattern (Retrieval-Augmented Generation)

```typescript
// Server-side RAG with Genkit
import { retrieve } from 'genkit';

app.post('/api/rag', async (req, res) => {
  const { question } = req.body;

  // 1. Retrieve relevant documents
  const docs = await vectorStore.search(question, { limit: 5 });

  // 2. Build context
  const context = docs.map(d => d.content).join('\n\n');

  // 3. Generate with context
  const response = await ai.generate({
    prompt: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`,
    config: { temperature: 0.3 } // Lower for factual
  });

  res.json({
    answer: response.text,
    sources: docs.map(d => d.metadata.source)
  });
});
```

## Security Patterns

### API Key Protection

```typescript
// WRONG: Exposing key in client
const API_KEY = 'sk-...'; // Never do this!

// CORRECT: Server proxy
// Server handles API key, client calls proxy
app.post('/api/ai/generate', async (req, res) => {
  const response = await genkit.generate({
    ...req.body,
    // API key from environment
  });
  res.json(response);
});
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: { error: 'Too many AI requests' }
});

app.use('/api/ai', aiLimiter);
```

### Output Validation

```typescript
// Always validate AI outputs before rendering
function sanitizeAIOutput(text: string): string {
  // Remove potential script injections
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'li']
  });
}
```
