/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ATTRIBUTE_NAME_ERROR_ID, ATTRIBUTE_NAME_ERROR_MESSAGE, DevEnv } from './DevEnvTypes';

interface DivWithErrorMessages extends HTMLDivElement {
    __aaAddError?: (id: string, element: HTMLElement) => void;
    __aaGetError?: (id: string) => HTMLElement | undefined;
    __aaDismissError?: (element: HTMLElement, keepInDOM?: boolean) => void;
}

export interface ErrorReporterUI {
    style: HTMLStyleElement;
    container: HTMLDivElement;
}

let _lastId = 0;
let _lastDismissAllId = 0;

export function createElements(): ErrorReporterUI | undefined {
    if (!__DEV__) {
        return;
    }

    const style = document.createElement('style');

    style.appendChild(document.createTextNode(`
.aa-error-container {
    background: #e07777;
    bottom: 0;
    box-shadow: 0 0 4px rgba(0, 0, 0, .3);
    color: #000;
    font-family: Helvetica;
    font-size: 14px;
    left: 0;
    line-height: 20px;
    max-height: 205px;
    opacity: .95;
    overflow: scroll;
    position: fixed;
    right: 0;
    z-index: 2147483647;
}

.aa-error-container * {
    box-sizing: border-box;
}

.aa-error-message {
    border-top: 1px solid #ddd;
    clear: both;
    min-height: 24px;
    padding: 8px 16px 8px 36px;
    position: relative;
    z-index: 1;
}

.aa-error-message.aa-error-message_render {
    background: #bbb;
}

.aa-error-locator {
    color: #333;
    display: none;
    float: right;
    font-size: 80%;
}

.aa-error-locator.aa-error-locator_available {
    display: block;
}

.aa-error-dismiss {
    background: #987575;
    border-radius: 4px;
    border: 1px solid #ec99a8;
    color: #fff;
    cursor: pointer;
    height: 21px;
    left: 8px;
    margin-top: -10px;
    position: absolute;
    top: 50%;
    width: 21px;
}

.aa-error-dismiss:hover {
    background: #aa8a8a;
    color: #777;
}

.aa-error-dismiss::before {
    content: '×';
    left: 5px;
    line-height: 17px;
    position: absolute;
}

.aa-error-dismiss-all {
    background: #640d0d;
    border-bottom: none;
    border-radius: 10px 10px 2px 2px;
    border: 1px solid #ec99a8;
    bottom: 0;
    color: #fff;
    cursor: pointer;
    display: none;
    font-size: 80%;
    left: 50%;
    margin-left: -50px;
    opacity: .8;
    padding: 4px;
    position: fixed;
    text-align: center;
    width: 100px;
    z-index: 100500;
}`));

    const container = document.createElement('div') as DivWithErrorMessages;

    const elements: HTMLElement[] = [];
    let elementByErrorId: { [id: string]: HTMLElement } = {};

    container.__aaAddError = addError;
    container.__aaGetError = getError;
    container.__aaDismissError = dismissError;

    container.className = 'aa-error-container';

    const dismissAll = document.createElement('div');
    dismissAll.className = 'aa-error-dismiss-all';
    dismissAll.innerText = 'Dismiss all';

    container.appendChild(dismissAll);

    container.addEventListener('click', (e) => {
        let shouldDismiss = false;

        for (let n: HTMLElement | null = e.target as HTMLElement; n; n = n.parentElement) {
            if (n.classList) {
                if (n.classList.contains('aa-error-dismiss')) {
                    shouldDismiss = true;
                } else if (shouldDismiss && n.classList.contains('aa-error-message')) {
                    dismissError(n);
                    break;
                } else if (n.classList.contains('aa-error-dismiss-all')) {
                    _lastDismissAllId = _lastId;

                    let e: HTMLElement | undefined;

                    elementByErrorId = {};

                    while ((e = elements.pop())) {
                        if (container.contains(e)) {
                            container.removeChild(e);
                        }
                    }

                    break;
                }
            }
        }

        updateState();
    });

    container.addEventListener('dblclick', (e) => {
        for (let n: HTMLElement | null = e.target as HTMLElement; n; n = n.parentElement) {
            if (n.classList && n.classList.contains('aa-error-message')) {
                dismissError(n);
                break;
            }
        }

        updateState();
    });

    return {
        style,
        container
    };

    function updateState() {
        dismissAll.style.display = elements.length > 1 ? 'block' : 'none';
    }

    function addError(id: string, e: HTMLElement) {
        if (!elementByErrorId[id]) {
            elements.push(e);
            elementByErrorId[id] = e;
        }

        if (container.firstChild) {
            if (container.firstChild !== e) {
                container.insertBefore(e, container.firstChild);
            }
        } else {
            container.appendChild(e);
        }

        updateState();
    }

    function getError(id: string): HTMLElement | undefined {
        return elementByErrorId[id];
    }

    function dismissError(e: HTMLElement, keepInDOM?: boolean) {
        if (!keepInDOM && container.contains(e)) {
            container.removeChild(e);
        }

        const prevId = e.getAttribute(ATTRIBUTE_NAME_ERROR_ID);

        if (prevId) {
            delete elementByErrorId[prevId];
        }

        const index = elements.indexOf(e);

        if (index >= 0) {
            elements.splice(index, 1);

            updateState();
        }
    }
}

export function reportError(env: DevEnv, message: string | null, element: HTMLElement | null, isRender: boolean): string | null {
    if (!__DEV__) {
        return null;
    }

    const errorContainer = env.errorContainer as DivWithErrorMessages;

    if (!errorContainer.__aaAddError || !errorContainer.__aaGetError || !errorContainer.__aaDismissError) {
        return null;
    }

    const prevId = element ? element.getAttribute(ATTRIBUTE_NAME_ERROR_ID) : null;
    let errorElement: HTMLElement | undefined;
    let errorText: HTMLElement | undefined;
    let errorLocator: HTMLElement | undefined;

    if (prevId) {
        errorElement = errorContainer.__aaGetError(prevId);
    }

    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'aa-error-message' + (isRender ? ' aa-error-message_render' : '');

        const dismiss = document.createElement('div');
        dismiss.className = 'aa-error-dismiss';
        errorElement.appendChild(dismiss);

        errorText = document.createElement('span');
        errorElement.appendChild(errorText);

        errorLocator = document.createElement('div');
        errorElement.appendChild(errorLocator);
    } else {
        const dismiss = errorElement.firstChild as HTMLElement;

        if (dismiss) {
            errorText = dismiss.nextSibling as HTMLElement;
        }

        if (errorText) {
            errorLocator = errorText.nextSibling as HTMLElement;
        }
    }

    if (!errorText || !errorLocator) {
        return null;
    }

    if (!message) {
        if (prevId) {
            errorContainer.__aaDismissError(errorElement);

            if (element) {
                element.removeAttribute(ATTRIBUTE_NAME_ERROR_ID);
                element.removeAttribute(ATTRIBUTE_NAME_ERROR_MESSAGE);
            }
        }

        return null;
    }

    let errorId: string;
    const sameError = element ? (element.getAttribute(ATTRIBUTE_NAME_ERROR_MESSAGE) === message) : (errorText.innerText === message);

    if (sameError && prevId) {
        if (_lastDismissAllId > parseInt(prevId, 10)) {
            return null;
        }

        errorId = prevId;
    } else {
        errorContainer.__aaDismissError(errorElement, true);

        errorElement.className = 'aa-error-message' + (isRender ? ' aa-error-message_render' : '');
        errorText.innerText = message;

        errorId = ++env.lastErrorId + '';
        const locator = `\$('[${ ATTRIBUTE_NAME_ERROR_ID }="${ errorId }"]')`;

        errorLocator.innerText = locator;

        errorElement.setAttribute(ATTRIBUTE_NAME_ERROR_ID, errorId);

        if (element) {
            element.setAttribute(ATTRIBUTE_NAME_ERROR_ID, errorId);
            element.setAttribute(ATTRIBUTE_NAME_ERROR_MESSAGE, message);
        }

        console.error(`${ message }\n\n${ locator }`);
    }

    errorText.innerText = message;

    const locator = `\$('[${ ATTRIBUTE_NAME_ERROR_ID }="${ errorId }"]')`;
    errorLocator.innerText = locator;

    errorElement.setAttribute(ATTRIBUTE_NAME_ERROR_ID, errorId);

    errorLocator.className = 'aa-error-locator' + (element ? ' aa-error-locator_available' : '');

    errorContainer.__aaAddError(errorId, errorElement);

    _lastId = env.lastErrorId;

    return errorId + '';
}
