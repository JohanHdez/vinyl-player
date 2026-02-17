describe('Full integration flow', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/video-info', {
      fixture: 'video-info.json',
    }).as('videoInfo');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  it('should complete the full flow: search → add → play → controls', () => {
    // Step 1: App loads with header and trending grid (no turntable yet)
    cy.contains('VINYL PLAYER').should('be.visible');
    cy.get('.trending-section').should('be.visible');

    // Step 2: Search for songs
    cy.get('.search-input').type('Rick Astley{enter}');
    cy.wait('@searchApi');
    cy.get('.result-item').should('have.length', 5);

    // Step 3: Add 3 songs to playlist
    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.result-item').eq(1).find('.result-add-btn').click();
    cy.get('.result-item').eq(2).find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 3);
    cy.get('.playlist-count').should('contain.text', '3 canciones');

    // Step 4: Play first song from playlist - layout should switch to playing mode
    cy.get('.playlist-item').first().click();
    cy.get('.playlist-item').first().should('have.class', 'active');
    cy.get('.song-title').should('contain.text', 'Rick Astley');
    cy.get('.turntable').should('be.visible');

    // Step 5: Switch to second song
    cy.get('.playlist-item').eq(1).click();
    cy.get('.playlist-item').eq(1).should('have.class', 'active');
    cy.get('.song-title').should('contain.text', 'PSY - GANGNAM STYLE');

    // Step 6: Toggle shuffle
    cy.get('[title="Aleatorio"]').click();
    cy.get('[title="Aleatorio"]').should('have.class', 'active');

    // Step 7: Toggle repeat
    cy.get('[title="Repetir"]').click();
    cy.get('[title="Repetir"]').should('have.class', 'active');

    // Step 8: Remove a song
    cy.get('.playlist-item').eq(2).find('.pl-remove').click({ force: true });
    cy.get('.playlist-item').should('have.length', 2);
    cy.get('.playlist-count').should('contain.text', '2 canciones');
  });

  it('should play directly from a YouTube URL', () => {
    cy.get('.search-input').type('https://www.youtube.com/watch?v=dQw4w9WgXcQ{enter}');
    cy.wait('@videoInfo');

    // Should add and start playing immediately, switching to playing layout
    cy.get('.playlist-item').should('have.length', 1);
    cy.get('.song-title').should('contain.text', 'Rick Astley - Never Gonna Give You Up');
    cy.get('.playlist-item').first().should('have.class', 'active');
    cy.get('.turntable').should('be.visible');
  });

  it('should handle multiple searches and accumulate playlist', () => {
    // First search
    cy.get('.search-input').type('test1{enter}');
    cy.wait('@searchApi');
    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 1);

    // Second search
    cy.get('.search-input').clear().type('test2{enter}');
    cy.wait('@searchApi');
    cy.get('.result-item').eq(1).find('.result-add-btn').click();
    cy.get('.playlist-item').should('have.length', 2);

    // Playlist persists across searches
    cy.get('.playlist-item').first().find('.pl-title')
      .should('contain.text', 'Rick Astley');
    cy.get('.playlist-item').eq(1).find('.pl-title')
      .should('contain.text', 'PSY');
  });

  it('should show search results panel only after searching', () => {
    // Initially trending grid visible, no search results panel
    cy.get('.trending-section').should('be.visible');
    cy.get('app-search-results .panel-card').should('not.exist');

    // After search, results panel appears
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');
    cy.get('app-search-results .panel-card').should('be.visible');
  });
});
