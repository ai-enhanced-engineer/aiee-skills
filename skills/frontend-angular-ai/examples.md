# Angular AI Examples

Production-ready AI integration patterns for Angular 21+.

## AI Chat Component

```typescript
import { Component, signal, computed, inject, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="chat-container" role="log" aria-live="polite">
      <!-- Messages -->
      <div class="messages">
        @for (msg of messages(); track msg.id) {
          <article
            class="message"
            [class.user]="msg.role === 'user'"
            [class.assistant]="msg.role === 'assistant'"
            [attr.aria-label]="msg.role + ' message'">
            <div class="content">{{ msg.content }}</div>
            <time class="timestamp">{{ formatTime(msg.timestamp) }}</time>
          </article>
        } @empty {
          <p class="empty-state">Start a conversation...</p>
        }

        @if (isStreaming()) {
          <article class="message assistant streaming">
            <div class="content">{{ streamingContent() }}</div>
            <span class="typing-indicator" aria-label="AI is typing">...</span>
          </article>
        }
      </div>

      <!-- Input -->
      <form (submit)="sendMessage($event)" class="input-form">
        <input
          type="text"
          [(ngModel)]="inputText"
          name="message"
          placeholder="Type your message..."
          [disabled]="isStreaming()"
          aria-label="Message input"
        />
        <button
          type="submit"
          [disabled]="!canSend()"
          aria-label="Send message">
          Send
        </button>
      </form>
    </div>
  `,
  styles: [`
    .chat-container { display: flex; flex-direction: column; height: 100%; }
    .messages { flex: 1; overflow-y: auto; padding: 1rem; }
    .message { margin-bottom: 1rem; padding: 0.75rem; border-radius: 8px; }
    .message.user { background: var(--primary-100); margin-left: 20%; }
    .message.assistant { background: var(--surface-100); margin-right: 20%; }
    .streaming .typing-indicator { animation: pulse 1s infinite; }
    .input-form { display: flex; gap: 0.5rem; padding: 1rem; }
    .input-form input { flex: 1; padding: 0.75rem; }
  `]
})
export class AIChatComponent {
  private chatService = inject(ChatService);

  messages = signal<Message[]>([]);
  inputText = signal('');
  isStreaming = signal(false);
  streamingContent = signal('');

  canSend = computed(() =>
    this.inputText().trim().length > 0 && !this.isStreaming()
  );

  async sendMessage(event: Event) {
    event.preventDefault();
    if (!this.canSend()) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: this.inputText(),
      timestamp: new Date()
    };

    this.messages.update(msgs => [...msgs, userMessage]);
    this.inputText.set('');
    this.isStreaming.set(true);
    this.streamingContent.set('');

    try {
      let fullResponse = '';

      for await (const chunk of this.chatService.streamChat(userMessage.content)) {
        fullResponse += chunk;
        this.streamingContent.set(fullResponse);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date()
      };

      this.messages.update(msgs => [...msgs, assistantMessage]);
    } finally {
      this.isStreaming.set(false);
      this.streamingContent.set('');
    }
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
```

## Chat Service with Streaming

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private apiUrl = '/api/chat';

  async *streamChat(message: string): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });

      // Parse SSE format
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            yield parsed.text || '';
          } catch {
            yield data;
          }
        }
      }
    }
  }
}
```

## AI-Powered Smart Form

```typescript
import { Component, signal, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-smart-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <div class="field">
        <label for="description">Product Description</label>
        <textarea
          id="description"
          formControlName="description"
          rows="4"
          aria-describedby="description-help">
        </textarea>
        <small id="description-help">Describe your product in detail</small>
      </div>

      <!-- AI Suggestions -->
      @if (suggestions().length > 0) {
        <div class="suggestions" role="region" aria-label="AI suggestions">
          <h4>AI Suggestions</h4>
          @for (suggestion of suggestions(); track suggestion) {
            <button
              type="button"
              class="suggestion-chip"
              (click)="applySuggestion(suggestion)">
              {{ suggestion }}
            </button>
          }
        </div>
      }

      @if (isLoadingSuggestions()) {
        <div class="loading" aria-live="polite">
          Generating suggestions...
        </div>
      }

      <div class="field">
        <label for="category">Category</label>
        <select id="category" formControlName="category">
          @for (cat of categories(); track cat.id) {
            <option [value]="cat.id">{{ cat.name }}</option>
          }
        </select>
      </div>

      <button type="submit" [disabled]="form.invalid">
        Create Product
      </button>
    </form>
  `
})
export class SmartFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private aiService = inject(AIService);

  form = this.fb.group({
    description: ['', [Validators.required, Validators.minLength(20)]],
    category: ['', Validators.required]
  });

  suggestions = signal<string[]>([]);
  isLoadingSuggestions = signal(false);
  categories = signal([
    { id: 'electronics', name: 'Electronics' },
    { id: 'clothing', name: 'Clothing' },
    { id: 'home', name: 'Home & Garden' }
  ]);

  ngOnInit() {
    // Generate suggestions when description changes
    this.form.get('description')!.valueChanges.pipe(
      debounceTime(1000),
      distinctUntilChanged()
    ).subscribe(async (value) => {
      if (value && value.length > 20) {
        await this.generateSuggestions(value);
      }
    });
  }

  async generateSuggestions(description: string) {
    this.isLoadingSuggestions.set(true);
    this.suggestions.set([]);

    try {
      const result = await this.aiService.getSuggestions(description);
      this.suggestions.set(result.tags);

      // Auto-suggest category
      if (result.suggestedCategory) {
        this.form.patchValue({ category: result.suggestedCategory });
      }
    } finally {
      this.isLoadingSuggestions.set(false);
    }
  }

  applySuggestion(suggestion: string) {
    const current = this.form.get('description')!.value || '';
    this.form.patchValue({
      description: `${current} ${suggestion}`
    });
  }

  onSubmit() {
    if (this.form.valid) {
      console.log('Submitting:', this.form.value);
    }
  }
}
```

## Image Analysis Component

```typescript
import { Component, signal, inject } from '@angular/core';

interface AnalysisResult {
  description: string;
  tags: string[];
  confidence: number;
}

@Component({
  selector: 'app-image-analyzer',
  standalone: true,
  template: `
    <div class="analyzer">
      <div
        class="dropzone"
        [class.dragover]="isDragOver()"
        (dragover)="onDragOver($event)"
        (dragleave)="isDragOver.set(false)"
        (drop)="onDrop($event)"
        role="button"
        tabindex="0"
        aria-label="Drop image here or click to upload"
        (keydown.enter)="fileInput.click()">

        @if (imagePreview()) {
          <img [src]="imagePreview()" alt="Uploaded image" />
        } @else {
          <p>Drop an image here or click to upload</p>
        }

        <input
          #fileInput
          type="file"
          accept="image/*"
          (change)="onFileSelect($event)"
          class="hidden"
        />
      </div>

      @if (isAnalyzing()) {
        <div class="analyzing" role="status" aria-live="polite">
          <span class="spinner"></span>
          Analyzing image...
        </div>
      }

      @if (result()) {
        <div class="results" role="region" aria-label="Analysis results">
          <h3>Analysis Results</h3>
          <p class="description">{{ result()!.description }}</p>
          <div class="tags">
            @for (tag of result()!.tags; track tag) {
              <span class="tag">{{ tag }}</span>
            }
          </div>
          <p class="confidence">
            Confidence: {{ (result()!.confidence * 100).toFixed(1) }}%
          </p>
        </div>
      }

      @if (error()) {
        <div class="error" role="alert">{{ error() }}</div>
      }
    </div>
  `
})
export class ImageAnalyzerComponent {
  private aiService = inject(AIService);

  imagePreview = signal<string | null>(null);
  isAnalyzing = signal(false);
  isDragOver = signal(false);
  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);

    const file = event.dataTransfer?.files[0];
    if (file?.type.startsWith('image/')) {
      this.processFile(file);
    }
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processFile(file);
    }
  }

  private async processFile(file: File) {
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.imagePreview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Analyze
    await this.analyzeImage(file);
  }

  private async analyzeImage(file: File) {
    this.isAnalyzing.set(true);
    this.result.set(null);
    this.error.set(null);

    try {
      const result = await this.aiService.analyzeImage(file);
      this.result.set(result);
    } catch (err) {
      this.error.set('Failed to analyze image. Please try again.');
    } finally {
      this.isAnalyzing.set(false);
    }
  }
}
```

## AI Service with Image Analysis

```typescript
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AIService {
  async analyzeImage(file: File): Promise<AnalysisResult> {
    const base64 = await this.fileToBase64(file);

    const response = await fetch('/api/ai/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        mimeType: file.type
      })
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    return response.json();
  }

  async getSuggestions(text: string): Promise<{
    tags: string[];
    suggestedCategory: string;
  }> {
    const response = await fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    return response.json();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
```
