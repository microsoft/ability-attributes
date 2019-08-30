/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssumptionSpecificity, AttributeSchemaClass, DevEnv, WindowWithClassMap, WindowWithDevEnv } from './DevEnvTypes';
import { createElements, reportError as reportErrorBase } from './ErrorReporter';
import { HTMLElementAttributes } from './HTML';
import { setup as setupValidator } from './Validator';

export * from './DevEnvTypes';

export function setup(win: Window, enforceClasses: boolean): void {
    if (!__DEV__) {
        return;
    }

    const w = win as WindowWithDevEnv;

    if (!w.__abilityHelpersDev) {
        const els = createElements();

        if (els) {
            w.__abilityHelpersDev = {
                errorStyle: els.style,
                errorContainer: els.container,
                reportError: (message: string | null, element: HTMLElement | null, isRender: boolean): string | null => {
                    const env = getDevEnv(win);

                    if (env) {
                        if (env.errorStyle.parentNode !== win.document.body) {
                            win.document.body.appendChild(env.errorStyle);
                        }

                        if (env.errorContainer.parentNode !== win.document.body) {
                            win.document.body.appendChild(env.errorContainer);
                        }

                        return reportErrorBase(env, message, element, isRender);
                    }

                    return null;
                },
                lastErrorId: 0
            };

            setupValidator(win, w.__abilityHelpersDev.reportError, getClassByName, enforceClasses, assumeClass);
        }
    }
}

export function getDevEnv(win: Window): DevEnv | undefined {
    return (win as WindowWithDevEnv).__abilityHelpersDev;
}

export function reportError(win: Window, message: string | null, element: HTMLElement | null, isRender: boolean): string | null {
    const env = getDevEnv(win);

    if (env) {
        return env.reportError(message, element, isRender);
    }

    return null;
}

export function addClass(name: string, Class: AttributeSchemaClass) {
    if (__DEV__ && (typeof window !== 'undefined')) {
        const win = window as WindowWithClassMap;

        if (!win.__abilityHelpersDevClassMap) {
            win.__abilityHelpersDevClassMap = {};
        }

        if (win.__abilityHelpersDevClassMap[name]) {
            console.error(`Duplicate class '${ name }'`);
        } else {
            win.__abilityHelpersDevClassMap[name] = Class;
        }
    }
}

export function getClassByName(name: string): AttributeSchemaClass | undefined {
    if (__DEV__ && (typeof window !== 'undefined')) {
        const win = window as WindowWithClassMap;

        return win.__abilityHelpersDevClassMap ? win.__abilityHelpersDevClassMap[name] : undefined;
    }

    return undefined;
}

interface AssumedClass {
    Class: AttributeSchemaClass;
    specificity: AssumptionSpecificity;
}

export function assumeClass(tagName: string, attributes: HTMLElementAttributes, element: HTMLElement | null,
        isRender: boolean): AttributeSchemaClass | undefined {

    if (__DEV__ && (typeof window !== 'undefined')) {
        const win = window as WindowWithClassMap;
        const classes = win.__abilityHelpersDevClassMap;

        if (classes) {
            const assumed: AssumedClass[] = [];

            for (let name of Object.keys(classes)) {
                const Class = classes[name];

                if (Class.assume) {
                    const specificity = Class.assume(tagName, attributes);

                    if (specificity) {
                        assumed.push({ Class, specificity });
                    }
                }
            }

            if (assumed.length === 0) {
                return undefined;
            }

            let hasEqualAssumptions: [AssumedClass, AssumedClass] | undefined;

            if (assumed.length > 1) {
                assumed.sort((a, b) => {
                    if (a.specificity.tag !== b.specificity.tag) {
                        return a.specificity.tag ? -1 : 1;
                    }

                    if (a.specificity.attributes !== b.specificity.attributes) {
                        return a.specificity.attributes < b.specificity.attributes ? -1 : 1;
                    }

                    hasEqualAssumptions = [a, b];

                    return 0;
                });
            }

            if (hasEqualAssumptions) {
                reportError(window, `Ambiguous class assumption: '${
                        hasEqualAssumptions[0].Class.className
                    }' and '${
                        hasEqualAssumptions[1].Class.className
                    }'`, element, isRender
                );

                return undefined;
            }

            return assumed[0].Class;
        }
    }

    return undefined;
}
