describe('Playlist functionality', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  it('should show empty playlist initially', () => {
    cy.get('.empty-state').should('be.visible');
    cy.get('.playlist-count').should('contain.text', '0 canciones');
  });

  it('should add a song to playlist using the + button', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-add-btn').click();

    cy.get('.playlist-item').should('have.length', 1);
    cy.get('.playlist-count').should('contain.text', '1 cancion');
    cy.get('.empty-state').should('not.exist');
  });

  it('should add multiple songs to playlist', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.result-item').eq(1).find('.result-add-btn').click();
    cy.get('.result-item').eq(2).find('.result-add-btn').click();

    cy.get('.playlist-item').should('have.length', 3);
    cy.get('.playlist-count').should('contain.text', '3 canciones');
  });

  it('should not add duplicate songs', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 1);

    // Try to add the same song again
    cy.get('.result-item').first().find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 1);

    // Toast should show "Ya esta en la lista"
    cy.get('.toast').should('contain.text', 'Ya esta en la lista');
  });

  it('should show song title, channel and thumbnail in playlist', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-add-btn').click();

    cy.get('.playlist-item').first().within(() => {
      cy.get('.pl-title').should('contain.text', 'Rick Astley');
      cy.get('.pl-channel').should('contain.text', 'Rick Astley');
      cy.get('.pl-thumb').should('have.attr', 'src').and('include', 'ytimg.com');
    });
  });

  it('should remove a song from playlist', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.result-item').eq(1).find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 2);

    // Hover to reveal remove button, then click it
    cy.get('.playlist-item').first().find('.pl-remove').click({ force: true });

    cy.get('.playlist-item').should('have.length', 1);
    cy.get('.playlist-count').should('contain.text', '1 cancion');
  });

  it('should show toast notification when adding a song', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-add-btn').click();

    cy.get('.toast').should('have.class', 'show');
    cy.get('.toast').should('contain.text', 'Agregada a la lista');
  });
});
