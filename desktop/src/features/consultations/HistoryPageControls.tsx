import { T, btnGhost } from '../../theme';
import type { usePatientHistory } from './usePatientHistory';

export default function HistoryPageControls({ page }: { page: ReturnType<typeof usePatientHistory> }) {
  if (!page.nextCursor && !page.error) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {page.error && <p role="alert" style={{ color: T.textSub }}>Could not load encounter history.</p>}
      <button type="button" style={btnGhost} onClick={page.loadMore} disabled={page.loading}>
        {page.loading ? 'Loading…' : page.error ? 'Retry loading records' : 'Load older encounters'}
      </button>
    </div>
  );
}

