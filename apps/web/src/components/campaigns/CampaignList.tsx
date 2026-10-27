import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api, ApiError } from '../../lib/api.js';

export interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  dmId: string;
  inviteCode: string;
  createdAt: string;
  dm: { id: string; name: string };
  _count: { members: number; characters: number };
}

interface CampaignListProps {
  onSelectCampaign: (campaignId: string) => void;
}

export const CampaignList: React.FC<CampaignListProps> = ({ onSelectCampaign }) => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Crear campaña
  const [name, setName] = useState('');
  const [system, setSystem] = useState('dnd5e');
  const [customSystem, setCustomSystem] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Unirse a campaña
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ campaigns: CampaignSummary[] }>('/api/campaigns');
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCampaigns();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('El nombre de la campaña es obligatorio');
      return;
    }

    const selectedSystem = system === 'other' ? customSystem.trim() : system.trim();
    if (!selectedSystem) {
      setCreateError('Debes indicar el sistema de la campaña');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await api.post<{ campaign: { id: string } }>('/api/campaigns', {
        name: name.trim(),
        system: selectedSystem,
      });
      setShowCreateModal(false);
      setName('');
      setSystem('dnd5e');
      setCustomSystem('');
      onSelectCampaign(res.campaign.id);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al crear campaña');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setJoinError('Introduce el código de invitación');
      return;
    }

    setJoining(true);
    setJoinError(null);

    try {
      const res = await api.post<{ campaign: { id: string } }>('/api/campaigns/join', {
        inviteCode: inviteCode.trim(),
      });
      setShowJoinModal(false);
      setInviteCode('');
      onSelectCampaign(res.campaign.id);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : 'Error al unirse a la campaña');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h2>Campañas de Rol</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Gestiona tus aventuras como Director de Juego o participa como Aventurero
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
            <span>🗝️</span>
            <span>Unirse con Código</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <span>🏰</span>
            <span>Crear Campaña (DM)</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            backgroundColor: 'rgba(19, 27, 46, 0.4)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗺️</div>
          <h3 style={{ marginBottom: '0.5rem' }}>No formas parte de ninguna campaña</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 1.5rem auto' }}>
            Únete a una partida con el código de invitación que te dé tu DM, o crea una nueva campaña si vas a dirigir una aventura.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
              Unirse con Código
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              Crear Campaña
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-cards">
          {campaigns.map((camp) => {
            const isDm = user?.id === camp.dmId;
            return (
              <div
                key={camp.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span className={isDm ? 'badge badge-gold' : 'badge badge-blue'}>
                      {isDm ? '👑 Dungeon Master' : '⚔️ Jugador'}
                    </span>
                    <span className="badge badge-muted">
                      👥 {camp._count.members} miembros
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: '1.25rem',
                      marginBottom: '0.4rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {camp.name}
                  </h3>

                  {camp.description ? (
                    <p
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.88rem',
                        marginBottom: '0.75rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {camp.description}
                    </p>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                      Sin descripción adicional
                    </p>
                  )}

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Director: <strong style={{ color: 'var(--text-secondary)' }}>{camp.dm.name}</strong>
                  </p>
                </div>

                <div
                  style={{
                    marginTop: '1.5rem',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '0.85rem',
                  }}
                >
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%' }}
                    onClick={() => onSelectCampaign(camp.id)}
                  >
                    <span>Entrar a la Campaña</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear Campaña */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nueva Campaña (DM)</h2>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>

            {createError && (
              <div className="alert alert-danger" role="alert">
                <span>⚠️</span>
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label" htmlFor="camp-name">
                  Nombre de la Campaña
                </label>
                <input
                  id="camp-name"
                  type="text"
                  className="form-input"
                  placeholder="Ej. La Maldición de Strahd"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: system === 'other' ? '1rem' : '1.5rem' }}>
                <label className="form-label" htmlFor="camp-system">
                  Sistema de Juego
                </label>
                <select
                  id="camp-system"
                  className="form-select"
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                >
                  <option value="dnd5e">Dungeons &amp; Dragons 5ª Edición (D&amp;D 5e)</option>
                  <option value="cyberpunk">Cyberpunk / Sci-Fi</option>
                  <option value="cthulhu">La Llamada de Cthulhu / Terror</option>
                  <option value="pathfinder">Pathfinder</option>
                  <option value="generic">Sistema Genérico</option>
                  <option value="other">Otro Sistema Personalizado...</option>
                </select>
              </div>

              {system === 'other' && (
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" htmlFor="camp-custom-system">
                    Nombre del Sistema Personalizado
                  </label>
                  <input
                    id="camp-custom-system"
                    type="text"
                    className="form-input"
                    placeholder="Ej. Vampiro: La Mascarada, Star Wars, etc."
                    value={customSystem}
                    onChange={(e) => setCustomSystem(e.target.value)}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <span className="spinner" style={{ width: '16px', height: '16px' }} /> : 'Crear Campaña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Unirse a Campaña */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Unirse a una Campaña</h2>
              <button className="modal-close-btn" onClick={() => setShowJoinModal(false)}>
                &times;
              </button>
            </div>

            {joinError && (
              <div className="alert alert-danger" role="alert">
                <span>⚠️</span>
                <span>{joinError}</span>
              </div>
            )}

            <form onSubmit={handleJoin}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="join-code">
                  Código de Invitación de la Campaña
                </label>
                <input
                  id="join-code"
                  type="text"
                  className="form-input"
                  placeholder="Introduce el código proporcionado por tu DM"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  autoFocus
                  required
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  Pídele al Director de Juego el código generado para su campaña.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowJoinModal(false)}
                  disabled={joining}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={joining}>
                  {joining ? <span className="spinner" style={{ width: '16px', height: '16px' }} /> : 'Unirse a la Campaña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
