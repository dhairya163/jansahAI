export default function NextError({ statusCode = 500 }: { statusCode?: number }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <p style={{ color: '#e45e50', fontWeight: 700 }}>{statusCode}</p>
        <h1 style={{ color: '#28152e' }}>This page could not be loaded.</h1>
        <p style={{ color: '#756a72' }}>Return to SahAI and try again.</p>
      </div>
    </main>
  );
}
