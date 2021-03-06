/*
 * Copyright (c) 2018-2020 Swiss Federal Railways
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 *  SPDX-License-Identifier: EPL-2.0
 */
import { $, browser, ElementFinder, Key, logging, protractor, WebElement } from 'protractor';
import { SciListItemPO } from '@scion/toolkit.internal/widgets.po';
import Entry = logging.Entry;
import Level = logging.Level;

/**
 * Returns if given CSS class is present on given element.
 */
export async function isCssClassPresent(elementFinder: ElementFinder, cssClass: string): Promise<boolean> {
  const classes: string[] = await getCssClasses(elementFinder);
  return classes.includes(cssClass);
}

/**
 * Returns css classes on given element.
 */
export async function getCssClasses(elementFinder: ElementFinder): Promise<string[]> {
  const classAttr: string = await elementFinder.getAttribute('class');
  return classAttr.split(/\s+/);
}

/**
 * Sends the given keys to the currently focused element.
 */
export async function sendKeys(...keys: string[]): Promise<void> {
  return browser.actions().sendKeys(...keys).perform();
}

/**
 * Enters the given text into the given input field.
 *
 * By default, the text is set directly as input to the field, because 'sendKeys' is very slow.
 */
export async function enterText(text: string, elementFinder: ElementFinder, inputStrategy: 'sendKeys' | 'setValue' = 'setValue'): Promise<void> {
  switch (inputStrategy) {
    case 'sendKeys': { // send keys is slow for long texts
      await elementFinder.clear();
      await elementFinder.click();
      await sendKeys(text);
      break;
    }
    case 'setValue': {
      // fire the 'input' event manually because not fired when setting the value with javascript
      await elementFinder.click();
      await browser.executeScript('arguments[0].value=arguments[1]; arguments[0].dispatchEvent(new Event(\'input\'));', elementFinder.getWebElement(), text);
      await sendKeys(Key.TAB);
      break;
    }
    default: {
      throw Error('[UnsupportedStrategyError] Input strategy not supported.');
    }
  }
}

/**
 * Sets an attribute of the given name and value on the specified element.
 */
export async function setAttribute(elementFinder: ElementFinder, name: string, value: string): Promise<void> {
  await browser.executeScript('arguments[0].setAttribute(arguments[1], arguments[2]);', elementFinder.getWebElement(), name, value);
}

/**
 * Removes the given attribute from the specified element.
 */
export async function removeAttribute(elementFinder: ElementFinder, name: string): Promise<void> {
  await browser.executeScript('arguments[0].removeAttribute(arguments[1]);', elementFinder.getWebElement(), name);
}

/**
 * Due to an issue with the Selenium WebDriver, elements within an iframe cannot be clicked if the iframe is part of a shadow DOM.
 *
 * Error: 'Failed: unknown error: no element reference returned by script'.
 *
 * This fix patches {@link WebElement#click} and {@link ElementFinder#click} methods and clicks the element programmatically
 * through a script.
 *
 * ---
 * Protractor: 5.4.2
 * Chrome: 79.0.3945.0
 * Chrome WebDriver: 79.0.3945.0 // webdriver-manager update --versions.chrome=79.0.3945.0
 * Puppeteer: 2.0.0 // Chrome 79
 *
 * ---
 * See related issues:
 * https://stackoverflow.com/q/51629411
 * https://stackoverflow.com/q/58872973
 */
export function seleniumWebDriverClickFix(): SeleniumWebDriverClickFix {
  const elementFinderClickFn = ElementFinder.prototype.click;
  const webElementClickFn = WebElement.prototype.click;
  const sciListItemPOClickFn = SciListItemPO.prototype.clickAction;

  return new class implements SeleniumWebDriverClickFix { // tslint:disable-line:new-parens
    public install(): this {
      ElementFinder.prototype.click = async function(): Promise<void> {
        await click(this.getWebElement());
      };
      WebElement.prototype.click = async function(): Promise<void> {
        await click(this);
      };
      SciListItemPO.prototype.clickAction = async function(cssClass: string): Promise<void> {
        const actionButtonFinder = this.actionsFinder.$$(`button.${cssClass}`).first();
        // hovering the action is not necessary as being clicked through script
        await click(actionButtonFinder.getWebElement());
      };
      return this;
    }

    public uninstall(): void {
      ElementFinder.prototype.click = elementFinderClickFn;
      WebElement.prototype.click = webElementClickFn;
      SciListItemPO.prototype.clickAction = sciListItemPOClickFn;
    }
  };
}

/**
 * Repairs clicking DOM elements contained in an iframe part of a shadow DOM.
 */
export interface SeleniumWebDriverClickFix {
  install(): this;

  uninstall(): void;
}

/**
 * Due to an issue with the Selenium WebDriver, elements within an iframe cannot be clicked if the iframe is part of a shadow DOM.
 *
 * Error: 'Failed: unknown error: no element reference returned through a script'.
 *
 * This method clicks the element returned by the {@link ElementFinder} programmatically via script.
 *
 * ---
 * Protractor: 5.4.2
 * Chrome: 79.0.3945.0
 * Chrome WebDriver: 79.0.3945.0 // webdriver-manager update --versions.chrome=79.0.3945.0
 * Puppeteer: 2.0.0 // Chrome 79
 *
 * ---
 * See related issues:
 * https://stackoverflow.com/q/51629411
 * https://stackoverflow.com/q/58872973
 */
async function click(element: WebElement): Promise<void> {
  const script = `
    if (arguments[0].tagName === 'INPUT' && arguments[0].type === 'text') {
      arguments[0].focus();
    }
    else if (arguments[0].tagName === 'TEXTAREA') {
      arguments[0].focus();
    }
    else if (arguments[0].tagName === 'OPTION') {
      arguments[0].selected = true;
      // fire the 'change' event manually because not fired when selecting the option with javascript
      arguments[0].parentElement.dispatchEvent(new Event('change'));
    }
    else {
      arguments[0].click();
    }`;
  await browser.executeScript(script, element);
}

/**
 * Selects an option of a select dropdown.
 */
export async function selectOption(value: string, selectField: ElementFinder): Promise<void> {
  await selectField.$(`option[value="${value}"`).click();
}

/**
 * Finds an element in the given list supporting returning a promise in the predicate.
 */
export async function findAsync<T>(items: T[], predicate: (item: T) => Promise<boolean>): Promise<T | undefined> {
  for (const item of items) {
    if (await predicate(item)) {
      return item;
    }
  }
  return undefined;
}

/**
 * Expects the given function to be rejected.
 *
 * Jasmine 3.5 provides 'expectAsync' expectation with the 'toBeRejectedWithError' matcher.
 * But, it does not support to test against a regular expression.
 * @see https://jasmine.github.io/api/3.5/async-matchers.html
 */
export function expectToBeRejectedWithError(promise: Promise<any>, expected?: RegExp): Promise<void> {
  const reasonExtractorFn = (reason: any): string => {
    if (typeof reason === 'string') {
      return reason;
    }
    if (reason instanceof Error) {
      return reason.message;
    }
    return reason.toString();
  };

  return promise
    .then(() => fail('Promise expected to be rejected but was resolved.'))
    .catch(reason => {
      if (expected && !reasonExtractorFn(reason).match(expected)) {
        fail(`Expected promise to be rejected with a reason matching '${expected.source}', but was '${reason}'.`);
      }
      else {
        expect(true).toBeTruthy();
      }
    });
}

/**
 * Expects the resolved map to contain at least the given map entries.
 *
 * Jasmine 3.5 provides 'mapContaining' matcher.
 */
export function expectMap(actual: Promise<Map<any, any>>): ToContainMatcher & { not: ToContainMatcher } {
  return {
    toContain: async (expected: Map<any, any>): Promise<void> => {
      const expectedTuples = [...expected];
      const actualTuples = [...await actual];
      await expect(actualTuples).toEqual(jasmine.arrayContaining(expectedTuples));
    },
    not: {
      toContain: async (expected: Map<any, any>): Promise<void> => {
        const expectedTuples = [...expected];
        const actualTuples = [...await actual];
        await expect(actualTuples).not.toEqual(jasmine.arrayContaining(expectedTuples));
      },
    },
  };
}

export interface ToContainMatcher {
  toContain(expected: Map<any, any>): Promise<void>;
}

/**
 * Reads the element value of the given element.
 */
export function getInputValue(elementFinder: ElementFinder): Promise<any> {
  return browser.executeScript('return arguments[0].value', elementFinder.getWebElement()) as Promise<any>;
}

/**
 * Reads the errors from the browser console.
 * Note that log buffers are reset after this call.
 */
export async function browserErrors(): Promise<Entry[]> {
  const logs = await browser.manage().logs().get('browser');
  return logs.filter(log => log.level === Level.SEVERE);
}

/**
 * Instructs Protractor to disable Angular synchronization while running the given function.
 */
export async function runOutsideAngularSynchronization<T = void>(fn: () => Promise<T>): Promise<T> {
  const waitForAngularEnabled = await browser.waitForAngularEnabled();
  await browser.waitForAngularEnabled(false);
  try {
    return await fn();
  }
  finally {
    await browser.waitForAngularEnabled(waitForAngularEnabled);
  }
}

/**
 * Invoke this method to wait until Protractor can detect the application as Angular application, if any.
 *
 * Since Angular 9 it may happen that Protractor does not recognize a starting Angular application as such if the Angular application has
 * asynchronous app initializers and is is embedded in an iframe. This causes the following error: 'Both AngularJS testability and Angular
 * testability are undefined'.
 */
export async function waitUntilTestingAppInteractableElseNoop(): Promise<void> {
  await runOutsideAngularSynchronization(async () => {
    // Check if the marker attribute 'data-sci-testing-app' is present, indicating that it is the testing application.
    const testingApp = await $('body[data-sci-testing-app]').isPresent();
    if (testingApp) {
      await browser.wait(protractor.ExpectedConditions.presenceOf($('*[ng-version]')));
    }
  });
}

/**
 * Switches the WebDriver execution context to the given iframe. When resolved, future Protractor commands are sent to that iframe.
 */
export async function switchToIframe(iframe: WebElement): Promise<void> {
  await browser.switchTo().frame(iframe);
  // If the iframe mounts the testing application, wait until Angular finished initialization, that is until asynchronous APP_INITIALIZERs completed.
  // Otherwise, Protractor throws errors like 'Both AngularJS testability and Angular testability are undefined'.
  await waitUntilTestingAppInteractableElseNoop();
}

/**
 * Moves backwards in the browser history.
 */
export async function browserNavigateBack(): Promise<void> {
  await browser.navigate().back();
  await waitUntilTestingAppInteractableElseNoop();
}

/**
 * Waits until the location of the currently active execution context matches the given URL (exact match), or throws an error if not entering that location within 5 seconds.
 */
export async function waitUntilLocation(url: string): Promise<void> {
  const expiryDate = Date.now() + 5000;
  while (true) {
    const currentUrl = await getUrlOfCurrentWebDriverExecutionContext();
    if (currentUrl === url) {
      break;
    }
    if (Date.now() > expiryDate) {
      throw Error(`[SpecTimeoutError] Timeout elapsed while waiting for the URL to be '${url}' [actual=${currentUrl}]`);
    }
  }
  await waitUntilTestingAppInteractableElseNoop();
}

/**
 * URL of the currently active WebDriver execution context.
 */
export async function getUrlOfCurrentWebDriverExecutionContext(): Promise<string> {
  return runOutsideAngularSynchronization((): Promise<string> => browser.executeScript('return window.location.href') as Promise<string>);
}

