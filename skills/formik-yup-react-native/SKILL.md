---
name: formik-yup-react-native
description: Formik + Yup for React Native. TextInput integration, mobile validation UX, error timing. Use when building mobile forms with validation, handling keyboard/focus UX, or wiring Yup schemas to Formik in RN.
kb-sources:
  - wiki/software-engineering/formik-yup-rn
updated: 2026-04-18
---

# Formik + Yup for React Native

Form validation for React Native.

## When to Use

- Forms with 3+ fields
- Email/password validation
- Mobile error UX
- Keyboard field navigation

**Foundation**: `react-redux-spa-patterns` (Formik/Yup basics)

## TextInput vs HTML

**Critical**: TextInput uses `onChangeText={handleChange('field')}`, not `onChange={handleChange}`.

| Web | React Native |
|-----|--------------|
| `onChange` + `name` attribute | `onChangeText` + explicit field arg |
| Auto-submit on Enter | Manual keyboard handling |

## Error UX Timing

| Show When | Why |
|-----------|-----|
| On Blur | Time to complete input |
| On Change (after touch) | Immediate correction feedback |
| On Submit | Catch incomplete |

**Pattern**: `{errors.field && touched.field && <Text>{errors.field}</Text>}`

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Manual validation | Use Yup schemas |
| Errors before touch | Check `touched.field` first |
| Duplicate submits | `disabled={isSubmitting}` |
| Hidden keyboard inputs | Wrap in `KeyboardAvoidingView` |

**reference.md**: Field components, keyboard dismissal, async validation, KeyboardAvoidingView setup
**examples.md**: Complete forms, TextInput patterns, Yup schemas, field navigation, real-world code
