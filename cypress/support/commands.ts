/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

// ***********************************************
// For comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

import * as uuid from 'uuid'
import { getAuthenticatedRequest, UserConfig } from './css-authentication'

declare global {
  namespace Cypress {
    interface Chainable {
      createRandomAccount(): Chainable<UserConfig>
      authenticatedRequest(
        user: UserConfig,
        ...args: Parameters<typeof cy.request>
      ): Chainable<any>
    }
  }
}

Cypress.Commands.add(
  'createRandomAccount',
  function (): Cypress.Chainable<UserConfig> {
    const username = 'test-' + uuid.v4()
    const password = '12345'
    const email = username + '@example.org'
    const config = {
      idp: Cypress.env('cssUrl') + '/',
      podUrl: `${Cypress.env('cssUrl')}/${username}/`,
      webId: `${Cypress.env('cssUrl')}/${username}/profile/card#me`,
      username: username,
      password: password,
      email: email,
    }
    const registerEndpoint = Cypress.env('cssUrl') + '/idp/register/'
    cy.request('POST', registerEndpoint, {
      createWebId: 'on',
      webId: '',
      register: 'on',
      createPod: 'on',
      podName: username,
      email: email,
      password: password,
      confirmPassword: password,
    })

    return cy.wrap(config)
  },
)

Cypress.Commands.add(
  'authenticatedRequest',
  (user: UserConfig, ...args: Parameters<typeof cy.request>) => {
    return getAuthenticatedRequest(user).then(request => request(...args))
  },
)

/**
Some code is copied from solidcryptpad repository
https://github.com/solidcryptpad/solidcryptpad/blob/74f93fee06fcb93b454f6004863647ef11e9c24f/cypress/support/commands.ts

MIT License

Copyright (c) 2022 SolidCryptPad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/