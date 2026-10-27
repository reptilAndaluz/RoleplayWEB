import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { LoginInputSchema, RegisterInputSchema } from '@rol/shared';
import { ApiError } from '../../lib/api.js';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFieldErrors({});
    setGeneralError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();

    if (isRegister) {
      const result = RegisterInputSchema.safeParse({ displayName, email, password });
      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0]?.toString() || 'general';
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      setLoading(true);
      try {
        await register(result.data);
      } catch (err) {
        if (err instanceof ApiError) {
          setGeneralError(err.message);
        } else {
          setGeneralError('Error al registrar usuario. Inténtalo de nuevo.');
        }
      } finally {
        setLoading(false);
      }
    } else {
      const result = LoginInputSchema.safeParse({ email, password });
      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0]?.toString() || 'general';
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      setLoading(true);
      try {
        await login(result.data);
      } catch (err) {
        if (err instanceof ApiError) {
          setGeneralError(err.message);
        } else {
          setGeneralError('Error al iniciar sesión. Inténtalo de nuevo.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '1.5rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '2.5rem 2rem',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              margin: '0 auto 1rem auto',
              background: 'linear-gradient(135deg, var(--accent-gold), #78350f)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-gold)',
            }}
          >
            <span
              style={{
                fontSize: '1.75rem',
                fontFamily: 'var(--font-fantasy)',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              D&amp;D
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>BurgosLabs Rol</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isRegister
              ? 'Únete para forjar tus personajes y unirte a campañas'
              : 'Accede a tus fichas de personaje y aventuras'}
          </p>
        </div>

        {generalError && (
          <div className="alert alert-danger" role="alert">
            <span>⚠️</span>
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <div className="form-group">
              <label className="form-label" htmlFor="register-name">
                Nombre de Aventurero / DM
              </label>
              <input
                id="register-name"
                className="form-input"
                type="text"
                placeholder="Ej. Gandalf o Tu Nombre"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
              {fieldErrors.displayName && <span className="form-error">{fieldErrors.displayName}</span>}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">
              Correo Electrónico
            </label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              placeholder="aventurero@burgoslabs.es"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {fieldErrors.email && <span className="form-error">{fieldErrors.email}</span>}
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="auth-password">
              Contraseña {isRegister && <span style={{ color: 'var(--text-muted)' }}>(mín. 10 caracteres)</span>}
            </label>
            <input
              id="auth-password"
              className="form-input"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
            {fieldErrors.password && <span className="form-error">{fieldErrors.password}</span>}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" style={{ width: '18px', height: '18px' }} />
            ) : isRegister ? (
              'Crear Cuenta'
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.75rem',
            textAlign: 'center',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1.25rem',
          }}
        >
          <button
            type="button"
            className="btn-outline"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-gold-light)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              textDecoration: 'underline',
            }}
            onClick={() => {
              setIsRegister(!isRegister);
              resetForm();
            }}
          >
            {isRegister
              ? '¿Ya tienes una cuenta? Inicia sesión aquí'
              : '¿No tienes cuenta? Regístrate gratis aquí'}
          </button>
        </div>
      </div>
    </div>
  );
};
