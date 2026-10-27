import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { Dnd5eSheet } from './Dnd5eSheet.js';
import { GenericSheet } from './GenericSheet.js';

interface CharacterSheetViewProps {
  characterId: string;
  readOnly?: boolean;
  onBack: () => void;
}

export const CharacterSheetView: React.FC<CharacterSheetViewProps> = ({
  characterId,
  readOnly = false,
  onBack,
}) => {
  const [system, setSystem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystem = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ character: { system: string } }>(`/api/characters/${characterId}`);
        setSystem(res.character.system);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error al cargar información del personaje');
      } finally {
        setLoading(false);
      }
    };

    void fetchSystem();
  }, [characterId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !system) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <div className="alert alert-danger">{error || 'No se pudo cargar el personaje'}</div>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Volver
        </button>
      </div>
    );
  }

  if (system.toLowerCase() === 'dnd5e') {
    return <Dnd5eSheet characterId={characterId} readOnly={readOnly} onBack={onBack} />;
  }

  return <GenericSheet characterId={characterId} readOnly={readOnly} onBack={onBack} />;
};
