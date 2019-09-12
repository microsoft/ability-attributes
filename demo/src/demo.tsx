/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DevEnv, Schema } from 'ability-attributes';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Button, Checkbox } from './schema';

DevEnv.setup();

ReactDOM.render(
    <>
        <h1>Hello world</h1>

        <button role='button' aria-labelledby='lalal'>
            Button

            { JSON.stringify(getAccessibilityAttributes('button', Button, { label: 'fff'})) }
        </button>

        <span { ...getAccessibilityAttributes('span', Button, { label: 'Button2' }) }>
            Button2
        </span>

        <div>
            <input
                type='checkbox'
                aria-label='Lalal'
                aria-checked='true'
                data-aa-class='Checkbox'
            />
            Lalal
        </div>

        <div { ...getAccessibilityAttributes('div', Checkbox, { checked: true }) }>
            Ololo
        </div>
    </>,

    document.getElementById('demo')
);

function getAccessibilityAttributes<P>(tagName: string, Class: Schema.AttributeSchemaClass<P>, params: P) {
    const attrs = new Class(tagName, params).getAttributes();

    if (attrs.tabindex !== undefined) {
        attrs.tabIndex = attrs.tabindex;
        delete attrs.tabindex;
    }

    return attrs;
}
