import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api, ApiError } from '../../lib/api.js';

interface CampaignDetailProps {
  campaignId: string;
  onBack: () => void;
  onViewCharacter: (characterId: string, readOnly: boolean) => void;
}

interface CampaignData {
  id: string;
  name: string;
  description: string | null;
  dmId: string;
  inviteCode: string;
  createdAt: string;
  dm: { id: string; name: string; email: string };
  members: Array<{
    id: string;
    joinedAt: string;
    user: { id: string; name: string; email: string };
  }>;
  characters: Array<{
    id: string;
    name: string;
    system: string;
    owner: { id: string; name: string };
  }>;
}

interface MyCharacterItem {
  id: string;
  name: string;
  system: string;
  campaignId: string | null;
}

export const CampaignDetail: React.FC<CampaignDetailProps> = ({
  campaignId,
  onBack,
  onViewCharacter,
}) => {
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [myCharacters, setMyCharacters] = useState<MyCharacterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchCampaign = async () => {
    setLoading(true);
    setError(null);
    try {
      const [campRes, myCharsRes] = await Promise.all([
        api.get<{ campaign: CampaignData }>(`/api/campaigns/${campaignId}`),
        api.get<{ items: MyCharacterItem[] }>('/api/characters'),
      ]);
      setCampaign(campRes.campaign);
      setMyCharacters(myCharsRes.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar detalles de la campaña');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCampaign();
  }, [campaignId]);

  if (loading || !campaign) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  const isDm = user?.id === campaign.dmId;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(campaign.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback si el portapapeles del navegador no está disponible
      alert(`Código de invitación: ${campaign.inviteCode}`);
    }
  };

  const handleAssignCharacter = async (charId: string, assign: boolean) => {
    setAssigning(true);
    try {
      await api.put(`/api/characters/${charId}`, {
        campaignId: assign ? campaign.id : null,
      });
      await fetchCampaign();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Error al actualizar la ficha en la campaña');
    } finally {
      setAssigning(false);
    }
  };

  // Ficha que el usuario actual tiene asignada a esta campaña
  const myAssignedChar = campaign.characters.find((c) => c.owner.id === user?.id);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Botón Volver */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          <span>←</span>
          <span>Volver a Campañas</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Cabecera de la Campaña */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span className={isDm ? 'badge badge-gold' : 'badge badge-blue'}>
                {isDm ? 'Director de Juego (DM)' : 'Jugador'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Creada el {new Date(campaign.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{campaign.name}</h1>
            {campaign.description && (
              <p style={{ color: 'var(--text-secondary)', maxWidth: '650px', lineHeight: 1.6 }}>
                {campaign.description}
              </p>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Dirigida por: <strong style={{ color: 'var(--text-primary)' }}>{campaign.dm.name}</strong>
            </p>
          </div>

          {/* Panel de Código de Invitación (Especial para el DM o visible para miembros) */}
          <div
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              minWidth: '240px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Código de Invitación
            </span>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--accent-gold-light)',
                margin: '0.4rem 0',
                letterSpacing: '0.1em',
              }}
            >
              {campaign.inviteCode}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ width: '100%' }}
              onClick={handleCopyCode}
            >
              {copied ? '✓ ¡Código Copiado!' : '📋 Copiar Código'}
            </button>
          </div>
        </div>
      </div>

      {/* Sección del Jugador: Asignar su ficha */}
      {!isDm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Tu Personaje en esta Campaña</h3>
          {myAssignedChar ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                backgroundColor: 'var(--bg-input)',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div>
                <span className="badge badge-gold" style={{ marginRight: '0.5rem' }}>
                  {myAssignedChar.system.toLowerCase() === 'dnd5e' ? 'D&D 5e' : 'Genérico'}
                </span>
                <strong style={{ fontSize: '1.1rem' }}>{myAssignedChar.name}</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onViewCharacter(myAssignedChar.id, false)}
                >
                  ✏️ Abrir y Editar Ficha
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ color: 'var(--status-danger)' }}
                  disabled={assigning}
                  onClick={() => handleAssignCharacter(myAssignedChar.id, false)}
                >
                  Desasignar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Aún no has asignado ningún personaje a esta campaña. Elige una de tus fichas para que el DM pueda verla:
              </p>
              {myCharacters.filter((c) => !c.campaignId).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No tienes ninguna ficha libre. Crea un personaje en &quot;Mis Fichas&quot; para asignarlo aquí.
                </p>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    id="select-char-assign"
                    className="form-select"
                    style={{ maxWidth: '300px' }}
                    disabled={assigning}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        void handleAssignCharacter(e.target.value, true);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Selecciona una ficha para unirte...
                    </option>
                    {myCharacters
                      .filter((c) => !c.campaignId)
                      .map((char) => (
                        <option key={char.id} value={char.id}>
                          {char.name} ({char.system === 'dnd5e' ? 'D&D 5e' : 'Genérico'})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid de Personajes de la Campaña (Visibles para DM y compañeros) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3>Fichas de los Jugadores ({campaign.characters.length})</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {isDm
                ? 'Como Director de Juego, puedes inspeccionar las hojas completas de todos los personajes.'
                : 'Personajes activos que componen el grupo de aventureros.'}
            </p>
          </div>
        </div>

        {campaign.characters.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>
            Los jugadores aún no han asignado ninguna ficha a la campaña.
          </p>
        ) : (
          <div className="grid-cards">
            {campaign.characters.map((char) => {
              const isMine = char.owner.id === user?.id;
              return (
                <div
                  key={char.id}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={char.system.toLowerCase() === 'dnd5e' ? 'badge badge-gold' : 'badge badge-blue'}>
                        {char.system.toLowerCase() === 'dnd5e' ? 'D&D 5e' : 'Genérico'}
                      </span>
                      {isMine && <span className="badge badge-green">Tu Personaje</span>}
                    </div>

                    <h4 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      {char.name}
                    </h4>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Jugador: <strong style={{ color: 'var(--text-secondary)' }}>{char.owner.name}</strong>
                    </p>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => onViewCharacter(char.id, !isMine)}
                    >
                      {isMine ? '✏️ Ver / Editar Ficha' : isDm ? '🔍 Inspeccionar Ficha (DM)' : '👁️ Ver Ficha'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de Miembros de la Campaña */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Miembros de la Mesa ({campaign.members.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {campaign.members.map((member) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{member.user.name}</strong>
                {member.user.id === campaign.dmId && (
                  <span className="badge badge-gold" style={{ marginLeft: '0.5rem' }}>
                    DM
                  </span>
                )}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Unido el {new Date(member.joinedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
