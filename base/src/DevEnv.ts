/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssumptionSpecificity, AttributeSchemaClass, DevEnv, DevEnvSettings, WindowWithClassMap, WindowWithDevEnv } from './DevEnvTypes';
import { createElements, reportError as reportErrorBase } from './ErrorReporter';
import { HTMLElementAttributes } from './HTML';
import { setup as setupValidator } from './Validator';

export * from './DevEnvTypes';

export function setup(settings?: DevEnvSettings): void {
    if (!__DEV__) {
        return;
    }

    const w = ((settings && settings.window) || (typeof window !== 'undefined' ? window : undefined)) as WindowWithDevEnv;

    if (!w) {
        return;
    }

    if (!w.__abilityAttributesDev) {
        const els = createElements();

        if (els) {
            w.__abilityAttributesDev = {
                errorStyle: els.style,
                errorContainer: els.container,
                reportError: (message: string | null, element: HTMLElement | null, isRender: boolean): string | null => {
                    const env = getDevEnv(w);

                    if (env) {
                        if (env.errorStyle.parentNode !== w.document.body) {
                            w.document.body.appendChild(env.errorStyle);
                        }

                        if (env.errorContainer.parentNode !== w.document.body) {
                            w.document.body.appendChild(env.errorContainer);
                        }

                        return reportErrorBase(env, message, element, isRender);
                    }

                    return null;
                },
                lastErrorId: 0
            };

            const enforceClasses = (settings && settings.enforceClasses) !== false;
            const ignoreUnknownClasses = !!(settings && settings.ignoreUnknownClasses);

            setupValidator(
                w,
                w.__abilityAttributesDev.reportError,
                getClassByName,
                enforceClasses,
                assumeClass,
                ignoreUnknownClasses
            );
        }
    }
}

export function getDevEnv(win: Window): DevEnv | undefined {
    return (win as WindowWithDevEnv).__abilityAttributesDev;
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

        if (!win.__abilityAttributesDevClassMap) {
            win.__abilityAttributesDevClassMap = {};
        }

        if (win.__abilityAttributesDevClassMap[name]) {
            console.error(`Duplicate class '${ name }'`);
        } else {
            win.__abilityAttributesDevClassMap[name] = Class;
        }
    }
}

export function getClassByName(name: string): AttributeSchemaClass | undefined {
    if (__DEV__ && (typeof window !== 'undefined')) {
        const win = window as WindowWithClassMap;

        return win.__abilityAttributesDevClassMap ? win.__abilityAttributesDevClassMap[name] : undefined;
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
        const classes = win.__abilityAttributesDevClassMap;

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
