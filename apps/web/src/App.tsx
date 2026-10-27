import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { AuthView } from './components/auth/AuthView.js';
import { CharacterList } from './components/characters/CharacterList.js';
import { CharacterSheetView } from './components/characters/CharacterSheetView.js';
import { CampaignList } from './components/campaigns/CampaignList.js';
import { CampaignDetail } from './components/campaigns/CampaignDetail.js';

type AppView = 'characters' | 'character-sheet' | 'campaigns' | 'campaign-detail';

const MainLayout: React.FC = () => {
  const { user, loading, logout } = useAuth();

  const [currentView, setCurrentView] = useState<AppView>('characters');
  const [previousView, setPreviousView] = useState<AppView>('characters');

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [characterReadOnly, setCharacterReadOnly] = useState<boolean>(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--bg-main)',
        }}
      >
        <div className="spinner" style={{ width: '36px', height: '36px' }} />
        <p style={{ marginTop: '1.25rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-fantasy)' }}>
          Cargando reino de rol...
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const handleOpenCharacter = (charId: string, readOnly = false, fromView: AppView = currentView) => {
    setSelectedCharacterId(charId);
    setCharacterReadOnly(readOnly);
    setPreviousView(fromView);
    setCurrentView('character-sheet');
  };

  const handleOpenCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setCurrentView('campaign-detail');
  };

  return (
    <div className="app-container">
      {/* Barra de Navegación Principal */}
      <header className="navbar">
        <div className="navbar-inner">
          <div
            className="navbar-brand"
            onClick={() => setCurrentView('characters')}
          >
            <div className="logo-icon">D&amp;D</div>
            <span>BurgosLabs Rol</span>
          </div>

          <nav className="navbar-nav">
            <button
              className={`nav-link ${
                currentView === 'characters' ||
                (currentView === 'character-sheet' && previousView === 'characters')
                  ? 'active'
                  : ''
              }`}
              onClick={() => setCurrentView('characters')}
            >
              <span>⚔️</span>
              <span>Mis Fichas</span>
            </button>

            <button
              className={`nav-link ${
                currentView === 'campaigns' ||
                currentView === 'campaign-detail' ||
                (currentView === 'character-sheet' && previousView === 'campaign-detail')
                  ? 'active'
                  : ''
              }`}
              onClick={() => setCurrentView('campaigns')}
            >
              <span>🏰</span>
              <span>Campañas</span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                marginLeft: '0.5rem',
                borderLeft: '1px solid var(--border-subtle)',
                paddingLeft: '0.75rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '120px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={user.email}
              >
                {user.displayName}
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => void logout()}
                title="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Contenido Dinámico de la Aplicación */}
      <main className="main-content">
        {currentView === 'characters' && (
          <CharacterList onSelectCharacter={(id) => handleOpenCharacter(id, false, 'characters')} />
        )}

        {currentView === 'character-sheet' && selectedCharacterId && (
          <CharacterSheetView
            characterId={selectedCharacterId}
            readOnly={characterReadOnly}
            onBack={() => setCurrentView(previousView)}
          />
        )}

        {currentView === 'campaigns' && (
          <CampaignList onSelectCampaign={handleOpenCampaign} />
        )}

        {currentView === 'campaign-detail' && selectedCampaignId && (
          <CampaignDetail
            campaignId={selectedCampaignId}
            onBack={() => setCurrentView('campaigns')}
            onViewCharacter={(charId, readOnly) =>
              handleOpenCharacter(charId, readOnly, 'campaign-detail')
            }
          />
        )}
      </main>

      {/* Pie de Página */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}
      >
        <p>
          BurgosLabs Rol &bull; D&amp;D 5e &amp; Tabletop Roleplaying Manager &bull; Desplegado en{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>rol.burgoslabs.es</strong>
        </p>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
};
