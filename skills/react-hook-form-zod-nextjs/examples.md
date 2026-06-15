# React Hook Form + Zod — Examples

> **Project-specific examples.** Drawn from an example frontend project (auth and member application flows). File paths reflect that project's structure; adapt them to your project layout. The patterns themselves are framework-generic.

## Login form (register pattern)

`src/components/auth/LoginForm.tsx` — the canonical simple form: module-scope schema, `z.infer` type, `useForm` with zodResolver, `register` spread on native inputs, mutation error surfaced as banner.

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";

// Schema at module scope — created once, importable by server-side code
const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const mutation = useMutation<AuthResponse, AxiosError<ApiErrorResponse>, LoginFormValues>({
    mutationFn: authService.login,
    onSuccess: (data) => { /* store token, redirect */ },
  });

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Surface mutation error — no separate useState needed
  const apiError = mutation.error?.response?.data?.message ?? mutation.error?.message;

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      {apiError && <p className="text-red-600 text-sm">{apiError}</p>}

      <input {...register("email")} placeholder="Email" />
      {errors.email && <p>{errors.email.message}</p>}

      <input type="password" {...register("password")} placeholder="Password" />
      {errors.password && <p>{errors.password.message}</p>}

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

**Key points:**
- Schema and type defined at module scope — not inside the component.
- `useMutation` error accessed via `mutation.error` — no `useState` for API errors.
- `mutation.isPending` disables submit without a `loading` boolean.

---

## Register form with cross-field validation

`src/components/auth/SignUpForm.tsx` — adds `.refine()` for password confirmation and a non-form state toggle (checkbox) that gates submit.

```typescript
const registerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().min(1, "Required").email("Invalid email"),
  password: z.string().min(6, "At least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],  // Error appears on the confirmPassword field
});
type RegisterFormValues = z.infer<typeof registerSchema>;
```

The `.refine()` path routes the error to `errors.confirmPassword` — no manual comparison in the component.

```typescript
// Non-form checkbox gates submit — RHF doesn't own this state
const [agreed, setAgreed] = useState(false);

<button type="submit" disabled={!agreed || mutation.isPending}>
  Create account
</button>
```

Terms checkbox is outside the schema because it's not submitted as form data — pure UI gate.

---

## Multi-step member application (mixed register + Controller)

`src/components/auth/DetailsForm.tsx` — step 2 of the member flow. Fields that map to a native `<input>` use `register`; selections backed by custom chip buttons use `setValue` directly with `watch` for reactive display.

```typescript
const step2Schema = z.object({
  categorySlug: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  shortDescription: z.string().optional(),
});
type Step2FormValues = z.infer<typeof step2Schema>;

// Chip selections update RHF state directly via setValue — no Controller needed
// because the button is the controller, not a custom input component
const { register, handleSubmit, setValue, watch } = useForm<Step2FormValues>({
  resolver: zodResolver(step2Schema),
});

const selectedCategory = watch("categorySlug");

<button
  type="button"
  onClick={() => setValue("categorySlug", selectedCategory === cat.slug ? "" : cat.slug)}
>
  {cat.name}
</button>
```

Operating hours (complex state not backed by RHF) are held in `useState` and merged into the mutation payload manually in `onSubmit` — not every piece of form state needs to be in RHF.

---

## API error → `setError` mapping recipe

When the API response identifies the failing field (e.g. "email already in use"), map it to the field directly. When it doesn't, fall through to `root`:

```typescript
onError: (error: AxiosError<ApiErrorResponse>) => {
  const message = error.response?.data?.message ?? error.message;
  const status = error.response?.status;

  if (status === 409 || message.toLowerCase().includes("email")) {
    setError("email", { type: "server", message });
  } else if (status === 422) {
    // Validation error — API may return field-keyed errors
    const fieldErrors = error.response?.data?.errors as Record<string, string> | undefined;
    if (fieldErrors) {
      Object.entries(fieldErrors).forEach(([field, msg]) => {
        setError(field as keyof FormValues, { type: "server", message: msg });
      });
    }
  } else {
    setError("root", { type: "server", message });
  }
}
```

In the JSX, display `errors.root?.message` in the top banner alongside field-specific errors.

---

## Shared schema — client form + server validation

Export schemas from a shared file so the server (NestJS or API route) and the client form use identical rules:

```typescript
// src/lib/schemas/auth.schemas.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;
```

```typescript
// Client form imports the schema
import { loginSchema, LoginDto } from "@/lib/schemas/auth.schemas";

// NestJS controller or API route imports the same schema
// import { loginSchema } from "../../../frontend/src/lib/schemas/auth.schemas";
// (or publish as shared package)
```

Shared schemas surface a mismatched validation rule as a compile error or test failure, not a runtime rejection.

---

## Controller with non-native input (illustrative)

When a custom component doesn't forward `ref`, use `Controller`:

```typescript
import { Controller, useFormContext } from "react-hook-form";

// useFormContext() connects a nested component without prop-drilling control
function CategorySelect() {
  const { control } = useFormContext<Step2FormValues>();
  return (
    <Controller
      name="categorySlug"
      control={control}
      render={({ field }) => (
        <CustomSelect value={field.value} onChange={field.onChange} />
      )}
    />
  );
}
```

`useFormContext` requires the form to be wrapped in `<FormProvider>` from `react-hook-form` — useful in deep component trees.
