# React Hook Form + Zod — Reference

## `useForm` options

```typescript
const form = useForm<T>({
  resolver: zodResolver(schema),      // Zod 4 resolver
  defaultValues: { ... },             // Stable reference prevents reset loop
  mode: "onSubmit",                   // onSubmit | onBlur | onChange | onTouched | all
  reValidateMode: "onChange",         // When to re-validate after first submit
  shouldFocusError: true,             // Focus first error field on submit fail
  resetOptions: {
    keepDirtyValues: false,           // Retain user-edited fields on reset
  },
});
```

**`mode` guidance:**

| Mode | When to use |
|---|---|
| `onSubmit` (default) | Standard forms — validate only on submit |
| `onBlur` | Forms with async validation — avoids requests per keystroke |
| `onChange` | Inline editors, search filters — no expensive validation |
| `onTouched` | Registration flows — validate each field once the user leaves it |

## Zod 4 resolver

Install: `npm install @hookform/resolvers` (ships `zodResolver` in `@hookform/resolvers/zod`).

Zod 4 (`zod@^4.0.0`) changes the import path — use `import { z } from "zod"` (same) but resolver compatibility requires `@hookform/resolvers >= 3.10`. Resolver options:

```typescript
zodResolver(schema, zodResolverOptions, resolverOptions)
// zodResolverOptions: passed to schema.safeParse() — e.g. { errorMap: customErrorMap }
// resolverOptions: { mode: "async" | "sync" } — defaults to async for await support
```

## Schema composition patterns

### Shared base schema

```typescript
// schemas/auth.ts
export const emailField = z.string().min(1, "Required").email("Invalid email");
export const passwordField = z.string().min(6, "At least 6 characters");

export const loginSchema = z.object({ email: emailField, password: passwordField });
export const registerSchema = z.object({
  fullName: z.string().min(1, "Required"),
  email: emailField,
  password: passwordField,
  confirmPassword: passwordField,
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
```

Exporting field-level validators lets server-side code (NestJS DTOs with `zod-class` or a Hono validator) import the same constraints — one source of truth.

### Optional multi-step schema

For multi-step forms where each step has different required fields, define one schema per step and combine for final validation:

```typescript
const step1Schema = z.object({ name: z.string().min(1) });
const step2Schema = z.object({ website: z.string().url().optional() });
const fullSchema = step1Schema.merge(step2Schema);
```

## Async `validate` with RHF

```typescript
const { register } = useForm<{ email: string }>({
  resolver: zodResolver(schema),
  mode: "onBlur",
});

// Supplement resolver with per-field async validate:
<input
  {...register("email", {
    validate: async (value) => {
      const taken = await authService.checkEmailExists(value);
      return taken ? "Email already registered" : true;
    },
  })}
/>
```

The field-level `validate` runs after the resolver, so Zod format checks pass first before the network call fires.

## `setError` patterns

```typescript
// Target a field
setError("email", { type: "server", message: "Email already in use" });

// Non-field (root) error — display in form banner
setError("root.serverError", { type: "server", message: "Something went wrong" });

// Clear after user edits
clearErrors("email");
```

`errors.root?.message` and `errors.root?.serverError?.message` both resolve from the form state — use whichever key you set.

## Controller pattern (custom inputs)

```typescript
import { Controller } from "react-hook-form";

<Controller
  name="categorySlug"
  control={control}
  render={({ field, fieldState }) => (
    <CustomSelect
      value={field.value}
      onChange={field.onChange}
      error={fieldState.error?.message}
    />
  )}
/>
```

`field.onChange` propagates the value to RHF. `field.onBlur` triggers validation when `mode: "onBlur"`. Both are passed from `render` — no manual wiring.

## FormState subscriptions (performance)

`formState` values are computed on access. Destructure only what's needed:

```typescript
const { errors, isDirty, isSubmitting } = formState;
```

Accessing `formState.errors` subscribes the component to error changes. Accessing `formState.isValid` additionally subscribes to every validation pass — avoid `isValid` with `mode: "onChange"` on large forms.

## Reset and dirty state

```typescript
reset();                          // Reset to defaultValues
reset(newValues);                 // Reset to new values
reset(undefined, { keepValues: true, keepErrors: false }); // Clear errors only
```

`isDirty` is true if the current values differ from `defaultValues`. Updating `defaultValues` via reset after a successful save keeps `isDirty` accurate for unsaved-changes guards.

## TypeScript discriminated union for API errors (reference)

The project's `useAuth` hooks type their mutations against `AxiosError<ApiErrorResponse>`:

```typescript
export interface ApiErrorResponse {
  message: string;
  statusCode: number;
}

useMutation<ResponseType, AxiosError<ApiErrorResponse>, RequestType>({
  mutationFn: ...,
  onError: (error) => {
    // error.response?.data is typed as ApiErrorResponse
    setError("root", { message: error.response?.data?.message ?? error.message });
  },
})
```

Typing the error generic surfaces `error.response?.data.message` without a cast.
