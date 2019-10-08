/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export type JSConstraintFunction = ((element: HTMLElement, value?: string | number | boolean | null) => boolean) & { schemaName: string };

export const checkIdentifiers: JSConstraintFunction = (element, value): boolean => {
    return typeof value === 'string' ? value.split(/\s+/).every(id => !!document.getElementById(id)) : false;
};
checkIdentifiers.schemaName = 'checkIdentifiers';

export const notEmpty: JSConstraintFunction = (element, value): boolean => {
    return (typeof value === 'string' ? value : '').trim() !== '';
};
notEmpty.schemaName = 'notEmpty';

export const equalsToAccessibilityLabelIfAny: JSConstraintFunction = (element, value) => {
    const ariaLabel = element.getAttribute('aria-label');

    if (ariaLabel) {
        return ariaLabel === value;
    }

    const ariaLabelledBy = element.getAttribute('aria-labelledby');

    if (ariaLabelledBy) {
        return true; // Temporarily don't try to calculate the label.
    }

    const innerText = element.innerText;

    return innerText ? innerText === value : true;
};
equalsToAccessibilityLabelIfAny.schemaName = 'equalsToAccessibilityLabelIfAny';
