# MVP & Roadmap Examples

Concrete examples of MVP scoping and roadmap planning.

## Example 1: API Service MVP

### Context

Building a document processing API that extracts structured data from PDFs.

### MoSCoW Analysis

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **Must** | PDF upload endpoint | Core input mechanism |
| **Must** | Text extraction | Minimum useful output |
| **Must** | JSON response format | API contract |
| **Must** | Basic error handling | Production-ready |
| **Should** | Table extraction | High-value enhancement |
| **Should** | Rate limiting | Operational safety |
| **Could** | Image extraction | Nice to have |
| **Could** | Batch processing | Efficiency feature |
| **Won't** | OCR for scanned docs | Different technology stack |
| **Won't** | Real-time streaming | Complexity not justified yet |

### PROJECT_PLAN.md

```markdown
# Project Plan: Document Processing API

**Generated**: 2024-01-15
**Based on**: document-api-synthesis.md

## MVP Definition

### Must Have
- POST /documents endpoint accepts PDF upload
- Extract text content from PDF pages
- Return JSON with page-by-page text
- Error responses for invalid files, size limits
- Health check endpoint
- Basic logging and monitoring

### Should Have (Phase 2)
- Table detection and extraction
- Rate limiting per API key
- Async processing for large files

### Could Have (Phase 3)
- Image extraction with metadata
- Batch upload endpoint
- Webhook notifications

### Won't Have (Future)
- OCR for scanned documents
- Real-time streaming results
- Custom extraction templates

## Implementation Roadmap

### Phase 1: MVP Foundation
**Timeline**: 2 weeks
**Success Criteria**:
- Process 10-page PDF in < 5 seconds
- 99% uptime over 1 week
- 3 beta customers onboarded

Deliverables:
- [ ] FastAPI application structure
- [ ] PDF upload and validation
- [ ] PyMuPDF text extraction
- [ ] JSON response formatting
- [ ] Error handling middleware
- [ ] Docker deployment
- [ ] Basic monitoring (health, latency)

### Phase 2: Core Enhancement
**Timeline**: 2 weeks
**Prerequisites**: MVP deployed, beta feedback collected
**Success Criteria**:
- Table extraction accuracy > 90%
- Handle 100 requests/minute

Deliverables:
- [ ] Table detection algorithm
- [ ] Structured table output
- [ ] Redis-based rate limiting
- [ ] Async job queue for large files
- [ ] Enhanced monitoring (queue depth, extraction metrics)

### Phase 3: Production Hardening
**Timeline**: 2 weeks
**Prerequisites**: Phase 2 complete, 10+ active customers
**Success Criteria**:
- < 1% error rate
- Customer satisfaction survey > 4/5

Deliverables:
- [ ] Image extraction
- [ ] Batch processing endpoint
- [ ] Webhook integration
- [ ] Performance optimization
- [ ] Documentation site
```

---

## Example 2: Data Pipeline MVP

### Context

Building an ETL pipeline for customer analytics data.

### MoSCoW Analysis

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **Must** | Daily CSV ingestion | Core data input |
| **Must** | Data validation | Quality gate |
| **Must** | PostgreSQL load | Destination storage |
| **Must** | Failure alerting | Operational awareness |
| **Should** | Incremental updates | Efficiency |
| **Should** | Data quality reports | Visibility |
| **Could** | Real-time ingestion | Lower latency |
| **Could** | Multiple data sources | Flexibility |
| **Won't** | ML feature generation | Different project |

### PROJECT_PLAN.md

```markdown
# Project Plan: Customer Analytics Pipeline

**Generated**: 2024-01-15
**Based on**: analytics-pipeline-synthesis.md

## MVP Definition

### Must Have
- Scheduled daily CSV file pickup from S3
- Schema validation with clear error messages
- Idempotent PostgreSQL upserts
- Slack alerts on pipeline failure
- Basic run logging

### Should Have (Phase 2)
- Incremental processing (only new/changed records)
- Data quality dashboard
- Retry logic with backoff

### Could Have (Phase 3)
- Real-time event ingestion
- Additional source connectors
- Data lineage tracking

## Implementation Roadmap

### Phase 1: MVP Foundation
**Timeline**: 1 week
**Success Criteria**:
- Successfully process 1M row file
- < 5 minute total runtime
- Zero data loss over 2 weeks

Deliverables:
- [ ] Prefect flow definition
- [ ] S3 file discovery task
- [ ] Polars CSV parsing
- [ ] Schema validation with Pandera
- [ ] PostgreSQL bulk upsert
- [ ] Slack notification on failure

### Phase 2: Efficiency & Visibility
**Timeline**: 1 week
**Prerequisites**: MVP running daily for 1 week
**Success Criteria**:
- 50% reduction in processing time
- Data quality issues visible within 1 hour

Deliverables:
- [ ] Change detection (hash-based)
- [ ] Incremental processing
- [ ] Data quality checks (nulls, ranges, uniqueness)
- [ ] Quality metrics to monitoring
- [ ] Retry decorator with exponential backoff

### Phase 3: Scale & Flexibility
**Timeline**: 2 weeks
**Prerequisites**: Phase 2 stable
**Success Criteria**:
- Support 3 additional data sources
- < 1 minute latency for real-time

Deliverables:
- [ ] Kafka consumer for real-time events
- [ ] Source connector abstraction
- [ ] Data lineage metadata
- [ ] Multi-source orchestration
```

---

## Example 3: AI/ML System MVP

### Context

Building a RAG-based question-answering system over company documentation.

### MoSCoW Analysis

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **Must** | Document ingestion | Data input |
| **Must** | Vector embedding | Core RAG component |
| **Must** | Semantic search | Retrieval |
| **Must** | LLM answer generation | Response generation |
| **Should** | Source citation | Trust & verification |
| **Should** | Conversation history | Context continuity |
| **Could** | Multi-modal (images) | Enhanced coverage |
| **Could** | Fine-tuned embeddings | Better accuracy |
| **Won't** | Real-time document sync | Complexity |
| **Won't** | Multi-tenant isolation | Future need |

### PROJECT_PLAN.md

```markdown
# Project Plan: Documentation Q&A System

**Generated**: 2024-01-15
**Based on**: rag-qa-synthesis.md

## MVP Definition

### Must Have
- Markdown/PDF document upload
- OpenAI text-embedding-3-small vectors
- Qdrant vector storage
- Semantic search (top-5 retrieval)
- Claude answer generation with context
- Simple chat UI

### Should Have (Phase 2)
- Source citations in answers
- Conversation memory (last 5 turns)
- Relevance feedback collection

### Could Have (Phase 3)
- Image understanding in documents
- Custom embedding fine-tuning
- Answer confidence scoring

## Implementation Roadmap

### Phase 1: MVP Foundation
**Timeline**: 2 weeks
**Success Criteria**:
- Answer accuracy > 70% on test set
- < 3 second response time
- 5 internal users onboarded

Deliverables:
- [ ] LlamaIndex document pipeline
- [ ] Chunking strategy (512 tokens, 50 overlap)
- [ ] Qdrant collection setup
- [ ] Retrieval + generation chain
- [ ] Streamlit chat interface
- [ ] Evaluation dataset (50 Q&A pairs)

### Phase 2: Trust & Context
**Timeline**: 2 weeks
**Prerequisites**: MVP deployed, user feedback collected
**Success Criteria**:
- Users rate citations as helpful > 80%
- Conversation context improves answers

Deliverables:
- [ ] Source attribution in responses
- [ ] Clickable citations to source docs
- [ ] Conversation buffer memory
- [ ] Feedback thumbs up/down
- [ ] Feedback analytics dashboard

### Phase 3: Enhanced Accuracy
**Timeline**: 3 weeks
**Prerequisites**: 100+ feedback samples collected
**Success Criteria**:
- Answer accuracy > 85%
- Handle image-based questions

Deliverables:
- [ ] Multi-modal document processing
- [ ] Embedding fine-tuning pipeline
- [ ] Confidence score display
- [ ] Hybrid search (dense + sparse)
- [ ] A/B testing framework
```

---

## PROJECT_PLAN.md Template

```markdown
# Project Plan: [Project Name]

**Generated**: [YYYY-MM-DD]
**Based on**: [research-synthesis-filename.md]

## MVP Definition

### Must Have
- [Feature 1]: [One sentence description]
- [Feature 2]: [One sentence description]
- [Feature 3]: [One sentence description]

### Should Have (Phase 2)
- [Feature]: [Description]
- [Feature]: [Description]

### Could Have (Phase 3)
- [Feature]: [Description]

### Won't Have (This Version)
- [Feature]: [Why excluded]

## Implementation Roadmap

### Phase 1: MVP Foundation
**Timeline**: [X weeks]
**Success Criteria**:
- [Measurable outcome 1]
- [Measurable outcome 2]

Deliverables:
- [ ] [Deliverable 1]
- [ ] [Deliverable 2]
- [ ] [Deliverable 3]

### Phase 2: [Phase Name]
**Timeline**: [X weeks]
**Prerequisites**: [What must be done first]
**Success Criteria**:
- [Measurable outcome]

Deliverables:
- [ ] [Deliverable]

### Phase 3: [Phase Name]
**Timeline**: [X weeks]
**Prerequisites**: [What must be done first]
**Success Criteria**:
- [Measurable outcome]

Deliverables:
- [ ] [Deliverable]

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | [H/M/L] | [H/M/L] | [Action] |

## Dependencies

| Dependency | Owner | Status | Needed By |
|------------|-------|--------|-----------|
| [Dependency] | [Team/Person] | [Status] | [Phase] |
```
