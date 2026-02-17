describe('Jam feature', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  it('should show Empezar Jam button after playing a song', () => {
    // Play a song to enter playing mode
    cy.get('.trending-card').first().click();

    cy.get('.jam-btn').should('be.visible');
    cy.get('.jam-btn').should('contain.text', 'Empezar Jam');
  });

  it('should not show jam button on landing page', () => {
    cy.get('.jam-btn').should('not.exist');
  });

  it('should open jam join dialog when URL has jam parameter', () => {
    cy.visit('/?jam=ABC123');

    cy.get('.jam-join-overlay').should('be.visible');
    cy.get('.field-input').first().should('have.value', 'ABC123');
  });

  it('should close jam join dialog on cancel', () => {
    cy.visit('/?jam=ABC123');

    cy.get('.jam-join-overlay').should('be.visible');
    cy.get('.cancel-btn').click();
    cy.get('.jam-join-overlay').should('not.exist');
  });
});
