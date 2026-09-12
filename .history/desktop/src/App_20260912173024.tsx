import { useState } from 'react';

export default function App() {
  const [email, setEmail] = useState('nurse@psu.edu.ph');
  const [password, setPassword] = useState('Password123!');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('valetudo_token', data.token);
        setUser(data.user);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setError('Cannot connect to backend: ' + err.message);
    }
  };

  if (user) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#0f766e' }}>PSU Lingayen Clinic Dashboard</h1>
        <h3>Authenticated as: {user.first_name} {user.last_name}</h3>
        <p>Email: <b>{user.email}</b></p>
        <p>Active Roles: <b>{user.roles.join(', ')}</b></p>
        <button onClick={() => setUser(null)} style={{ padding: '8px 16px' }}>Sign Out</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, border: '1px solid #ccc', borderRadius: 8, fontFamily: 'sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#0f766e' }}>Salsalan Portal</h2>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 16 }}>
          <label>Email Address</label>
          <input
            style={{ width: '100%', padding: 8, marginTop: 4 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Password</label>
          <input
            style={{ width: '100%', padding: 8, marginTop: 4 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: 10, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Sign In to Infirmary
        </button>
      </form>
    </div>
  );
}