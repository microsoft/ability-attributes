/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttributeSchema } from './Base';
import { HTMLElementAttributes } from './HTML';

export const ATTRIBUTE_NAME_CLASS = 'data-ah-class';
export const ATTRIBUTE_NAME_ERROR_ID = 'data-ah-error-id';
export const ATTRIBUTE_NAME_ERROR_MESSAGE = 'data-ah-error-message';
export const ATTRIBUTE_NAME_PROPS = 'data-ah-props';

export type ErrorReporter = (message: string | null, element: HTMLElement | null, isRender: boolean) => string | null;

export type AssumptionSpecificity = { tag: boolean; attributes: number; };

export type AssumeClass = (tagName: string, attributes: HTMLElementAttributes, element: HTMLElement | null,
    isRender: boolean) => AttributeSchemaClass | undefined ;

export interface AttributeSchemaClass<P = any> {
    new (tagName: string, params?: P): AttributeSchema<P>;
    className: string;
    fromAttributes(tagName: string, attributes: HTMLElementAttributes): AttributeSchema<P>;
    assume?: (tagName: string, attributes: HTMLElementAttributes) => AssumptionSpecificity | undefined;
}

export interface DevEnv {
    errorStyle: HTMLStyleElement;
    errorContainer: HTMLDivElement;
    reportError: ErrorReporter;
    lastErrorId: number;
    lastDismissAllId?: number;
}

export interface WindowWithDevEnv extends Window {
    __abilityHelpersDev?: DevEnv;
}

export interface WindowWithClassMap extends Window {
    __abilityHelpersDevClassMap?: { [name: string]: AttributeSchemaClass };
}
