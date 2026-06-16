# Architecture Diagrams Reference

Complete syntax reference and advanced patterns for architecture visualization.

---

## Mermaid Flowchart Reference

### Node Shapes

```mermaid
flowchart LR
    A[Rectangle] --> B(Rounded)
    B --> C([Stadium])
    C --> D[[Subroutine]]
    D --> E[(Database)]
    E --> F((Circle))
    F --> G>Flag]
    G --> H{Diamond}
    H --> I{{Hexagon}}
```

| Shape | Syntax | Use Case |
|-------|--------|----------|
| Rectangle | `[text]` | Services, components |
| Rounded | `(text)` | Processes, actions |
| Stadium | `([text])` | Start/end points |
| Subroutine | `[[text]]` | External calls |
| Database | `[(text)]` | Data stores |
| Circle | `((text))` | Events, triggers |
| Diamond | `{text}` | Decisions |
| Hexagon | `{{text}}` | Preparation steps |

### Arrow Types

```mermaid
flowchart LR
    A --> B
    B --- C
    C -.- D
    D -.-> E
    E ==> F
    F ~~~ G
```

| Arrow | Syntax | Meaning |
|-------|--------|---------|
| Solid | `-->` | Direct call/dependency |
| Open | `---` | Association (no direction) |
| Dotted | `-.-` | Optional/async association |
| Dotted arrow | `-.->` | Async call |
| Thick | `==>` | Primary/critical path |
| Invisible | `~~~` | Layout spacing |

### Subgraphs

```mermaid
flowchart TB
    subgraph Frontend
        A[Widget]
        B[Dashboard]
    end

    subgraph Backend
        C[Gateway]
        D[Assistant]
    end

    subgraph Data
        E[(PostgreSQL)]
        F[(Redis)]
    end

    A --> C
    B --> C
    C --> D
    C --> E
    C --> F
```

### Styling

```mermaid
flowchart LR
    A[Critical Service]:::critical --> B[Normal Service]
    B --> C[External]:::external

    classDef critical fill:#f96,stroke:#333,stroke-width:2px
    classDef external fill:#bbf,stroke:#333,stroke-dasharray: 5 5
```

## Sequence Diagram Reference

### Message Types

```mermaid
sequenceDiagram
    participant A as Client
    participant B as Server

    A->>B: Sync request (solid arrow)
    B-->>A: Sync response (dashed)
    A-)B: Async message (open arrow)
    B--)A: Async response
    A-xB: Lost message (X)
```

| Syntax | Type | Use Case |
|--------|------|----------|
| `->>` | Solid arrow | Synchronous request |
| `-->>` | Dashed arrow | Response or async |
| `-)` | Open arrow | Fire-and-forget |
| `--)` | Open dashed | Async notification |
| `-x` | X arrow | Failed/lost message |

### Control Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant D as Database

    C->>S: Request

    alt Success
        S->>D: Query
        D-->>S: Results
        S-->>C: 200 OK
    else Not Found
        S-->>C: 404 Not Found
    else Error
        S-->>C: 500 Error
    end
```

> **Important**: The keyword `end` must match the case used to open the block. Using lowercase `end` elsewhere in diagram text can cause parsing errors.

### Loops and Parallel

```mermaid
sequenceDiagram
    participant W as Widget
    participant G as Gateway

    loop Every 30s
        W->>G: Heartbeat
        G-->>W: Ack
    end

    par Stream Response
        G-->>W: Chunk 1
    and
        G-->>W: Chunk 2
    and
        G-->>W: Chunk N
    end
```

### Notes and Activations

```mermaid
sequenceDiagram
    participant A as Client
    participant B as Server

    Note over A: User clicks send

    activate A
    A->>+B: Request
    Note right of B: Processing...
    B-->>-A: Response
    deactivate A

    Note over A,B: Connection closed
```

## C4 Model Reference

> **Note**: C4 diagrams in Mermaid are experimental. Syntax may change in future releases. Refer to the [official Mermaid C4 documentation](https://mermaid.js.org/syntax/c4.html) for the latest syntax.

### C4 Context (Level 1)

```mermaid
C4Context
    title System Context Diagram

    Enterprise_Boundary(eb, "Enterprise") {
        Person(user, "End User", "Primary user of the system")
        Person(admin, "Administrator", "Manages configuration")
    }

    System(sys, "Our System", "The system being designed")

    System_Ext(ext1, "External API", "Third-party service")
    System_Ext(ext2, "Email Service", "Notification delivery")

    Rel(user, sys, "Uses", "HTTPS")
    Rel(admin, sys, "Configures", "HTTPS")
    Rel(sys, ext1, "Calls", "REST API")
    Rel(sys, ext2, "Sends via", "SMTP")
```

### C4 Container (Level 2)

```mermaid
C4Container
    title Container Diagram

    Person(user, "User")

    System_Boundary(sb, "System") {
        Container(web, "Web App", "React", "User interface")
        Container(api, "API", "FastAPI", "Business logic")
        Container(worker, "Worker", "Celery", "Background tasks")
        ContainerDb(db, "Database", "PostgreSQL", "Persistent storage")
        ContainerDb(cache, "Cache", "Redis", "Session/rate limiting")
        Container_Ext(queue, "Message Queue", "RabbitMQ", "Task queue")
    }

    Rel(user, web, "Uses", "HTTPS")
    Rel(web, api, "Calls", "REST")
    Rel(api, db, "Reads/Writes", "SQL")
    Rel(api, cache, "Caches", "Redis protocol")
    Rel(api, queue, "Publishes", "AMQP")
    Rel(worker, queue, "Consumes", "AMQP")
    Rel(worker, db, "Updates", "SQL")
```

### C4 Component (Level 3)

```mermaid
C4Component
    title API Component Diagram

    Container_Boundary(api, "API Container") {
        Component(auth, "Auth Module", "JWT validation")
        Component(widget, "Widget Controller", "Widget endpoints")
        Component(chat, "Chat Controller", "Chat endpoints")
        Component(repo, "Repository Layer", "Data access")
    }

    ContainerDb(db, "Database")
    Container_Ext(openai, "OpenAI API")

    Rel(auth, widget, "Protects")
    Rel(auth, chat, "Protects")
    Rel(widget, repo, "Uses")
    Rel(chat, repo, "Uses")
    Rel(chat, openai, "Calls")
    Rel(repo, db, "Queries")
```

## ASCII Diagram Patterns

### Service Architecture

```
                           ┌─────────────────────────────────────────┐
                           │              LOAD BALANCER              │
                           └──────────────────┬──────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
    │   Instance 1    │             │   Instance 2    │             │   Instance 3    │
    │   (Gateway)     │             │   (Gateway)     │             │   (Gateway)     │
    └────────┬────────┘             └────────┬────────┘             └────────┬────────┘
             │                               │                               │
             └───────────────────────────────┼───────────────────────────────┘
                                             │
                           ┌─────────────────┴─────────────────┐
                           │                                   │
                           ▼                                   ▼
                 ┌─────────────────┐                 ┌─────────────────┐
                 │   PostgreSQL    │                 │     Redis       │
                 │   (Primary)     │                 │   (Cluster)     │
                 └─────────────────┘                 └─────────────────┘
```

### Request Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Client  │───▶│  Widget  │───▶│ Gateway  │───▶│Assistant │───▶│  OpenAI  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │   Load Page   │               │               │               │
     │──────────────▶│               │               │               │
     │               │  WS Connect   │               │               │
     │               │──────────────▶│               │               │
     │               │               │   HTTP POST   │               │
     │               │               │──────────────▶│               │
     │               │               │               │  API Call     │
     │               │               │               │──────────────▶│
     │               │               │               │◀──────────────│
     │               │               │◀──────────────│   SSE Stream  │
     │               │◀──────────────│   WS Frames   │               │
     │◀──────────────│   Display     │               │               │
     │               │               │               │               │
```

### Decision Tree

```
                         ┌─────────────────────┐
                         │  Need Real-time?    │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │ Yes                       No  │
                    ▼                               ▼
          ┌─────────────────┐             ┌─────────────────┐
          │ Browser Support │             │   REST API      │
          │   Required?     │             │   (Polling OK)  │
          └────────┬────────┘             └─────────────────┘
                   │
       ┌───────────┴───────────┐
       │ Modern            All │
       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐
│   WebSocket     │   │      SSE        │
│ (Bidirectional) │   │ (Server Push)   │
└─────────────────┘   └─────────────────┘
```

## Best Practices

### Diagram Maintenance

1. **Keep diagrams close to code** - Store in same repo
2. **Version with architecture** - Update when system changes
3. **Use consistent notation** - Same shapes mean same things
4. **Include timestamps** - Note when last updated

### Readability

1. **Limit nodes** - Max 7-10 per diagram, split if needed
2. **Use consistent direction** - TD for hierarchy, LR for flows
3. **Group related items** - Subgraphs for logical boundaries
4. **Label all connections** - Protocol, format, or action

### Documentation

1. **Add context** - What decision does this support?
2. **Link to ADRs** - Reference architectural decisions
3. **Include legends** - Define abbreviations and symbols
4. **Note assumptions** - What's simplified or omitted?
