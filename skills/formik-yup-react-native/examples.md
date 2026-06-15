# Formik + Yup React Native Examples

Example implementations for a React Native app showing form validation patterns.

## Login Form with Email & Password

### LoginComponent.js - Basic Form with Yup Validation

```javascript
// @flow
import React from 'react';
import { Button, Form, Input, Item, Text, Content, Container } from 'native-base';
import { StyleSheet, View } from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import * as Device from 'expo-device';

type Props = {
    login: (string, string, string) => UserAction,
    isLoggingIn: boolean,
    navigation: StackNavigationProp<AuthParamList, 'Login'>,
};

class LoginComponent extends React.Component<Props> {
    render() {
        const { login, isLoggingIn } = this.props;

        const schema = Yup.object().shape({
            email: Yup.string()
                .email('Must be a valid e-mail address.')
                .required('Please provide an e-mail address.'),
            password: Yup.string()
                .required('Please provide a password.')
        });

        return (
            <Container>
                <Content contentContainerStyle={styles.container}>
                    <Formik
                        initialValues={{ email: '', password: '', deviceName: 'mobile' }}
                        onSubmit={(values) => {
                            const email = values.email;
                            const password = values.password;
                            login(email, password, Device.modelName);
                        }}
                        validationSchema={schema}
                    >
                        {({ handleChange, values, handleSubmit, errors, touched }) => (
                            <Form style={{ flex: 1 }}>
                                <View style={{ flex: 4, justifyContent: 'center', marginHorizontal: 20 }}>
                                    <Item>
                                        <Input
                                            required
                                            placeholder={'Email'}
                                            name={'email'}
                                            type={'email'}
                                            defaultValue={''}
                                            autoCapitalize={'none'}
                                            onChangeText={handleChange('email')}
                                            value={values.email}
                                            accessibilityLabel={'Email'}
                                        />
                                        {errors.email && touched.email && (
                                            <Text
                                                style={styles.formErrors}
                                                accessibilityLabel={'Email Input Error'}
                                            >
                                                {errors.email}
                                            </Text>
                                        )}
                                    </Item>
                                    <Item>
                                        <Input
                                            required
                                            placeholder={'Password'}
                                            name={'password'}
                                            type={'password'}
                                            defaultValue={''}
                                            secureTextEntry={true}
                                            onChangeText={handleChange('password')}
                                            value={values.password}
                                            accessibilityLabel={'Password'}
                                        />
                                        {errors.password && touched.password && (
                                            <Text
                                                style={styles.formErrors}
                                                accessibilityLabel={'Password Input Error'}
                                            >
                                                {errors.password}
                                            </Text>
                                        )}
                                    </Item>
                                    <Text
                                        style={styles.link}
                                        onPress={() => {
                                            this.props.navigation.navigate('ForgotPassword');
                                        }}
                                    >
                                        Forgot your password?
                                    </Text>
                                    <Button
                                        full
                                        rounded
                                        style={styles.button}
                                        title={'submit'}
                                        onPress={handleSubmit}
                                        accessibilityLabel={'Submit Login Form'}
                                    >
                                        {isLoggingIn ? (
                                            <Text>Logging In...</Text>
                                        ) : (
                                            <Text>Submit</Text>
                                        )}
                                    </Button>
                                </View>
                            </Form>
                        )}
                    </Formik>
                </Content>
            </Container>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
    },
    formErrors: {
        color: '#d32f2f',
        fontSize: 12,
        marginTop: 4,
    },
    link: {
        color: '#1976d2',
        marginVertical: 10,
        textAlign: 'center',
    },
    button: {
        marginTop: 20,
    },
});

export default LoginComponent;
```

**Pattern notes**:
- **Yup schema**: Inline definition with email and required validations
- **initialValues**: Includes hidden `deviceName` field set to 'mobile'
- **onSubmit**: Extracts values and calls Redux action with device model name
- **Error display**: `{errors.email && touched.email && <Text>{errors.email}</Text>}`
- **Submit button state**: Changes text to "Logging In..." during submission (uses prop, not `isSubmitting`)
- **Native Base**: Uses `<Input>` component (not standard `<TextInput>`)
- **Accessibility**: `accessibilityLabel` props for screen readers

---

## Registration Form with Multiple Fields

### Simplified Registration Pattern

```javascript
import React from 'react';
import { View, TextInput, Button, Text, StyleSheet } from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';

const registrationSchema = Yup.object().shape({
    name: Yup.string()
        .min(2, 'Too short')
        .required('Name is required'),
    email: Yup.string()
        .email('Invalid email')
        .required('Email is required'),
    password: Yup.string()
        .min(8, 'Must be at least 8 characters')
        .matches(/[a-z]/, 'Must contain lowercase')
        .matches(/[A-Z]/, 'Must contain uppercase')
        .matches(/[0-9]/, 'Must contain number')
        .required('Password is required'),
    confirmPassword: Yup.string()
        .oneOf([Yup.ref('password')], 'Passwords must match')
        .required('Confirm password'),
});

function RegistrationForm({ onRegister }) {
    return (
        <Formik
            initialValues={{
                name: '',
                email: '',
                password: '',
                confirmPassword: '',
            }}
            validationSchema={registrationSchema}
            onSubmit={(values, { setSubmitting }) => {
                onRegister(values)
                    .then(() => {
                        // Success
                    })
                    .catch((error) => {
                        // Error handled elsewhere
                    })
                    .finally(() => {
                        setSubmitting(false);
                    });
            }}
        >
            {({
                handleChange,
                handleBlur,
                handleSubmit,
                values,
                errors,
                touched,
                isSubmitting,
            }) => (
                <View style={styles.container}>
                    <TextInput
                        placeholder="Name"
                        onChangeText={handleChange('name')}
                        onBlur={handleBlur('name')}
                        value={values.name}
                        autoCapitalize="words"
                        style={styles.input}
                    />
                    {errors.name && touched.name && (
                        <Text style={styles.error}>{errors.name}</Text>
                    )}

                    <TextInput
                        placeholder="Email"
                        onChangeText={handleChange('email')}
                        onBlur={handleBlur('email')}
                        value={values.email}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={styles.input}
                    />
                    {errors.email && touched.email && (
                        <Text style={styles.error}>{errors.email}</Text>
                    )}

                    <TextInput
                        placeholder="Password"
                        onChangeText={handleChange('password')}
                        onBlur={handleBlur('password')}
                        value={values.password}
                        secureTextEntry
                        autoCapitalize="none"
                        style={styles.input}
                    />
                    {errors.password && touched.password && (
                        <Text style={styles.error}>{errors.password}</Text>
                    )}

                    <TextInput
                        placeholder="Confirm Password"
                        onChangeText={handleChange('confirmPassword')}
                        onBlur={handleBlur('confirmPassword')}
                        value={values.confirmPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        style={styles.input}
                    />
                    {errors.confirmPassword && touched.confirmPassword && (
                        <Text style={styles.error}>{errors.confirmPassword}</Text>
                    )}

                    <Button
                        title={isSubmitting ? 'Creating Account...' : 'Create Account'}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    />
                </View>
            )}
        </Formik>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        fontSize: 16,
    },
    error: {
        color: '#d32f2f',
        fontSize: 12,
        marginBottom: 12,
        marginLeft: 8,
    },
});

export default RegistrationForm;
```

**Pattern notes**:
- **Password complexity**: Multiple `.matches()` rules for strong passwords
- **Confirm password**: `Yup.ref('password')` to reference another field
- **Submit state**: Uses `isSubmitting` and `setSubmitting` from Formik
- **Keyboard types**: `email-address` for email, default for text
- **Auto-capitalize**: `words` for name, `none` for email/password

---

## Keyboard Navigation Example

### Sequential Field Focus

```javascript
import React, { useRef } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';

const schema = Yup.object().shape({
    firstName: Yup.string().required('Required'),
    lastName: Yup.string().required('Required'),
    email: Yup.string().email().required('Required'),
    phone: Yup.string().required('Required'),
});

function ContactForm() {
    const lastNameRef = useRef();
    const emailRef = useRef();
    const phoneRef = useRef();

    return (
        <Formik
            initialValues={{ firstName: '', lastName: '', email: '', phone: '' }}
            validationSchema={schema}
            onSubmit={(values) => console.log(values)}
        >
            {({ handleChange, handleBlur, handleSubmit, values }) => (
                <View style={styles.container}>
                    <TextInput
                        placeholder="First Name"
                        onChangeText={handleChange('firstName')}
                        onBlur={handleBlur('firstName')}
                        value={values.firstName}
                        returnKeyType="next"
                        onSubmitEditing={() => lastNameRef.current?.focus()}
                        style={styles.input}
                    />

                    <TextInput
                        ref={lastNameRef}
                        placeholder="Last Name"
                        onChangeText={handleChange('lastName')}
                        onBlur={handleBlur('lastName')}
                        value={values.lastName}
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                        style={styles.input}
                    />

                    <TextInput
                        ref={emailRef}
                        placeholder="Email"
                        onChangeText={handleChange('email')}
                        onBlur={handleBlur('email')}
                        value={values.email}
                        keyboardType="email-address"
                        returnKeyType="next"
                        onSubmitEditing={() => phoneRef.current?.focus()}
                        style={styles.input}
                    />

                    <TextInput
                        ref={phoneRef}
                        placeholder="Phone"
                        onChangeText={handleChange('phone')}
                        onBlur={handleBlur('phone')}
                        value={values.phone}
                        keyboardType="phone-pad"
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit}
                        style={styles.input}
                    />

                    <Button title="Submit" onPress={handleSubmit} />
                </View>
            )}
        </Formik>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        fontSize: 16,
    },
});
```

**Pattern notes**:
- **Refs**: Create ref for each field except the first
- **returnKeyType**: "next" for all except last field ("done")
- **onSubmitEditing**: Focus next field on "Next" button press
- **Last field**: Calls `handleSubmit` on "Done" button

---

## KeyboardAvoidingView Integration

### Full Form with Keyboard Management

```javascript
import React from 'react';
import {
    View,
    TextInput,
    Button,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';

const schema = Yup.object().shape({
    name: Yup.string().required('Required'),
    email: Yup.string().email().required('Required'),
    message: Yup.string().min(10, 'Too short').required('Required'),
});

function ContactForm() {
    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <Formik
                    initialValues={{ name: '', email: '', message: '' }}
                    validationSchema={schema}
                    onSubmit={(values, { setSubmitting, resetForm }) => {
                        setTimeout(() => {
                            console.log(values);
                            resetForm();
                            setSubmitting(false);
                        }, 1000);
                    }}
                >
                    {({ handleChange, handleSubmit, values, isSubmitting }) => (
                        <View style={styles.form}>
                            <TextInput
                                placeholder="Name"
                                onChangeText={handleChange('name')}
                                value={values.name}
                                style={styles.input}
                            />
                            <TextInput
                                placeholder="Email"
                                onChangeText={handleChange('email')}
                                value={values.email}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.input}
                            />
                            <TextInput
                                placeholder="Message"
                                onChangeText={handleChange('message')}
                                value={values.message}
                                multiline
                                numberOfLines={4}
                                style={[styles.input, styles.textArea]}
                            />
                            <Button
                                title={isSubmitting ? 'Sending...' : 'Send'}
                                onPress={handleSubmit}
                                disabled={isSubmitting}
                            />
                        </View>
                    )}
                </Formik>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    form: {
        padding: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        fontSize: 16,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
});

export default ContactForm;
```

**Pattern notes**:
- **KeyboardAvoidingView**: Different behavior for iOS (`padding`) vs Android (`height`)
- **ScrollView**: Allows scrolling when keyboard is open
- **keyboardShouldPersistTaps**: Allows tapping inputs without dismissing keyboard
- **multiline**: Textarea-style input for message field
- **resetForm**: Clears form after successful submission

---

## Conditional Validation Example

### Delivery Address Based on Checkbox

```javascript
import React from 'react';
import { View, TextInput, Switch, Text, Button, StyleSheet } from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';

const schema = Yup.object().shape({
    name: Yup.string().required('Required'),
    billingAddress: Yup.string().required('Required'),
    useDeliveryAddress: Yup.boolean(),
    deliveryAddress: Yup.string().when('useDeliveryAddress', {
        is: true,
        then: Yup.string().required('Delivery address is required'),
        otherwise: Yup.string().optional(),
    }),
});

function OrderForm() {
    return (
        <Formik
            initialValues={{
                name: '',
                billingAddress: '',
                useDeliveryAddress: false,
                deliveryAddress: '',
            }}
            validationSchema={schema}
            onSubmit={(values) => console.log(values)}
        >
            {({
                handleChange,
                handleSubmit,
                values,
                setFieldValue,
                errors,
                touched,
            }) => (
                <View style={styles.container}>
                    <TextInput
                        placeholder="Name"
                        onChangeText={handleChange('name')}
                        value={values.name}
                        style={styles.input}
                    />

                    <TextInput
                        placeholder="Billing Address"
                        onChangeText={handleChange('billingAddress')}
                        value={values.billingAddress}
                        style={styles.input}
                    />

                    <View style={styles.switchRow}>
                        <Text>Use different delivery address?</Text>
                        <Switch
                            value={values.useDeliveryAddress}
                            onValueChange={(value) =>
                                setFieldValue('useDeliveryAddress', value)
                            }
                        />
                    </View>

                    {values.useDeliveryAddress && (
                        <>
                            <TextInput
                                placeholder="Delivery Address"
                                onChangeText={handleChange('deliveryAddress')}
                                value={values.deliveryAddress}
                                style={styles.input}
                            />
                            {errors.deliveryAddress && touched.deliveryAddress && (
                                <Text style={styles.error}>
                                    {errors.deliveryAddress}
                                </Text>
                            )}
                        </>
                    )}

                    <Button title="Submit" onPress={handleSubmit} />
                </View>
            )}
        </Formik>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 12,
    },
    error: {
        color: '#d32f2f',
        fontSize: 12,
        marginBottom: 12,
    },
});

export default OrderForm;
```

**Pattern notes**:
- **Conditional validation**: `Yup.when('field', { is: value, then: schema })`
- **Switch**: Uses `setFieldValue` instead of `handleChange`
- **Conditional rendering**: Delivery address field only shows when checkbox is true
- **Validation updates**: Schema automatically validates delivery address when checkbox changes

---

## Key Patterns

1. **Native Base Integration**: Uses `<Input>` component instead of standard `<TextInput>`
2. **Inline Schema**: Yup schema defined inside render method (could be extracted for reusability)
3. **Device Info**: Includes device model name in login submission
4. **Prop-based Loading**: Uses component prop (`isLoggingIn`) instead of Formik's `isSubmitting`
5. **Accessibility**: Consistent `accessibilityLabel` props for screen readers
6. **Error Styling**: Red text below inputs with consistent styling
7. **Navigation Integration**: "Forgot password" link navigates using React Navigation

**Production improvements**:
- Extract Yup schema to separate file for reusability
- Use Formik's `isSubmitting` instead of external prop
- Add keyboard navigation (returnKeyType, refs, onSubmitEditing)
- Implement KeyboardAvoidingView for better mobile UX
- Add `handleBlur` to all inputs for better validation timing
