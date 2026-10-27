import React, { useEffect, useState, useMemo } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { createDefaultDnd5eData } from '../../lib/dnd5e-defaults.js';

export interface CharacterItem {
  id: string;
  name: string;
  system: string;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
  campaign?: { id: string; name: string } | null;
}

interface CharacterListProps {
  onSelectCharacter: (characterId: string) => void;
}

export const CharacterList: React.FC<CharacterListProps> = ({ onSelectCharacter }) => {
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFilter, setSystemFilter] = useState<'all' | 'dnd5e' | 'generic'>('all');

  // Modal Crear Ficha
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSystem, setNewSystem] = useState<'dnd5e' | 'generic'>('dnd5e');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchCharacters = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items: CharacterItem[] }>('/api/characters');
      setCharacters(data.items);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al cargar la lista de fichas.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCharacters();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar la ficha de "${name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      await api.delete(`/api/characters/${id}`);
      setCharacters((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Error al eliminar la ficha');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError('El nombre del personaje es obligatorio.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    // Valores iniciales según sistema
    let initialData: unknown = {};
    if (newSystem === 'dnd5e') {
      initialData = createDefaultDnd5eData();
    } else {
      initialData = {
        description: '',
        stats: { Salud: '100' },
        traits: [],
        inventory: [],
        notes: '',
      };
    }

    try {
      const res = await api.post<{ character: { id: string } }>('/api/characters', {
        name: newName.trim(),
        system: newSystem,
        data: initialData,
      });

      setShowCreateModal(false);
      setNewName('');
      onSelectCharacter(res.character.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Error al crear la ficha.');
      }
    } finally {
      setCreating(false);
    }
  };

  const filteredCharacters = useMemo(() => {
    return characters.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSystem = systemFilter === 'all' || c.system.toLowerCase() === systemFilter;
      return matchesSearch && matchesSystem;
    });
  }, [characters, searchTerm, systemFilter]);

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
          <h2>Mis Personajes y Fichas</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Gestiona tus hojas de personaje para tus sesiones de rol
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <span>⚔️</span>
          <span>Crear Nueva Ficha</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1', minWidth: '220px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar personaje por nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <select
            className="form-select"
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value as 'all' | 'dnd5e' | 'generic')}
          >
            <option value="all">Todos los sistemas</option>
            <option value="dnd5e">D&amp;D 5e</option>
            <option value="generic">Genérico</option>
          </select>
        </div>
      </div>

      {/* Grid de Fichas */}
      {filteredCharacters.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            backgroundColor: 'rgba(19, 27, 46, 0.4)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📜</div>
          <h3 style={{ marginBottom: '0.5rem' }}>No se encontraron fichas</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
            {searchTerm || systemFilter !== 'all'
              ? 'No hay ningún personaje que coincida con los criterios de búsqueda.'
              : 'Aún no has creado ningún personaje. ¡Empieza creando tu primer aventurero!'}
          </p>
          {!searchTerm && systemFilter === 'all' && (
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              Crear mi primera ficha
            </button>
          )}
        </div>
      ) : (
        <div className="grid-cards">
          {filteredCharacters.map((char) => (
            <div
              key={char.id}
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
                  <span
                    className={
                      char.system.toLowerCase() === 'dnd5e' ? 'badge badge-gold' : 'badge badge-blue'
                    }
                  >
                    {char.system.toLowerCase() === 'dnd5e' ? 'D&D 5e' : 'Genérico'}
                  </span>
                  {char.campaign ? (
                    <span className="badge badge-green" title="Campaña asignada">
                      🏰 {char.campaign.name}
                    </span>
                  ) : (
                    <span className="badge badge-muted">Sin campaña</span>
                  )}
                </div>

                <h3
                  style={{
                    fontSize: '1.25rem',
                    marginBottom: '0.4rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {char.name}
                </h3>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Creado el {new Date(char.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '1.5rem',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '0.85rem',
                }}
              >
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => onSelectCharacter(char.id)}
                >
                  <span>✏️</span>
                  <span>Abrir Ficha</span>
                </button>
                <button
                  className="btn btn-outline btn-sm btn-icon"
                  style={{ color: 'var(--status-danger)' }}
                  title="Eliminar personaje"
                  onClick={() => handleDelete(char.id, char.name)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear Ficha */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Crear Nueva Ficha</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
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
                <label className="form-label" htmlFor="new-character-name">
                  Nombre del Personaje
                </label>
                <input
                  id="new-character-name"
                  type="text"
                  className="form-input"
                  placeholder="Ej. Elminster, Legolas, o Jane Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="new-character-system">
                  Sistema de Reglas
                </label>
                <select
                  id="new-character-system"
                  className="form-select"
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value as 'dnd5e' | 'generic')}
                >
                  <option value="dnd5e">Dungeons &amp; Dragons 5ª Edición (D&amp;D 5e)</option>
                  <option value="generic">Sistema Genérico / Otros Sistemas de Rol</option>
                </select>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  {newSystem === 'dnd5e'
                    ? 'Incluye calculadora de atributos, vida interactiva, conjuros, inventario y tiradas.'
                    : 'Permite configurar campos personalizados clave-valor y notas libres.'}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? <span className="spinner" style={{ width: '16px', height: '16px' }} /> : 'Crear Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
