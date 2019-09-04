/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { provideAccessibilityClass, provideAccessibilityClassAndProps, setup as setupAbilityAttributes } from 'ability-attributes-react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Button, Checkbox } from './schema';

setupAbilityAttributes();

ReactDOM.render(
    <>
        <h1>Hello world</h1>

        <button aria-labelledby='lalal'>
            Button
        </button>

        <span $accessibility={ provideAccessibilityClassAndProps(Button, { label: 'Button2' }) }>
            Button2
        </span>

        <div>
            <input
                type='checkbox'
                aria-label='Lalal'
                aria-checked='true'
                $accessibility={ provideAccessibilityClass(Checkbox) }
            />
            Lalal
        </div>

        <div $accessibility={ provideAccessibilityClassAndProps(Checkbox, { checked: true }) }>
            Ololo
        </div>
    </>,

    document.getElementById('demo')
);
