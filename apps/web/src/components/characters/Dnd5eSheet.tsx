import React, { useEffect, useState } from 'react';
import type { Dnd5eCharacterData, Dnd5eAttack, Dnd5eSpell, Dnd5eInventoryItem } from '@rol/shared';
import { Dnd5eCharacterDataSchema } from '@rol/shared';
import { api, ApiError } from '../../lib/api.js';

interface Dnd5eSheetProps {
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
  campaign?: { id: string; name: string } | null;
}

type TabType = 'attributes' | 'combat' | 'skills' | 'spells' | 'inventory' | 'notes';

const SKILLS_LIST = [
  { name: 'Acrobacias', attr: 'dexterity' as const },
  { name: 'Atletismo', attr: 'strength' as const },
  { name: 'Conocimiento Arcano', attr: 'intelligence' as const },
  { name: 'Engaño', attr: 'charisma' as const },
  { name: 'Historia', attr: 'intelligence' as const },
  { name: 'Interpretación', attr: 'charisma' as const },
  { name: 'Intimidación', attr: 'charisma' as const },
  { name: 'Investigación', attr: 'intelligence' as const },
  { name: 'Juego de Manos', attr: 'dexterity' as const },
  { name: 'Medicina', attr: 'wisdom' as const },
  { name: 'Naturaleza', attr: 'intelligence' as const },
  { name: 'Percepción', attr: 'wisdom' as const },
  { name: 'Perspicacia', attr: 'wisdom' as const },
  { name: 'Persuasión', attr: 'charisma' as const },
  { name: 'Religión', attr: 'intelligence' as const },
  { name: 'Sigilo', attr: 'dexterity' as const },
  { name: 'Supervivencia', attr: 'wisdom' as const },
  { name: 'Trato con Animales', attr: 'wisdom' as const },
];

export const Dnd5eSheet: React.FC<Dnd5eSheetProps> = ({ characterId, readOnly = false, onBack }) => {
  const [character, setCharacter] = useState<CharacterResponse | null>(null);
  const [charName, setCharName] = useState('');
  const [data, setData] = useState<Dnd5eCharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('attributes');

  useEffect(() => {
    const fetchCharacter = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ character: CharacterResponse }>(`/api/characters/${characterId}`);
        setCharacter(res.character);
        setCharName(res.character.name);
        const parsed = Dnd5eCharacterDataSchema.safeParse(res.character.data);
        if (parsed.success) {
          setData(parsed.data);
        } else {
          setSaveMessage({
            type: 'error',
            text: 'La ficha contiene un formato antiguo o inválido de D&D 5e.',
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
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Cargando ficha de personaje...</p>
      </div>
    );
  }

  // Modificadores calculados
  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const formatMod = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  const profBonus = Math.floor((data.level - 1) / 4) + 2;

  // Guardar ficha
  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage(null);

    // Validar con Zod
    const validation = Dnd5eCharacterDataSchema.safeParse(data);
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

  // Ajustes de Vida rápida
  const adjustHp = (amount: number) => {
    if (readOnly) return;
    setData((prev) => {
      if (!prev) return prev;
      const newCurrent = Math.max(0, Math.min(prev.hitPoints.max, prev.hitPoints.current + amount));
      return {
        ...prev,
        hitPoints: { ...prev.hitPoints, current: newCurrent },
      };
    });
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Barra superior de navegación y guardado */}
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
          {character?.campaign && (
            <span className="badge badge-green">🏰 {character.campaign.name}</span>
          )}
          {readOnly && (
            <span className="badge badge-blue">Modo Solo Lectura (DM)</span>
          )}

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
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <span className="spinner" style={{ width: '16px', height: '16px' }} />
              ) : (
                '💾 Guardar Cambios'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Cabecera del personaje */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div>
            <label className="form-label">Nombre del Personaje</label>
            <input
              type="text"
              className="form-input"
              style={{ fontSize: '1.2rem', fontWeight: 'bold' }}
              value={charName}
              disabled={readOnly}
              onChange={(e) => setCharName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Clase y Nivel</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Clase"
                value={data.class}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, class: e.target.value })}
              />
              <input
                type="number"
                className="form-input"
                style={{ width: '70px', textAlign: 'center' }}
                min={1}
                max={20}
                value={data.level}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, level: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Raza</label>
            <input
              type="text"
              className="form-input"
              value={data.race}
              disabled={readOnly}
              onChange={(e) => setData({ ...data, race: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Trasfondo y Alineamiento</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Trasfondo"
                value={data.background}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, background: e.target.value })}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Alineamiento"
                value={data.alignment}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, alignment: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navegación por pestañas */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'attributes' ? 'active' : ''}`}
          onClick={() => setActiveTab('attributes')}
        >
          ⚡ Atributos
        </button>
        <button
          className={`tab-btn ${activeTab === 'combat' ? 'active' : ''}`}
          onClick={() => setActiveTab('combat')}
        >
          🛡️ Combate &amp; Salud
        </button>
        <button
          className={`tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
        >
          🎯 Competencias
        </button>
        <button
          className={`tab-btn ${activeTab === 'spells' ? 'active' : ''}`}
          onClick={() => setActiveTab('spells')}
        >
          ✨ Conjuros
        </button>
        <button
          className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          🎒 Inventario
        </button>
        <button
          className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          📜 Rasgos &amp; Notas
        </button>
      </div>

      {/* Pestaña 1: Atributos */}
      {activeTab === 'attributes' && (
        <div>
          <div className="grid-attributes" style={{ marginBottom: '1.5rem' }}>
            {(
              [
                ['Fuerza', 'strength'],
                ['Destreza', 'dexterity'],
                ['Constitución', 'constitution'],
                ['Inteligencia', 'intelligence'],
                ['Sabiduría', 'wisdom'],
                ['Carisma', 'charisma'],
              ] as const
            ).map(([label, key]) => {
              const score = data.attributes[key];
              const mod = getModifier(score);
              return (
                <div key={key} className="stat-box">
                  <div className="stat-label">{label}</div>
                  <div className="stat-modifier">{formatMod(mod)}</div>
                  <input
                    type="number"
                    className="stat-score-input"
                    min={1}
                    max={30}
                    value={score}
                    disabled={readOnly}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 10;
                      setData({
                        ...data,
                        attributes: { ...data.attributes, [key]: Math.min(30, Math.max(1, val)) },
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="card" style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bono de Competencia</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent-gold-light)' }}>
                +{profBonus}
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Percepción Pasiva</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
                {10 +
                  getModifier(data.attributes.wisdom) +
                  (data.proficiencies.skills.includes('Percepción') ? profBonus : 0)}
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Puntos de Experiencia</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', marginTop: '0.4rem', fontWeight: 'bold' }}
                value={data.experiencePoints}
                disabled={readOnly}
                onChange={(e) =>
                  setData({ ...data, experiencePoints: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 2: Combate & Salud */}
      {activeTab === 'combat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Fila de Estadísticas de Combate */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Clase de Armadura</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 'bold' }}
                value={data.armorClass}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, armorClass: parseInt(e.target.value) || 10 })}
              />
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Iniciativa</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 'bold' }}
                value={data.initiative}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, initiative: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Velocidad (pies)</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 'bold' }}
                value={data.speed}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, speed: parseInt(e.target.value) || 30 })}
              />
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Dados de Golpe</span>
              <input
                type="text"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}
                value={data.hitDice}
                disabled={readOnly}
                onChange={(e) => setData({ ...data, hitDice: e.target.value })}
              />
            </div>
          </div>

          {/* Barra y Controles de Salud */}
          <div className="hp-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Puntos de Golpe (PG)</h3>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                <span style={{ color: '#34d399' }}>{data.hitPoints.current}</span> / {data.hitPoints.max}
                {data.hitPoints.temp > 0 && (
                  <span style={{ color: '#38bdf8', fontSize: '0.9rem', marginLeft: '0.4rem' }}>
                    (+{data.hitPoints.temp} temp)
                  </span>
                )}
              </div>
            </div>

            <div className="hp-bar-outer">
              <div
                className="hp-bar-inner"
                style={{
                  width: `${Math.min(100, Math.max(0, (data.hitPoints.current / (data.hitPoints.max || 1)) * 100))}%`,
                }}
              />
            </div>

            {!readOnly && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-danger btn-sm" onClick={() => adjustHp(-5)}>
                  -5 PG
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => adjustHp(-1)}>
                  -1 PG
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => adjustHp(1)}>
                  +1 PG
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => adjustHp(5)}>
                  +5 PG
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div>
                <label className="form-label">PG Actuales</label>
                <input
                  type="number"
                  className="form-input"
                  value={data.hitPoints.current}
                  disabled={readOnly}
                  onChange={(e) =>
                    setData({
                      ...data,
                      hitPoints: { ...data.hitPoints, current: parseInt(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <div>
                <label className="form-label">PG Máximos</label>
                <input
                  type="number"
                  className="form-input"
                  value={data.hitPoints.max}
                  disabled={readOnly}
                  onChange={(e) =>
                    setData({
                      ...data,
                      hitPoints: { ...data.hitPoints, max: parseInt(e.target.value) || 1 },
                    })
                  }
                />
              </div>
              <div>
                <label className="form-label">PG Temporales</label>
                <input
                  type="number"
                  className="form-input"
                  value={data.hitPoints.temp}
                  disabled={readOnly}
                  onChange={(e) =>
                    setData({
                      ...data,
                      hitPoints: { ...data.hitPoints, temp: parseInt(e.target.value) || 0 },
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Salvaciones de Muerte */}
          <div className="card">
            <h3 style={{ marginBottom: '0.75rem' }}>Salvaciones contra la Muerte</h3>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#34d399', fontWeight: 600 }}>Éxitos:</span>
                {[1, 2, 3].map((num) => (
                  <input
                    key={num}
                    type="checkbox"
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    checked={(data.deathSaves.successes || 0) >= num}
                    disabled={readOnly}
                    onChange={(e) => {
                      setData({
                        ...data,
                        deathSaves: {
                          ...data.deathSaves,
                          successes: e.target.checked ? num : num - 1,
                        },
                      });
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#f87171', fontWeight: 600 }}>Fallos:</span>
                {[1, 2, 3].map((num) => (
                  <input
                    key={num}
                    type="checkbox"
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    checked={(data.deathSaves.failures || 0) >= num}
                    disabled={readOnly}
                    onChange={(e) => {
                      setData({
                        ...data,
                        deathSaves: {
                          ...data.deathSaves,
                          failures: e.target.checked ? num : num - 1,
                        },
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Ataques y Armas */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Ataques y Acciones</h3>
              {!readOnly && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const newAttack: Dnd5eAttack = {
                      name: 'Nuevo Ataque',
                      bonus: profBonus + getModifier(data.attributes.strength),
                      damage: '1d6',
                      type: 'Contundente',
                      notes: '',
                    };
                    setData({ ...data, attacks: [...data.attacks, newAttack] });
                  }}
                >
                  + Agregar Ataque
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.attacks.map((atk, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr)) 40px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-input)',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nombre"
                    value={atk.name}
                    disabled={readOnly}
                    onChange={(e) => {
                      const updated = [...data.attacks];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setData({ ...data, attacks: updated });
                    }}
                  />
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Bono (+)"
                    value={atk.bonus}
                    disabled={readOnly}
                    onChange={(e) => {
                      const updated = [...data.attacks];
                      updated[index] = { ...updated[index], bonus: parseInt(e.target.value) || 0 };
                      setData({ ...data, attacks: updated });
                    }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Daño (ej. 1d8+3)"
                    value={atk.damage}
                    disabled={readOnly}
                    onChange={(e) => {
                      const updated = [...data.attacks];
                      updated[index] = { ...updated[index], damage: e.target.value };
                      setData({ ...data, attacks: updated });
                    }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tipo"
                    value={atk.type}
                    disabled={readOnly}
                    onChange={(e) => {
                      const updated = [...data.attacks];
                      updated[index] = { ...updated[index], type: e.target.value };
                      setData({ ...data, attacks: updated });
                    }}
                  />
                  {!readOnly ? (
                    <button
                      className="btn-outline btn-icon"
                      style={{ color: 'var(--status-danger)', border: 'none' }}
                      title="Eliminar"
                      onClick={() => {
                        const updated = data.attacks.filter((_, i) => i !== index);
                        setData({ ...data, attacks: updated });
                      }}
                    >
                      ✕
                    </button>
                  ) : <div />}
                </div>
              ))}
              {data.attacks.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay ataques registrados.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 3: Competencias & Habilidades */}
      {activeTab === 'skills' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {/* Tiradas de Salvación */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Tiradas de Salvación</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {(
                [
                  ['Fuerza', 'strength'],
                  ['Destreza', 'dexterity'],
                  ['Constitución', 'constitution'],
                  ['Inteligencia', 'intelligence'],
                  ['Sabiduría', 'wisdom'],
                  ['Carisma', 'charisma'],
                ] as const
              ).map(([label, key]) => {
                const isProf = data.proficiencies.savingThrows.includes(key);
                const mod = getModifier(data.attributes[key]) + (isProf ? profBonus : 0);
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isProf ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <input
                        type="checkbox"
                        checked={isProf}
                        disabled={readOnly}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...data.proficiencies.savingThrows, key]
                            : data.proficiencies.savingThrows.filter((k) => k !== key);
                          setData({
                            ...data,
                            proficiencies: { ...data.proficiencies, savingThrows: updated },
                          });
                        }}
                      />
                      <span>{label}</span>
                    </div>
                    <span style={{ fontWeight: 'bold', color: isProf ? 'var(--text-gold)' : 'inherit' }}>
                      {formatMod(mod)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Habilidades */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Habilidades</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {SKILLS_LIST.map(({ name, attr }) => {
                const isProf = data.proficiencies.skills.includes(name);
                const mod = getModifier(data.attributes[attr]) + (isProf ? profBonus : 0);
                return (
                  <label
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.3rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isProf ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                      fontSize: '0.9rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={isProf}
                        disabled={readOnly}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...data.proficiencies.skills, name]
                            : data.proficiencies.skills.filter((s) => s !== name);
                          setData({
                            ...data,
                            proficiencies: { ...data.proficiencies, skills: updated },
                          });
                        }}
                      />
                      <span>{name}</span>
                    </div>
                    <span style={{ fontWeight: 'bold', color: isProf ? 'var(--text-gold)' : 'inherit' }}>
                      {formatMod(mod)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 4: Conjuros */}
      {activeTab === 'spells' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Estadísticas de lanzamiento de conjuros */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Aptitud Mágica</span>
              <select
                className="form-select"
                value={data.spells?.spellcastingAbility || 'intelligence'}
                disabled={readOnly}
                onChange={(e) =>
                  setData({
                    ...data,
                    spells: {
                      ...data.spells,
                      spellcastingAbility: e.target.value,
                      known: data.spells?.known || [],
                    },
                  })
                }
              >
                <option value="intelligence">Inteligencia</option>
                <option value="wisdom">Sabiduría</option>
                <option value="charisma">Carisma</option>
              </select>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">CD de Salvación</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 'bold' }}
                value={data.spells?.spellSaveDc ?? 10}
                disabled={readOnly}
                onChange={(e) =>
                  setData({
                    ...data,
                    spells: {
                      ...data.spells,
                      spellSaveDc: parseInt(e.target.value) || 10,
                      known: data.spells?.known || [],
                    },
                  })
                }
              />
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <span className="form-label">Bono de Ataque de Conjuro</span>
              <input
                type="number"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 'bold' }}
                value={data.spells?.spellAttackBonus ?? 2}
                disabled={readOnly}
                onChange={(e) =>
                  setData({
                    ...data,
                    spells: {
                      ...data.spells,
                      spellAttackBonus: parseInt(e.target.value) || 0,
                      known: data.spells?.known || [],
                    },
                  })
                }
              />
            </div>
          </div>

          {/* Espacios de Conjuro */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Espacios de Conjuro por Nivel</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                gap: '0.6rem',
                textAlign: 'center',
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => {
                const key = String(lvl);
                const slot = data.spells?.slots?.[key] || { current: 0, max: 0 };
                return (
                  <div key={key} style={{ backgroundColor: 'var(--bg-input)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
                      Nvl {lvl}
                    </span>
                    <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center', marginTop: '0.3rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: '40px', padding: '0.2rem', textAlign: 'center' }}
                        value={slot.current}
                        min={0}
                        max={10}
                        disabled={readOnly}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          const slots = { ...(data.spells?.slots || {}) };
                          slots[key] = { ...slot, current: val };
                          setData({
                            ...data,
                            spells: { ...data.spells, slots, known: data.spells?.known || [] },
                          });
                        }}
                      />
                      <span style={{ alignSelf: 'center' }}>/</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: '40px', padding: '0.2rem', textAlign: 'center' }}
                        value={slot.max}
                        min={0}
                        max={10}
                        disabled={readOnly}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          const slots = { ...(data.spells?.slots || {}) };
                          slots[key] = { ...slot, max: val };
                          setData({
                            ...data,
                            spells: { ...data.spells, slots, known: data.spells?.known || [] },
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista de Conjuros Conocidos */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Conjuros Conocidos</h3>
              {!readOnly && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const newSpell: Dnd5eSpell = {
                      name: 'Nuevo Conjuro',
                      level: 1,
                      prepared: false,
                      school: 'Evocación',
                      description: '',
                    };
                    const known = [...(data.spells?.known || []), newSpell];
                    setData({
                      ...data,
                      spells: { ...data.spells, known },
                    });
                  }}
                >
                  + Agregar Conjuro
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {data.spells?.known?.map((spell, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 100px 40px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-input)',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <select
                    className="form-select"
                    value={spell.level}
                    disabled={readOnly}
                    onChange={(e) => {
                      const known = [...(data.spells?.known || [])];
                      known[idx] = { ...known[idx], level: parseInt(e.target.value) || 0 };
                      setData({ ...data, spells: { ...data.spells, known } });
                    }}
                  >
                    <option value={0}>Truco</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        Nvl {lvl}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nombre del conjuro"
                    value={spell.name}
                    disabled={readOnly}
                    onChange={(e) => {
                      const known = [...(data.spells?.known || [])];
                      known[idx] = { ...known[idx], name: e.target.value };
                      setData({ ...data, spells: { ...data.spells, known } });
                    }}
                  />

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={spell.prepared}
                      disabled={readOnly}
                      onChange={(e) => {
                        const known = [...(data.spells?.known || [])];
                        known[idx] = { ...known[idx], prepared: e.target.checked };
                        setData({ ...data, spells: { ...data.spells, known } });
                      }}
                    />
                    <span>Listo</span>
                  </label>

                  {!readOnly ? (
                    <button
                      className="btn-outline btn-icon"
                      style={{ color: 'var(--status-danger)', border: 'none' }}
                      title="Eliminar"
                      onClick={() => {
                        const known = (data.spells?.known || []).filter((_, i) => i !== idx);
                        setData({ ...data, spells: { ...data.spells, known } });
                      }}
                    >
                      ✕
                    </button>
                  ) : <div />}
                </div>
              ))}
              {(!data.spells?.known || data.spells.known.length === 0) && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay conjuros en la lista.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 5: Inventario */}
      {activeTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Monedas */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Monedero</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                gap: '0.75rem',
                textAlign: 'center',
              }}
            >
              {(
                [
                  ['Cobre (PC)', 'cp', '#b45309'],
                  ['Plata (PP)', 'sp', '#94a3b8'],
                  ['Electro (PE)', 'ep', '#38bdf8'],
                  ['Oro (PO)', 'gp', '#fbbf24'],
                  ['Platino (PPT)', 'pp', '#e2e8f0'],
                ] as const
              ).map(([label, coinKey, color]) => (
                <div key={coinKey} style={{ backgroundColor: 'var(--bg-input)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color }}>{label}</span>
                  <input
                    type="number"
                    className="form-input"
                    style={{ textAlign: 'center', marginTop: '0.3rem', fontWeight: 'bold' }}
                    value={data.inventory.currency[coinKey]}
                    min={0}
                    disabled={readOnly}
                    onChange={(e) =>
                      setData({
                        ...data,
                        inventory: {
                          ...data.inventory,
                          currency: {
                            ...data.inventory.currency,
                            [coinKey]: Math.max(0, parseInt(e.target.value) || 0),
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Objetos */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Objetos y Equipo</h3>
              {!readOnly && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const newItem: Dnd5eInventoryItem = {
                      name: 'Nuevo Objeto',
                      quantity: 1,
                      weight: 0,
                      notes: '',
                    };
                    setData({
                      ...data,
                      inventory: {
                        ...data.inventory,
                        items: [...data.inventory.items, newItem],
                      },
                    });
                  }}
                >
                  + Agregar Objeto
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.inventory.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 70px 40px',
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
                    value={item.name}
                    disabled={readOnly}
                    onChange={(e) => {
                      const items = [...data.inventory.items];
                      items[idx] = { ...items[idx], name: e.target.value };
                      setData({ ...data, inventory: { ...data.inventory, items } });
                    }}
                  />
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Cant."
                    title="Cantidad"
                    value={item.quantity}
                    min={1}
                    disabled={readOnly}
                    onChange={(e) => {
                      const items = [...data.inventory.items];
                      items[idx] = { ...items[idx], quantity: parseInt(e.target.value) || 1 };
                      setData({ ...data, inventory: { ...data.inventory, items } });
                    }}
                  />
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Peso"
                    title="Peso (libras)"
                    value={item.weight}
                    min={0}
                    disabled={readOnly}
                    onChange={(e) => {
                      const items = [...data.inventory.items];
                      items[idx] = { ...items[idx], weight: parseFloat(e.target.value) || 0 };
                      setData({ ...data, inventory: { ...data.inventory, items } });
                    }}
                  />
                  {!readOnly ? (
                    <button
                      className="btn-outline btn-icon"
                      style={{ color: 'var(--status-danger)', border: 'none' }}
                      title="Eliminar"
                      onClick={() => {
                        const items = data.inventory.items.filter((_, i) => i !== idx);
                        setData({ ...data, inventory: { ...data.inventory, items } });
                      }}
                    >
                      ✕
                    </button>
                  ) : <div />}
                </div>
              ))}
              {data.inventory.items.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>El inventario está vacío.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 6: Rasgos & Notas */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3>Rasgos de Clase, Raza y Dotes</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Habilidades pasivas, bendiciones y dotes especiales de tu personaje
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.traits.map((trait, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontWeight: 'bold' }}
                      placeholder="Nombre del rasgo"
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
                        style={{ color: 'var(--status-danger)', border: 'none', marginLeft: '0.5rem' }}
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
                    placeholder="Descripción del efecto..."
                    value={trait.description}
                    disabled={readOnly}
                    onChange={(e) => {
                      const traits = [...data.traits];
                      traits[idx] = { ...traits[idx], description: e.target.value };
                      setData({ ...data, traits });
                    }}
                  />
                </div>
              ))}

              {!readOnly && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    setData({
                      ...data,
                      traits: [
                        ...data.traits,
                        { name: 'Nuevo Rasgo', description: '', source: '' },
                      ],
                    });
                  }}
                >
                  + Agregar Rasgo
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '0.75rem' }}>Notas Libres y Trasfondo</h3>
            <textarea
              className="form-textarea"
              style={{ minHeight: '160px' }}
              placeholder="Escribe aquí anotaciones de aventuras, secretos, contactos o historia del personaje..."
              value={data.notes}
              disabled={readOnly}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
