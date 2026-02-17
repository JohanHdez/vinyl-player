describe('Player controls and turntable', () => {
  beforeEach(() => {
    cy.intercept('POST', 'http://localhost:3001/api/search', {
      fixture: 'search-results.json',
    }).as('searchApi');

    cy.intercept('POST', 'http://localhost:3001/api/trending', {
      fixture: 'trending-results.json',
    }).as('trendingApi');

    cy.visit('/');
  });

  // Helper: search and play a song to enter playing mode
  function playSongFirst() {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');
    cy.get('.result-item').first().click();
  }

  it('should NOT display turntable on landing (no song selected)', () => {
    cy.get('.turntable').should('not.exist');
  });

  it('should display turntable after selecting a song', () => {
    playSongFirst();
    cy.get('.turntable').should('be.visible');
    cy.get('.vinyl').should('be.visible');
    cy.get('.tonearm').should('be.visible');
  });

  it('should show song info in bottom bar after playing', () => {
    playSongFirst();
    cy.get('.song-title').should('contain.text', 'Rick Astley - Never Gonna Give You Up');
    cy.get('.song-artist').should('contain.text', 'Rick Astley');
  });

  it('should display all control buttons in bottom bar', () => {
    playSongFirst();
    cy.get('.play-btn').should('be.visible');
    cy.get('[title="Anterior"]').should('be.visible');
    cy.get('[title="Siguiente"]').should('be.visible');
    cy.get('[title="Aleatorio"]').should('be.visible');
    cy.get('[title="Repetir"]').should('be.visible');
  });

  it('should display volume slider in bottom bar', () => {
    playSongFirst();
    cy.get('.volume-slider').should('be.visible');
  });

  it('should display progress bar at 0', () => {
    playSongFirst();
    cy.get('.progress-bar').should('be.visible');
    cy.get('.progress-fill').should('have.css', 'width', '0px');
  });

  it('should toggle shuffle mode', () => {
    playSongFirst();
    cy.get('[title="Aleatorio"]').click();
    cy.get('[title="Aleatorio"]').should('have.class', 'active');
    cy.get('.toast').should('contain.text', 'Aleatorio activado');

    cy.get('[title="Aleatorio"]').click();
    cy.get('[title="Aleatorio"]').should('not.have.class', 'active');
    cy.get('.toast').should('contain.text', 'Aleatorio desactivado');
  });

  it('should toggle repeat mode', () => {
    playSongFirst();
    cy.get('[title="Repetir"]').click();
    cy.get('[title="Repetir"]').should('have.class', 'active');
    cy.get('.toast').should('contain.text', 'Repetir activado');

    cy.get('[title="Repetir"]').click();
    cy.get('[title="Repetir"]').should('not.have.class', 'active');
    cy.get('.toast').should('contain.text', 'Repetir desactivado');
  });

  it('should start playing when clicking a result (song title updates)', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').first().click();

    cy.get('.song-title').should('contain.text', 'Rick Astley - Never Gonna Give You Up');
    cy.get('.song-artist').should('contain.text', 'Rick Astley');
  });

  it('should highlight the active song in the playlist', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.result-item').eq(1).find('.result-add-btn').click();

    cy.get('.playlist-item').first().click();

    cy.get('.playlist-item').first().should('have.class', 'active');
    cy.get('.playlist-item').eq(1).should('not.have.class', 'active');
  });

  it('should switch active song when clicking another in playlist', () => {
    cy.get('.search-input').type('test{enter}');
    cy.wait('@searchApi');

    cy.get('.result-item').eq(0).find('.result-add-btn').click();
    cy.get('.result-item').eq(1).find('.result-add-btn').click();

    cy.get('.playlist-item').first().click();
    cy.get('.playlist-item').first().should('have.class', 'active');

    cy.get('.playlist-item').eq(1).click();
    cy.get('.playlist-item').eq(1).should('have.class', 'active');
    cy.get('.playlist-item').first().should('not.have.class', 'active');

    cy.get('.song-title').should('contain.text', 'PSY - GANGNAM STYLE');
  });
});
