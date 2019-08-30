/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttributeSchema } from 'ability-attributes';

export type AttributeSchemaClass<P> = new(tagName: string, props: P) => AttributeSchema<P>;

export class Accessibility<P> {
    private constructor(public readonly Class: AttributeSchemaClass<P>, public readonly props?: P) {
        // Making the constructor private and doing a hack in $A function to instantiate
        // this object.
        // For two reasons: proper type inference, future attempt to make a compile-time
        // transformation of the $A() call in order to validate the props and remove the
        // runtime overhead.
    }

    protected static _create<P>(Class: AttributeSchemaClass<P>, props?: P): Accessibility<P> {
        return new Accessibility(Class, props);
    }
}

export function $A<P>(Class: AttributeSchemaClass<P>, props: P): Accessibility<P> {
    return (Accessibility as any)._create(Class, props);
}

export function $AA<P>(Class: AttributeSchemaClass<P>): Accessibility<P> {
    return (Accessibility as any)._create(Class);
}
