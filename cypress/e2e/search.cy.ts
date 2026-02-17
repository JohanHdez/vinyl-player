describe('Search functionality', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  it('should display the search bar', () => {
    cy.get('.search-input').should('be.visible');
    cy.get('.search-btn').should('be.visible').and('contain.text', 'Buscar');
  });

  it('should search and display results when clicking the button', () => {
    cy.get('.search-input').type('Rick Astley');
    cy.get('.search-btn').click();

    cy.wait('@searchApi');

    cy.get('.result-item').should('have.length', 5);
    cy.get('.result-item').first().find('.result-title').should('contain.text', 'Rick Astley');
    cy.get('.result-item').first().find('.result-channel').should('contain.text', 'Rick Astley');
  });

  it('should search when pressing Enter', () => {
    cy.get('.search-input').type('Despacito{enter}');

    cy.wait('@searchApi');

    cy.get('.result-item').should('have.length.greaterThan', 0);
  });

  it('should show thumbnails for each result', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-thumb').should('have.attr', 'src')
      .and('include', 'ytimg.com');
  });

  it('should show add-to-playlist button on each result', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().find('.result-add-btn').should('be.visible');
  });

  it('should handle empty search gracefully', () => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      body: { items: [] },
    }).as('emptySearch');

    cy.get('.search-input').type('xyznonexistent{enter}');
    cy.wait('@emptySearch');

    cy.get('.result-item').should('have.length', 0);
  });

  it('should handle API errors gracefully', () => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      statusCode: 502,
      body: { error: 'Bad Gateway' },
    }).as('errorSearch');

    cy.get('.search-input').type('test{enter}');
    cy.wait('@errorSearch');

    cy.get('.result-item').should('have.length', 0);
  });

  it('should detect and handle YouTube URLs directly', () => {
    cy.intercept('POST', 'http://localhost:3001/api/video-info', {
      fixture: 'video-info.json',
    }).as('videoInfo');

    cy.get('.search-input').type('https://www.youtube.com/watch?v=dQw4w9WgXcQ{enter}');
    cy.wait('@videoInfo');

    // Should add directly to playlist and start playing
    cy.get('.playlist-item').should('have.length', 1);
    cy.get('.playlist-item').first().find('.pl-title')
      .should('contain.text', 'Rick Astley - Never Gonna Give You Up');
  });
});
