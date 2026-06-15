---
name: react-hook-form-zod-nextjs
description: React Hook Form v7 + Zod 4 validation patterns for Next.js App Router. Use when building forms with schema-driven types, async field validation, API error mapping to form fields, or integrating useMutation with form submit. Call for schema-first type inference, setError patterns, register vs Controller decisions, or shared client/server validation schemas.
updated: 2026-05-07
---

# React Hook Form + Zod — Next.js App Router

Schema-first form patterns combining react-hook-form v7, @hookform/resolvers/zod, and Zod 4 in a Next.js 16 App Router project. These forms live in Client Components — App Router enforces the boundary.

## When to use this skill

- Setting up a typed form where the schema is the single source of truth for both TypeScript types and runtime validation
- Adding async validation (e.g. checking email uniqueness against an API)
- Mapping API error responses back to specific form fields via `setError`
- Integrating `useMutation` (TanStack Query) with form submit
- Deciding between `register` and `Controller` for a given input

See **reference.md** for `useForm` options and Zod 4 resolver details. See **examples.md** for annotated LoginForm, RegisterForm, and multi-step application form patterns.

## Schema-first form types

`z.infer<typeof schema>` is the sole source of the form's TypeScript type — no separate interface needed. The resolver wires the schema to RHF at construction time.

```typescript
const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: "", password: "" },
});
```

Cross-field validation (e.g. password confirmation) uses `.refine()` on the schema object — no separate validation logic in the component.

## `register` vs `Controller`

| Use `register` | Use `Controller` |
|---|---|
| Native `<input>`, `<textarea>`, `<select>` | Custom components that don't forward `ref` |
| Component accepts `ref` via `forwardRef` | Third-party UI components (date pickers, select libraries) |
| Simple text/password/email fields | Checkbox groups, toggle switches managed as state |

Mixing controlled (`useState`) and uncontrolled (`register`) inputs on the same field causes stale validation state and duplicate errors.

## API error → field mapping

When an API call fails, surface the error to the relevant field rather than a generic banner. The mutation's `onError` callback inspects the response, then calls `setError(fieldName, { type: "server", message })` for field-specific failures or `setError("root", ...)` for non-field errors. The form renders `errors.root?.message` as a banner without inventing a separate error state. See **examples.md** for the `setError` field-mapping recipe with status-code dispatch.

## Submit + mutation wiring

`handleSubmit(onSubmit)` gates execution behind schema validation, so the `onSubmit` body only runs with type-safe `data`. Inside it, call `mutation.mutate(data)` directly. `mutation.isPending` is the canonical flag for disabling the submit button during the request — no separate `isSubmitting` state is needed. See **examples.md** for the full LoginForm implementation.

## Async field validation

For fields that need a server round-trip (e.g. email uniqueness), use the Zod `superRefine` async path or an RHF `validate` function in the field options. Run these only on `onBlur` to avoid a request on every keystroke — set `mode: "onBlur"` in `useForm`.

## Anti-pattern quick table

| Symptom | Root cause | Consequence |
|---|---|---|
| Every keystroke triggers a network request for uniqueness check | `mode: "onChange"` with async `validate` | Rate-limit hits, UI jank |
| Client schema and server schema differ | Duplicated validation without shared Zod schema | Valid client data rejected server-side |
| `useState` used for field value + `register` on same input | Mixed controlled/uncontrolled | Stale or duplicate errors |
| API error swallowed, no `setError` call | Error caught but not propagated to form | User sees no feedback |
| Schema defined inside the component | Re-created on every render | Performance cost; can't share across files |

Schemas at module scope (outside the component) are created once and importable across modules — a client form and a server-side validator can share identical constraints. Schemas defined inside a component re-create on every render and are not importable from other files.
