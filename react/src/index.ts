/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import 'react';

import { createElement, setup } from './CreateElement';
import { Accessibility, AttributeSchemaClass, provideAccessibilityClass, provideAccessibilityClassAndProps } from './ReactProp';

export {
    provideAccessibilityClass,
    provideAccessibilityClassAndProps,
    setup,
    createElement,
    Accessibility,
    AttributeSchemaClass
};

declare module 'react' {
    interface HTMLAttributes<T> {
        $accessibility?: Accessibility<any>;
    }
}
