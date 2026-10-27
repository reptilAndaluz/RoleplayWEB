import React, { useEffect, useState } from 'react';
import type { GenericCharacterData } from '@rol/shared';
import { GenericCharacterDataSchema } from '@rol/shared';
import { api, ApiError } from '../../lib/api.js';

interface GenericSheetProps {
  characterId: string;
  readOnly?: boolean;
  onBack: () => void;
}

interface CharacterResponse {
  id: string;
  name: string;
  system: string;
  campaignId: string | null;
  data: unknown;
  ownerId: string;
}

export const GenericSheet: React.FC<GenericSheetProps> = ({ characterId, readOnly = false, onBack }) => {
  const [charName, setCharName] = useState('');
  const [data, setData] = useState<GenericCharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados locales para añadir nuevas propiedades
  const [newStatKey, setNewStatKey] = useState('');
  const [newStatValue, setNewStatValue] = useState('');

  useEffect(() => {
    const fetchCharacter = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ character: CharacterResponse }>(`/api/characters/${characterId}`);
        setCharName(res.character.name);
        const parsed = GenericCharacterDataSchema.safeParse(res.character.data);
        if (parsed.success) {
          setData(parsed.data);
        } else {
          setData({
            description: '',
            stats: {},
            traits: [],
            inventory: [],
            notes: '',
          });
        }
      } catch (err) {
        setSaveMessage({
          type: 'error',
          text: err instanceof ApiError ? err.message : 'Error al cargar la ficha',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchCharacter();
  }, [characterId]);

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Cargando ficha...</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage(null);

    const validation = GenericCharacterDataSchema.safeParse(data);
    if (!validation.success) {
      setSaveMessage({
        type: 'error',
        text: `Error de validación: ${validation.error.issues[0]?.message || 'Datos incompletos'}`,
      });
      setSaving(false);
      return;
    }

    try {
      await api.put(`/api/characters/${characterId}`, {
        name: charName.trim(),
        data: validation.data,
      });
      setSaveMessage({ type: 'success', text: '¡Ficha guardada con éxito!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Error al guardar la ficha',
      });
    } finally {
      setSaving(false);
    }
  };

  const addStat = () => {
    if (!newStatKey.trim()) return;
    setData({
      ...data,
      stats: {
        ...data.stats,
        [newStatKey.trim()]: newStatValue.trim(),
      },
    });
    setNewStatKey('');
    setNewStatValue('');
  };

  const removeStat = (key: string) => {
    const updated = { ...data.stats };
    delete updated[key];
    setData({ ...data, stats: updated });
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Barra superior */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          <span>←</span>
          <span>Volver</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {readOnly && <span className="badge badge-blue">Modo Solo Lectura (DM)</span>}
          {saveMessage && (
            <span
              style={{
                fontSize: '0.85rem',
                color: saveMessage.type === 'success' ? '#34d399' : '#f87171',
                fontWeight: 600,
              }}
            >
              {saveMessage.text}
            </span>
          )}
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" style={{ width: '16px', height: '16px' }} /> : '💾 Guardar Ficha'}
            </button>
          )}
        </div>
      </div>

      {/* Cabecera */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-group">
          <label className="form-label">Nombre del Personaje</label>
          <input
            type="text"
            className="form-input"
            style={{ fontSize: '1.25rem', fontWeight: 'bold' }}
            value={charName}
            disabled={readOnly}
            onChange={(e) => setCharName(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Descripción General / Concepto</label>
          <textarea
            className="form-textarea"
            placeholder="Arquetipo, descripción física, rol en el grupo..."
            value={data.description}
            disabled={readOnly}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </div>
      </div>

      {/* Atributos / Stats dinámicos */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Atributos y Estadísticas del Sistema</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Pares de características numéricas o de texto personalizadas
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          {Object.entries(data.stats).map(([key, val]) => (
            <div
              key={key}
              style={{
                backgroundColor: 'var(--bg-input)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-gold)' }}>{key}</span>
                {!readOnly && (
                  <button
                    className="btn-outline btn-icon"
                    style={{ border: 'none', color: 'var(--status-danger)', padding: 0 }}
                    onClick={() => removeStat(key)}
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                type="text"
                className="form-input"
                style={{ marginTop: '0.3rem' }}
                value={String(val)}
                disabled={readOnly}
                onChange={(e) =>
                  setData({
                    ...data,
                    stats: { ...data.stats, [key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: '130px' }}
              placeholder="Nueva característica (ej. Suerte)"
              value={newStatKey}
              onChange={(e) => setNewStatKey(e.target.value)}
            />
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: '100px' }}
              placeholder="Valor (ej. 75)"
              value={newStatValue}
              onChange={(e) => setNewStatValue(e.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addStat}>
              + Añadir
            </button>
          </div>
        )}
      </div>

      {/* Rasgos y Habilidades */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Habilidades y Rasgos Especiales</h3>
          {!readOnly && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setData({
                  ...data,
                  traits: [...data.traits, { name: 'Nueva Habilidad', value: '' }],
                });
              }}
            >
              + Añadir Habilidad
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {data.traits.map((trait, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: 'var(--bg-input)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontWeight: 'bold' }}
                  placeholder="Nombre de habilidad"
                  value={trait.name}
                  disabled={readOnly}
                  onChange={(e) => {
                    const traits = [...data.traits];
                    traits[idx] = { ...traits[idx], name: e.target.value };
                    setData({ ...data, traits });
                  }}
                />
                {!readOnly && (
                  <button
                    className="btn-outline btn-icon"
                    style={{ color: 'var(--status-danger)', border: 'none' }}
                    onClick={() => {
                      const traits = data.traits.filter((_, i) => i !== idx);
                      setData({ ...data, traits });
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <textarea
                className="form-textarea"
                placeholder="Descripción de la habilidad o efecto..."
                value={trait.value}
                disabled={readOnly}
                onChange={(e) => {
                  const traits = [...data.traits];
                  traits[idx] = { ...traits[idx], value: e.target.value };
                  setData({ ...data, traits });
                }}
              />
            </div>
          ))}
          {data.traits.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay habilidades registradas.</p>
          )}
        </div>
      </div>

      {/* Inventario */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Inventario y Posesiones</h3>
          {!readOnly && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setData({
                  ...data,
                  inventory: [...data.inventory, { item: 'Nuevo Objeto', quantity: 1, notes: '' }],
                });
              }}
            >
              + Añadir Objeto
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.inventory.map((inv, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 70px 40px',
                gap: '0.5rem',
                alignItems: 'center',
                backgroundColor: 'var(--bg-input)',
                padding: '0.5rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <input
                type="text"
                className="form-input"
                placeholder="Nombre del objeto"
                value={inv.item}
                disabled={readOnly}
                onChange={(e) => {
                  const items = [...data.inventory];
                  items[idx] = { ...items[idx], item: e.target.value };
                  setData({ ...data, inventory: items });
                }}
              />
              <input
                type="number"
                className="form-input"
                placeholder="Cant."
                value={inv.quantity}
                min={1}
                disabled={readOnly}
                onChange={(e) => {
                  const items = [...data.inventory];
                  items[idx] = { ...items[idx], quantity: parseInt(e.target.value) || 1 };
                  setData({ ...data, inventory: items });
                }}
              />
              {!readOnly ? (
                <button
                  className="btn-outline btn-icon"
                  style={{ color: 'var(--status-danger)', border: 'none' }}
                  onClick={() => {
                    const items = data.inventory.filter((_, i) => i !== idx);
                    setData({ ...data, inventory: items });
                  }}
                >
                  ✕
                </button>
              ) : <div />}
            </div>
          ))}
          {data.inventory.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>El inventario está vacío.</p>
          )}
        </div>
      </div>

      {/* Notas */}
      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>Notas y Diario de Aventuras</h3>
        <textarea
          className="form-textarea"
          style={{ minHeight: '160px' }}
          placeholder="Anotaciones de la partida, lugares descubiertos, PNJs..."
          value={data.notes}
          disabled={readOnly}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
};
