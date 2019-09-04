/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttributeSchema } from 'ability-attributes';

export type AttributeSchemaClass<P> = new(tagName: string, props: P) => AttributeSchema<P>;

export class Accessibility<P> {
    private constructor(public readonly Class: AttributeSchemaClass<P>, public readonly props?: P) {
        // Making the constructor private and doing a hack in provideAccessibilityClass()
        // function to instantiate this object.
        // For two reasons: proper type inference, future attempt to make a compile-time
        // transformation of the provideAccessibilityClass() call in order to validate
        // the props and remove the runtime overhead.
    }

    protected static _create<P>(Class: AttributeSchemaClass<P>, props?: P): Accessibility<P> {
        return new Accessibility(Class, props);
    }
}

export function provideAccessibilityClassAndProps<P>(Class: AttributeSchemaClass<P>, props: P): Accessibility<P> {
    return (Accessibility as any)._create(Class, props);
}

export function provideAccessibilityClass<P>(Class: AttributeSchemaClass<P>): Accessibility<P> {
    return (Accessibility as any)._create(Class);
}
