/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ATTRIBUTE_NAME_ERROR_ID, ATTRIBUTE_NAME_ERROR_MESSAGE, DevEnv } from './DevEnvTypes';

interface DivWithErrorMessages extends HTMLDivElement {
    __ahAddError?: (id: string, element: HTMLElement) => void;
    __ahGetError?: (id: string) => HTMLElement | undefined;
    __ahDismissError?: (element: HTMLElement, keepInDOM?: boolean) => void;
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
.ah-error-container {
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

.ah-error-container * {
    box-sizing: border-box;
}

.ah-error-message {
    border-top: 1px solid #ddd;
    clear: both;
    min-height: 24px;
    padding: 8px 16px 8px 36px;
    position: relative;
    z-index: 1;
}

.ah-error-message.ah-error-message_render {
    background: #bbb;
}

.ah-error-locator {
    color: #333;
    display: none;
    float: right;
    font-size: 80%;
}

.ah-error-locator.ah-error-locator_available {
    display: block;
}

.ah-error-dismiss {
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

.ah-error-dismiss:hover {
    background: #aa8a8a;
    color: #777;
}

.ah-error-dismiss::before {
    content: '×';
    left: 5px;
    line-height: 17px;
    position: absolute;
}

.ah-error-dismiss-all {
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

    container.__ahAddError = addError;
    container.__ahGetError = getError;
    container.__ahDismissError = dismissError;

    container.className = 'ah-error-container';

    const dismissAll = document.createElement('div');
    dismissAll.className = 'ah-error-dismiss-all';
    dismissAll.innerText = 'Dismiss all';

    container.appendChild(dismissAll);

    container.addEventListener('click', (e) => {
        let shouldDismiss = false;

        for (let n: HTMLElement | null = e.target as HTMLElement; n; n = n.parentElement) {
            if (n.classList) {
                if (n.classList.contains('ah-error-dismiss')) {
                    shouldDismiss = true;
                } else if (shouldDismiss && n.classList.contains('ah-error-message')) {
                    dismissError(n);
                    break;
                } else if (n.classList.contains('ah-error-dismiss-all')) {
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
            if (n.classList && n.classList.contains('ah-error-message')) {
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

    if (!errorContainer.__ahAddError || !errorContainer.__ahGetError || !errorContainer.__ahDismissError) {
        return null;
    }

    const prevId = element ? element.getAttribute(ATTRIBUTE_NAME_ERROR_ID) : null;
    let errorElement: HTMLElement | undefined;
    let errorText: HTMLElement | undefined;
    let errorLocator: HTMLElement | undefined;

    if (prevId) {
        errorElement = errorContainer.__ahGetError(prevId);
    }

    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'ah-error-message' + (isRender ? ' ah-error-message_render' : '');

        const dismiss = document.createElement('div');
        dismiss.className = 'ah-error-dismiss';
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
            errorContainer.__ahDismissError(errorElement);

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
        errorContainer.__ahDismissError(errorElement, true);

        errorElement.className = 'ah-error-message' + (isRender ? ' ah-error-message_render' : '');
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

    errorLocator.className = 'ah-error-locator' + (element ? ' ah-error-locator_available' : '');

    errorContainer.__ahAddError(errorId, errorElement);

    _lastId = env.lastErrorId;

    return errorId + '';
}
