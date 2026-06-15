# Formik + Yup React Native Reference

Detailed patterns for form validation in React Native apps.

## React Native TextInput Integration

### Core Pattern

React Native's `TextInput` component requires explicit integration with Formik due to platform differences from web forms.

**Web vs React Native**:
```javascript
// ❌ Web pattern (doesn't work in React Native)
<input name="email" onChange={handleChange} value={values.email} />

// ✅ React Native pattern
<TextInput
    onChangeText={handleChange('email')}
    onBlur={handleBlur('email')}
    value={values.email}
/>
```

**Key Differences**:
- React Native uses `onChangeText` instead of `onChange`
- React Native requires explicit field name argument: `handleChange('email')`
- No automatic name-based binding like web inputs

### Custom Field Component

Create reusable field components by wrapping TextInput with Formik's field props:

```javascript
import React from 'react';
import { TextInput, Text, View } from 'react-native';
import { Field } from 'formik';

const FormField = ({ name, label, ...otherProps }) => {
    return (
        <Field name={name}>
            {({ field, form }) => (
                <View>
                    {label && <Text>{label}</Text>}
                    <TextInput
                        onChangeText={form.handleChange(name)}
                        onBlur={form.handleBlur(name)}
                        value={field.value}
                        {...otherProps}
                    />
                    {form.errors[name] && form.touched[name] && (
                        <Text style={{ color: 'red' }}>
                            {form.errors[name]}
                        </Text>
                    )}
                </View>
            )}
        </Field>
    );
};

// Usage
<FormField name="email" label="Email" keyboardType="email-address" />
```

### Direct State Setters

Formik provides direct state setters as alternatives to `handleChange` and `handleBlur`:

```javascript
setFieldValue(fieldName, value)  // Direct value update
setFieldTouched(fieldName, bool) // Manual touch tracking
setFieldError(fieldName, error)  // Manual error setting
```

**Use Cases**:
- Complex interactions (multi-step forms)
- Conditional field updates
- Custom validation triggers
- Non-text inputs (switches, pickers)

**Example**:
```javascript
<Switch
    value={values.agreeToTerms}
    onValueChange={(value) => setFieldValue('agreeToTerms', value)}
/>
```

## Mobile Validation UX

### Error Display Timing

**Best Practice**: Balance immediate feedback with avoiding premature errors.

#### Strategy 1: On Blur (Primary)

Show errors after user leaves a field:

```javascript
{form.errors[name] && form.touched[name] && (
    <Text style={styles.error}>{form.errors[name]}</Text>
)}
```

**Why**: Gives users time to complete input before seeing validation feedback.

#### Strategy 2: On Change (After Touch)

Once a field has been touched and has an error, validate on every keystroke:

```javascript
<Formik
    validateOnChange={true}  // Validate on every keystroke (default)
    validateOnBlur={true}    // Validate on blur (default)
>
```

**Why**: Provides immediate feedback when error is corrected ("fix and see" experience).

#### Strategy 3: On Submit

Always validate all fields on submission:

```javascript
<Formik
    onSubmit={(values, { setSubmitting, setErrors }) => {
        // Validation runs automatically before onSubmit
        // If validation fails, onSubmit won't be called
    }}
>
```

**Why**: Catches incomplete forms before API submission.

### Error Message Display

Mobile screens have limited real estate, so error presentation must be space-efficient:

```javascript
const styles = StyleSheet.create({
    errorText: {
        color: '#d32f2f',      // Red for visibility
        fontSize: 12,          // Smaller than input text
        marginTop: 4,          // Space from input
        marginLeft: 8,         // Align with input text
        fontWeight: '500',
    }
});
```

**Best Practices**:
- **Inline Errors**: Position directly below input
- **Visual Cues**: Red text, error icons
- **User-Friendly Language**: "Please enter a valid email" not "Invalid format"
- **Single Error Focus**: Show most critical error first
- **Persistent Visibility**: Keep visible even when keyboard is open

### Keyboard Dismissal

The on-screen keyboard can obscure form elements, requiring explicit management:

#### KeyboardAvoidingView

```javascript
import { KeyboardAvoidingView, Platform } from 'react-native';

<KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1 }}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
>
    <Formik>{/* form */}</Formik>
</KeyboardAvoidingView>
```

**Behavior Options**:
- `'padding'`: Adjusts view padding (iOS)
- `'height'`: Adjusts view height (Android)
- `'position'`: Adjusts view position

#### ScrollView Integration

```javascript
import { ScrollView, Keyboard } from 'react-native';

<ScrollView
    keyboardShouldPersistTaps="handled"
    onScroll={() => Keyboard.dismiss()}
>
    <Formik>{/* form */}</Formik>
</ScrollView>
```

**Props**:
- `keyboardShouldPersistTaps="handled"`: Allows tapping inputs without dismissing keyboard
- `onScroll`: Dismisses keyboard when user scrolls

#### Programmatic Dismissal

```javascript
import { Keyboard, TouchableWithoutFeedback } from 'react-native';

<TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
    <View>
        <Formik>{/* form */}</Formik>
    </View>
</TouchableWithoutFeedback>
```

## Keyboard Handling

### Sequential Field Navigation

Implement "Next" button behavior to move between fields:

```javascript
import React, { useRef } from 'react';

function MyForm() {
    const emailRef = useRef();
    const passwordRef = useRef();
    const confirmPasswordRef = useRef();

    return (
        <Formik>
            {({ handleChange, handleSubmit }) => (
                <>
                    <TextInput
                        ref={emailRef}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        onChangeText={handleChange('email')}
                    />
                    <TextInput
                        ref={passwordRef}
                        returnKeyType="next"
                        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                        onChangeText={handleChange('password')}
                    />
                    <TextInput
                        ref={confirmPasswordRef}
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit}
                        onChangeText={handleChange('confirmPassword')}
                    />
                </>
            )}
        </Formik>
    );
}
```

**returnKeyType Options**:
- `"next"`: Show "Next" button (moves to next field)
- `"done"`: Show "Done" button (submits form)
- `"search"`: Show "Search" button
- `"send"`: Show "Send" button

### Type-Specific Props

Automatically apply appropriate TextInput props based on field type:

```javascript
const getTypeProps = (type) => {
    switch (type) {
        case 'email':
            return {
                keyboardType: 'email-address',
                autoCapitalize: 'none',
                autoCorrect: false,
            };
        case 'password':
            return {
                secureTextEntry: true,
                autoCapitalize: 'none',
                autoCorrect: false,
            };
        case 'phone':
            return {
                keyboardType: 'phone-pad',
                autoCapitalize: 'none',
            };
        case 'number':
            return {
                keyboardType: 'numeric',
            };
        case 'name':
            return {
                autoCapitalize: 'words',
            };
        default:
            return {};
    }
};

// Usage
<TextInput
    {...getTypeProps('email')}
    onChangeText={handleChange('email')}
/>
```

## Submit Button State Management

### Basic Disabled State

```javascript
<Button
    title={isSubmitting ? 'Submitting...' : 'Submit'}
    onPress={handleSubmit}
    disabled={isSubmitting}
/>
```

### Disable Until Valid

```javascript
<Formik
    validateOnMount={true}  // Validate immediately
    initialValues={{ email: '', password: '' }}
    validationSchema={schema}
>
    {({ handleSubmit, isSubmitting, isValid }) => (
        <Button
            title="Submit"
            onPress={handleSubmit}
            disabled={isSubmitting || !isValid}
        />
    )}
</Formik>
```

### Require Changes Before Submit

```javascript
<Button
    title="Submit"
    onPress={handleSubmit}
    disabled={isSubmitting || !isValid || !dirty}
/>
```

**Props Explanation**:
- `isSubmitting`: True during async onSubmit execution
- `isValid`: True when all fields pass validation
- `dirty`: True when any field value has changed from initial value

### Loading Indicator

```javascript
import { ActivityIndicator } from 'react-native';

<Button
    title={isSubmitting ? '' : 'Submit'}
    onPress={handleSubmit}
    disabled={isSubmitting}
>
    {isSubmitting && <ActivityIndicator color="white" />}
</Button>
```

## Yup Validation Patterns

### Common Validations

```javascript
import * as Yup from 'yup';

const schema = Yup.object().shape({
    // Required string
    name: Yup.string()
        .required('Name is required'),

    // Email
    email: Yup.string()
        .email('Must be a valid email')
        .required('Email is required'),

    // Password with complexity
    password: Yup.string()
        .min(8, 'Must be at least 8 characters')
        .matches(/[a-z]/, 'Must contain lowercase letter')
        .matches(/[A-Z]/, 'Must contain uppercase letter')
        .matches(/[0-9]/, 'Must contain number')
        .matches(/[@$!%*?&#]/, 'Must contain special character')
        .required('Password is required'),

    // Confirm password
    confirmPassword: Yup.string()
        .oneOf([Yup.ref('password')], 'Passwords must match')
        .required('Please confirm password'),

    // Phone number
    phone: Yup.string()
        .matches(/^[0-9]{10}$/, 'Must be 10 digits')
        .optional(),

    // Age with range
    age: Yup.number()
        .min(18, 'Must be at least 18')
        .max(120, 'Invalid age')
        .required('Age is required'),

    // URL
    website: Yup.string()
        .url('Must be a valid URL')
        .optional(),

    // Boolean (checkbox/switch)
    agreeToTerms: Yup.boolean()
        .oneOf([true], 'You must accept the terms')
        .required(),
});
```

### Custom Validation

```javascript
const schema = Yup.object().shape({
    username: Yup.string()
        .test('no-spaces', 'Username cannot contain spaces', (value) => {
            return !value || !value.includes(' ');
        })
        .required('Username is required'),

    email: Yup.string()
        .email()
        .test('unique-email', 'Email already exists', async (value) => {
            if (!value) return true;
            const response = await api.checkEmail(value);
            return !response.exists;
        })
        .required(),
});
```

### Conditional Validation

```javascript
const schema = Yup.object().shape({
    hasDeliveryAddress: Yup.boolean(),
    deliveryAddress: Yup.string()
        .when('hasDeliveryAddress', {
            is: true,
            then: Yup.string().required('Delivery address is required'),
            otherwise: Yup.string().optional(),
        }),
});
```

## Async Validation

For validations requiring API calls (e.g., checking email uniqueness):

```javascript
const schema = Yup.object().shape({
    email: Yup.string()
        .email('Invalid email')
        .required('Required')
        .test('unique-email', 'Email already exists', async (value) => {
            if (!value) return true;
            try {
                const response = await api.checkEmailAvailability(value);
                return response.available;
            } catch (error) {
                return true; // Allow on error (don't block user)
            }
        }),
});
```

**Show Loading State**:
```javascript
{({ isValidating }) => (
    <>
        <TextInput onChangeText={handleChange('email')} />
        {isValidating && <ActivityIndicator size="small" />}
    </>
)}
```

## Form Submission Patterns

### Basic Submission

```javascript
<Formik
    initialValues={{ email: '', password: '' }}
    validationSchema={schema}
    onSubmit={(values, { setSubmitting, setErrors }) => {
        api.login(values)
            .then(() => {
                // Success
                navigation.navigate('Home');
            })
            .catch((error) => {
                // Server errors
                setErrors({ email: error.message });
            })
            .finally(() => {
                setSubmitting(false);
            });
    }}
>
```

### With Redux Action

```javascript
<Formik
    onSubmit={(values, { setSubmitting }) => {
        dispatch(login(values.email, values.password))
            .then(() => {
                navigation.navigate('Home');
            })
            .catch((error) => {
                // Error handled in reducer/action
            })
            .finally(() => {
                setSubmitting(false);
            });
    }}
>
```

### Reset After Submission

```javascript
<Formik
    onSubmit={(values, { setSubmitting, resetForm }) => {
        api.submit(values)
            .then(() => {
                resetForm(); // Clear form
                showSuccessMessage();
            })
            .finally(() => {
                setSubmitting(false);
            });
    }}
>
```

## Performance Optimization

### Debounce Validation

For expensive async validation:

```javascript
import debounce from 'lodash/debounce';

const debouncedValidate = debounce(async (value) => {
    const response = await api.checkUsername(value);
    return response.available;
}, 500);

const schema = Yup.object().shape({
    username: Yup.string()
        .test('available', 'Username taken', debouncedValidate)
        .required(),
});
```

### Memoize Schema

```javascript
import { useMemo } from 'react';

function MyForm() {
    const schema = useMemo(() => Yup.object().shape({
        email: Yup.string().email().required(),
        password: Yup.string().min(8).required(),
    }), []);

    return <Formik validationSchema={schema}>{/* ... */}</Formik>;
}
```

### Reduce Validation Frequency

```javascript
<Formik
    validateOnChange={false}  // Don't validate on every keystroke
    validateOnBlur={true}     // Only validate on blur
>
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|-------------|-------------|----------|
| Not using Formik for complex forms | Manual state management is verbose and error-prone | Use Formik for forms with 3+ fields |
| Inline validation logic | Hard to maintain, test, and reuse | Define Yup schemas |
| Not showing errors to users | Users submit repeatedly without understanding issues | Display errors when touched |
| Not disabling submit during submission | Duplicate API calls, race conditions | Use `disabled={isSubmitting}` |
| Showing errors immediately | Frustrates users before they finish typing | Check `touched[field]` before showing errors |
| Not handling async validation loading | Users don't know validation is in progress | Show `ActivityIndicator` when `isValidating` |
