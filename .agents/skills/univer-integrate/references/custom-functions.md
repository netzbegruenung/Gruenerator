# Custom Formula Functions

Univer's formula engine (`@univerjs/engine-formula`) supports registering custom functions, allowing developers to use them in cells just like built-in functions.

## Two Registration Methods

### Method 1: Register via Configuration (At Initialization)

```ts
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { MyCustomFunction } from './my-custom-function';

univer.registerPlugin(UniverFormulaEnginePlugin, {
  notExecuteFormula: false,
  function: [
    [MyCustomFunction, 'CUSTOM.ADD'], // [Class, functionName]
  ],
});
```

### Method 2: Register at Runtime (via Mutation)

```ts
import { RegisterFunctionMutation } from '@univerjs/engine-formula';

commandService.executeCommand(RegisterFunctionMutation.id, {
  functions: [['functionBodyAsString', 'CUSTOM.ADD']],
});
```

> Runtime registration is mainly used for the main thread to synchronize function definitions to the Worker thread.

## Implementing a Custom Function

Inherit `BaseFunction` and override the `calculate` method:

```ts
import {
  BaseFunction,
  BaseValueObject,
  NumberValueObject,
  StringValueObject,
  BooleanValueObject,
  ErrorValueObject,
  ArrayValueObject,
  ErrorType,
} from '@univerjs/engine-formula';

/**
 * Custom addition function: CUSTOM.ADD(a, b)
 * Supports numbers, arrays, and references
 */
export class MyCustomFunction extends BaseFunction {
  override minParams = 2;
  override maxParams = 2;

  override calculate(...args: BaseValueObject[]): BaseValueObject {
    const [a, b] = args;

    // Handle error propagation
    if (a.isError()) return a;
    if (b.isError()) return b;

    // If array, take the first cell
    const left = a.isArray() ? (a as ArrayValueObject).getFirstCell() : a;
    const right = b.isArray() ? (b as ArrayValueObject).getFirstCell() : b;

    // Type checking and conversion
    if (!left.isNumber() || !right.isNumber()) {
      return ErrorValueObject.create(ErrorType.VALUE);
    }

    const sum = (left.getValue() as number) + (right.getValue() as number);
    return NumberValueObject.create(sum);
  }
}
```

## Value Object System

The formula engine internally uses `BaseValueObject` to represent all values:

| Class | Meaning | Creation |
|-------|---------|----------|
| `NumberValueObject` | Number | `NumberValueObject.create(42)` |
| `StringValueObject` | String | `StringValueObject.create('hello')` |
| `BooleanValueObject` | Boolean | `BooleanValueObject.create(true)` |
| `NullValueObject` | Null | `NullValueObject.create()` |
| `ErrorValueObject` | Error | `ErrorValueObject.create(ErrorType.VALUE)` |
| `ArrayValueObject` | Array / Range | `ArrayValueObject.create([[1, 2], [3, 4]])` |

### Common Predicate Methods

```ts
value.isNumber()      // Is number
value.isString()      // Is string
value.isBoolean()     // Is boolean
value.isNull()        // Is null
value.isError()       // Is error
value.isArray()       // Is array
```

### Get Raw Value

```ts
value.getValue()      // Returns string | boolean | number | null
```

### Array Operations

```ts
const arr = value as ArrayValueObject;
arr.getFirstCell()           // Take the first cell
arr.getArrayValue()          // Get 2D value array
arr.getRowCount()
arr.getColumnCount()
arr.getCellValue(row, col)   // Get value at specified position
arr.map((v) => v)            // Traverse and map
```

## Complete Example: Custom Discount Function

```ts
import { BaseFunction, BaseValueObject, NumberValueObject, ErrorValueObject, ArrayValueObject, ErrorType } from '@univerjs/engine-formula';

/**
 * CUSTOM.DISCOUNT(price, rate)
 * Calculate discounted price, rate is a decimal between 0-1
 */
export class DiscountFunction extends BaseFunction {
  override minParams = 2;
  override maxParams = 2;

  override calculate(price: BaseValueObject, rate: BaseValueObject): BaseValueObject {
    if (price.isError()) return price;
    if (rate.isError()) return rate;

    const p = price.isArray() ? (price as ArrayValueObject).getFirstCell() : price;
    const r = rate.isArray() ? (rate as ArrayValueObject).getFirstCell() : rate;

    if (!p.isNumber() || !r.isNumber()) {
      return ErrorValueObject.create(ErrorType.VALUE);
    }

    const priceVal = p.getValue() as number;
    const rateVal = r.getValue() as number;

    if (rateVal < 0 || rateVal > 1) {
      return ErrorValueObject.create(ErrorType.NUM);
    }

    return NumberValueObject.create(priceVal * (1 - rateVal));
  }
}
```

Use in cells after registration:

```
=CUSTOM.DISCOUNT(A1, 0.2)
```

## Async Custom Functions

```ts
import { AsyncCustomFunction } from '@univerjs/engine-formula';

export class FetchDataFunction extends AsyncCustomFunction {
  override minParams = 1;
  override maxParams = 1;

  override async calculateCustom(...args: FormulaFunctionValueType[]): Promise<FormulaFunctionResultValueType> {
    const [url] = args;
    const response = await fetch(url as string);
    const data = await response.json();
    return data.value;
  }
}
```

Note: Async functions inherit from `AsyncCustomFunction` instead of `BaseFunction`, and override `calculateCustom`.

## Function Metadata

Configuration fields provided by `BaseFunction`:

```ts
class MyFunction extends BaseFunction {
  override minParams = 1;           // Minimum number of parameters
  override maxParams = 3;           // Maximum number of parameters (-1 means unlimited)
  override needsExpandParams = true; // Whether to auto-expand parameters (array formula behavior)
  override needsReferenceObject = true; // Whether raw reference object is needed (instead of value)
  override needsLocale = true;      // Whether locale info is needed
  override needsSheetsInfo = true;  // Whether sheet info is needed
  override needsFormulaDataModel = true; // Whether FormulaDataModel is needed
  override needsSheetRowColumnCount = true; // Whether row/column count is needed
}
```

## Error Types

```ts
ErrorType.VALUE   // #VALUE!
ErrorType.REF     // #REF!
ErrorType.NAME    // #NAME?
ErrorType.NUM     // #NUM!
ErrorType.NA      // #N/A
ErrorType.NULL    // #NULL!
ErrorType.DIV_BY_ZERO // #DIV/0!
```
