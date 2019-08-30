/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import 'react';

import { createElement, setup } from './CreateElement';
import { $A, $AA, Accessibility, AttributeSchemaClass } from './ReactProp';

export {
    $A,
    $AA,
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
