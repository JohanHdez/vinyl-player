declare namespace Cypress {
  interface Chainable {
    searchSong(query: string): Chainable<void>;
  }
}

Cypress.Commands.add('searchSong', (query: string) => {
  cy.get('.search-input').clear().type(query);
  cy.get('.search-btn').click();
});
