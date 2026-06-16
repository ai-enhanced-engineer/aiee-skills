<h1 align="center">The AI Enhanced Engineer's Team</h1>

<p align="center">
  <img src="assets/images/cover.jpeg" alt="AIEE Team - Domain specialists for production workflows" width="450" />
</p>

<p align="center">
  <a href="https://github.com/ai-enhanced-engineer/aiee-team/releases"><img src="https://img.shields.io/github/v/release/ai-enhanced-engineer/aiee-team" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/ai-enhanced-engineer/aiee-team/actions"><img src="https://img.shields.io/github/actions/workflow/status/ai-enhanced-engineer/aiee-team/release.yml?branch=main" alt="Build Status" /></a>
</p>

<p align="center">
  🌐 <a href="https://aiee.io">Website</a> | 📧 <a href="https://aienhancedengineer.substack.com/">Subscribe</a>
</p>

Multi-agent orchestration with domain specialists for production software development workflows.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [🚀 Quick Start](#-quick-start)
- [🎯 Commands](#-commands)
- [👥 Team Members](#-team-members)
- [🛠️ Skills](#%EF%B8%8F-skills)
- [📂 Directory Structure](#-directory-structure)
- [🤝 Contributing](#-contributing)
- [📜 License](#-license)

---

## Why This Exists

You ask Claude to build an API. It writes 500 lines of FastAPI in 30 seconds. No tests. No migration rollback. No SQL injection protection.

The problem isn't that Claude can't code. It's that production software requires **domain expertise**:

- A backend engineer knows to add database indexes for common queries
- A security engineer validates JWT signatures before protected routes
- A DevOps engineer versions Terraform state and locks deployments

This plugin gives you specialist agents with that knowledge built in.

**What you get:**

- **Domain specialists** - Backend engineer designs your schema. Security engineer audits for vulnerabilities.
- **Encoded patterns** - "Always use RLS for multi-tenant databases", "Test error codes, not just happy paths"
- **Orchestrated workflows** - Architecture review before implementation. Security audit before deployment.

---

## 🚀 Quick Start

### Via Plugin Marketplace (Recommended)

1. Add the AIEE Team marketplace to Claude Code:
   ```shell
   /plugin marketplace add ai-enhanced-engineer/aiee-team
   ```

2. Install the plugin:
   ```shell
   /plugin install aiee-team@aiee-team
   ```

3. Verify installation:
   ```shell
   /agents
   ```
   You should see AIEE agents listed.

### Via Local Development

For contributors or local testing:

1. Clone the repository:
   ```bash
   git clone https://github.com/ai-enhanced-engineer/aiee-team.git ~/projects/aiee-team
   ```

2. Start Claude Code with the plugin loaded:
   ```bash
   claude --plugin-dir ~/projects/aiee-team
   ```

### Usage

Claude automatically delegates to specialist agents based on task context. You can also explicitly request an agent:

```
Use the aiee-backend-engineer agent to design the API for user authentication
```

View all available agents with `/agents`.

---

## 🧪 Development & Testing

### Testing Locally

To test the plugin during development:

1. **Load the plugin from your local directory:**
   ```bash
   cd /path/to/aiee-team
   claude --plugin-dir ./
   ```

2. **Verify plugin loaded:**
   ```bash
   /plugins
   # Should show: aiee-team (local)
   ```

3. **Test commands are available:**
   ```bash
   /commands
   # Should show: aiee-backend, aiee-frontend
   ```

4. **Test a command:**
   ```bash
   /aiee-backend fix: Test command loading
   ```

5. **Verify agents are accessible:**
   ```bash
   /agents
   # Should list: aiee-backend-engineer, aiee-frontend-engineer, etc.
   ```

### Before Committing

Always run validation checks:

```bash
# Validate JSON files
cat .claude-plugin/plugin.json | jq empty
cat .claude-plugin/marketplace.json | jq empty

# Check for required files
test -f .claude-plugin/plugin.json && echo "✅ Manifest exists"
test -f .claude-plugin/marketplace.json && echo "✅ Marketplace config exists"
test -f commands/aiee-backend.md && echo "✅ Backend command exists"
test -f commands/aiee-frontend.md && echo "✅ Frontend command exists"

# Verify agent references use aiee-* prefix
grep -r "@agent-" commands/ | grep -v "aiee-" | grep -v "test-enforcement-reviewer" | grep -v "python-code-quality-auditor" && echo "⚠️ Non-aiee agents found" || echo "✅ Agent references correct"
```

### Plugin Installation Scopes

When installing the plugin, choose the appropriate scope:

| Scope | Use Case | Location | Sharing |
|-------|----------|----------|---------|
| `--scope project` | **Team development** (recommended) | Committed to git | Everyone on team uses same version |
| `--scope user` | Personal use across projects | `~/.claude/plugins/` | Only you |
| `--scope local` | Project-specific testing | `.claude/` (gitignored) | Development only |

**Recommended for teams:** `--scope project`

```bash
# Install for team
/plugin install aiee-team@aiee-team --scope project
```

---

## 🎯 Commands

| Command | Purpose |
|---------|---------|
| `aiee-backend` | Backend implementation with 2-phase gated review (quality + security → tests) |
| `aiee-frontend` | Frontend implementation with 2-phase gated review (architecture + security → tests) |

### Backend Development Workflow

The `/aiee-backend` command orchestrates a quality-gated implementation cycle:

```bash
# Bug fix
/aiee-backend fix: Resolve N+1 query in user profile endpoint

# New feature
/aiee-backend feat: Add pagination to user list API

# Refactoring
/aiee-backend refactor: Extract email validation to service layer
```

**Workflow phases**:
1. Implementation by `aiee-backend-engineer`
2. Parallel reviews (code quality, Python patterns, security)
3. Test enforcement gate (80% coverage, proper naming)
4. Consolidation and iteration (max 3 cycles)

See `commands/aiee-backend.md` for detailed workflow documentation.

### Frontend Development Workflow

The `/aiee-frontend` command orchestrates a quality-gated implementation cycle for Angular 21+ projects:

```bash
# Bug fix
/aiee-frontend fix: Resolve accessibility issue in navigation menu

# New feature
/aiee-frontend feat: Add dark mode toggle component

# Refactoring
/aiee-frontend refactor: Extract form validation to composable
```

**Workflow phases**:
1. Implementation by `aiee-frontend-engineer`
2. Parallel reviews (frontend architecture + accessibility, security)
3. Test enforcement gate (80% coverage, E2E tests)
4. Consolidation and iteration (max 3 cycles)

See `commands/aiee-frontend.md` for detailed workflow documentation.

---

## 👥 Team Members

| Agent | Role |
|-------|------|
| `aiee-backend-engineer` | Python, PHP/Laravel, and TypeScript/NestJS backend engineer for API design, database modeling, and system integration |
| `aiee-data-engineer` | Data engineer specializing in PostgreSQL/MySQL schema design, migration management, RLS security, and query optimization |
| `aiee-devops-engineer` | DevOps engineer for CI/CD pipelines, Infrastructure as Code, deployment automation, and container orchestration |
| `aiee-frontend-engineer` | Svelte 5, SvelteKit, Angular 21+, and React web engineer for modern frontend development |
| `aiee-ios-engineer` | Native iOS + watchOS engineer specializing in Swift 6, SwiftUI, HealthKit, Apple Foundation Models, and on-device AI |
| `aiee-mobile-engineer` | React Native + Expo mobile engineer specializing in iOS/Android app development |
| `aiee-observability-engineer` | Observability specialist for monitoring, alerting, logging, and distributed tracing |
| `aiee-python-expert-engineer` | Modern Python expert for architecture decisions, async patterns, performance optimization, and code review |
| `aiee-security-engineer` | Security specialist for threat modeling, penetration testing, and compliance (SOC 2, GDPR, OWASP) |
| `aiee-sre-engineer` | Site Reliability Engineer for operational readiness, runbooks, disaster recovery, incident response, and on-call procedures |
| `aiee-systems-architect` | Full-stack systems architect for architecture reviews, service design, API contracts, legacy assessments, and client deliverables |

---

## 🛠️ Skills

This plugin includes **102 skills** that provide domain knowledge to agents:

| Skill | Purpose |
|-------|---------|
| `ai-video-understanding` | Multimodal AI patterns for extracting structured information from video using Gemini, GPT-4o, and Clau... |
| `apple-foundation-models` | Apple Foundation Models framework for on-device AI. LanguageModelSession, @Generable macro, structured... |
| `arch-ddd` | Tactical DDD patterns for clean Python architecture including Domain Model, Repository, Service Layer,... |
| `arch-decision-records` | Architecture Decision Records (ADRs) for documenting significant technical decisions |
| `arch-diagrams` | Architecture visualization patterns using Mermaid and ASCII diagrams |
| `arch-events` | Event-driven architecture patterns for Python including Domain Events, Commands, Message Bus, CQRS, an... |
| `arch-mvp-roadmap` | MVP definition, MoSCoW prioritization, and phased delivery planning |
| `arch-python-modern` | Modern Python 3.10+ development standards including type hints, async patterns, pathlib, dataclasses,... |
| `aws-app-runner` | AWS App Runner and ECS Express Mode deployment patterns for stateless Python services |
| `aws-cicd-patterns` | CI/CD patterns for AWS using GitHub Actions, ECR, and App Runner/ECS Express Mode |
| `aws-security-hardening` | AWS security hardening patterns including IAM least privilege, GitHub OIDC federation, Secrets Manager... |
| `azure-functions-python-v2` | Azure Functions Python v2 programming model patterns for Service Bus-triggered services. Covers functi... |
| `azure-identity-m2m-auth` | Azure AD machine-to-machine authentication for Python services using azure-identity (DefaultAzureCrede... |
| `azure-service-bus-messaging` | Azure Service Bus async producer/consumer patterns with azure-servicebus 7.x — singleton credential, A... |
| `azure-workflow-execution-models` | Time-bound reference for comparing Camunda, Azure Functions, Dapr, and KEDA as workflow execution mode... |
| `caddy-tls-proxy` | Caddy as a zero-config TLS reverse proxy for single-service EC2 deployments. Auto-provisioned Let's En... |
| `compliance-frameworks` | Security and privacy compliance patterns for B2B SaaS |
| `design-system-workflow` | Human-in-loop design system workflow using AI generation (Gemini) for brand identity exploration, dual... |
| `dev-debugging-strategies` | Systematic production debugging patterns including hypothesis-driven investigation, temporal regressio... |
| `dev-standards` | Development standards for Python projects including code style, git conventions, testing patterns, tim... |
| `docker-python-poetry` | Multi-stage Docker builds for Poetry-based Python services. Specializes the Poetry export pattern, pro... |
| `docker-python` | Docker patterns for Python 3.12+ applications. Debian Trixie breaking changes, OpenCV dependencies, se... |
| `fastapi-patterns` | Modern FastAPI 0.111+ production patterns for Python services — async lifespan, Pydantic v2 schemas, d... |
| `ffmpeg-laravel-video` | FFmpeg integration with Laravel for video processing. Thumbnail generation, format conversion, video m... |
| `formik-yup-react-native` | Formik + Yup for React Native. TextInput integration, mobile validation UX, error timing |
| `frontend-accessibility` | Web accessibility patterns for WCAG 2.1 AA compliance including ARIA, keyboard navigation, screen read... |
| `frontend-angular-ai` | AI integration patterns for Angular applications using Genkit, Firebase AI Logic, or Gemini API. Inclu... |
| `frontend-angular-tooling` | Angular CLI and MCP server integration for AI-assisted development. Includes Web Codegen Scorer for co... |
| `frontend-angular` | Modern Angular 21+ patterns including signals, standalone components, zoneless change detection, and n... |
| `frontend-design-systems` | Integrating design systems (Material Design, Carbon, etc.) into existing sites while preserving brand... |
| `frontend-material-chat` | Material Design 3 patterns for chat widget components |
| `frontend-material-design-3` | Material Design 3 (Material You) patterns for dashboards and web apps |
| `frontend-svelte` | Svelte 5 and SvelteKit production patterns — runes-based reactivity, stores, Web Components, Shadow DO... |
| `gcp-cicd-patterns` | Cloud-native CI/CD patterns for GCP using Cloud Build, Cloud Deploy, and GitOps |
| `gcp-cloud-run` | Cloud Run deployment patterns for stateless, scalable Python services |
| `gcp-cloudsql-infrastructure` | Cloud SQL PostgreSQL infrastructure provisioning and operations. Machine type selection, storage sizin... |
| `gcp-finops` | GCP cost engineering and financial operations. Analyze billing, optimize resources, manage budgets, re... |
| `gcp-observability` | Cloud-native observability patterns for GCP using Cloud Monitoring, Cloud Logging, and SLO-based alerting |
| `gcp-security-hardening` | GCP security hardening patterns including IAM best practices, Workload Identity Federation (WIF), zero... |
| `github-actions-cicd` | GitHub Actions CI/CD patterns for Python services — Poetry caching, SonarQube scanner, semantic versio... |
| `healthkit-biofeedback` | HealthKit integration for real-time biofeedback apps. Workout sessions, heart rate streaming, HRV quer... |
| `infra-terraform` | Modern Terraform patterns for module design, state management, and CI/CD integration |
| `ios-app-quality` | iOS app quality patterns: privacy-first data architecture, XCTest/Swift Testing, HealthKit mocking, In... |
| `ios-audio-haptics` | AVFoundation audio and Core Haptics for guided breathing apps. Audio sessions, mixing, interruption ha... |
| `jest-nestjs-testing` | Unit and e2e testing for NestJS with Jest, Test.createTestingModule, supertest, and TypeORM. Covers re... |
| `langchain-azure-openai-patterns` | Azure OpenAI + LangChain production patterns. AzureChatOpenAI config with token-provider auth, with_st... |
| `laravel-auth-hardening` | Laravel authentication hardening patterns — anti-enumeration on auth-adjacent endpoints, role allowlis... |
| `laravel-ci-mysql` | Laravel CI patterns for GitHub Actions with MySQL service containers — env injection without .env boot... |
| `laravel-mix-webpack` | Laravel Mix (Webpack wrapper) configuration for React SPAs. Babel setup, SASS compilation, asset versi... |
| `laravel-modern-patterns` | Laravel 8+ architecture patterns including Repository + Action pattern, Sanctum API authentication, El... |
| `laravel-pint-patterns` | Laravel Pint code style patterns — autofix vs check-only modes, php_unit_method_casing rule behavior,... |
| `laravel-s3-storage` | Laravel Flysystem S3 integration for file uploads. Storage facade usage, disk configuration, public/pr... |
| `laravel-sail-docker` | Laravel Docker development and production environment. Sail for local dev (MySQL, Redis, Mailhog), pro... |
| `mobile-app-deployment` | Mobile app deployment patterns for iOS App Store and Google Play Store including EAS Submit, signing c... |
| `mobile-e2e-testing` | Mobile E2E testing patterns with Maestro (YAML-based, recommended) and Detox for React Native. Device... |
| `mobile-offline-sync` | Offline-first patterns for React Native including local databases (WatermelonDB, expo-sqlite, MMKV), b... |
| `mobile-push-notifications` | Push notification patterns for React Native using expo-notifications and Firebase Cloud Messaging v1.... |
| `mobile-video-upload` | Mobile video upload patterns for React Native and native iOS/Android including chunked resumable uploa... |
| `mongodb-asyncmongoclient-patterns` | PyMongo 4.13+ AsyncMongoClient patterns (the official Motor replacement; Motor deprecated 2026-05-14)... |
| `mongodb-atlas-patterns` | MongoDB Atlas + PyMongo 4.8 production patterns — connection pooling, Atlas Search index design (text/... |
| `nestjs-patterns` | NestJS 11 production patterns for module organization, dependency injection scopes, DTO validation pip... |
| `nextjs-16-app-router` | Build Next.js 16 App Router projects with React 19, Turbopack-default builds, static export for hybrid... |
| `nextjs-pwa-offline` | next-pwa configuration for Next.js 16 App Router with static export and Capacitor hybrid shells. Cover... |
| `passport-jwt-nestjs` | JWT authentication in NestJS with @nestjs/passport, passport-jwt, and bcrypt. Covers JwtStrategy, toke... |
| `performance-engineering` | Profiling, load testing, and optimization patterns for Python web services |
| `poetry-python-monorepo` | Poetry 1.8+ multi-package monorepo patterns — `package-mode = false` orchestrator root, path dependenc... |
| `product-sprint-planning` | Sprint planning patterns including effort estimation, cross-project validation, ticket refinement work... |
| `psycopg3-async-patterns` | psycopg 3 async + psycopg_pool.AsyncConnectionPool patterns for Azure Postgres flexible-server. Covers... |
| `pyjwt-fastapi-validation` | Server-side JWT validation in FastAPI for Azure AD–issued M2M tokens. PyJWT 2.x decode pipeline, PyJWK... |
| `pytest-fastapi-async` | pytest-asyncio + httpx AsyncClient patterns for testing async FastAPI services. Covers asyncio_mode/lo... |
| `qa-angular` | Angular 21+ QA validation patterns for code review, accessibility audits, visual regression, and AI-ge... |
| `react-hook-form-zod-nextjs` | React Hook Form v7 + Zod 4 validation patterns for Next.js App Router |
| `react-i18n-context-patterns` | React Context-based internationalization (i18n) patterns for multi-language applications with translat... |
| `react-native-camera-video` | Camera and video capture for React Native using react-native-vision-camera v4+. Frame processors, vide... |
| `react-native-container-component` | React Native Container/Component pattern with Redux. Containers connect to Redux, Components are prese... |
| `react-native-expo-patterns` | React Native 0.64 + Expo 44 managed workflow patterns. Expo modules (Camera, FileSystem, Sharing), app... |
| `react-native-legacy-builds` | Patterns for building EOL React Native (0.64) + Expo SDK 44 apps on modern toolchains (Xcode 14+, Appl... |
| `react-native-ml-inference` | TensorFlow.js on-device inference patterns for React Native. Teachable Machine model preprocessing, te... |
| `react-native-modern-patterns` | Modern React Native 0.76+ patterns with New Architecture, Expo SDK 53+, TypeScript, Zustand, MMKV, and... |
| `react-query-patterns` | TanStack Query v5 data fetching patterns for React 18 including caching, mutations, invalidation, and... |
| `react-redux-spa-patterns` | React 17 + Redux + React Router v6 patterns for Laravel SPAs. Redux Thunk async actions, redux-persist... |
| `react-streaming-sse-patterns` | Server-Sent Events (SSE) streaming patterns for React 18 including fetch ReadableStream, chunk parsing... |
| `react-vite-modern-patterns` | Modern React 18 application patterns with Vite 5 build tool, custom hooks, and component architecture |
| `react-zustand-patterns` | Zustand 5.x state management patterns for React 18 including store slices, middleware, async actions,... |
| `redis-async-caching-python` | redis-py async caching patterns for Azure Cache for Redis with Entra ID (AAD) auth. Covers BlockingCon... |
| `redux-duck-flow-pattern` | Redux Duck pattern with Flow type annotations. Actions, reducers, selectors, types, api, mappers in sa... |
| `redux-persist-asyncstorage` | Redux persistence for React Native using redux-persist + AsyncStorage. PersistGate rehydration, select... |
| `ruff-python-quality` | Ruff 0.6+ linter and formatter patterns for Python projects — comprehensive rule selection (40 categor... |
| `static-site-deployment` | Static site deployment patterns for SiteGround shared hosting via GitHub Actions — SSH key setup, Acti... |
| `stripe-elements-react` | Stripe Elements integration patterns for React 19 + Next.js static export — loadStripe module scope, c... |
| `stripe-webhook-laravel` | Stripe webhook handling patterns for Laravel — atomic idempotency via DB::transaction and UNIQUE const... |
| `swift-app-structure` | iOS/watchOS app structure: NavigationStack coordinators, dependency injection, SPM modularization, and... |
| `swift-patterns-architecture` | Swift 6 runtime architecture: strict concurrency, actor isolation, @Observable migration, SwiftData vs... |
| `swift-swiftui` | Swift 6+ and SwiftUI patterns for iOS/watchOS apps. MVVM architecture, animations, state management, a... |
| `tailwindcss-4-patterns` | Tailwind CSS v4 patterns with Oxide engine, CSS-first config via @theme and @import, @tailwindcss/post... |
| `testing-angular` | Angular 21+ testing patterns with Vitest, signal component testing, and Playwright E2E |
| `typeorm-patterns` | TypeORM 0.3 patterns with PostgreSQL — entity modeling, relations and N+1 prevention, DataSource vs Re... |
| `unit-test-standards` | Unit test standards across Python (pytest), PHP/Laravel (PHPUnit + Pint), TypeScript/React (Vitest), a... |
| `video-preprocessing-python` | Python video preprocessing for AI pipelines using ffmpeg-python and faster-whisper, including frame ex... |
| `vite-pwa-patterns` | Vite PWA plugin configuration for offline-capable React apps with service workers, caching strategies,... |
| `watchos-development` | watchOS app architecture, WatchConnectivity, battery optimization, and watch-specific SwiftUI patterns... |
| `web-open-redirect-guards` | Open-redirect guard patterns for ?next=, ?return_to=, and ?redirect= URL parameters — protocol-relativ... |

---

## 📂 Directory Structure

```
aiee-team/
├── .claude-plugin/
│   ├── plugin.json       # Plugin metadata
│   └── marketplace.json  # Marketplace distribution
├── agents/               # Agent definitions
├── assets/
│   └── images/           # Cover image and visuals
├── commands/             # Team-specific slash commands
├── skills/               # Team-specific skills
├── workflows/            # Team-specific workflows
├── scripts/
│   └── setup.sh          # Local development helper
└── README.md
```

---

## 🤝 Contributing

We welcome contributions that improve the team's capabilities.

| I want to... | Guide |
|--------------|-------|
| Add or modify an **agent** | See [`agents/README.md`](agents/README.md) |
| Add or modify a **skill** | See [`skills/README.md`](skills/README.md) |

After changes, update the tables in this README to keep the overview current.

---

## 📜 License

MIT - See [LICENSE](LICENSE) file for details.

---

🚀 **Ready to supercharge your development workflow?** Clone the plugin and start delegating to specialist agents today.

*Domain expertise on demand. For developers building real systems.*

📬 [Subscribe](https://aienhancedengineer.substack.com/) for practical guides on AI-enhanced engineering.
