describe('Layout transitions', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  it('should show landing layout on initial load', () => {
    // Header visible
    cy.contains('VINYL PLAYER').should('be.visible');

    // Trending grid visible
    cy.get('.trending-section').should('be.visible');
    cy.get('.trending-card').should('have.length.greaterThan', 0);

    // No turntable or bottom bar
    cy.get('.turntable').should('not.exist');
    cy.get('.bottom-bar').should('not.exist');
  });

  it('should show trending grid with song cards', () => {
    cy.get('.trending-grid').should('be.visible');
    cy.get('.trending-card').first().within(() => {
      cy.get('.card-title').should('be.visible');
      cy.get('.card-channel').should('be.visible');
      cy.get('.card-thumb').should('be.visible');
      cy.get('.card-add-btn').should('be.visible');
    });
  });

  it('should switch to playing layout when a song is played', () => {
    // Play a trending song
    cy.get('.trending-card').first().click();

    // Should switch to playing layout
    cy.get('.turntable').should('be.visible');
    cy.get('.bottom-bar').should('be.visible');
    cy.get('.playing-content').should('be.visible');
    cy.get('.landing-content').should('not.exist');
  });

  it('should show turntable on left and playlist on right in playing mode', () => {
    cy.get('.trending-card').first().click();

    cy.get('.turntable-col').should('be.visible');
    cy.get('.playlist-col').should('be.visible');
  });

  it('should show player controls in fixed bottom bar', () => {
    cy.get('.trending-card').first().click();

    cy.get('.bottom-bar').should('be.visible');
    cy.get('.bottom-bar').within(() => {
      cy.get('.play-btn').should('be.visible');
      cy.get('.progress-bar').should('be.visible');
      cy.get('.song-title').should('be.visible');
    });
  });

  it('should hide trending when search results are visible', () => {
    cy.get('.trending-section').should('be.visible');

    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    // Trending hidden, search results visible
    cy.get('.trending-section').should('not.exist');
    cy.get('.result-item').should('have.length', 5);
  });

  it('should add trending song to playlist without playing', () => {
    cy.get('.trending-card').first().find('.card-add-btn').click();

    // Should add to playlist but stay in landing mode
    cy.get('.playlist-item').should('have.length', 1);
    cy.get('.landing-content').should('be.visible');
    cy.get('.turntable').should('not.exist');
  });

  it('should show Empezar Jam button in playing mode', () => {
    cy.get('.trending-card').first().click();
    cy.get('.jam-btn').should('be.visible').and('contain.text', 'Empezar Jam');
  });
});
