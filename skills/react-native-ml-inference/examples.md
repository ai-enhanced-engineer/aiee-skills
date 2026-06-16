# React Native ML Inference - Examples

## TM v2 Normalization

```js
// (pixel / 127.5) - 1 for [-1, 1] range (MobileNet v2 convention)
const scaled = resized.div(tf.scalar(127.5)).sub(tf.scalar(1));
```

## decodeJpeg Outer Tensor Pattern

```js
// imgTensor is created OUTSIDE tidy — must dispose manually
const imgTensor = decodeJpeg(raw);

const processedTensor = tf.tidy(() => {
    const resized = tf.image.resizeNearestNeighbor(imgTensor, [224, 224]);
    const scaled = resized.div(tf.scalar(127.5)).sub(tf.scalar(1));
    return tf.reshape(scaled, [1, 224, 224, 3]);  // intermediates auto-cleaned
});

imgTensor.dispose();   // outer tensor — manual cleanup required
return processedTensor; // caller is responsible for disposing this
```

## Error-Path Disposal

```js
let tensor;
try {
    tensor = await convertImageToTensor(image);
    const predictions = await makePredictions(1, model, tensor);
} catch (error) {
    closeModal();
} finally {
    if (tensor) { tensor.dispose(); }  // guard: tensor may be undefined
    setIsProcessing(false);
}
```

## Extract for Testability

Move async inference pipeline out of component into standalone utility:

```js
// src/features/items/utils/processImagePrediction.js
export const processImagePrediction = async (
    image, model, setIsProcessing, setPredictions, closeModal
) => {
    let tensor;
    try {
        setIsProcessing(true);
        tensor = await convertImageToTensor(image);
        const predictions = await makePredictions(1, model, tensor);
        // ... process predictions
    } catch (error) {
        closeModal();
    } finally {
        if (tensor) { tensor.dispose(); }
        setIsProcessing(false);
    }
};
```

## Testing Finally Blocks

Three test groups for every async utility with `finally`:

```js
// Mock tensor setup — always give mock tensors a dispose spy
beforeEach(() => {
    mockTensor = { dispose: jest.fn() };
    convertImageToTensor.mockResolvedValue(mockTensor);
});

// Early-throw test validates the `if (tensor)` guard
describe('error path — convertImageToTensor throws (tensor is undefined)', () => {
    beforeEach(() => {
        convertImageToTensor.mockRejectedValue(new Error('Could not convert'));
    });

    it('does not call tensor.dispose() when tensor was never assigned', async () => {
        await run();
        expect(mockTensor.dispose).not.toHaveBeenCalled();
    });
});
```

## Jest Chained Mock Ordering

Use `mockReturnValueOnce` + distinct mock objects for chained calls:

```js
const mockSub = { reshape: jest.fn().mockReturnValue(mockResult) };
const mockDiv = { sub: jest.fn().mockReturnValueOnce(mockSub) };
mockResized.div = jest.fn().mockReturnValueOnce(mockDiv);

// Verify with toHaveBeenNthCalledWith for belt-and-suspenders
expect(mockResized.div).toHaveBeenNthCalledWith(1, expect.anything());
```

## File-Level Coverage Thresholds

For legacy codebases, use file-level thresholds instead of global:

```js
coverageThreshold: {
    './src/features/items/utils/TensorHelper.js': { lines: 80 },
    './src/features/items/utils/processImagePrediction.js': { lines: 80 },
    './src/data/user/reducers.js': { lines: 8 },  // legacy baseline
},
```

## Tensor Lifecycle Table

| Tensor | Created in | Disposed by | Mechanism |
|--------|-----------|-------------|-----------|
| `imgTensor` (from `decodeJpeg`) | `convertImageToTensor` | `convertImageToTensor` (after tidy) | `.dispose()` |
| Intermediate resized/scaled tensors | `tf.tidy()` callback | `tf.tidy()` automatically | tidy |
| `processedTensor` (returned from tidy) | `convertImageToTensor` → tidy | `processImagePrediction` finally block | `.dispose()` |
| `output` (from `model.predict`) | `makePredictions` | `makePredictions` (before return) | `.dispose()` |
